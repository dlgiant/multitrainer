// Bateria de testes de referência (plan seções 7-8).
// Cada teste vira um RepTest na avaliação; o motor usa e1rm (Epley com RIR)
// + ratios para semear a carga dos exercícios (seedLoad) a partir do 2º treino.
import type { RepTest } from './db';

/** Um teste da bateria. `engineId` é o id do catálogo do motor (ExerciseId). */
export interface BatteryTest {
  engineId: string;
  name: string;
  /** Dica curta de execução do teste. */
  hint: string;
  /** Repetições-alvo sugeridas (5-10: faixa válida do Epley com RIR). */
  targetReps: number;
}

/** Bateria padrão: 4 movimentos carregáveis que cobrem os padrões principais.
 *  O supino pode ficar sem teste — o motor estima pelo ratio da remada (RATIO). */
export const BATTERY: BatteryTest[] = [
  {
    engineId: 'goblet-squat',
    name: 'Agachamento taça (halter)',
    hint: 'Desça até a coxa paralela ou o quanto der com controle.',
    targetReps: 8,
  },
  {
    engineId: 'db-row',
    name: 'Remada unilateral (halter)',
    hint: 'Tronco apoiado no banco; puxe até o quadril.',
    targetReps: 8,
  },
  {
    engineId: 'db-bench-press',
    name: 'Supino com halteres',
    hint: 'Opcional: o motor estima pela remada se não houver teste.',
    targetReps: 8,
  },
  {
    engineId: 'hip-thrust',
    name: 'Elevação pélvica com halter',
    hint: 'Apóie a escápula no banco; contraia o glúteo no topo.',
    targetReps: 10,
  },
];

/** Estado de edição de um teste no formulário (strings para inputs livres). */
export interface TestDraft {
  reps: string;
  loadKg: string;
  rir: string;
}

/** Réplica os testes salvos para edição. */
export function toDrafts(bench?: { repTests?: RepTest[] }): Record<string, TestDraft> {
  const out: Record<string, TestDraft> = {};
  for (const t of bench?.repTests ?? []) {
    out[t.exerciseId] = { reps: String(t.reps), loadKg: String(t.loadKg), rir: String(t.rir) };
  }
  return out;
}

/** Extrai os RepTest válidos dos rascunhos de input (reps, carga e RIR preenchidos). */
export function fromDrafts(drafts: Record<string, TestDraft>): RepTest[] {
  const out: RepTest[] = [];
  for (const t of BATTERY) {
    const d = drafts[t.engineId];
    if (!d) continue;
    const reps = Number(d.reps.replace(',', '.'));
    const loadKg = Number(d.loadKg.replace(',', '.'));
    const rir = Number(d.rir.replace(',', '.'));
    if (Number.isFinite(reps) && reps > 0 && Number.isFinite(loadKg) && loadKg > 0 && Number.isFinite(rir) && rir >= 0) {
      out.push({ exerciseId: t.engineId, reps, loadKg, rir });
    }
  }
  return out;
}

/** e1RM (Epley com RIR) só para exibição — a mesma fórmula do motor. */
export function est1rm(loadKg: number, reps: number, rir: number): number {
  return loadKg * (1 + (reps + rir) / 30);
}
