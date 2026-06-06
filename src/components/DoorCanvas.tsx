import { useMemo, useState } from 'react';
import { type VentilationInputs, type VentilationResult } from '../core/ventilationEngine';

interface DoorCanvasProps {
  inputs: VentilationInputs;
  result: VentilationResult;
}

const CANVAS_W = 480;
const CANVAS_H = 600;
const PAD = 36; // SVG padding around door

// Map mm → SVG px, preserving aspect ratio inside the canvas
function useDoorScale(widthMm: number, heightMm: number) {
  return useMemo(() => {
    const availW = CANVAS_W - PAD * 2;
    const availH = CANVAS_H - PAD * 2;
    const scale = Math.min(availW / widthMm, availH / heightMm);
    const doorW = widthMm * scale;
    const doorH = heightMm * scale;
    const originX = (CANVAS_W - doorW) / 2;
    const originY = (CANVAS_H - doorH) / 2;
    return { scale, doorW, doorH, originX, originY };
  }, [widthMm, heightMm]);
}

function LouverPattern({
  x, y, w, h, rows = 8,
}: {
  x: number; y: number; w: number; h: number; rows?: number;
}) {
  const slats = Array.from({ length: rows });
  const slotH = h / rows;
  return (
    <g>
      {slats.map((_, i) => {
        const sy = y + i * slotH;
        const openH = slotH * 0.55;
        return (
          <rect
            key={i}
            x={x}
            y={sy + slotH * 0.22}
            width={w}
            height={openH}
            fill="rgba(99,179,237,0.18)"
            stroke="#63b3ed"
            strokeWidth={0.8}
            rx={1}
          />
        );
      })}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#63b3ed" strokeWidth={1.5} rx={2} />
    </g>
  );
}

function PunchingPattern({
  x, y, w, h,
}: {
  x: number; y: number; w: number; h: number;
}) {
  const cols = Math.max(2, Math.round(w / 14));
  const rows = Math.max(2, Math.round(h / 14));
  const cx = w / cols;
  const cy = h / rows;
  const r = Math.min(cx, cy) * 0.28;
  const dots = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      dots.push(
        <circle
          key={`${row}-${col}`}
          cx={x + cx * (col + 0.5)}
          cy={y + cy * (row + 0.5)}
          r={r}
          fill="rgba(99,179,237,0.25)"
          stroke="#63b3ed"
          strokeWidth={0.6}
        />
      );
    }
  }
  return (
    <g>
      {dots}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#63b3ed" strokeWidth={1.5} rx={2} />
    </g>
  );
}

export function DoorCanvas({ inputs, result }: DoorCanvasProps) {
  const [showGlassSlit, setShowGlassSlit] = useState(false);
  const [glassSlitH, setGlassSlitH] = useState(120); // mm

  const { scale, doorW, doorH, originX, originY } = useDoorScale(
    inputs.doorWidthMm,
    inputs.doorHeightMm
  );

  const frameThickness = 10 * scale; // visual frame thickness in SVG px
  const offsetPx = inputs.designOffsetMm * scale;

  // Opening geometry in SVG px
  const openW = result.requiredOpeningWidthMm * scale;
  const openH = result.requiredOpeningHeightMm * scale;

  // Center the opening in the allowed zone for louver/punching
  const allowedZoneX = originX + offsetPx;
  const allowedZoneY = originY + offsetPx;
  const allowedZoneW = result.maxAllowedWidthMm * scale;
  const allowedZoneH = result.maxAllowedHeightMm * scale;

  let openX: number;
  let openY: number;

  if (inputs.openingType === 'undercut') {
    // Undercut: bottom of door leaf, spanning allowed width
    openX = originX + offsetPx;
    openY = originY + doorH - openH - 2 * scale; // 2mm floor gap visual
  } else {
    // Center grille vertically in lower 60% of door (typical louver placement)
    openX = allowedZoneX + (allowedZoneW - openW) / 2;
    const zoneStart = allowedZoneY + allowedZoneH * 0.35;
    openY = zoneStart + (allowedZoneH * 0.65 - openH) / 2;
  }

  const isViolation = result.hasGeometryViolation || !result.isSafe;
  const openingColor = isViolation ? '#fc8181' : '#63b3ed';
  const openingFill = isViolation ? 'rgba(252,129,129,0.12)' : 'rgba(99,179,237,0.12)';

  // Glass slit (decorative panel in upper door third)
  const glassSlitPx = (glassSlitH / inputs.doorHeightMm) * doorH;
  const glassSlitW = (inputs.doorWidthMm - 2 * inputs.designOffsetMm) * 0.6 * scale;
  const glassSlitX = originX + (doorW - glassSlitW) / 2;
  const glassSlitY = originY + offsetPx + 8 * scale;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Glass slit toggle */}
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span>明かり窓（意匠用スリットガラス）</span>
        <button
          onClick={() => setShowGlassSlit(v => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            showGlassSlit ? 'bg-sky-500' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              showGlassSlit ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
        {showGlassSlit && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">高さ:</span>
            <input
              type="range"
              min={60}
              max={300}
              value={glassSlitH}
              onChange={e => setGlassSlitH(Number(e.target.value))}
              className="w-20 accent-sky-400"
            />
            <span className="font-mono-code text-xs text-sky-400">{glassSlitH}mm</span>
          </div>
        )}
      </div>

      {/* SVG Blueprint */}
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        style={{ maxWidth: CANVAS_W, background: '#0d1526', borderRadius: 12, border: `1.5px solid ${isViolation ? '#fc8181' : '#1e3a5f'}` }}
      >
        {/* Blueprint grid */}
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

        {/* Outer door casing frame */}
        <rect
          x={originX - frameThickness}
          y={originY - frameThickness}
          width={doorW + frameThickness * 2}
          height={doorH + frameThickness * 2}
          fill="#152036"
          stroke="#2d4a6e"
          strokeWidth={1.5}
          rx={3}
        />

        {/* Door leaf */}
        <rect
          x={originX}
          y={originY}
          width={doorW}
          height={doorH}
          fill="#111d33"
          stroke="#2a5080"
          strokeWidth={2}
        />

        {/* Door panel reveal lines (decorative inset) */}
        <rect
          x={originX + doorW * 0.1}
          y={originY + doorH * 0.06}
          width={doorW * 0.8}
          height={doorH * 0.42}
          fill="none"
          stroke="#1e3a5f"
          strokeWidth={0.8}
          rx={1}
        />
        <rect
          x={originX + doorW * 0.1}
          y={originY + doorH * 0.52}
          width={doorW * 0.8}
          height={doorH * 0.42}
          fill="none"
          stroke="#1e3a5f"
          strokeWidth={0.8}
          rx={1}
        />

        {/* Glass slit panel (optional) */}
        {showGlassSlit && (
          <g>
            <rect
              x={glassSlitX}
              y={glassSlitY}
              width={glassSlitW}
              height={glassSlitPx}
              fill="rgba(99,179,237,0.06)"
              stroke="#3182ce"
              strokeWidth={1}
              strokeDasharray="4 2"
              rx={2}
            />
            {/* Frosted glass lines */}
            {Array.from({ length: Math.floor(glassSlitPx / 8) }).map((_, i) => (
              <line
                key={i}
                x1={glassSlitX + 4}
                y1={glassSlitY + i * 8 + 4}
                x2={glassSlitX + glassSlitW - 4}
                y2={glassSlitY + i * 8 + 4}
                stroke="rgba(99,179,237,0.15)"
                strokeWidth={0.5}
              />
            ))}
            <text
              x={glassSlitX + glassSlitW / 2}
              y={glassSlitY + glassSlitPx / 2 + 4}
              textAnchor="middle"
              fill="#3182ce"
              fontSize={9}
              opacity={0.7}
            >
              明かり窓（スリットガラス）
            </text>
          </g>
        )}

        {/* 150mm design boundary margin (dashed) */}
        <rect
          x={originX + offsetPx}
          y={originY + offsetPx}
          width={allowedZoneW}
          height={allowedZoneH}
          fill="none"
          stroke="#d4af37"
          strokeWidth={1}
          strokeDasharray="6 3"
          opacity={0.7}
        />
        {/* Boundary label */}
        <text
          x={originX + offsetPx + 4}
          y={originY + offsetPx - 5}
          fill="#d4af37"
          fontSize={9}
          opacity={0.8}
        >
          {inputs.designOffsetMm}mm 意匠境界オフセット
        </text>

        {/* Opening (grille / louver / undercut) */}
        {inputs.openingType === 'louver' ? (
          <LouverPattern
            x={Math.max(openX, allowedZoneX)}
            y={Math.max(openY, allowedZoneY)}
            w={Math.min(openW, allowedZoneW)}
            h={Math.min(openH, allowedZoneH - (openY - allowedZoneY))}
            rows={Math.max(4, Math.round(openH / 16))}
          />
        ) : inputs.openingType === 'punching' ? (
          <PunchingPattern
            x={Math.max(openX, allowedZoneX)}
            y={Math.max(openY, allowedZoneY)}
            w={Math.min(openW, allowedZoneW)}
            h={Math.min(openH, allowedZoneH)}
          />
        ) : (
          /* Undercut */
          <g>
            <rect
              x={openX}
              y={openY}
              width={openW}
              height={Math.min(openH, 30 * scale)}
              fill={openingFill}
              stroke={openingColor}
              strokeWidth={1.5}
              strokeDasharray="5 2"
            />
            <text
              x={openX + openW / 2}
              y={openY - 5}
              textAnchor="middle"
              fill={openingColor}
              fontSize={9}
            >
              アンダーカット {result.requiredOpeningHeightMm.toFixed(1)}mm
            </text>
          </g>
        )}

        {/* Overflow indicator */}
        {isViolation && (
          <g>
            <rect
              x={originX}
              y={originY}
              width={doorW}
              height={doorH}
              fill="none"
              stroke="#fc8181"
              strokeWidth={3}
              strokeDasharray="8 4"
              opacity={0.6}
            />
          </g>
        )}

        {/* Dimension annotations */}
        {/* Door width annotation */}
        <line
          x1={originX}
          y1={originY + doorH + frameThickness + 14}
          x2={originX + doorW}
          y2={originY + doorH + frameThickness + 14}
          stroke="#4a6fa5"
          strokeWidth={1}
          markerEnd="url(#arr)"
          markerStart="url(#arr)"
        />
        <text
          x={originX + doorW / 2}
          y={originY + doorH + frameThickness + 26}
          textAnchor="middle"
          fill="#4a6fa5"
          fontSize={10}
        >
          {inputs.doorWidthMm} mm
        </text>

        {/* Door height annotation */}
        <line
          x1={originX - frameThickness - 14}
          y1={originY}
          x2={originX - frameThickness - 14}
          y2={originY + doorH}
          stroke="#4a6fa5"
          strokeWidth={1}
        />
        <text
          x={originX - frameThickness - 22}
          y={originY + doorH / 2}
          textAnchor="middle"
          fill="#4a6fa5"
          fontSize={10}
          transform={`rotate(-90, ${originX - frameThickness - 22}, ${originY + doorH / 2})`}
        >
          {inputs.doorHeightMm} mm
        </text>

        {/* Door handle */}
        <circle
          cx={originX + doorW * 0.82}
          cy={originY + doorH * 0.52}
          r={5 * Math.min(scale * 10, 1)}
          fill="#2d4a6e"
          stroke="#4a7ab5"
          strokeWidth={1.5}
        />
        <line
          x1={originX + doorW * 0.82}
          y1={originY + doorH * 0.49}
          x2={originX + doorW * 0.82}
          y2={originY + doorH * 0.55}
          stroke="#4a7ab5"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Hinge marks */}
        {[0.2, 0.5, 0.8].map((hingeY, i) => (
          <rect
            key={i}
            x={originX + 2}
            y={originY + doorH * hingeY - 6}
            width={8}
            height={12}
            fill="#1e3a5f"
            stroke="#2d4a6e"
            strokeWidth={1}
            rx={1}
          />
        ))}

        {/* Blueprint title */}
        <text x={PAD} y={20} fill="#4a6fa5" fontSize={11} fontFamily="monospace" opacity={0.9}>
          建具立面図 — 換気開口レイアウト
        </text>
        <text x={CANVAS_W - PAD} y={20} textAnchor="end" fill="#4a6fa5" fontSize={9} fontFamily="monospace" opacity={0.6}>
          DoorFlow v1.0
        </text>
      </svg>

      {/* Compliance badge */}
      <div
        className={`text-xs font-mono px-3 py-1 rounded-full border ${
          result.isSafe
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/40 bg-red-500/10 text-red-400'
        }`}
      >
        {result.isSafe ? '✓ 設備・意匠要件に適合' : '✗ 要件不適合 — 是正措置を確認してください'}
      </div>
    </div>
  );
}
