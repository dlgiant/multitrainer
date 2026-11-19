// Marco 2: rotinas de alongamento sugeridas pelo motor + entrega (WhatsApp / .ics).
import { db, uid, type Routine, type RoutineItem } from './db';
import { buildEngineClient, loadEngineExercises, loadEngineRules } from './engineAdapter';
import { suggestStretches } from '../engine/routine';
import { buildIcs } from '../engine/ics';
import { slug } from './utils';

export const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Músculos treinados na última sessão encerrada (primary + secondary dos exercícios). */
export async function trainedMusclesFromLastSession(clientId: string): Promise<string[]> {
  const last = await db.sessions
    .where('clientId')
    .equals(clientId)
    .filter((s) => !!s.endedAt)
    .sortBy('endedAt');
  const s = last[last.length - 1];
  if (!s) return [];
  const ids = [...new Set(s.entries.map((e) => e.exerciseId))];
  const rows = await db.exercises.bulkGet(ids);
  const muscles: string[] = [];
  for (const r of rows) {
    if (!r?.muscles) continue;
    muscles.push(...r.muscles.primary, ...r.muscles.secondary);
  }
  return [...new Set(muscles)];
}

/** Sugere itens de alongamento com o motor (respeita lesões, equipamento e focos). */
export async function suggestRoutineItems(clientId: string, limit = 6): Promise<RoutineItem[]> {
  const [client, catalogue, rules, trained] = await Promise.all([
    buildEngineClient(clientId),
    loadEngineExercises(),
    loadEngineRules(),
    trainedMusclesFromLastSession(clientId),
  ]);
  const picks = suggestStretches(client, catalogue, rules, { trainedMuscles: trained, limit });
  return picks.map((p) => ({
    key: uid(),
    exerciseId: p.exercise.id,
    holdSec: p.exercise.holdSec ?? 30,
    perSide: p.exercise.perSide,
    reason: p.reason,
  }));
}

function itemNameSync(id: string, cache: Map<string, string>): string {
  return cache.get(id) ?? id;
}

async function loadNames(routine: Routine): Promise<Map<string, string>> {
  const rows = await db.exercises.bulkGet(routine.items.map((i) => i.exerciseId));
  const m = new Map<string, string>();
  for (const r of rows) if (r) m.set(r.id, r.name);
  return m;
}

function itemLine(item: RoutineItem, name: string): string {
  let dose = item.holdSec ? `${item.holdSec}s` : '30s';
  if (item.perSide) dose += ' por lado';
  return `• ${name} — ${dose}`;
}

/** Texto PT-BR para WhatsApp / compartilhamento. */
export async function routineMessage(routine: Routine, clientName: string): Promise<string> {
  const names = await loadNames(routine);
  const days = [...routine.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(' ');
  const lines = routine.items.map((i) => itemLine(i, itemNameSync(i.exerciseId, names)));
  return [
    `🌙 ${routine.name} — ${clientName}`,
    `⏰ ${routine.timeOfDay} · ${days}`,
    '',
    ...lines,
    '',
    routine.notes ?? 'Respire fundo em cada posição. Sem dor, só alongamento.',
  ].join('\n');
}

/** Próxima data (yyyy-mm-dd) cujo dia da semana está em `days`, a partir de hoje. */
function nextOccurrence(days: number[]): { date: string; weekday: number } {
  const set = new Set(days.length ? days : [1, 3, 5]);
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    if (set.has(d.getDay())) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date, weekday: d.getDay() };
    }
    d.setDate(d.getDate() + 1);
  }
  const date2 = new Date();
  return { date: `${date2.getFullYear()}-${String(date2.getMonth() + 1).padStart(2, '0')}-${String(date2.getDate()).padStart(2, '0')}`, weekday: date2.getDay() };
}

/** Arquivo .ics da rotina (RRULE semanal nos dias escolhidos, alarme 10 min antes). */
export async function buildRoutineIcs(routine: Routine, clientName: string): Promise<File> {
  const { date } = nextOccurrence(routine.days);
  const description = (await routineMessage(routine, clientName)).split('\n').slice(3).filter(Boolean).join('\n');
  const ics = buildIcs([
    {
      uid: `mt-rotina-${routine.id}`,
      title: `${routine.name} — ${clientName}`,
      description,
      start: `${date} ${routine.timeOfDay}`,
      durationMin: 10,
      weekdays: [...new Set(routine.days)].sort((a, b) => a - b),
      count: 12,
      alarmMin: 10,
    },
  ]);
  const fname = `rotina-${slug(clientName)}-${slug(routine.name)}.ics`;
  return new File([ics], fname, { type: 'text/calendar' });
}

/** Envia por WhatsApp (wa.me) ou cai no compartilhamento nativo. Registra o envio. */
export async function sendRoutineWhats(routine: Routine, clientName: string, phone?: string): Promise<void> {
  const text = await routineMessage(routine, clientName);
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
  } else {
    const { shareText } = await import('./utils');
    await shareText(text, routine.name);
  }
  await db.routineLogs.add({
    id: uid(),
    clientId: routine.clientId,
    routineId: routine.id,
    date: new Date().toISOString().slice(0, 10),
    source: 'trainer',
    channel: phone ? 'whatsapp' : 'other',
    sharedAt: Date.now(),
    createdAt: Date.now(),
  });
}

/** Registra o envio do .ics e devolve o arquivo. */
export async function shareRoutineIcs(routine: Routine, clientName: string): Promise<void> {
  const file = await buildRoutineIcs(routine, clientName);
  const { shareFiles } = await import('./utils');
  await shareFiles([file], file.name);
  await db.routineLogs.add({
    id: uid(),
    clientId: routine.clientId,
    routineId: routine.id,
    date: new Date().toISOString().slice(0, 10),
    source: 'trainer',
    channel: 'ics',
    sharedAt: Date.now(),
    createdAt: Date.now(),
  });
}

export function newRoutine(clientId: string): Routine {
  return {
    id: uid(),
    clientId,
    name: 'Alongamento noturno',
    timeOfDay: '21:00',
    days: [1, 3, 5],
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Espalhamento de dias por treinos/semana (JS: 1 = segunda … 6 = sábado). */
const DAY_SPREAD: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

/** Rotina de fim de dia sugerida após ativar um programa (plan section 5).
 *  Não cria se o cliente já tem rotinas (evita duplicar trabalho do treinador). */
export async function suggestEveningRoutine(clientId: string): Promise<Routine | null> {
  const existing = await db.routines.where('clientId').equals(clientId).count();
  if (existing > 0) return null;
  const items = await suggestRoutineItems(clientId);
  if (items.length === 0) return null;
  const client = await db.clients.get(clientId);
  const base = newRoutine(clientId);
  return {
    ...base,
    name: 'Rotina de fim de dia',
    days: DAY_SPREAD[client?.prefs?.daysPerWeek ?? 3] ?? [1, 3, 5],
    items,
    notes: 'Sugerida junto com o programa. Ajuste livremente na aba Rotinas.',
  };
}
