// Goal dose profiles + level scaling + split by days/week (plan section 4).
// Every default is a setting the trainer can override per client.
import type { ClientModel, Goal, Level } from "./types.ts";

export interface DoseProfile {
  reps: [number, number];       // main rep range
  accessoryReps: [number, number];
  rir: [number, number];
  hardSetsPerMuscle: [number, number];
  restMin: [number, number];
  conditioning: boolean;
}

export const DOSE: Record<Goal, DoseProfile> = {
  strength:        { reps: [3, 6],  accessoryReps: [6, 10], rir: [1, 3], hardSetsPerMuscle: [6, 12], restMin: [2, 4], conditioning: false },
  hypertrophy:     { reps: [6, 12], accessoryReps: [10, 15], rir: [0, 3], hardSetsPerMuscle: [10, 20], restMin: [1.5, 3], conditioning: false },
  "fat-loss":      { reps: [8, 12], accessoryReps: [12, 15], rir: [1, 3], hardSetsPerMuscle: [8, 14], restMin: [1, 2], conditioning: true },
  "general-fitness": { reps: [8, 12], accessoryReps: [10, 15], rir: [2, 4], hardSetsPerMuscle: [4, 10], restMin: [1, 2], conditioning: false },
  endurance:       { reps: [15, 25], accessoryReps: [15, 25], rir: [2, 4], hardSetsPerMuscle: [6, 12], restMin: [0.5, 1], conditioning: true },
  "mobility-rehab": { reps: [10, 15], accessoryReps: [10, 15], rir: [3, 5], hardSetsPerMuscle: [2, 6], restMin: [1, 1], conditioning: false },
};

export function scaleForLevel(profile: DoseProfile, level: Level): DoseProfile {
  // Beginners: bottom of volume range, RIR at the easy end (plan: level scaling).
  const pick = (r: [number, number], easy: boolean): number => (easy ? r[0] : Math.round((r[0] + r[1]) / 2));
  const easy = level === "beginner";
  return {
    ...profile,
    hardSetsPerMuscle: [profile.hardSetsPerMuscle[0], profile.hardSetsPerMuscle[1]],
    rir: [easy ? Math.max(profile.rir[0], 3) : profile.rir[0], easy ? Math.max(profile.rir[1], 3) : profile.rir[1]],
    restMin: [pick(profile.restMin, easy), profile.restMin[1]],
  };
}

export function splitFor(daysPerWeek: number): { name: string; days: string[] } {
  if (daysPerWeek <= 2) return { name: "full-body-a/b", days: ["A", "B"] };
  if (daysPerWeek === 3) return { name: "full-body-a/b/c", days: ["A", "B", "C"] };
  if (daysPerWeek === 4) return { name: "upper-lower-x2", days: ["Upper", "Lower", "Upper", "Lower"] };
  return { name: "upper-lower-plus-full", days: ["Upper", "Lower", "Full", "Upper", "Lower"] };
}

/** Pattern slots each day must cover (full-body default from plan section 4). */
export function slotsForDay(day: string): string[] {
  const upper = ["h-push", "h-pull"];
  const lower = ["squat", "hinge"];
  if (day === "Upper") return upper;
  if (day === "Lower") return lower;
  // full-body: squat or lunge, hinge, push, pull, core
  return ["squat", "hinge", "h-push", "h-pull", "core"];
}

export function doseFor(client: ClientModel): DoseProfile {
  return scaleForLevel(DOSE[client.goal.primary], client.level);
}
