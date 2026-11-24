// Goal-ordered workout-type sequence (marco 5). Which pattern slots a session
// covers still comes from the split (dosing.ts); the ORDER of the slots within
// each day now depends on the client's goal, and mobility-rehab gains a
// mobility slot at the front of every day.
import type { ClientModel, Goal, Pattern } from "./types.ts";
import { splitFor, slotsForDay } from "./dosing.ts";

export interface SessionSlot {
  week: number;                  // 1-based
  dayIndex: number;              // 0-based within the week
  day: string;                   // split day label, e.g. "A" / "Upper"
  slots: Pattern[];              // goal-ordered
}

/** Priority order of pattern slots per goal. Slots not listed keep their
 *  relative order after the listed ones (Array.sort is stable). */
const GOAL_SLOT_PRIORITY: Record<Goal, Pattern[]> = {
  strength: ["squat", "hinge", "h-push", "v-push", "h-pull", "v-pull", "carry", "core"],
  hypertrophy: ["squat", "hinge", "lunge", "h-push", "v-push", "h-pull", "v-pull", "core"],
  "fat-loss": ["h-push", "h-pull", "squat", "hinge", "lunge", "conditioning", "core"],
  "general-fitness": ["squat", "hinge", "h-push", "h-pull", "carry", "core"],
  endurance: ["conditioning", "lunge", "core", "squat", "hinge", "h-push", "h-pull"],
  "mobility-rehab": ["mobility", "core", "hinge", "squat", "h-push", "h-pull"],
};

/** Stable goal-based ordering of a day's slots. */
export function orderSlotsForGoal(slots: Pattern[], goal: Goal): Pattern[] {
  const pri = GOAL_SLOT_PRIORITY[goal];
  const rank = (p: Pattern) => {
    const i = pri.indexOf(p);
    return i === -1 ? pri.length : i;
  };
  return [...slots].sort((a, b) => rank(a) - rank(b));
}

/** The whole block as an ordered list of sessions: week × day from the split,
 *  slots ordered per goal. mobility-rehab prepends a "mobility" slot to every
 *  day so the goal's primary pattern is actually trained in-session. */
export function sequenceFor(client: ClientModel, weeks = 4): SessionSlot[] {
  const split = splitFor(client.prefs.daysPerWeek);
  const goal = client.goal.primary;
  const out: SessionSlot[] = [];
  for (let week = 1; week <= weeks; week++) {
    for (let dayIndex = 0; dayIndex < split.days.length; dayIndex++) {
      const day = split.days[dayIndex]!;
      const base = slotsForDay(day) as Pattern[];
      const slots = goal === "mobility-rehab" ? (["mobility", ...base] as Pattern[]) : base;
      out.push({ week, dayIndex, day, slots: orderSlotsForGoal(slots, goal) });
    }
  }
  return out;
}
