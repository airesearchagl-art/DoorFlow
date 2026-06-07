// DoorFlow Ventilation Engine — pure deterministic fluid-dynamic calculations.
// No React imports. No side effects. All units in SI unless noted.

export type OpeningType = 'louver' | 'punching' | 'undercut';
export type DoorType = 'single' | 'double' | 'parent-child';
export type GrilleAlign = 'center' | 'left' | 'right' | 'far-left' | 'far-right';

export const GRILLE_ALIGN_LABELS: Record<GrilleAlign, string> = {
  center:      '中央下',
  left:        '左下',
  right:       '右下',
  'far-left':  '左端',
  'far-right': '右端',
};

export interface LeafConfig {
  selectedLouverWidth: number;  // 0 = auto
  louverHeightFixed: boolean;
  louverHeight: number;         // mm
  glassSlitYMm: number;         // 0 = no constraint; distance from door top to slit bottom
  grilleAlign: GrilleAlign;     // horizontal placement preset
  glassSlitLinked: boolean;     // true → glass bottom Y snaps to grille top, W = grille W
}

export interface VentilationInputs {
  doorWidthMm: number;
  doorHeightMm: number;
  doorType: DoorType;
  childWidthMm: number;
  designOffsetMm: number;

  requiredAirflowM3h: number;
  minVelocityMs: number;
  maxVelocityMs: number;

  openingType: OpeningType;
  openingRate: number;

  leafConfigs: [LeafConfig, LeafConfig];
}

export interface LeafLayout {
  leafWidthMm: number;
  leafOffsetMm: number;
  // Grille
  grilleWidthMm: number;
  grilleHeightMm: number;
  grilleEffectiveAreaM2: number;
  grilleXOffsetMm: number;      // X from leaf-left edge
  // Glass slit
  glassSlitYMm: number;         // effective slit bottom Y (may be auto-computed in linked mode)
  glassSlitHeightMm: number;
  glassSlitWidthMm: number;
  glassSlitXOffsetMm: number;   // X from leaf-left edge
  glassSlitLinked: boolean;
  glassInterference: boolean;
}

export interface VentilationResult {
  airflowM3s: number;
  effectiveAreaM2: number;
  physicalAreaM2: number;

  leafLayouts: LeafLayout[];

  grilleWidthMm: number;
  grilleHeightMm: number;
  grilleEffectiveAreaM2: number;

  undercutHeightMm: number;
  undercutWidthMm: number;

  requiredOpeningWidthMm: number;
  requiredOpeningHeightMm: number;
  maxAllowedWidthMm: number;
  maxAllowedHeightMm: number;

  actualVelocityMs: number;

  isSafe: boolean;
  velocityTooLow: boolean;
  velocityTooHigh: boolean;
  overflowsWidth: boolean;
  overflowsHeight: boolean;
  undercutOverflowsStructural: boolean;
  hasGeometryViolation: boolean;
  hasGlassInterference: boolean;

  grilleContribRatio: number;
  undercutContribRatio: number;

  remediationHint: string | null;
}

export const DEFAULT_LEAF_CONFIG: LeafConfig = {
  selectedLouverWidth: 0,
  louverHeightFixed: false,
  louverHeight: 400,
  glassSlitYMm: 0,
  grilleAlign: 'center',
  glassSlitLinked: false,
};

export const DEFAULTS = {
  designOffsetMm: 150,
  minVelocityMs: 2.0,
  maxVelocityMs: 3.0,
  openingRate: 0.35,
  doorType: 'single' as DoorType,
  childWidthMm: 450,
} as const;

export const DOOR_WIDTH_PRESETS: Record<DoorType, number> = {
  single: 900,
  'parent-child': 1350,
  double: 1800,
};

const UNDERCUT_STRUCTURAL_LIMIT_MM = 25;

// ---------------------------------------------------------------------------
// Grille X position resolver
// ---------------------------------------------------------------------------
function computeGrilleXOffset(
  align: GrilleAlign,
  leafWidthMm: number,
  grilleWidthMm: number,
  designOffsetMm: number,
): number {
  const allowedStart = designOffsetMm;
  const allowedEnd = leafWidthMm - designOffsetMm;
  const allowedW = allowedEnd - allowedStart;
  const clampedGW = Math.min(grilleWidthMm, allowedW);

  switch (align) {
    case 'center':    return allowedStart + (allowedW - clampedGW) / 2;
    case 'left':      return allowedStart;
    case 'right':     return allowedEnd - clampedGW;
    case 'far-left':  return 0;
    case 'far-right': return leafWidthMm - clampedGW;
  }
}

// ---------------------------------------------------------------------------
// Leaf dimension resolver
// ---------------------------------------------------------------------------
function resolveLeaves(inputs: VentilationInputs): Array<{ widthMm: number; offsetXMm: number }> {
  const { doorWidthMm, doorType, childWidthMm } = inputs;

  if (doorType === 'double') {
    const half = doorWidthMm / 2;
    return [
      { widthMm: half, offsetXMm: 0 },
      { widthMm: half, offsetXMm: half },
    ];
  }

  if (doorType === 'parent-child') {
    const child = Math.max(100, Math.min(childWidthMm, doorWidthMm - 200));
    const main = doorWidthMm - child;
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
    leafConfigs,
  } = inputs;

  const airflowM3s = requiredAirflowM3h / 3600;
  const targetVelocityMs = (minVelocityMs + maxVelocityMs) / 2;
  const effectiveAreaM2 = airflowM3s / targetVelocityMs;
  const physicalAreaM2 = effectiveAreaM2 / openingRate;

  const maxAllowedWidthMm = Math.max(1, doorWidthMm - 2 * designOffsetMm);
  const maxAllowedHeightMm = Math.max(1, doorHeightMm - 2 * designOffsetMm);

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
    const isSafe = !velocityTooLow && !velocityTooHigh && !undercutOverflowsStructural;

    const singleLeaf: LeafLayout = {
      leafWidthMm: doorWidthMm, leafOffsetMm: 0,
      grilleWidthMm: 0, grilleHeightMm: 0, grilleEffectiveAreaM2: 0, grilleXOffsetMm: 0,
      glassSlitYMm: 0, glassSlitHeightMm: 0, glassSlitWidthMm: 0, glassSlitXOffsetMm: 0,
      glassSlitLinked: false, glassInterference: false,
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
      undercutOverflowsStructural, hasGeometryViolation: undercutOverflowsStructural,
      hasGlassInterference: false,
      grilleContribRatio: 0, undercutContribRatio: 1,
      remediationHint: buildRemediationHint({
        velocityTooLow, velocityTooHigh, overflowsWidth: false,
        overflowsHeight: undercutOverflowsStructural,
        undercutOverflowsStructural, grilleOverflowsHeight: false,
        hasGlassInterference: false,
        openingType, grilleHeightMm: 0, maxAllowedHeightMm,
        undercutHeightMm: ucHeightMm, doorWidthMm,
        actualVelocityMs, maxVelocityMs, minVelocityMs, combinedMode: false,
      }),
    };
  }

  // -------------------------------------------------------------------------
  // LOUVER / PUNCHING
  // -------------------------------------------------------------------------
  const leaves = resolveLeaves(inputs);
  const numLeaves = leaves.length;
  const physAreaPerLeaf = physicalAreaM2 / numLeaves;

  const leafLayouts: LeafLayout[] = leaves.map((leaf, i) => {
    const cfg = leafConfigs[Math.min(i, 1) as 0 | 1];
    const { selectedLouverWidth, louverHeightFixed, louverHeight, grilleAlign, glassSlitLinked } = cfg;

    const leafAllowedW = Math.max(1, leaf.widthMm - 2 * designOffsetMm);

    // Grille width
    const rawW = selectedLouverWidth > 0 ? Math.min(selectedLouverWidth, leafAllowedW) : leafAllowedW;
    const gW = Math.max(10, rawW);
    const gWm = gW / 1000;

    let gH: number;
    let effectiveGlassSlitYMm: number;
    let glassInterference: boolean;

    if (glassSlitLinked) {
      // Compute grille height without glass constraint, then snap glass to grille top
      const neededH = louverHeightFixed && louverHeight > 0
        ? louverHeight
        : (physAreaPerLeaf / gWm) * 1000;
      gH = Math.min(neededH, maxAllowedHeightMm);
      // Glass bottom Y = door top → grille top position
      effectiveGlassSlitYMm = doorHeightMm - designOffsetMm - gH;
      glassInterference = false; // linked mode never interferes by design
    } else {
      // Independent glass slit constraint
      const glassConstraintMm = cfg.glassSlitYMm > 0
        ? Math.max(0, cfg.glassSlitYMm - designOffsetMm)
        : 0;
      const zoneH = Math.max(10, maxAllowedHeightMm - glassConstraintMm);
      const neededH = louverHeightFixed && louverHeight > 0 ? louverHeight : (physAreaPerLeaf / gWm) * 1000;
      gH = Math.min(neededH, zoneH);
      effectiveGlassSlitYMm = cfg.glassSlitYMm;
      glassInterference = cfg.glassSlitYMm > 0 && neededH > zoneH + 0.01;
    }

    const gEffM2 = (gW / 1000) * (gH / 1000) * openingRate;
    const grilleXOffsetMm = computeGrilleXOffset(grilleAlign, leaf.widthMm, gW, designOffsetMm);

    // Glass slit visual sizing
    const glassSlitHeightMm = effectiveGlassSlitYMm > designOffsetMm
      ? effectiveGlassSlitYMm - designOffsetMm
      : 0;
    const glassSlitWidthMm = glassSlitLinked ? gW : leaf.widthMm * 0.55;
    const glassSlitXOffsetMm = glassSlitLinked ? grilleXOffsetMm : (leaf.widthMm - glassSlitWidthMm) / 2;

    return {
      leafWidthMm: leaf.widthMm,
      leafOffsetMm: leaf.offsetXMm,
      grilleWidthMm: gW,
      grilleHeightMm: gH,
      grilleEffectiveAreaM2: gEffM2,
      grilleXOffsetMm,
      glassSlitYMm: effectiveGlassSlitYMm,
      glassSlitHeightMm,
      glassSlitWidthMm,
      glassSlitXOffsetMm,
      glassSlitLinked,
      glassInterference,
    };
  });

  const totalGrilleEffM2 = leafLayouts.reduce((s, l) => s + l.grilleEffectiveAreaM2, 0);
  const hasGlassInterference = leafLayouts.some(l => l.glassInterference);
  const primaryLeaf = leafLayouts[0];

  const aShortageM2 = Math.max(0, effectiveAreaM2 - totalGrilleEffM2);
  const doorWidthM = doorWidthMm / 1000;
  const undercutHeightMm = aShortageM2 > 0 ? (aShortageM2 / doorWidthM) * 1000 : 0;

  const totalEffM2 = totalGrilleEffM2 + (undercutHeightMm / 1000) * doorWidthM;
  const actualVelocityMs = airflowM3s / Math.max(totalEffM2, 1e-9);

  const velocityTooLow = actualVelocityMs < minVelocityMs;
  const velocityTooHigh = actualVelocityMs > maxVelocityMs;
  const overflowsWidth = primaryLeaf.grilleWidthMm > (Math.max(1, primaryLeaf.leafWidthMm - 2 * designOffsetMm)) + 0.01;

  const cfg0 = leafConfigs[0];
  const neededHforPrimary = cfg0.louverHeightFixed ? cfg0.louverHeight
    : (physAreaPerLeaf / (primaryLeaf.grilleWidthMm / 1000)) * 1000;
  const primaryZoneH = cfg0.glassSlitLinked
    ? maxAllowedHeightMm
    : Math.max(10, maxAllowedHeightMm - Math.max(0, (cfg0.glassSlitYMm || 0) - designOffsetMm));
  const grilleOverflowsHeight = neededHforPrimary > primaryZoneH + 0.01;
  const undercutOverflowsStructural = undercutHeightMm > UNDERCUT_STRUCTURAL_LIMIT_MM;
  const overflowsHeight = grilleOverflowsHeight && undercutOverflowsStructural;
  const hasGeometryViolation = overflowsWidth || overflowsHeight || hasGlassInterference;
  const isSafe = !velocityTooLow && !velocityTooHigh && !hasGeometryViolation;

  const grilleContribRatio = totalEffM2 > 0 ? totalGrilleEffM2 / totalEffM2 : 0;
  const undercutContribRatio = 1 - grilleContribRatio;

  return {
    airflowM3s, effectiveAreaM2, physicalAreaM2,
    leafLayouts,
    grilleWidthMm: primaryLeaf.grilleWidthMm,
    grilleHeightMm: primaryLeaf.grilleHeightMm,
    grilleEffectiveAreaM2: totalGrilleEffM2,
    undercutHeightMm, undercutWidthMm: doorWidthMm,
    requiredOpeningWidthMm: primaryLeaf.grilleWidthMm,
    requiredOpeningHeightMm: primaryLeaf.grilleHeightMm,
    maxAllowedWidthMm, maxAllowedHeightMm,
    actualVelocityMs, isSafe, velocityTooLow, velocityTooHigh,
    overflowsWidth, overflowsHeight, undercutOverflowsStructural,
    hasGeometryViolation, hasGlassInterference,
    grilleContribRatio, undercutContribRatio,
    remediationHint: buildRemediationHint({
      velocityTooLow, velocityTooHigh, overflowsWidth,
      overflowsHeight: grilleOverflowsHeight,
      undercutOverflowsStructural, grilleOverflowsHeight,
      hasGlassInterference,
      openingType, grilleHeightMm: neededHforPrimary, maxAllowedHeightMm: primaryZoneH,
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
  hasGlassInterference: boolean;
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

  if (h.hasGlassInterference) {
    hints.push(
      `【意匠境界エラー（ガラスと干渉）】ガラリの必要高さがスリットガラスゾーンに侵入しています。` +
      `スリットガラス下端位置を下方に移動するかガラリ幅を広げてください。`
    );
  }

  if (h.openingType === 'undercut' && h.undercutOverflowsStructural) {
    hints.push(
      `【意匠境界エラー】アンダーカット隙間（${h.undercutHeightMm.toFixed(1)} mm）が` +
      `構造上限（25 mm）を超過。ガラリ方式への切り替えを検討してください。`
    );
  }

  if (h.grilleOverflowsHeight && !h.undercutOverflowsStructural && h.combinedMode) {
    hints.push(
      `【複合補償モード】ガラリゾーン（${h.maxAllowedHeightMm.toFixed(0)} mm）を超えるため` +
      `アンダーカット ${h.undercutHeightMm.toFixed(1)} mm で自動補償中。`
    );
  } else if (h.grilleOverflowsHeight && !h.combinedMode) {
    const excess = Math.ceil(h.grilleHeightMm - h.maxAllowedHeightMm);
    hints.push(
      `【意匠境界エラー】ガラリ高さが意匠ゾーンを ${excess} mm 超過。建具H寸法を拡大してください。`
    );
  }

  if (h.overflowsWidth) {
    hints.push(`【意匠境界エラー】ガラリ幅が意匠境界を超過。固定開口幅を縮小または建具W寸法を拡大してください。`);
  }

  if (h.undercutOverflowsStructural && h.combinedMode) {
    hints.push(
      `【構造限界超過】アンダーカット補償量（${h.undercutHeightMm.toFixed(1)} mm）が25mm上限を超過。` +
      `ガラリ固定幅を広げる・建具W/Hを拡大・両開き扉への変更を検討してください。`
    );
  }

  if (h.velocityTooHigh) {
    const excess = (h.actualVelocityMs - h.maxVelocityMs).toFixed(2);
    hints.push(
      `【警告】通過風速が速すぎます（${h.actualVelocityMs.toFixed(2)} m/s、+${excess} m/s）。ガラリ幅を広げてください。`
    );
  }

  if (h.velocityTooLow) {
    const deficit = (h.minVelocityMs - h.actualVelocityMs).toFixed(2);
    hints.push(
      `【警告】通過風速が遅すぎます（${h.actualVelocityMs.toFixed(2)} m/s、−${deficit} m/s）。換気量を確認してください。`
    );
  }

  return hints.length > 0 ? hints.join(' · ') : null;
}
