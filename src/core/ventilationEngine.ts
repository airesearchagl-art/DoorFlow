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
  selectedLouverWidth: number;     // fixed grille width (mm); 0 = auto-compute
}

export interface VentilationResult {
  // Airflow
  airflowM3s: number;              // Q in m³/s
  effectiveAreaM2: number;         // required effective opening area (A_req_eff)
  physicalAreaM2: number;          // required gross physical area

  // Grille geometry (mm) — louver or punching
  grilleWidthMm: number;
  grilleHeightMm: number;
  grilleEffectiveAreaM2: number;   // actual eff. area contributed by grille alone

  // Undercut geometry (mm) — compensation gap at door bottom
  undercutHeightMm: number;        // 0 if grille alone is sufficient
  undercutWidthMm: number;         // = door width (full span)

  // Derived totals (for pure-undercut mode, grille fields are 0)
  requiredOpeningWidthMm: number;  // primary opening width (grille W, or undercut W)
  requiredOpeningHeightMm: number; // primary opening height (grille H, or undercut gap)
  maxAllowedWidthMm: number;       // door width minus 2 × offset
  maxAllowedHeightMm: number;      // door height minus 2 × offset

  // Velocity (computed over combined opening)
  actualVelocityMs: number;

  // Compliance
  isSafe: boolean;
  velocityTooLow: boolean;
  velocityTooHigh: boolean;
  overflowsWidth: boolean;
  overflowsHeight: boolean;
  undercutOverflowsStructural: boolean; // undercut > 25 mm structural limit
  hasGeometryViolation: boolean;

  // Actionable remediation hint
  remediationHint: string | null;
}

export const DEFAULTS = {
  designOffsetMm: 150,
  minVelocityMs: 2.0,
  maxVelocityMs: 3.0,
  openingRate: 0.35,
  selectedLouverWidth: 0,          // 0 = auto (use maxAllowedWidth)
} as const;

const UNDERCUT_STRUCTURAL_LIMIT_MM = 25;

/**
 * Core reverse-calculation engine with combined grille + undercut compensation.
 *
 * For louver/punching:
 *   1. Resolve grille width (user-fixed or auto = maxAllowedWidth).
 *   2. Derive grille height so that A_grille_phys × α ≥ A_req_eff.
 *   3. If grille height overflows maxAllowedHeight, cap it and allocate the
 *      remaining effective-area shortage to an undercut at the door bottom.
 *   4. Undercut height = A_shortage / doorWidthM × 1000 (mm).
 *
 * For pure undercut:
 *   Width = maxAllowedWidth, height solved directly.
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
    selectedLouverWidth,
  } = inputs;

  // --- 1. Volume flow: m³/h → m³/s ---
  const airflowM3s = requiredAirflowM3h / 3600;

  // --- 2. Required effective area at target (mid-point) velocity ---
  const targetVelocityMs = (minVelocityMs + maxVelocityMs) / 2;
  const effectiveAreaM2 = airflowM3s / targetVelocityMs;   // A_req_eff
  const physicalAreaM2 = effectiveAreaM2 / openingRate;     // A_req_phys

  // --- 3. Boundary zone ---
  const maxAllowedWidthMm = Math.max(1, doorWidthMm - 2 * designOffsetMm);
  const maxAllowedHeightMm = Math.max(1, doorHeightMm - 2 * designOffsetMm);

  // -----------------------------------------------------------------------
  // PURE UNDERCUT mode
  // -----------------------------------------------------------------------
  if (openingType === 'undercut') {
    const ucWidthMm = maxAllowedWidthMm;
    const ucWidthM = ucWidthMm / 1000;
    const ucHeightMm = (physicalAreaM2 / ucWidthM) * 1000;

    const actualEffM2 = (ucWidthMm / 1000) * (ucHeightMm / 1000) * openingRate;
    const actualVelocityMs = airflowM3s / Math.max(actualEffM2, 1e-9);

    const velocityTooLow = actualVelocityMs < minVelocityMs;
    const velocityTooHigh = actualVelocityMs > maxVelocityMs;
    const overflowsWidth = false;
    const undercutOverflowsStructural = ucHeightMm > UNDERCUT_STRUCTURAL_LIMIT_MM;
    const overflowsHeight = undercutOverflowsStructural;
    const hasGeometryViolation = overflowsWidth || overflowsHeight;
    const isSafe = !velocityTooLow && !velocityTooHigh && !hasGeometryViolation;

    const remediationHint = buildRemediationHint({
      velocityTooLow, velocityTooHigh, overflowsWidth, overflowsHeight,
      undercutOverflowsStructural, grilleOverflowsHeight: false,
      openingType, grilleHeightMm: 0, maxAllowedHeightMm,
      undercutHeightMm: ucHeightMm, doorWidthMm,
      actualVelocityMs, maxVelocityMs, minVelocityMs,
      combinedMode: false,
    });

    return {
      airflowM3s, effectiveAreaM2, physicalAreaM2,
      grilleWidthMm: 0, grilleHeightMm: 0, grilleEffectiveAreaM2: 0,
      undercutHeightMm: ucHeightMm, undercutWidthMm: ucWidthMm,
      requiredOpeningWidthMm: ucWidthMm,
      requiredOpeningHeightMm: ucHeightMm,
      maxAllowedWidthMm, maxAllowedHeightMm,
      actualVelocityMs, isSafe, velocityTooLow, velocityTooHigh,
      overflowsWidth, overflowsHeight, undercutOverflowsStructural,
      hasGeometryViolation, remediationHint,
    };
  }

  // -----------------------------------------------------------------------
  // LOUVER / PUNCHING mode with optional fixed-width + undercut compensation
  // -----------------------------------------------------------------------

  // 3a. Resolve grille width
  const rawGrilleWidth = selectedLouverWidth > 0
    ? Math.min(selectedLouverWidth, maxAllowedWidthMm)
    : maxAllowedWidthMm;
  const grilleWidthMm = Math.max(10, rawGrilleWidth);
  const grilleWidthM = grilleWidthMm / 1000;

  // 3b. Grille height needed to satisfy the full physical area requirement
  const neededGrilleHeightMm = (physicalAreaM2 / grilleWidthM) * 1000;

  // 3c. Cap grille height at the allowed zone
  const grilleHeightMm = Math.min(neededGrilleHeightMm, maxAllowedHeightMm);
  const grillePhysAreaM2 = grilleWidthM * (grilleHeightMm / 1000);
  const grilleEffectiveAreaM2 = grillePhysAreaM2 * openingRate;

  // 3d. Undercut compensation for any remaining shortage
  const aShortageM2 = Math.max(0, effectiveAreaM2 - grilleEffectiveAreaM2);
  const doorWidthM = doorWidthMm / 1000;
  // Undercut effective area = undercutH * doorW * openingRate (openingRate = 1 for gap)
  // We treat the undercut as a fully open gap (α = 1):
  const undercutHeightMm = aShortageM2 > 0
    ? (aShortageM2 / doorWidthM) * 1000   // gap α = 1 (full opening)
    : 0;
  const undercutWidthMm = doorWidthMm;

  // 3e. Total combined effective area
  const totalEffectiveAreaM2 = grilleEffectiveAreaM2
    + (undercutHeightMm / 1000) * doorWidthM;  // undercut is full-open

  // 3f. Combined velocity
  const actualVelocityMs = airflowM3s / Math.max(totalEffectiveAreaM2, 1e-9);

  // 3g. Compliance flags
  const velocityTooLow = actualVelocityMs < minVelocityMs;
  const velocityTooHigh = actualVelocityMs > maxVelocityMs;
  const overflowsWidth = grilleWidthMm > maxAllowedWidthMm + 0.01;
  const grilleOverflowsHeight = neededGrilleHeightMm > maxAllowedHeightMm + 0.01;
  const undercutOverflowsStructural = undercutHeightMm > UNDERCUT_STRUCTURAL_LIMIT_MM;
  const overflowsHeight = grilleOverflowsHeight && undercutOverflowsStructural;
  const hasGeometryViolation = overflowsWidth || (grilleOverflowsHeight && undercutOverflowsStructural);
  const isSafe = !velocityTooLow && !velocityTooHigh && !hasGeometryViolation;

  const remediationHint = buildRemediationHint({
    velocityTooLow, velocityTooHigh, overflowsWidth,
    overflowsHeight: grilleOverflowsHeight,
    undercutOverflowsStructural, grilleOverflowsHeight,
    openingType, grilleHeightMm: neededGrilleHeightMm, maxAllowedHeightMm,
    undercutHeightMm, doorWidthMm,
    actualVelocityMs, maxVelocityMs, minVelocityMs,
    combinedMode: undercutHeightMm > 0,
  });

  return {
    airflowM3s, effectiveAreaM2, physicalAreaM2,
    grilleWidthMm, grilleHeightMm, grilleEffectiveAreaM2,
    undercutHeightMm, undercutWidthMm,
    requiredOpeningWidthMm: grilleWidthMm,
    requiredOpeningHeightMm: grilleHeightMm,
    maxAllowedWidthMm, maxAllowedHeightMm,
    actualVelocityMs, isSafe, velocityTooLow, velocityTooHigh,
    overflowsWidth, overflowsHeight, undercutOverflowsStructural,
    hasGeometryViolation, remediationHint,
  };
}

// ---------------------------------------------------------------------------
// Remediation hint builder
// ---------------------------------------------------------------------------

interface HintInputs {
  velocityTooLow: boolean;
  velocityTooHigh: boolean;
  overflowsWidth: boolean;
  overflowsHeight: boolean;
  undercutOverflowsStructural: boolean;
  grilleOverflowsHeight: boolean;
  openingType: OpeningType;
  grilleHeightMm: number;
  maxAllowedHeightMm: number;
  undercutHeightMm: number;
  doorWidthMm: number;
  actualVelocityMs: number;
  maxVelocityMs: number;
  minVelocityMs: number;
  combinedMode: boolean;
}

function buildRemediationHint(h: HintInputs): string | null {
  const hints: string[] = [];

  if (h.openingType === 'undercut' && h.undercutOverflowsStructural) {
    hints.push(
      `【意匠境界エラー】アンダーカット隙間（${h.undercutHeightMm.toFixed(1)} mm）が` +
      `構造上限（${UNDERCUT_STRUCTURAL_LIMIT_MM} mm）を超過しています。` +
      `ガラリ方式への切り替え、または建具製品幅の拡大を検討してください。`
    );
  }

  if (h.grilleOverflowsHeight && !h.undercutOverflowsStructural && h.combinedMode) {
    hints.push(
      `【複合補償モード】ガラリ高さが意匠境界（${h.maxAllowedHeightMm.toFixed(0)} mm）を超えるため、` +
      `不足面積をアンダーカット ${h.undercutHeightMm.toFixed(1)} mm で自動補償しています。` +
      `建具H寸法の拡大、またはガラリ固定幅の縮小でアンダーカットを削減できます。`
    );
  } else if (h.grilleOverflowsHeight && !h.combinedMode) {
    const excess = Math.ceil(h.grilleHeightMm - h.maxAllowedHeightMm);
    hints.push(
      `【意匠境界エラー】ガラリ高さが意匠境界を ${excess} mm 超過しています。` +
      `建具H寸法を ≥${excess} mm 拡大するか、固定幅を広げて高さを削減してください。`
    );
  }

  if (h.overflowsWidth) {
    hints.push(
      `【意匠境界エラー】ガラリ幅が意匠境界を超過しています。` +
      `固定開口幅を縮小するか、建具W寸法を拡大してください。`
    );
  }

  if (h.undercutOverflowsStructural && h.combinedMode) {
    hints.push(
      `【構造限界超過】アンダーカット補償量（${h.undercutHeightMm.toFixed(1)} mm）が` +
      `構造上限（${UNDERCUT_STRUCTURAL_LIMIT_MM} mm）を超えています。` +
      `ガラリ固定幅を広げる・建具W/Hを拡大する・必要風量を見直してください。`
    );
  }

  if (h.velocityTooHigh) {
    const excess = (h.actualVelocityMs - h.maxVelocityMs).toFixed(2);
    hints.push(
      `【警告】通過風速が速すぎます（${h.actualVelocityMs.toFixed(2)} m/s、上限超過 +${excess} m/s）。` +
      `気流騒音や扉のバタつきの原因となります。ガラリ幅を広げるか、アンダーカット高さを併用して開口面積を確保してください。`
    );
  }

  if (h.velocityTooLow) {
    const deficit = (h.minVelocityMs - h.actualVelocityMs).toFixed(2);
    hints.push(
      `【警告】通過風速が遅すぎます（${h.actualVelocityMs.toFixed(2)} m/s、下限不足 −${deficit} m/s）。` +
      `換気不足となります。ガラリ固定幅を縮小するか、必要風量を増加させてください。`
    );
  }

  return hints.length > 0 ? hints.join(' · ') : null;
}
