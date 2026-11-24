// Stable reason ids. The app renders these as one-line, tappable chips (PT-BR).
export const R = {
  // selection
  EquipmentFiltered: "equipment-filtered",
  InjuryRule: "injury-rule",
  InjuryRuleSub: "injury-rule-substitution",
  TrainerMustPick: "trainer-must-pick",
  GoalMatch: "goal-match",
  FocusMuscle: "focus-muscle",
  Liked: "liked",
  Disliked: "disliked",
  Variety: "variety-vs-last-block",
  Loadability: "loadability",
  // dosing
  GoalDose: "goal-dose",
  LevelScaling: "level-scaling",
  TimeBudget: "time-budget",
  // prep
  WarmupPattern: "warmup-pattern",
  CardioBlock: "cardio-block",
  InjuryPrimer: "injury-primer",
  RampUp: "ramp-up",
  CooldownFirst: "cooldown-trimmed-first",
  // progression
  HitTopRange: "hit-top-of-range",
  WeightJumpTooBig: "weight-jump-too-big",
  InRange: "within-range",
  BelowRange: "below-range",
  BelowRangeTwice: "below-range-twice",
  PainFlag: "pain-flag",
  BodyweightTop: "bodyweight-top-of-range",
  DeloadNow: "deload-now",
  VariationSwap: "no-e1rm-gain-swap",
  ResumeAfterBreak: "resume-after-break",
  ReadinessLow: "readiness-low",
  // gates
  ParqBlocked: "parq-positive",
  AcuteInjuryBlocked: "acute-injury",
  Severity3Blocked: "severity-3",
  BpBlocked: "blood-pressure-over-threshold",
  // evening routine
  StretchInjuryRule: "stretch-injury-rule",
  StretchTrained: "stretch-trained-muscles",
  StretchFocus: "stretch-focus-area",
  StretchGeneral: "stretch-general",
} as const;

export type ReasonId = (typeof R)[keyof typeof R];
export const ENGINE_VERSION = "0.4.0";
