import type { ClientModel, GateBlock } from "./types.ts";

export const BP_SYSTOLIC_THRESHOLD = 160;
export const BP_DIASTOLIC_THRESHOLD = 100;

/**
 * Safety gates are hard blocks, not advice (plan section 9). Generation stops
 * until the trainer confirms clearance (recorded via Injury.clearedAt).
 */
export function evaluateGates(client: ClientModel): GateBlock[] {
  const blocks: GateBlock[] = [];
  if (client.parqPositive) {
    blocks.push({ gate: "parq", message: "PAR-Q+ has a yes answer; trainer must record clearance." });
  }
  for (const injury of client.injuries) {
    const cleared = injury.status === "cleared" || injury.clearedAt !== undefined;
    if (!cleared && injury.status === "acute") {
      blocks.push({
        gate: "acute-injury",
        injuryId: injury.id,
        message: `Acute injury (${injury.condition}, ${injury.region}) blocks generation until clearance.`,
      });
    }
    if (!cleared && injury.severity === 3) {
      blocks.push({
        gate: "severity-3",
        injuryId: injury.id,
        message: `Severity-3 condition (${injury.condition}) requires trainer clearance.`,
      });
    }
  }
  const bp = client.restingBloodPressure;
  if (bp && (bp.systolic >= BP_SYSTOLIC_THRESHOLD || bp.diastolic >= BP_DIASTOLIC_THRESHOLD)) {
    blocks.push({
      gate: "blood-pressure",
      message: `Resting BP ${bp.systolic}/${bp.diastolic} is over the threshold; blocks max-effort work.`,
    });
  }
  return blocks;
}
