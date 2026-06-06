// DoorFlow Ventilation Engine — pure deterministic fluid-dynamic calculations.
// No React imports. No side effects. All units in SI unless noted.

export type OpeningType = 'louver' | 'punching' | 'undercut';
export type DoorType = 'single' | 'double' | 'parent-child';

export interface VentilationInputs {
  // Door geometry
  doorWidthMm: number;
  doorHeightMm: number;
  doorType: DoorType;           // single / double / parent-child
  designOffsetMm: number;       // default 150

  // Airflow requirements
  requiredAirflowM3h: number;
  minVelocityMs: number;        // default 2.0
  maxVelocityMs: number;        // default 3.0

  // Opening
  openingType: OpeningType;
  openingRate: number;          // default 0.35

  // Grille sizing controls
  selectedLouverWidth: number;  // 0 = auto (maxAllowedWidth)
  louverHeightFixed: boolean;   // if true, use louverHeight as exact H
  louverHeight: number;         // mm — used when louverHeightFixed = true

  // Design constraint: glass slit bottom Y (mm from door top)
  // When >0, grille top must be placed below this value
  glassSlitYMm: number;         // 0 = no constraint
}

export interface LeafLayout {
  leafWidthMm: number;       // effective width of one leaf for grille placement
  leafOffsetMm: number;      // X offset of this leaf from door origin
  grilleWidthMm: number;
  grilleHeightMm: number;
  grilleEffectiveAreaM2: number;
}

export interface VentilationResult {
  // Airflow
  airflowM3s: number;
  effectiveAreaM2: number;       // A_req_eff
  physicalAreaM2: number;

  // Per-leaf layout (1 entry for single, 2 for double/parent-child)
  leafLayouts: LeafLayout[];

  // Aggregate grille totals (sum of all leaves)
  grilleWidthMm: number;         // widest single leaf grille W (for compat)
  grilleHeightMm: number;
  grilleEffectiveAreaM2: number;

  // Undercut
  undercutHeightMm: number;
  undercutWidthMm: number;

  // Legacycompat fields
  requiredOpeningWidthMm: number;
  requiredOpeningHeightMm: number;
  maxAllowedWidthMm: number;
  maxAllowedHeightMm: number;

  // Combined velocity
  actualVelocityMs: number;

  // Compliance
  isSafe: boolean;
  velocityTooLow: boolean;
  velocityTooHigh: boolean;
  overflowsWidth: boolean;
  overflowsHeight: boolean;
  undercutOverflowsStructural: boolean;
  hasGeometryViolation: boolean;

  // Contribution ratios (0–1)
  grilleContribRatio: number;    // grille share of total effective area
  undercutContribRatio: number;  // undercut share

  remediationHint: string | null;
}

export const DEFAULTS = {
  designOffsetMm: 150,
  minVelocityMs: 2.0,
  maxVelocityMs: 3.0,
  openingRate: 0.35,
  selectedLouverWidth: 0,
  louverHeightFixed: false,
  louverHeight: 400,
  glassSlitYMm: 0,
  doorType: 'single' as DoorType,
} as const;

const UNDERCUT_STRUCTURAL_LIMIT_MM = 25;

// ---------------------------------------------------------------------------
// Leaf dimension resolver
// For double: two equal leaves; for parent-child: 60% main + 40% child
// ---------------------------------------------------------------------------
function resolveLeaves(inputs: VentilationInputs): Array<{ widthMm: number; offsetXMm: number }> {
  const { doorWidthMm, doorType } = inputs;
  if (doorType === 'double') {
    const half = doorWidthMm / 2;
    return [
      { widthMm: half, offsetXMm: 0 },
      { widthMm: half, offsetXMm: half },
    ];
  }
  if (doorType === 'parent-child') {
    const main = doorWidthMm * 0.6;
    const child = doorWidthMm * 0.4;
    return [
      { widthMm: main, offsetXMm: 0 },
      { widthMm: child, offsetXMm: main },
    ];
  }
  return [{ widthMm: doorWidthMm, offsetXMm: 0 }];
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------
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
    louverHeightFixed,
    louverHeight,
    glassSlitYMm,
  } = inputs;

  // 1. Volume flow
  const airflowM3s = requiredAirflowM3h / 3600;
  const targetVelocityMs = (minVelocityMs + maxVelocityMs) / 2;
  const effectiveAreaM2 = airflowM3s / targetVelocityMs;
  const physicalAreaM2 = effectiveAreaM2 / openingRate;

  // 2. Boundary zone (full door)
  const maxAllowedWidthMm = Math.max(1, doorWidthMm - 2 * designOffsetMm);
  const maxAllowedHeightMm = Math.max(1, doorHeightMm - 2 * designOffsetMm);

  // 3. Glass slit height constraint: grille zone top is pushed down by glassSlitYMm
  // Available grille height is reduced when glass slit occupies upper zone
  const glassConstraintMm = glassSlitYMm > 0
    ? Math.max(0, glassSlitYMm - designOffsetMm)
    : 0;
  const effectiveGrilleZoneHeightMm = Math.max(10, maxAllowedHeightMm - glassConstraintMm);

  // -------------------------------------------------------------------------
  // PURE UNDERCUT
  // -------------------------------------------------------------------------
  if (openingType === 'undercut') {
    const ucWidthMm = maxAllowedWidthMm;
    const ucWidthM = ucWidthMm / 1000;
    const ucHeightMm = (physicalAreaM2 / ucWidthM) * 1000;
    const actualEffM2 = (ucWidthMm / 1000) * (ucHeightMm / 1000) * openingRate;
    const actualVelocityMs = airflowM3s / Math.max(actualEffM2, 1e-9);

    const velocityTooLow = actualVelocityMs < minVelocityMs;
    const velocityTooHigh = actualVelocityMs > maxVelocityMs;
    const undercutOverflowsStructural = ucHeightMm > UNDERCUT_STRUCTURAL_LIMIT_MM;
    const hasGeometryViolation = undercutOverflowsStructural;
    const isSafe = !velocityTooLow && !velocityTooHigh && !hasGeometryViolation;

    const singleLeaf: LeafLayout = {
      leafWidthMm: doorWidthMm,
      leafOffsetMm: 0,
      grilleWidthMm: 0,
      grilleHeightMm: 0,
      grilleEffectiveAreaM2: 0,
    };

    return {
      airflowM3s, effectiveAreaM2, physicalAreaM2,
      leafLayouts: [singleLeaf],
      grilleWidthMm: 0, grilleHeightMm: 0, grilleEffectiveAreaM2: 0,
      undercutHeightMm: ucHeightMm, undercutWidthMm: ucWidthMm,
      requiredOpeningWidthMm: ucWidthMm, requiredOpeningHeightMm: ucHeightMm,
      maxAllowedWidthMm, maxAllowedHeightMm,
      actualVelocityMs, isSafe, velocityTooLow, velocityTooHigh,
      overflowsWidth: false, overflowsHeight: undercutOverflowsStructural,
      undercutOverflowsStructural, hasGeometryViolation,
      grilleContribRatio: 0, undercutContribRatio: 1,
      remediationHint: buildRemediationHint({
        velocityTooLow, velocityTooHigh, overflowsWidth: false,
        overflowsHeight: undercutOverflowsStructural,
        undercutOverflowsStructural, grilleOverflowsHeight: false,
        openingType, grilleHeightMm: 0, maxAllowedHeightMm,
        undercutHeightMm: ucHeightMm, doorWidthMm,
        actualVelocityMs, maxVelocityMs, minVelocityMs, combinedMode: false,
      }),
    };
  }

  // -------------------------------------------------------------------------
  // LOUVER / PUNCHING — distribute across leaves
  // -------------------------------------------------------------------------
  const leaves = resolveLeaves(inputs);
  const numLeaves = leaves.length;

  // Each leaf carries equal share of required physical area
  const physAreaPerLeaf = physicalAreaM2 / numLeaves;

  const leafLayouts: LeafLayout[] = leaves.map(leaf => {
    const leafMaxW = Math.max(1, leaf.widthMm - 2 * designOffsetMm);

    // Resolve grille width for this leaf
    const rawW = selectedLouverWidth > 0
      ? Math.min(selectedLouverWidth, leafMaxW)
      : leafMaxW;
    const gW = Math.max(10, rawW);
    const gWm = gW / 1000;

    // Resolve grille height
    let gH: number;
    if (louverHeightFixed && louverHeight > 0) {
      gH = Math.min(louverHeight, effectiveGrilleZoneHeightMm);
    } else {
      const neededH = (physAreaPerLeaf / gWm) * 1000;
      gH = Math.min(neededH, effectiveGrilleZoneHeightMm);
    }

    const gEffM2 = (gW / 1000) * (gH / 1000) * openingRate;

    return {
      leafWidthMm: leaf.widthMm,
      leafOffsetMm: leaf.offsetXMm,
      grilleWidthMm: gW,
      grilleHeightMm: gH,
      grilleEffectiveAreaM2: gEffM2,
    };
  });

  // Aggregate
  const totalGrilleEffM2 = leafLayouts.reduce((s, l) => s + l.grilleEffectiveAreaM2, 0);

  // Representative values (from largest leaf = first)
  const primaryLeaf = leafLayouts[0];

  // Undercut compensation
  const aShortageM2 = Math.max(0, effectiveAreaM2 - totalGrilleEffM2);
  const doorWidthM = doorWidthMm / 1000;
  const undercutHeightMm = aShortageM2 > 0 ? (aShortageM2 / doorWidthM) * 1000 : 0;
  const undercutWidthMm = doorWidthMm;

  // Combined effective area & velocity
  const totalEffM2 = totalGrilleEffM2 + (undercutHeightMm / 1000) * doorWidthM;
  const actualVelocityMs = airflowM3s / Math.max(totalEffM2, 1e-9);

  // Compliance
  const velocityTooLow = actualVelocityMs < minVelocityMs;
  const velocityTooHigh = actualVelocityMs > maxVelocityMs;
  const overflowsWidth = primaryLeaf.grilleWidthMm > (Math.max(1, primaryLeaf.leafWidthMm - 2 * designOffsetMm)) + 0.01;
  const neededHforPrimary = louverHeightFixed ? louverHeight : (physAreaPerLeaf / (primaryLeaf.grilleWidthMm / 1000)) * 1000;
  const grilleOverflowsHeight = neededHforPrimary > effectiveGrilleZoneHeightMm + 0.01;
  const undercutOverflowsStructural = undercutHeightMm > UNDERCUT_STRUCTURAL_LIMIT_MM;
  const overflowsHeight = grilleOverflowsHeight && undercutOverflowsStructural;
  const hasGeometryViolation = overflowsWidth || (grilleOverflowsHeight && undercutOverflowsStructural);
  const isSafe = !velocityTooLow && !velocityTooHigh && !hasGeometryViolation;

  const grilleContribRatio = totalEffM2 > 0 ? totalGrilleEffM2 / totalEffM2 : 0;
  const undercutContribRatio = 1 - grilleContribRatio;

  return {
    airflowM3s, effectiveAreaM2, physicalAreaM2,
    leafLayouts,
    grilleWidthMm: primaryLeaf.grilleWidthMm,
    grilleHeightMm: primaryLeaf.grilleHeightMm,
    grilleEffectiveAreaM2: totalGrilleEffM2,
    undercutHeightMm, undercutWidthMm,
    requiredOpeningWidthMm: primaryLeaf.grilleWidthMm,
    requiredOpeningHeightMm: primaryLeaf.grilleHeightMm,
    maxAllowedWidthMm, maxAllowedHeightMm,
    actualVelocityMs, isSafe, velocityTooLow, velocityTooHigh,
    overflowsWidth, overflowsHeight, undercutOverflowsStructural, hasGeometryViolation,
    grilleContribRatio, undercutContribRatio,
    remediationHint: buildRemediationHint({
      velocityTooLow, velocityTooHigh, overflowsWidth,
      overflowsHeight: grilleOverflowsHeight,
      undercutOverflowsStructural, grilleOverflowsHeight,
      openingType, grilleHeightMm: neededHforPrimary, maxAllowedHeightMm: effectiveGrilleZoneHeightMm,
      undercutHeightMm, doorWidthMm,
      actualVelocityMs, maxVelocityMs, minVelocityMs,
      combinedMode: undercutHeightMm > 0,
    }),
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
      `【複合補償モード】ガラリ高さが意匠ゾーン（${h.maxAllowedHeightMm.toFixed(0)} mm）を超えるため、` +
      `不足面積をアンダーカット ${h.undercutHeightMm.toFixed(1)} mm で自動補償中。` +
      `建具H寸法の拡大、またはスリットガラス位置の下方移動でゾーンを拡張できます。`
    );
  } else if (h.grilleOverflowsHeight && !h.combinedMode) {
    const excess = Math.ceil(h.grilleHeightMm - h.maxAllowedHeightMm);
    hints.push(
      `【意匠境界エラー】ガラリ高さが意匠ゾーンを ${excess} mm 超過しています。` +
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
      `ガラリ固定幅を広げる・建具W/Hを拡大する・両開き扉への変更を検討してください。`
    );
  }

  if (h.velocityTooHigh) {
    const excess = (h.actualVelocityMs - h.maxVelocityMs).toFixed(2);
    hints.push(
      `【警告】通過風速が速すぎます（${h.actualVelocityMs.toFixed(2)} m/s、上限超過 +${excess} m/s）。` +
      `気流騒音・扉バタつきの原因となります。ガラリ幅を広げるか、アンダーカット高さを併用してください。`
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
