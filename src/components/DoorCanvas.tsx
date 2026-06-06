import { useMemo, useRef } from 'react';
import type { VentilationInputs, VentilationResult, LeafLayout } from '../core/ventilationEngine';

interface DoorCanvasProps {
  inputs: VentilationInputs;
  result: VentilationResult;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

const CANVAS_W = 540;
const CANVAS_H = 650;
const PAD = 32;

function useDoorScale(widthMm: number, heightMm: number) {
  return useMemo(() => {
    const availW = CANVAS_W - PAD * 2;
    const availH = CANVAS_H - PAD * 2 - 40;
    const scale = Math.min(availW / widthMm, availH / heightMm);
    const doorW = widthMm * scale;
    const doorH = heightMm * scale;
    const originX = (CANVAS_W - doorW) / 2;
    const originY = PAD + 14;
    return { scale, doorW, doorH, originX, originY };
  }, [widthMm, heightMm]);
}

function LouverPattern({ x, y, w, h, rows = 8, color = '#63b3ed' }: {
  x: number; y: number; w: number; h: number; rows?: number; color?: string;
}) {
  const ch = Math.max(h, 4);
  const slotH = ch / rows;
  return (
    <g>
      {Array.from({ length: rows }).map((_, i) => (
        <rect key={i} x={x} y={y + i * slotH + slotH * 0.22} width={w} height={slotH * 0.55}
          fill={`${color}2a`} stroke={color} strokeWidth={0.8} rx={1} />
      ))}
      <rect x={x} y={y} width={w} height={ch} fill="none" stroke={color} strokeWidth={1.5} rx={2} />
    </g>
  );
}

function PunchingPattern({ x, y, w, h, color = '#63b3ed' }: {
  x: number; y: number; w: number; h: number; color?: string;
}) {
  const cols = Math.max(2, Math.round(w / 12));
  const rows = Math.max(2, Math.round(h / 12));
  const cxs = w / cols;
  const cys = h / rows;
  const r = Math.min(cxs, cys) * 0.26;
  const dots = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      dots.push(
        <circle key={`${row}-${col}`}
          cx={x + cxs * (col + 0.5)} cy={y + cys * (row + 0.5)} r={r}
          fill={`${color}40`} stroke={color} strokeWidth={0.5} />
      );
    }
  }
  return (
    <g>
      {dots}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={1.5} rx={2} />
    </g>
  );
}

// One door leaf — receives per-leaf layout from engine result
function DoorLeaf({
  x, y, w, h,
  offsetPx, scale,
  openingType, isGrille,
  grilleW, grilleH, grilleColor,
  showHandle, showHinge,
  layout,
  doorHeightMm,
  isViolation,
}: {
  x: number; y: number; w: number; h: number;
  offsetPx: number; scale: number;
  openingType: string; isGrille: boolean;
  grilleW: number; grilleH: number; grilleColor: string;
  showHandle: boolean; showHinge: boolean;
  layout: LeafLayout;
  doorHeightMm: number;
  isViolation: boolean;
}) {
  const leafAllowedW = Math.max(0, w - 2 * offsetPx);
  const leafAllowedH = Math.max(0, h - 2 * offsetPx);
  const allowedX = x + offsetPx;
  const allowedY = y + offsetPx;

  const safeGrilleW = Math.min(grilleW, leafAllowedW);
  const safeGrilleH = Math.min(grilleH, leafAllowedH);
  const gX = allowedX + (leafAllowedW - safeGrilleW) / 2;

  // Glass slit constraint from layout
  const hasGlass = layout.glassSlitYMm > 0;
  const glassConstraintPx = hasGlass
    ? Math.max(0, (layout.glassSlitYMm / doorHeightMm) * h - offsetPx)
    : 0;
  const grilleZoneTopPx = allowedY + glassConstraintPx;
  const grilleZoneH = allowedY + leafAllowedH - grilleZoneTopPx;
  const safeFinalH = Math.min(safeGrilleH, grilleZoneH);
  const gY = grilleZoneTopPx + grilleZoneH - safeFinalH - 4 * scale;

  // Glass slit visual: height = glassSlitHeightMm scaled
  const glassH = (layout.glassSlitHeightMm / doorHeightMm) * h;
  const glassW = Math.min(w * 0.65, leafAllowedW);
  const glassX = x + (w - glassW) / 2;
  const glassY = y + offsetPx;

  return (
    <g>
      {/* Leaf body */}
      <rect x={x} y={y} width={w} height={h} fill="#111d33" stroke="#2a5080" strokeWidth={2} />

      {/* Panel reveals */}
      <rect x={x + w * 0.1} y={y + h * 0.06} width={w * 0.8} height={h * 0.42}
        fill="none" stroke="#1e3a5f" strokeWidth={0.8} rx={1} />
      <rect x={x + w * 0.1} y={y + h * 0.52} width={w * 0.8} height={h * 0.42}
        fill="none" stroke="#1e3a5f" strokeWidth={0.8} rx={1} />

      {/* Glass slit */}
      {hasGlass && glassH > 2 && (
        <g>
          <rect x={glassX} y={glassY} width={glassW} height={glassH}
            fill={layout.glassInterference ? 'rgba(252,129,129,0.08)' : 'rgba(99,179,237,0.06)'}
            stroke={layout.glassInterference ? '#fc8181' : '#3182ce'}
            strokeWidth={1} strokeDasharray="4 2" rx={2} />
          {Array.from({ length: Math.floor(glassH / 8) }).map((_, i) => (
            <line key={i}
              x1={glassX + 4} y1={glassY + i * 8 + 4}
              x2={glassX + glassW - 4} y2={glassY + i * 8 + 4}
              stroke={layout.glassInterference ? 'rgba(252,129,129,0.2)' : 'rgba(99,179,237,0.15)'}
              strokeWidth={0.5} />
          ))}
          <text x={glassX + glassW / 2} y={glassY + glassH / 2 + 4}
            textAnchor="middle"
            fill={layout.glassInterference ? '#fc8181' : '#3182ce'}
            fontSize={7} fontFamily="monospace" opacity={0.9}>
            {layout.glassInterference ? '⚠ ガラス干渉' : `明かり窓 ${layout.glassSlitHeightMm.toFixed(0)}mm`}
          </text>
          {/* Slit bottom line */}
          <line
            x1={x + 4} y1={y + (layout.glassSlitYMm / doorHeightMm) * h}
            x2={x + w - 4} y2={y + (layout.glassSlitYMm / doorHeightMm) * h}
            stroke={layout.glassInterference ? '#fc8181' : '#38bdf8'}
            strokeWidth={1} strokeDasharray="3 2" opacity={0.8} />
        </g>
      )}

      {/* Design boundary dashed rect */}
      <rect x={allowedX} y={allowedY} width={leafAllowedW} height={leafAllowedH}
        fill="none" stroke="#d4af37" strokeWidth={0.8} strokeDasharray="5 3" opacity={0.7} />

      {/* Grille zone top constraint line when glass slit active */}
      {hasGlass && !layout.glassInterference && (
        <line x1={allowedX} y1={grilleZoneTopPx}
          x2={allowedX + leafAllowedW} y2={grilleZoneTopPx}
          stroke="#38bdf8" strokeWidth={0.8} strokeDasharray="3 2" opacity={0.6} />
      )}

      {/* Grille */}
      {isGrille && safeFinalH > 2 && (
        <>
          {openingType === 'louver' ? (
            <LouverPattern x={gX} y={gY} w={safeGrilleW} h={safeFinalH}
              rows={Math.max(3, Math.round(safeFinalH / 16))} color={grilleColor} />
          ) : (
            <PunchingPattern x={gX} y={gY} w={safeGrilleW} h={safeFinalH} color={grilleColor} />
          )}
          <text x={gX + safeGrilleW / 2} y={Math.max(gY - 5, allowedY + 6)}
            textAnchor="middle" fill={grilleColor} fontSize={7} fontFamily="monospace">
            W{layout.grilleWidthMm.toFixed(0)}×H{layout.grilleHeightMm.toFixed(0)}
          </text>
        </>
      )}

      {/* Handle */}
      {showHandle && (
        <g>
          <circle cx={x + w * 0.82} cy={y + h * 0.52}
            r={Math.max(3, 5 * Math.min(scale * 10, 1))}
            fill="#2d4a6e" stroke="#4a7ab5" strokeWidth={1.5} />
          <line x1={x + w * 0.82} y1={y + h * 0.49}
            x2={x + w * 0.82} y2={y + h * 0.55}
            stroke="#4a7ab5" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )}

      {/* Hinges */}
      {showHinge && [0.2, 0.5, 0.8].map((fy, i) => (
        <rect key={i} x={x + 2} y={y + h * fy - 5}
          width={7} height={10}
          fill="#1e3a5f" stroke="#2d4a6e" strokeWidth={1} rx={1} />
      ))}

      {/* Violation frame */}
      {isViolation && (
        <rect x={x} y={y} width={w} height={h}
          fill="none" stroke="#fc8181" strokeWidth={1.5}
          strokeDasharray="8 4" opacity={0.5} />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function DoorCanvas({ inputs, result, svgRef }: DoorCanvasProps) {
  const internalRef = useRef<SVGSVGElement>(null);
  const ref = svgRef ?? internalRef;

  const { scale, doorW, doorH, originX, originY } = useDoorScale(
    inputs.doorWidthMm, inputs.doorHeightMm
  );

  const frameThickness = Math.max(6, 10 * scale);
  const offsetPx = inputs.designOffsetMm * scale;
  const isGrille = inputs.openingType === 'louver' || inputs.openingType === 'punching';
  const isViolation = result.hasGeometryViolation || !result.isSafe;
  const hasUndercut = result.undercutHeightMm > 0;
  const grilleColor = isViolation ? '#fc8181' : '#63b3ed';
  const ucColor = result.undercutOverflowsStructural ? '#fc8181' : '#f6ad55';

  const ucHeightPx = Math.min(result.undercutHeightMm * scale, 36);

  const isSingle = inputs.doorType === 'single';
  const isDouble = inputs.doorType === 'double';
  const isParentChild = inputs.doorType === 'parent-child';

  // Map leaf layouts to SVG coordinates
  const leaves = result.leafLayouts.map(l => ({
    xPx: originX + (l.leafOffsetMm / inputs.doorWidthMm) * doorW,
    wPx: (l.leafWidthMm / inputs.doorWidthMm) * doorW,
    grilleW: l.grilleWidthMm * scale,
    grilleH: l.grilleHeightMm * scale,
    layout: l,
  }));

  const borderColor = isViolation ? '#fc8181'
    : hasUndercut ? '#d97706'
    : (isDouble || isParentChild) ? '#7c3aed'
    : '#1e3a5f';

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Door type label */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        {(isDouble || isParentChild) && (
          <div className="text-[11px] text-violet-400 font-mono">
            {isDouble
              ? `両開き — 各扉 ${(inputs.doorWidthMm / 2).toFixed(0)}mm（左右対称）`
              : `親子扉 — 親${(inputs.doorWidthMm - inputs.childWidthMm).toFixed(0)}mm / 子${inputs.childWidthMm}mm`}
          </div>
        )}
        {result.hasGlassInterference && (
          <span className="text-red-400 text-[10px] font-mono animate-pulse">⚠ ガラス干渉</span>
        )}
      </div>

      {/* SVG Blueprint */}
      <svg
        ref={ref as React.RefObject<SVGSVGElement>}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        style={{ maxWidth: CANVAS_W, background: '#0d1526', borderRadius: 12, border: `1.5px solid ${borderColor}` }}
      >
        <defs>
          <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0f2040" strokeWidth={0.5} />
          </pattern>
          <pattern id="gridLarge" width={100} height={100} patternUnits="userSpaceOnUse">
            <rect width={100} height={100} fill="url(#grid)" />
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#0f2040" strokeWidth={1} />
          </pattern>
        </defs>
        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#gridLarge)" />

        {/* Outer casing frame */}
        <rect
          x={originX - frameThickness} y={originY - frameThickness}
          width={doorW + frameThickness * 2} height={doorH + frameThickness * 2}
          fill="#152036" stroke={isDouble || isParentChild ? '#4c1d95' : '#2d4a6e'}
          strokeWidth={1.5} rx={3}
        />

        {/* Door leaves */}
        {isSingle ? (
          <DoorLeaf
            x={originX} y={originY} w={doorW} h={doorH}
            offsetPx={offsetPx} scale={scale}
            openingType={inputs.openingType} isGrille={isGrille}
            grilleW={leaves[0]?.grilleW ?? 0} grilleH={leaves[0]?.grilleH ?? 0}
            grilleColor={grilleColor}
            showHandle showHinge
            layout={leaves[0]?.layout ?? result.leafLayouts[0]}
            doorHeightMm={inputs.doorHeightMm}
            isViolation={isViolation}
          />
        ) : (
          <>
            {leaves.map((leaf, idx) => (
              <DoorLeaf
                key={idx}
                x={leaf.xPx} y={originY} w={leaf.wPx} h={doorH}
                offsetPx={offsetPx} scale={scale}
                openingType={inputs.openingType} isGrille={isGrille}
                grilleW={leaf.grilleW} grilleH={leaf.grilleH}
                grilleColor={grilleColor}
                showHandle={idx === 0}
                showHinge={idx === 0}
                layout={leaf.layout}
                doorHeightMm={inputs.doorHeightMm}
                isViolation={isViolation}
              />
            ))}
            {/* Leaf divider line */}
            {leaves.length > 1 && (
              <line
                x1={leaves[1].xPx} y1={originY}
                x2={leaves[1].xPx} y2={originY + doorH}
                stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.8}
              />
            )}
            {/* Leaf width labels */}
            {leaves.map((leaf, idx) => (
              <text key={idx}
                x={leaf.xPx + leaf.wPx / 2} y={originY - 8}
                textAnchor="middle" fill="#7c3aed" fontSize={8} fontFamily="monospace" opacity={0.9}>
                {leaf.layout.leafWidthMm.toFixed(0)}mm
                {isParentChild && (idx === 0 ? ' (親)' : ' (子)')}
              </text>
            ))}
          </>
        )}

        {/* Design boundary label */}
        <text x={originX + offsetPx + 4} y={originY + offsetPx - 6}
          fill="#d4af37" fontSize={8} opacity={0.8}>
          {inputs.designOffsetMm}mm 意匠境界
        </text>

        {/* Pure undercut mode */}
        {!isGrille && (
          <g>
            <rect
              x={originX + offsetPx}
              y={originY + doorH - Math.min(result.requiredOpeningHeightMm * scale, 30)}
              width={result.requiredOpeningWidthMm * scale}
              height={Math.min(result.requiredOpeningHeightMm * scale, 30)}
              fill={`${grilleColor}18`} stroke={grilleColor} strokeWidth={1.5} strokeDasharray="5 2"
            />
            <text
              x={originX + offsetPx + result.requiredOpeningWidthMm * scale / 2}
              y={originY + doorH - Math.min(result.requiredOpeningHeightMm * scale, 30) - 5}
              textAnchor="middle" fill={grilleColor} fontSize={9}>
              アンダーカット {result.requiredOpeningHeightMm.toFixed(1)}mm
            </text>
          </g>
        )}

        {/* Undercut gap (combined mode) */}
        {isGrille && hasUndercut && (
          <g>
            <line
              x1={originX - frameThickness - 4} y1={originY + doorH + frameThickness + ucHeightPx}
              x2={originX + doorW + frameThickness + 4} y2={originY + doorH + frameThickness + ucHeightPx}
              stroke="#4a5568" strokeWidth={1} strokeDasharray="4 3"
            />
            <rect
              x={originX} y={originY + doorH}
              width={doorW} height={Math.max(ucHeightPx, 2)}
              fill={`${ucColor}18`} stroke={ucColor} strokeWidth={1.5} strokeDasharray="5 2"
            />
            <text x={originX + doorW / 2} y={originY + doorH + ucHeightPx / 2 + 4}
              textAnchor="middle" fill={ucColor} fontSize={8} fontFamily="monospace">
              ＋ アンダーカット {result.undercutHeightMm.toFixed(1)}mm
              {result.undercutOverflowsStructural ? ' ⚠' : ''}
            </text>
            <line x1={originX + doorW + frameThickness + 6} y1={originY + doorH}
              x2={originX + doorW + frameThickness + 6} y2={originY + doorH + ucHeightPx}
              stroke={ucColor} strokeWidth={1} />
            <line x1={originX + doorW + frameThickness + 3} y1={originY + doorH}
              x2={originX + doorW + frameThickness + 9} y2={originY + doorH}
              stroke={ucColor} strokeWidth={1} />
            <line x1={originX + doorW + frameThickness + 3} y1={originY + doorH + ucHeightPx}
              x2={originX + doorW + frameThickness + 9} y2={originY + doorH + ucHeightPx}
              stroke={ucColor} strokeWidth={1} />
          </g>
        )}

        {/* Dimension: width */}
        <line
          x1={originX} y1={originY + doorH + frameThickness + (hasUndercut && isGrille ? ucHeightPx + 18 : 14)}
          x2={originX + doorW} y2={originY + doorH + frameThickness + (hasUndercut && isGrille ? ucHeightPx + 18 : 14)}
          stroke="#4a5568" strokeWidth={1} />
        <text
          x={originX + doorW / 2}
          y={originY + doorH + frameThickness + (hasUndercut && isGrille ? ucHeightPx + 30 : 26)}
          textAnchor="middle" fill="#64748b" fontSize={9} fontFamily="monospace">
          {inputs.doorWidthMm} mm
        </text>

        {/* Dimension: height */}
        <line
          x1={originX - frameThickness - 14} y1={originY}
          x2={originX - frameThickness - 14} y2={originY + doorH}
          stroke="#4a5568" strokeWidth={1} />
        <text
          x={originX - frameThickness - 20}
          y={originY + doorH / 2}
          textAnchor="middle" fill="#64748b" fontSize={9} fontFamily="monospace"
          transform={`rotate(-90, ${originX - frameThickness - 20}, ${originY + doorH / 2})`}>
          {inputs.doorHeightMm} mm
        </text>
      </svg>
    </div>
  );
}
