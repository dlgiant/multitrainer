// Domain types for the workout engine. Pure data; no React, no Dexie.

export type Goal =
  | "strength"
  | "hypertrophy"
  | "fat-loss"
  | "general-fitness"
  | "endurance"
  | "mobility-rehab";

export type Level = "beginner" | "intermediate" | "advanced";
export type BodyRegion =
  | "spine" | "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";
export type Pattern =
  | "squat" | "hinge" | "lunge" | "h-push" | "v-push" | "h-pull" | "v-pull"
  | "carry" | "core" | "conditioning" | "mobility";
export type Role =
  | "warmup" | "primer" | "main" | "accessory" | "core" | "stretch" | "breathing"
  | "cardio";
export type InjuryStatus = "acute" | "recovering" | "chronic" | "cleared";
export type ExerciseId = string;

export interface StressValue { load: number; range: number; impact: number } // 0-3
export type StressProfile = Partial<Record<BodyRegion, StressValue>>;

export interface Exercise {
  id: ExerciseId;
  name: string;
  pattern: Pattern;
  muscles: { primary: string[]; secondary: string[] };
  equipment: string[];            // required; all must be owned
  complexity: 1 | 2 | 3;
  loadable: boolean;              // can progress in small steps with owned weights
  stress: StressProfile;
  constraints: { floor?: boolean; wallAnchor?: boolean; jumping?: boolean; noise?: boolean; spaceM2?: number };
  regressesTo?: ExerciseId;
  progressesTo?: ExerciseId;
  role: Role;
  tempoSecPerRep: number;
  holdSec?: number;               // stretches
  perSide?: boolean;
}

export interface Injury {
  id: string;
  region: BodyRegion;
  condition: string;
  severity: 1 | 2 | 3;
  status: InjuryStatus;
  painMoves: string[];            // free-text movement cues the trainer records
  clinicianNotes?: string;
  clearedAt?: string;            // ISO date; presence clears the gate
  reviewAt?: string;
}

/** Injury -> stress limits, not banned exercise names (plan section 3). */
export interface Rule {
  id: string;
  condition: string;             // matches Injury.condition loosely
  limits: Partial<Record<BodyRegion | "core", Partial<StressValue>>>; // e.g. { spine: { load: 1, range: 1 } }
  prefer: string[];               // preferred exercise ids / pattern hints
  requiresClearance: boolean;
}

export interface GoalSpec {
  primary: Goal;
  secondary?: Goal;
  target?: string;                // e.g. "-4 kg"
  targetDate?: string;            // ISO date
}

export interface Preferences {
  daysPerWeek: number;
  sessionMin: number;
  likes: ExerciseId[];
  dislikes: ExerciseId[];
  focus: string[];               // muscles, e.g. ["glutes"]
  noJump: boolean;
  spaceM2?: number;
  /** Onde o bloco de cardio entra na sessão (default: 'late', antes do relaxamento). */
  cardioPlacement?: "early" | "late";
}

export interface Environment {
  equipment: string[];           // ids of owned equipment, e.g. ["db", "band", "bench"]
  weightsKg: number[];           // owned dumbbell/load increments
}

export interface Benchmarks {
  repTests?: { exerciseId: ExerciseId; reps: number; loadKg: number; rir: number }[];
  pain?: { region: BodyRegion; score: number }[];
}

export interface ClientModel {
  clientId: string;
  name: string;
  goal: GoalSpec;
  level: Level;
  monthsTraining: number;
  parqPositive: boolean;         // any PAR-Q+ "yes"
  restingBloodPressure?: { systolic: number; diastolic: number };
  injuries: Injury[];
  prefs: Preferences;
  env: Environment;
  benchmarks?: Benchmarks;
}

export interface PlannedSet { reps: number; targetRir: number }
export interface PlannedExercise {
  exerciseId: ExerciseId;
  block: "warmup" | "primer" | "main" | "accessory" | "core" | "cooldown" | "cardio";
  sets: number;
  targetReps: number;            // top of rep range
  targetRir: number;
  loadKg?: number;               // undefined = bodyweight
  restMin: number;
  reason: Reason;
  pinned?: boolean;
  durationMin?: number;          // cardio: tempo contínuo em minutos (targetReps/RIR ficam 0)
}

export type SessionStatus = "pending" | "ready" | "done";

export interface SessionPlan {
  dayIndex: number;              // 0-based within the week
  week: number;                  // 1-based
  minutes: number;               // estimated duration
  items: PlannedExercise[];      // empty while status is "pending" (JIT mode)
  status?: SessionStatus;        // JIT mode; undefined = legacy block mode (all ready)
  slots?: Pattern[];             // goal-ordered pattern slots of this session (sequence.ts)
}

export interface Program {
  id: string;
  clientId: string;
  goal: Goal;
  weeks: number;
  split: string;                 // e.g. "full-body-a/b"
  sessions: SessionPlan[];
  generatedFrom: ClientModel;    // snapshot for reproducibility
  engineVersion: string;
  status: "draft" | "active" | "done";
  mode?: "block" | "jit";        // "block" (default): all sessions materialized upfront;
                                 // "jit": sessions start pending, filled one at a time by nextSession
}

export interface Reason {
  id: string;                    // stable reason id, see reasons.ts
  params?: Record<string, string | number | boolean>;
}

// ---- history / progression ----
export interface SetLog {
  exerciseId: ExerciseId;
  reps: number;
  loadKg?: number;
  rir: number;
  pain?: { region: BodyRegion; score: number };
}
export interface SessionLog {
  week: number;
  dayIndex: number;
  date?: string;
  readiness?: { sleep: number; soreness: number; energy: number; pain: number };
  sets: SetLog[];
}

export type Change =
  | { kind: "load"; exerciseId: ExerciseId; from?: number; to?: number; reps: number; rir: number; reason: Reason }
  | { kind: "reps"; exerciseId: ExerciseId; from: number; to: number; reason: Reason }
  | { kind: "add-set"; exerciseId: ExerciseId; to: number; reason: Reason }
  | { kind: "tempo"; exerciseId: ExerciseId; to: string; reason: Reason }
  | { kind: "regress"; exerciseId: ExerciseId; to: ExerciseId; reason: Reason }
  | { kind: "hold"; exerciseId: ExerciseId; reason: Reason };

export interface GateBlock {
  gate: "parq" | "acute-injury" | "severity-3" | "blood-pressure";
  message: string;
  injuryId?: string;
}
