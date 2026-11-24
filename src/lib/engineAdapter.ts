// Adaptador entre os dados do app (Dexie) e o modelo de entrada do motor.
// O motor em src/engine é puro: nada de React ou Dexie dentro dele.
import { db, type FitnessLevel, type InjuryRecord, type RuleRecord } from './db';
import type { ClientModel, Exercise, Rule } from '../engine/types';
import { parqPositive } from './parq';

/** Presets de condição que correspondem às regras semeadas (regras = estresse máximo, não nomes de exercícios). */
export const CONDITION_PRESETS: { id: string; label: string; region: 'spine' | 'shoulder' | 'knee' }[] = [
  { id: 'lumbar-disc', label: 'Hérnia de disco lombar', region: 'spine' },
  { id: 'shoulder-impingement', label: 'Ombro (impacto / síndrome do impacto)', region: 'shoulder' },
  { id: 'patellofemoral', label: 'Joelho (patelofemoral / condromalácia)', region: 'knee' },
  { id: 'pregnancy', label: 'Gestação', region: 'spine' },
  { id: 'hypertension', label: 'Hipertensão', region: 'spine' },
];

export const INJURY_STATUS_LABEL: Record<InjuryRecord['status'], string> = {
  acute: 'Aguda',
  recovering: 'Em recuperação',
  chronic: 'Crônica',
  cleared: 'Liberada',
};

const LEVEL_MAP: Record<FitnessLevel, ClientModel['level']> = {
  iniciante: 'beginner',
  intermediario: 'intermediate',
  avancado: 'advanced',
};

/** "12/8" (BR) ou "120/80" -> { systolic, diastolic }. */
export function parseBp(bp?: string): { systolic: number; diastolic: number } | undefined {
  if (!bp) return undefined;
  const nums = bp.split('/').map((p) => Number(p.replace(',', '.')));
  if (nums.length < 2 || nums.some((n) => !Number.isFinite(n) || n <= 0)) return undefined;
  const fix = (n: number) => (n < 30 ? Math.round(n * 10) : Math.round(n)); // 12/8 => 120/80
  return { systolic: fix(nums[0]!), diastolic: fix(nums[1]!) };
}

/** Nome do equipamento -> tokens que os exercícios exigem (db, kb, bench, band, barra…). */
function tokensFromEquipment(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const n = raw.toLowerCase();
    if (/(halter|dumbbell|peso livre|anilha)/.test(n)) out.add('db');
    if (/kettlebell|\bkb\b|kettle/.test(n)) out.add('kb');
    if (/banco|sofá|step/.test(n)) out.add('bench');
    if (/elástic|banda|band/.test(n)) out.add('band');
    if (/barra fixa|pull-?up|barra de dominada/.test(n)) out.add('barra');
    if (/parede|porta|ancor/.test(n)) out.add('wallAnchor');
    if (/trx|suspens/.test(n)) out.add('trx');
    if (/bike|bicicl|pedal|ciclis/.test(n)) out.add('bike');
    if (/remador|remo|rower/.test(n)) out.add('rower');
    if (/esteira|treadmill/.test(n)) out.add('treadmill');
  }
  return [...out];
}

export async function buildEngineClient(clientId: string): Promise<ClientModel> {
  const [client, assessments, equipment, injuries] = await Promise.all([
    db.clients.get(clientId),
    db.assessments.where('clientId').equals(clientId).toArray(),
    db.equipment.where('clientId').equals(clientId).toArray(),
    db.injuries.where('clientId').equals(clientId).toArray(),
  ]);
  const latest = assessments.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0];
  if (!client) throw new Error('Cliente não encontrado');

  return {
    clientId: client.id,
    name: client.name,
    goal: client.goal ?? { primary: 'general-fitness' },
    level: LEVEL_MAP[latest?.fitnessLevel ?? 'iniciante'],
    monthsTraining: latest?.monthsTraining ?? 0,
    // PAR-Q+ 2022 (lib/parq.ts): qualquer SIM na página 1 liga o portão do motor.
    parqPositive: parqPositive(latest?.parq),
    restingBloodPressure: parseBp(latest?.bloodPressure),
    injuries: injuries.map(toEngineInjury),
    prefs: {
      daysPerWeek: client.prefs?.daysPerWeek ?? 3,
      sessionMin: client.prefs?.sessionMin ?? 55,
      likes: client.prefs?.likes ?? [],
      dislikes: client.prefs?.dislikes ?? [],
      focus: client.prefs?.focus ?? [],
      noJump: client.prefs?.noJump ?? false,
      cardioPlacement: client.prefs?.cardioPlacement ?? 'late',
    },
    env: {
      equipment: tokensFromEquipment(equipment.map((e) => e.name)),
      weightsKg: [...new Set(equipment.flatMap((e) => e.weights ?? []))].sort((a, b) => a - b),
    },
    benchmarks:
      latest?.benchmarks?.repTests && latest.benchmarks.repTests.length > 0
        ? { repTests: latest.benchmarks.repTests }
        : undefined, // seedLoad/e1rm (plan seções 7-8)
  };
}

export function toEngineInjury(i: InjuryRecord): ClientModel['injuries'][number] {
  return {
    id: i.id,
    region: i.region,
    condition: i.condition,
    severity: i.severity,
    status: i.status,
    painMoves: i.painMoves ?? [],
    clinicianNotes: i.notes,
    clearedAt: i.clearedAt,
    reviewAt: i.reviewAt,
  };
}

export async function loadEngineRules(): Promise<Rule[]> {
  const rows = await db.rules.toArray();
  return rows.map((r: RuleRecord) => ({
    id: r.id,
    condition: r.condition,
    limits: r.limits as Rule['limits'],
    prefer: r.prefer ?? [],
    requiresClearance: r.requiresClearance,
  }));
}

/** Exercícios do app com tags do motor. Exercícios sem padrão não participam da seleção automática. */
export async function loadEngineExercises(): Promise<Exercise[]> {
  const rows = await db.exercises.toArray();
  return rows
    .filter((r) => r.pattern !== undefined)
    .map((r) => ({
      id: r.id,
      name: r.name,
      pattern: r.pattern!,
      muscles: r.muscles ?? { primary: [r.muscleGroup], secondary: [] },
      equipment: r.equipmentTokens ?? [],
      complexity: r.complexity ?? 2,
      loadable: r.loadable ?? false,
      stress: r.stress ?? {},
      constraints: r.constraints ?? {},
      regressesTo: r.regressesTo,
      progressesTo: r.progressesTo,
      role: r.role ?? 'main',
      tempoSecPerRep: r.tempoSecPerRep ?? (r.mode === 'tempo' ? 1 : 3),
      holdSec: r.holdSec,
      perSide: r.perSide,
    }));
}

/** O mesmo exercício visto pelo motor, mesmo sem tag (alvo de substituição). */
export async function toEngineExercise(exerciseId: string): Promise<Exercise | undefined> {
  const r = await db.exercises.get(exerciseId);
  if (!r) return undefined;
  return {
    id: r.id,
    name: r.name,
    pattern: r.pattern ?? 'core',
    muscles: r.muscles ?? { primary: [r.muscleGroup], secondary: [] },
    equipment: r.equipmentTokens ?? [],
    complexity: r.complexity ?? 2,
    loadable: r.loadable ?? false,
    stress: r.stress ?? {},
    constraints: r.constraints ?? {},
    regressesTo: r.regressesTo,
    progressesTo: r.progressesTo,
    role: r.role ?? 'main',
    tempoSecPerRep: r.tempoSecPerRep ?? (r.mode === 'tempo' ? 1 : 3),
    holdSec: r.holdSec,
    perSide: r.perSide,
  };
}

/** Texto PT-BR dos motivos do motor (chips de uma linha). */
export function reasonLabel(reason: { id: string; params?: Record<string, string | number | boolean> }): string {
  const p = reason.params ?? {};
  switch (reason.id) {
    case 'injury-rule-substitution':
      return p.from && p.to
        ? `Troca segura de ${p.from} → ${p.to}: respeita a regra de lesão e o equipamento disponível`
        : 'Opção segura: respeita a regra de lesão e o equipamento disponível';
    case 'pain-flag':
      return `Dor ${p.score}/10 em ${p.region}: regredir na próxima sessão`;
    case 'hit-top-of-range':
      return 'Todas as séries no topo da faixa: sobe carga';
    case 'weight-jump-too-big':
      return `Próxima carga (${p.to} kg) é >10% mais pesada (${p.from} kg): não pular, somar repetições primeiro`;
    case 'within-range':
      return 'Dentro da faixa: mesma carga, +1 repetição na série mais fraca';
    case 'below-range':
      return 'Abaixo da faixa: manter a carga';
    case 'below-range-twice':
      return 'Abaixo da faixa duas vezes: desce de carga';
    case 'bodyweight-top-of-range':
      return 'Topo da faixa no peso corporal: progressão de repetições/tempo';
    case 'deload-now':
      return 'Queda de e1RM em duas sessões: deload agora';
    case 'no-e1rm-gain-swap':
      return 'Sem ganho de e1RM em 3 sessões: trocar variação';
    case 'resume-after-break':
      return 'Retorno após pausa: ~90% das cargas, RIR +1';
    case 'readiness-low':
      return 'Aptidão baixa hoje: menos séries ou +1 RIR';
    case 'goal-dose':
      return `Dose do objetivo (${p.goal}) ajustada ao nível`;
    case 'goal-match':
      return p.deload
        ? `Semana de deload: mesmas cargas, menos esforço (padrão: 3 build + 1 deload)`
        : `Melhor opção para ${p.slot} (nota ${p.score}) com o equipamento disponível`;
    case 'time-budget':
      return 'Ajustado para caber no tempo da sessão';
    case 'warmup-pattern':
      return 'Aquecimento alinhado aos padrões da sessão';
    case 'cardio-block':
      return `Cardio contínuo: ${p.minutes} min${p.deload ? ' (deload)' : ''} · objetivo ${p.goal}`;
    case 'injury-primer':
      return `Primer de ativação para ${p.pattern}`;
    case 'ramp-up':
      return `Série de aproximação a ${p.pct}% da carga`;
    case 'cooldown-trimmed-first':
      return 'Relaxamento final — o primeiro a ser cortado se faltar tempo';
    case 'stretch-injury-rule':
      return 'Recomendado pela regra da sua lesão';
    case 'stretch-trained-muscles':
      return `Alonga os músculos treinados (${p.muscles ?? ''})`;
    case 'stretch-focus-area':
      return 'Alinha com o seu foco de treino';
    case 'stretch-general':
      return 'Alongamento geral de recuperação';
    default:
      return reason.id;
  }
}
