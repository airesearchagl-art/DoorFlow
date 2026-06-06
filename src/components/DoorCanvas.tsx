import { useMemo, useState } from 'react';
import { type VentilationInputs, type VentilationResult } from '../core/ventilationEngine';

interface DoorCanvasProps {
  inputs: VentilationInputs;
  result: VentilationResult;
}

const CANVAS_W = 480;
const CANVAS_H = 620;
const PAD = 36;

function useDoorScale(widthMm: number, heightMm: number) {
  return useMemo(() => {
    const availW = CANVAS_W - PAD * 2;
    // Reserve 28px at bottom for undercut gap callout
    const availH = CANVAS_H - PAD * 2 - 28;
    const scale = Math.min(availW / widthMm, availH / heightMm);
    const doorW = widthMm * scale;
    const doorH = heightMm * scale;
    const originX = (CANVAS_W - doorW) / 2;
    const originY = PAD + 8;
    return { scale, doorW, doorH, originX, originY };
  }, [widthMm, heightMm]);
}

function LouverPattern({ x, y, w, h, rows = 8, color = '#63b3ed' }: {
  x: number; y: number; w: number; h: number; rows?: number; color?: string;
}) {
  const clampedH = Math.max(h, 2);
  const slotH = clampedH / rows;
  return (
    <g>
      {Array.from({ length: rows }).map((_, i) => {
        const sy = y + i * slotH;
        return (
          <rect
            key={i}
            x={x}
            y={sy + slotH * 0.22}
            width={w}
            height={slotH * 0.55}
            fill={`${color}30`}
            stroke={color}
            strokeWidth={0.8}
            rx={1}
          />
        );
      })}
      <rect x={x} y={y} width={w} height={clampedH} fill="none" stroke={color} strokeWidth={1.5} rx={2} />
    </g>
  );
}

function PunchingPattern({ x, y, w, h, color = '#63b3ed' }: {
  x: number; y: number; w: number; h: number; color?: string;
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
          fill={`${color}40`}
          stroke={color}
          strokeWidth={0.6}
        />
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

export function DoorCanvas({ inputs, result }: DoorCanvasProps) {
  const [showGlassSlit, setShowGlassSlit] = useState(false);
  const [glassSlitH, setGlassSlitH] = useState(120);

  const { scale, doorW, doorH, originX, originY } = useDoorScale(
    inputs.doorWidthMm,
    inputs.doorHeightMm
  );

  const frameThickness = Math.max(6, 10 * scale);
  const offsetPx = inputs.designOffsetMm * scale;
  const allowedZoneX = originX + offsetPx;
  const allowedZoneY = originY + offsetPx;
  const allowedZoneW = result.maxAllowedWidthMm * scale;
  const allowedZoneH = result.maxAllowedHeightMm * scale;

  const isGrille = inputs.openingType === 'louver' || inputs.openingType === 'punching';
  const isViolation = result.hasGeometryViolation || !result.isSafe;
  const hasUndercut = result.undercutHeightMm > 0;

  // ---- Grille geometry in SVG px ----
  const grilleW = result.grilleWidthMm * scale;
  const grilleH = result.grilleHeightMm * scale;
  // Center the grille horizontally within allowed zone, place in lower-centre
  const grilleX = allowedZoneX + (allowedZoneW - grilleW) / 2;
  const zoneBottom = allowedZoneY + allowedZoneH;
  const grilleY = zoneBottom - grilleH - 4 * scale; // 4mm clearance above bottom margin

  // ---- Undercut geometry in SVG px ----
  // The undercut gap sits below the door leaf (floor clearance visual)
  const ucHeightPx = Math.min(result.undercutHeightMm * scale, 30); // visual cap
  const ucY = originY + doorH; // flush with door bottom
  const ucX = originX;
  const ucW = doorW;

  // ---- Pure undercut mode ----
  const ucOnlyW = result.requiredOpeningWidthMm * scale;
  const ucOnlyH = Math.min(result.requiredOpeningHeightMm * scale, 30);
  const ucOnlyX = originX + offsetPx;
  const ucOnlyY = originY + doorH - ucOnlyH;

  const grilleColor = isViolation ? '#fc8181' : '#63b3ed';
  const ucColor = result.undercutOverflowsStructural ? '#fc8181' : '#f6ad55';

  // Glass slit
  const glassSlitPx = (glassSlitH / inputs.doorHeightMm) * doorH;
  const glassSlitW = (inputs.doorWidthMm - 2 * inputs.designOffsetMm) * 0.6 * scale;
  const glassSlitX = originX + (doorW - glassSlitW) / 2;
  const glassSlitY = originY + offsetPx + 8 * scale;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 明かり窓トグル */}
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
              type="range" min={60} max={300} value={glassSlitH}
              onChange={e => setGlassSlitH(Number(e.target.value))}
              className="w-20 accent-sky-400"
            />
            <span className="font-mono text-xs text-sky-400">{glassSlitH}mm</span>
          </div>
        )}
      </div>

      {/* SVG Blueprint */}
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        style={{
          maxWidth: CANVAS_W,
          background: '#0d1526',
          borderRadius: 12,
          border: `1.5px solid ${isViolation ? '#fc8181' : hasUndercut ? '#d97706' : '#1e3a5f'}`,
        }}
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

        {/* 外枠（ドアケーシング） */}
        <rect
          x={originX - frameThickness}
          y={originY - frameThickness}
          width={doorW + frameThickness * 2}
          height={doorH + frameThickness * 2}
          fill="#152036" stroke="#2d4a6e" strokeWidth={1.5} rx={3}
        />

        {/* ドア扉パネル */}
        <rect
          x={originX} y={originY} width={doorW} height={doorH}
          fill="#111d33" stroke="#2a5080" strokeWidth={2}
        />

        {/* パネル意匠線 */}
        <rect
          x={originX + doorW * 0.1} y={originY + doorH * 0.06}
          width={doorW * 0.8} height={doorH * 0.42}
          fill="none" stroke="#1e3a5f" strokeWidth={0.8} rx={1}
        />
        <rect
          x={originX + doorW * 0.1} y={originY + doorH * 0.52}
          width={doorW * 0.8} height={doorH * 0.42}
          fill="none" stroke="#1e3a5f" strokeWidth={0.8} rx={1}
        />

        {/* 明かり窓（オプション） */}
        {showGlassSlit && (
          <g>
            <rect
              x={glassSlitX} y={glassSlitY} width={glassSlitW} height={glassSlitPx}
              fill="rgba(99,179,237,0.06)" stroke="#3182ce" strokeWidth={1}
              strokeDasharray="4 2" rx={2}
            />
            {Array.from({ length: Math.floor(glassSlitPx / 8) }).map((_, i) => (
              <line
                key={i}
                x1={glassSlitX + 4} y1={glassSlitY + i * 8 + 4}
                x2={glassSlitX + glassSlitW - 4} y2={glassSlitY + i * 8 + 4}
                stroke="rgba(99,179,237,0.15)" strokeWidth={0.5}
              />
            ))}
            <text x={glassSlitX + glassSlitW / 2} y={glassSlitY + glassSlitPx / 2 + 4}
              textAnchor="middle" fill="#3182ce" fontSize={9} opacity={0.7}>
              明かり窓（スリットガラス）
            </text>
          </g>
        )}

        {/* 意匠境界オフセット（破線） */}
        <rect
          x={originX + offsetPx} y={originY + offsetPx}
          width={allowedZoneW} height={allowedZoneH}
          fill="none" stroke="#d4af37" strokeWidth={1} strokeDasharray="6 3" opacity={0.7}
        />
        <text x={originX + offsetPx + 4} y={originY + offsetPx - 5}
          fill="#d4af37" fontSize={9} opacity={0.8}>
          {inputs.designOffsetMm}mm 意匠境界オフセット
        </text>

        {/* ===== 開口部レンダリング ===== */}

        {isGrille ? (
          <>
            {/* ガラリ / パンチング グリル */}
            {inputs.openingType === 'louver' ? (
              <LouverPattern
                x={Math.max(grilleX, allowedZoneX)}
                y={Math.max(grilleY, allowedZoneY)}
                w={Math.min(grilleW, allowedZoneW)}
                h={Math.max(Math.min(grilleH, allowedZoneY + allowedZoneH - Math.max(grilleY, allowedZoneY)), 4)}
                rows={Math.max(4, Math.round(grilleH / 16))}
                color={grilleColor}
              />
            ) : (
              <PunchingPattern
                x={Math.max(grilleX, allowedZoneX)}
                y={Math.max(grilleY, allowedZoneY)}
                w={Math.min(grilleW, allowedZoneW)}
                h={Math.max(Math.min(grilleH, allowedZoneH), 4)}
                color={grilleColor}
              />
            )}

            {/* ガラリ寸法コールアウト */}
            <text
              x={Math.max(grilleX, allowedZoneX) + Math.min(grilleW, allowedZoneW) / 2}
              y={Math.max(grilleY, allowedZoneY) - 7}
              textAnchor="middle" fill={grilleColor} fontSize={8} fontFamily="monospace"
            >
              W{result.grilleWidthMm.toFixed(0)} × H{result.grilleHeightMm.toFixed(0)} mm
            </text>

            {/* アンダーカット補償ギャップ（ドア下端） */}
            {hasUndercut && (
              <g>
                {/* フロアライン */}
                <line
                  x1={originX - frameThickness - 4} y1={originY + doorH + frameThickness + ucHeightPx}
                  x2={originX + doorW + frameThickness + 4} y2={originY + doorH + frameThickness + ucHeightPx}
                  stroke="#4a5568" strokeWidth={1} strokeDasharray="4 3"
                />
                {/* アンダーカットギャップ矩形 */}
                <rect
                  x={ucX} y={ucY}
                  width={ucW} height={Math.max(ucHeightPx, 2)}
                  fill={`${ucColor}18`}
                  stroke={ucColor}
                  strokeWidth={1.5}
                  strokeDasharray="5 2"
                />
                {/* ラベル */}
                <text
                  x={ucX + ucW / 2}
                  y={ucY + Math.max(ucHeightPx, 2) / 2 + 4}
                  textAnchor="middle" fill={ucColor} fontSize={8} fontFamily="monospace"
                >
                  ＋ アンダーカット {result.undercutHeightMm.toFixed(1)}mm
                  {result.undercutOverflowsStructural ? ' ⚠' : ''}
                </text>
                {/* 引き出し線 (右側) */}
                <line
                  x1={originX + doorW + frameThickness + 6} y1={ucY}
                  x2={originX + doorW + frameThickness + 6} y2={ucY + ucHeightPx}
                  stroke={ucColor} strokeWidth={1}
                />
                <line x1={originX + doorW + frameThickness + 3} y1={ucY} x2={originX + doorW + frameThickness + 9} y2={ucY} stroke={ucColor} strokeWidth={1} />
                <line x1={originX + doorW + frameThickness + 3} y1={ucY + ucHeightPx} x2={originX + doorW + frameThickness + 9} y2={ucY + ucHeightPx} stroke={ucColor} strokeWidth={1} />
              </g>
            )}
          </>
        ) : (
          /* 純粋アンダーカットモード */
          <g>
            <rect
              x={ucOnlyX} y={ucOnlyY}
              width={ucOnlyW} height={Math.max(ucOnlyH, 2)}
              fill={`${grilleColor}18`}
              stroke={grilleColor}
              strokeWidth={1.5}
              strokeDasharray="5 2"
            />
            <text
              x={ucOnlyX + ucOnlyW / 2} y={ucOnlyY - 5}
              textAnchor="middle" fill={grilleColor} fontSize={9}
            >
              アンダーカット {result.requiredOpeningHeightMm.toFixed(1)}mm
            </text>
          </g>
        )}

        {/* 違反インジケータ */}
        {isViolation && (
          <rect
            x={originX} y={originY} width={doorW} height={doorH}
            fill="none" stroke="#fc8181" strokeWidth={3} strokeDasharray="8 4" opacity={0.6}
          />
        )}

        {/* 建具幅注記 */}
        <line
          x1={originX} y1={originY + doorH + frameThickness + (hasUndercut ? ucHeightPx + 20 : 14)}
          x2={originX + doorW} y2={originY + doorH + frameThickness + (hasUndercut ? ucHeightPx + 20 : 14)}
          stroke="#4a6fa5" strokeWidth={1}
        />
        <text
          x={originX + doorW / 2}
          y={originY + doorH + frameThickness + (hasUndercut ? ucHeightPx + 32 : 26)}
          textAnchor="middle" fill="#4a6fa5" fontSize={10}
        >
          W {inputs.doorWidthMm} mm
        </text>

        {/* 建具高さ注記 */}
        <line
          x1={originX - frameThickness - 14} y1={originY}
          x2={originX - frameThickness - 14} y2={originY + doorH}
          stroke="#4a6fa5" strokeWidth={1}
        />
        <text
          x={originX - frameThickness - 22}
          y={originY + doorH / 2}
          textAnchor="middle" fill="#4a6fa5" fontSize={10}
          transform={`rotate(-90, ${originX - frameThickness - 22}, ${originY + doorH / 2})`}
        >
          H {inputs.doorHeightMm} mm
        </text>

        {/* ドアハンドル */}
        <circle
          cx={originX + doorW * 0.82} cy={originY + doorH * 0.52}
          r={5 * Math.min(scale * 10, 1)}
          fill="#2d4a6e" stroke="#4a7ab5" strokeWidth={1.5}
        />
        <line
          x1={originX + doorW * 0.82} y1={originY + doorH * 0.49}
          x2={originX + doorW * 0.82} y2={originY + doorH * 0.55}
          stroke="#4a7ab5" strokeWidth={3} strokeLinecap="round"
        />

        {/* 蝶番 */}
        {[0.2, 0.5, 0.8].map((fy, i) => (
          <rect
            key={i}
            x={originX + 2} y={originY + doorH * fy - 6}
            width={8} height={12}
            fill="#1e3a5f" stroke="#2d4a6e" strokeWidth={1} rx={1}
          />
        ))}

        {/* タイトル */}
        <text x={PAD} y={20} fill="#4a6fa5" fontSize={11} fontFamily="monospace" opacity={0.9}>
          建具立面図 — 換気開口レイアウト
        </text>
        <text x={CANVAS_W - PAD} y={20} textAnchor="end" fill="#4a6fa5" fontSize={9} fontFamily="monospace" opacity={0.6}>
          DoorFlow v1.1
        </text>

        {/* 複合モードバッジ */}
        {hasUndercut && isGrille && (
          <text x={CANVAS_W - PAD} y={34} textAnchor="end" fill="#d97706" fontSize={8} fontFamily="monospace" opacity={0.9}>
            複合換気（ガラリ＋アンダーカット）
          </text>
        )}
      </svg>

      {/* 適合バッジ */}
      <div
        className={`text-xs font-mono px-3 py-1 rounded-full border ${
          result.isSafe
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/40 bg-red-500/10 text-red-400'
        }`}
      >
        {result.isSafe
          ? `✓ 設備・意匠要件に適合${hasUndercut ? '（複合換気）' : ''}`
          : '✗ 要件不適合 — 是正措置を確認してください'}
      </div>
    </div>
  );
}
