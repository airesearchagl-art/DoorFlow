// DoorFlow Ventilation Engine — pure deterministic fluid-dynamic calculations.
// No React imports. No side effects. All units in SI unless noted.

export type OpeningType = 'louver' | 'punching' | 'undercut';

export interface VentilationInputs {
  doorWidthMm: number;
  doorHeightMm: number;
  designOffsetMm: number;          // default 150
  requiredAirflowM3h: number;
  minVelocityMs: number;           // default 2.0
  maxVelocityMs: number;           // default 3.0
  openingType: OpeningType;
  openingRate: number;             // default 0.35 (35%)
}

export interface VentilationResult {
  // Airflow
  airflowM3s: number;              // Q in m³/s
  effectiveAreaM2: number;         // required effective opening area
  physicalAreaM2: number;          // required gross physical area

  // Geometry (mm)
  requiredOpeningWidthMm: number;  // for louver/punching: horizontal span
  requiredOpeningHeightMm: number; // for louver/punching: vertical span; for undercut: gap height
  maxAllowedWidthMm: number;       // door width minus 2 × offset
  maxAllowedHeightMm: number;      // door height minus 2 × offset

  // Velocity
  actualVelocityMs: number;

  // Compliance
  isSafe: boolean;
  velocityTooLow: boolean;
  velocityTooHigh: boolean;
  overflowsWidth: boolean;
  overflowsHeight: boolean;
  hasGeometryViolation: boolean;

  // Actionable remediation hint
  remediationHint: string | null;
}

export const DEFAULTS = {
  designOffsetMm: 150,
  minVelocityMs: 2.0,
  maxVelocityMs: 3.0,
  openingRate: 0.35,
} as const;

/**
 * Core reverse-calculation engine.
 * Given door dimensions + airflow target + opening type, returns the required
 * physical grille / undercut geometry and all compliance flags.
 */
export function calculateVentilation(inputs: VentilationInputs): VentilationResult {
  const {
    doorWidthMm,
    doorHeightMm,
    designOffsetMm,
    requiredAirflowM3h,
    minVelocityMs,
    maxVelocityMs,
    openingType,
    openingRate,
  } = inputs;

  // --- 1. Volume flow: m³/h → m³/s ---
  const airflowM3s = requiredAirflowM3h / 3600;

  // --- 2. Required effective area (use mid-point of safe velocity band) ---
  const targetVelocityMs = (minVelocityMs + maxVelocityMs) / 2; // 2.5 m/s
  const effectiveAreaM2 = airflowM3s / targetVelocityMs;

  // --- 3. Physical area (accounting for opening rate) ---
  const physicalAreaM2 = effectiveAreaM2 / openingRate;

  // --- 4. Maximum allowed opening zone inside 150 mm border ---
  const maxAllowedWidthMm = doorWidthMm - 2 * designOffsetMm;
  const maxAllowedHeightMm = doorHeightMm - 2 * designOffsetMm;

  // --- 5. Derive geometry per opening type ---
  let requiredOpeningWidthMm: number;
  let requiredOpeningHeightMm: number;

  if (openingType === 'undercut') {
    // Undercut spans full door width (minus offset each side); solve for gap height
    const undercutWidthMm = maxAllowedWidthMm;
    const undercutWidthM = undercutWidthMm / 1000;
    const physicalHeightM = physicalAreaM2 / undercutWidthM;
    requiredOpeningWidthMm = undercutWidthMm;
    requiredOpeningHeightMm = physicalHeightM * 1000;
  } else {
    // louver / punching: assume square-ish grille centred in door
    const physicalSideMm = Math.sqrt(physicalAreaM2) * 1000;
    // Fit width = full allowed width, derive height proportionally
    requiredOpeningWidthMm = Math.min(physicalSideMm, maxAllowedWidthMm);
    const adjustedWidthM = requiredOpeningWidthMm / 1000;
    const neededHeightM = physicalAreaM2 / adjustedWidthM;
    requiredOpeningHeightMm = neededHeightM * 1000;
  }

  // --- 6. Actual velocity check ---
  const actualPhysicalAreaM2 =
    (requiredOpeningWidthMm / 1000) * (requiredOpeningHeightMm / 1000);
  const actualEffectiveAreaM2 = actualPhysicalAreaM2 * openingRate;
  const actualVelocityMs = airflowM3s / actualEffectiveAreaM2;

  // --- 7. Compliance flags ---
  const velocityTooLow = actualVelocityMs < minVelocityMs;
  const velocityTooHigh = actualVelocityMs > maxVelocityMs;
  const overflowsWidth = requiredOpeningWidthMm > maxAllowedWidthMm + 0.01;
  const overflowsHeight =
    openingType === 'undercut'
      ? requiredOpeningHeightMm > 25 // undercut hard limit 25 mm structural max
      : requiredOpeningHeightMm > maxAllowedHeightMm + 0.01;
  const hasGeometryViolation = overflowsWidth || overflowsHeight;
  const isSafe = !velocityTooLow && !velocityTooHigh && !hasGeometryViolation;

  // --- 8. Remediation hint ---
  const remediationHint = buildRemediationHint({
    velocityTooLow,
    velocityTooHigh,
    overflowsWidth,
    overflowsHeight,
    openingType,
    requiredOpeningHeightMm,
    maxAllowedHeightMm,
    doorWidthMm,
    actualVelocityMs,
    maxVelocityMs,
    minVelocityMs,
  });

  return {
    airflowM3s,
    effectiveAreaM2,
    physicalAreaM2,
    requiredOpeningWidthMm,
    requiredOpeningHeightMm,
    maxAllowedWidthMm,
    maxAllowedHeightMm,
    actualVelocityMs,
    isSafe,
    velocityTooLow,
    velocityTooHigh,
    overflowsWidth,
    overflowsHeight,
    hasGeometryViolation,
    remediationHint,
  };
}

interface HintInputs {
  velocityTooLow: boolean;
  velocityTooHigh: boolean;
  overflowsWidth: boolean;
  overflowsHeight: boolean;
  openingType: OpeningType;
  requiredOpeningHeightMm: number;
  maxAllowedHeightMm: number;
  doorWidthMm: number;
  actualVelocityMs: number;
  maxVelocityMs: number;
  minVelocityMs: number;
}

function buildRemediationHint(h: HintInputs): string | null {
  const hints: string[] = [];

  if (h.overflowsHeight && h.openingType === 'undercut') {
    hints.push(
      `Undercut gap (${h.requiredOpeningHeightMm.toFixed(1)} mm) exceeds structural limit. ` +
        `Switch to louver or increase door width.`
    );
  } else if (h.overflowsHeight) {
    const excess = Math.ceil(h.requiredOpeningHeightMm - h.maxAllowedHeightMm);
    hints.push(
      `Grille height overflows boundary by ${excess} mm. ` +
        `Increase door height by ≥${excess} mm or widen the door to reduce required height.`
    );
  }

  if (h.overflowsWidth) {
    hints.push(
      `Grille width exceeds available zone. Increase door width or reduce airflow target.`
    );
  }

  if (h.velocityTooHigh) {
    const excessMs = (h.actualVelocityMs - h.maxVelocityMs).toFixed(2);
    hints.push(
      `Velocity ${h.actualVelocityMs.toFixed(2)} m/s exceeds max ${h.maxVelocityMs} m/s (+${excessMs} m/s). ` +
        `Increase opening area or switch to louver type.`
    );
  }

  if (h.velocityTooLow) {
    const deficitMs = (h.minVelocityMs - h.actualVelocityMs).toFixed(2);
    hints.push(
      `Velocity ${h.actualVelocityMs.toFixed(2)} m/s below min ${h.minVelocityMs} m/s (−${deficitMs} m/s). ` +
        `Reduce opening area or increase airflow.`
    );
  }

  return hints.length > 0 ? hints.join(' · ') : null;
}
