import Dexie, { type EntityTable } from 'dexie';
import type { GoalSpec, Pattern, Role, StressProfile } from '../engine/types';

export type FitnessLevel = 'iniciante' | 'intermediario' | 'avancado';
export type ExerciseMode = 'reps' | 'tempo';
export type InjuryStatus = 'acute' | 'recovering' | 'chronic' | 'cleared';
export type BodyRegion = 'spine' | 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle';

export interface Client {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  goals?: string;
  notes?: string;
  archived?: boolean;
  createdAt: number;
  /** Objetivo estruturado (motor). O texto livre em `goals` continua valendo como nota. */
  goal?: GoalSpec;
  /** Preferências de treino (motor, plano seção 1). Opcional: usa padrões 3×55min. */
  prefs?: ClientPrefs;
}

/** Preferências que alimentam o gerador (plan section 1 — Preferences). */
export interface ClientPrefs {
  /** Treinos por semana (1–6). Define o split (plan section 4). */
  daysPerWeek: number;
  /** Duração alvo da sessão em minutos (orçamento de tempo do motor). */
  sessionMin: number;
  /** SemImpacto: moradia/apartamento — proíbe saltos e ruído forte. */
  noJump: boolean;
  /** Focos musculares (soft score de seleção). */
  focus: string[];
  /** Exercícios que o cliente gosta / evita (soft score ±). */
  likes: string[];
  dislikes: string[];
}

/** Snapshot do estado físico do cliente numa data (avaliação). */
export interface Assessment {
  id: string;
  clientId: string;
  date: string; // yyyy-mm-dd
  fitnessLevel?: FitnessLevel;
  weightKg?: number;
  heightCm?: number;
  bodyFatPct?: number;
  waistCm?: number;
  restingHr?: number;
  bloodPressure?: string;
  injuries?: string;
  notes?: string;
  createdAt: number;
  /** PAR-Q+ 2022 preenchido (questões oficiais, veja lib/parq.ts). */
  parq?: ParqResult;
  /** Bateria de testes de referência: alimenta seedLoad/e1rm do motor. */
  benchmarks?: { repTests?: RepTest[] };
  /** Meses de treino contínuo do cliente (experiência; afeta progressão do motor). */
  monthsTraining?: number;
}

/** Resposta PAR-Q+ 2022: respostas por chave oficial + declaração. */
export interface ParqResult {
  /** 'g1'…'g7' (página 1) e 'c1'…'c10', '1a'…'10c' (páginas 2-3). */
  answers: Record<string, 'yes' | 'no'>;
  /** Condições listadas nas questões 4 e 6. */
  conditions?: string;
  /** Assinado por (nome). */
  signedBy?: string;
  filledAt: number;
}

/** Teste de repetição de referência (bateria de benchmarks, plan seções 7-8).
 *  `exerciseId` é o id do catálogo do motor (ex.: 'goblet-squat'), igual ao
 *  que `seedLoad`/`e1rm` esperam em Benchmarks.repTests. */
export interface RepTest {
  exerciseId: string;
  reps: number;
  loadKg: number;
  rir: number;
}

/** Equipamento disponível no local onde o cliente treina (casa, condomínio...). */
export interface Equipment {
  id: string;
  clientId: string;
  name: string;
  /** Cargas disponíveis em kg (ex.: halteres 2, 4, 6...). Vazio = peso corporal / sem carga. */
  weights: number[];
  notes?: string;
  createdAt: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  mode: ExerciseMode;
  cues?: string;
  custom?: boolean;
  // ---- tags do motor (schema v2). Opcionais: exercícios antigos continuam usáveis. ----
  pattern?: Pattern;
  muscles?: { primary: string[]; secondary: string[] };
  complexity?: 1 | 2 | 3;
  loadable?: boolean;
  equipmentTokens?: string[]; // 'db', 'kb', 'bench', 'band', 'barra', 'wallAnchor'
  stress?: StressProfile; // por região: { load, range, impact } 0–3
  constraints?: { floor?: boolean; wallAnchor?: boolean; jumping?: boolean; noise?: boolean; spaceM2?: number };
  regressesTo?: string;
  progressesTo?: string;
  role?: Role;
  tempoSecPerRep?: number;
  holdSec?: number;
  perSide?: boolean;
}

/** Lesão estruturada (schema v2). O texto livre em Assessment.injuries continua como nota. */
export interface InjuryRecord {
  id: string;
  clientId: string;
  region: BodyRegion;
  /** Id da regra correspondente (ex.: 'lumbar-disc') — ver CONDITION_PRESETS. */
  condition: string;
  severity: 1 | 2 | 3;
  status: InjuryStatus;
  painMoves?: string[];
  notes?: string;
  clearedAt?: string;
  reviewAt?: string;
  createdAt: number;
}

/** Regra lesão → limite de estresse (schema v2, editável pelo treinador). */
export interface RuleRecord {
  id: string;
  condition: string;
  limits: Record<string, Partial<{ load: number; range: number; impact: number }>>;
  prefer: string[];
  requiresClearance: boolean;
}

/** Bloco gerado pelo motor (usado a partir do marco 3). */
export interface ProgramRecord {
  id: string;
  clientId: string;
  goal: string;
  startDate: string;
  weeks: number;
  split: string;
  status: 'draft' | 'active' | 'done';
  generatedFrom?: unknown;
  engineVersion: string;
  createdAt: number;
}

/** Todo ajuste do treinador é registrado, para melhorar os padrões. */
export interface OverrideRecord {
  id: string;
  clientId: string;
  at: number;
  what: string; // ex.: 'substitute-exercise'
  from?: string;
  to?: string;
  reason?: string;
}

export interface WorkoutItem {
  key: string;
  exerciseId: string;
  equipmentId?: string;
  sets: number;
  reps?: number;
  durationSec?: number;
  weightKg?: number;
  restSec: number;
  notes?: string;
  // ---- schema v2 ----
  targetRir?: number;
  reason?: { id: string; params?: Record<string, string | number | boolean> };
  pinned?: boolean;
}

export interface Workout {
  id: string;
  clientId: string;
  name: string;
  items: WorkoutItem[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  // ---- schema v2 ----
  programId?: string;
  week?: number;
  day?: number;
}

export interface SetLog {
  reps?: number;
  durationSec?: number;
  weightKg?: number;
  done: boolean;
  completedAt?: number;
  // ---- schema v2 (autoregulação) ----
  rir?: number; // 0–4+ (repetições em reserva)
  pain?: { region: BodyRegion; score: number }; // 0–10
}

export interface SessionEntry {
  key: string;
  exerciseId: string;
  exerciseName: string;
  mode: ExerciseMode;
  equipmentId?: string;
  restSec: number;
  notes?: string;
  /** Texto curto explicando a carga sugerida (progressão). */
  suggestion?: string;
  sets: SetLog[];
}

export interface Session {
  id: string;
  clientId: string;
  workoutId?: string;
  workoutName: string;
  startedAt: number;
  endedAt?: number;
  entries: SessionEntry[];
  notes?: string;
  /** Esforço percebido da sessão (1–10). */
  rpe?: number;
  // ---- schema v2 ----
  readiness?: { sleep: number; soreness: number; energy: number; pain: number };
  // ---- schema v3 (marco 2): proposta do motor já revisada ----
  diffAppliedAt?: number;
}

// ---- marco 2: rotinas de alongamento (uma por cliente, ex.: alongamento noturno) ----
export interface RoutineItem {
  key: string;
  exerciseId: string;
  holdSec?: number;
  perSide?: boolean;
  notes?: string;
  /** Motivo do motor (chip explicando a escolha). */
  reason?: { id: string; params?: Record<string, string | number | boolean> };
}

export interface Routine {
  id: string;
  clientId: string;
  name: string;
  /** Hora local do lembrete, 'HH:MM' (padrão 21:00). */
  timeOfDay: string;
  /** Dias da semana (JS: 0 = domingo … 6 = sábado). */
  days: number[];
  items: RoutineItem[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** Envio/aderência da rotina (WhatsApp ou .ics) para medir efeitos a médio prazo. */
export interface RoutineLog {
  id: string;
  clientId: string;
  routineId: string;
  /** yyyy-mm-dd do envio. */
  date: string;
  source: 'trainer' | 'client';
  channel: 'whatsapp' | 'ics' | 'other';
  sharedAt?: number;
  createdAt: number;
}

export interface Video {
  id: string;
  clientId: string;
  sessionId?: string;
  exerciseId?: string;
  exerciseName?: string;
  note?: string;
  blob: Blob;
  mimeType: string;
  durationSec?: number;
  createdAt: number;
  sharedAt?: number;
}

export const db = new Dexie('multitrainer') as Dexie & {
  clients: EntityTable<Client, 'id'>;
  assessments: EntityTable<Assessment, 'id'>;
  equipment: EntityTable<Equipment, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  videos: EntityTable<Video, 'id'>;
  injuries: EntityTable<InjuryRecord, 'id'>;
  rules: EntityTable<RuleRecord, 'id'>;
  programs: EntityTable<ProgramRecord, 'id'>;
  overrides: EntityTable<OverrideRecord, 'id'>;
  routines: EntityTable<Routine, 'id'>;
  routineLogs: EntityTable<RoutineLog, 'id'>;
};

db.version(1).stores({
  clients: 'id, name, createdAt',
  assessments: 'id, clientId, date',
  equipment: 'id, clientId',
  exercises: 'id, name, muscleGroup',
  workouts: 'id, clientId, updatedAt',
  sessions: 'id, clientId, startedAt, endedAt',
  videos: 'id, clientId, sessionId, createdAt',
});

/** Schema v2: campos do motor. Campos novos são opcionais; clientes antigos continuam funcionando. */
db.version(2).stores({
  clients: 'id, name, createdAt',
  assessments: 'id, clientId, date',
  equipment: 'id, clientId',
  exercises: 'id, name, muscleGroup',
  workouts: 'id, clientId, updatedAt',
  sessions: 'id, clientId, startedAt, endedAt',
  videos: 'id, clientId, sessionId, createdAt',
  injuries: 'id, clientId',
  rules: 'id',
  programs: 'id, clientId',
  overrides: 'id, clientId',
});

/** Schema v3 (marco 2): rotinas de alongamento + logs de envio. */
db.version(3).stores({
  clients: 'id, name, createdAt',
  assessments: 'id, clientId, date',
  equipment: 'id, clientId',
  exercises: 'id, name, muscleGroup',
  workouts: 'id, clientId, updatedAt',
  sessions: 'id, clientId, startedAt, endedAt',
  videos: 'id, clientId, sessionId, createdAt',
  injuries: 'id, clientId',
  rules: 'id',
  programs: 'id, clientId',
  overrides: 'id, clientId',
  routines: 'id, clientId',
  routineLogs: 'id, clientId, routineId, date',
});

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Remove o cliente e tudo o que está associado a ele. */
export async function deleteClient(clientId: string) {
  await db.transaction(
    'rw',
    [db.clients, db.assessments, db.equipment, db.workouts, db.sessions, db.videos, db.injuries, db.programs, db.overrides, db.routines, db.routineLogs],
    async () => {
      await db.assessments.where('clientId').equals(clientId).delete();
      await db.equipment.where('clientId').equals(clientId).delete();
      await db.workouts.where('clientId').equals(clientId).delete();
      await db.sessions.where('clientId').equals(clientId).delete();
      await db.videos.where('clientId').equals(clientId).delete();
      await db.injuries.where('clientId').equals(clientId).delete();
      await db.programs.where('clientId').equals(clientId).delete();
      await db.overrides.where('clientId').equals(clientId).delete();
      await db.routines.where('clientId').equals(clientId).delete();
      await db.routineLogs.where('clientId').equals(clientId).delete();
      await db.clients.delete(clientId);
    },
  );
}
