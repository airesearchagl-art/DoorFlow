import { Download, FileJson, Image, FileText } from 'lucide-react';
import type { VentilationInputs, VentilationResult } from '../core/ventilationEngine';

interface ExportPanelProps {
  inputs: VentilationInputs;
  result: VentilationResult;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

// ---------------------------------------------------------------------------
// DXF generation — minimal AutoCAD R12 format (AC1009), units = mm
// ---------------------------------------------------------------------------
function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return [
    '  0', 'LINE',
    '  8', layer,
    ' 10', x1.toFixed(3),
    ' 20', y1.toFixed(3),
    ' 30', '0.000',
    ' 11', x2.toFixed(3),
    ' 21', y2.toFixed(3),
    ' 31', '0.000',
  ].join('\n');
}

function dxfRect(layer: string, x: number, y: number, w: number, h: number): string {
  // DXF Y axis points up: flip y so origin is bottom-left
  return [
    dxfLine(layer, x,     y,     x + w, y),
    dxfLine(layer, x + w, y,     x + w, y + h),
    dxfLine(layer, x + w, y + h, x,     y + h),
    dxfLine(layer, x,     y + h, x,     y),
  ].join('\n');
}

function buildDxf(inputs: VentilationInputs, result: VentilationResult): string {
  const { doorWidthMm, doorHeightMm, designOffsetMm } = inputs;
  const lines: string[] = [];

  // Door frame
  lines.push(dxfRect('DOOR_FRAME', 0, 0, doorWidthMm, doorHeightMm));

  // Design boundary
  lines.push(dxfRect(
    'DESIGN_BOUNDARY',
    designOffsetMm, designOffsetMm,
    doorWidthMm - 2 * designOffsetMm, doorHeightMm - 2 * designOffsetMm,
  ));

  // Per-leaf grille and glass
  for (const leaf of result.leafLayouts) {
    if (leaf.grilleWidthMm > 0 && leaf.grilleHeightMm > 0) {
      const gx = leaf.leafOffsetMm + leaf.grilleXOffsetMm;
      // Y=0 is door bottom; grille sits at bottom of design zone
      const gy = designOffsetMm;
      lines.push(dxfRect('GRILLE', gx, gy, leaf.grilleWidthMm, leaf.grilleHeightMm));
    }

    // Glass slit (Y measured from top — flip for DXF)
    if (leaf.glassSlitYMm > 0 && leaf.glassSlitHeightMm > 0) {
      const gsX = leaf.leafOffsetMm + leaf.glassSlitXOffsetMm;
      const gsYBottom = doorHeightMm - leaf.glassSlitYMm;
      lines.push(dxfRect('GLASS_SLIT', gsX, gsYBottom, leaf.glassSlitWidthMm, leaf.glassSlitHeightMm));
    }
  }

  // Undercut
  if (result.undercutHeightMm > 0) {
    lines.push(dxfRect('UNDERCUT', 0, -result.undercutHeightMm, doorWidthMm, result.undercutHeightMm));
  }

  const header = [
    '  0', 'SECTION',
    '  2', 'HEADER',
    '  9', '$ACADVER',
    '  1', 'AC1009',
    '  9', '$INSUNITS',
    ' 70', '     4',
    '  0', 'ENDSEC',
  ].join('\n');

  const entities = [
    '  0', 'SECTION',
    '  2', 'ENTITIES',
    lines.join('\n'),
    '  0', 'ENDSEC',
  ].join('\n');

  return [header, entities, '  0', 'EOF'].join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExportPanel({ inputs, result, svgRef }: ExportPanelProps) {
  function handleJsonExport() {
    const payload = {
      meta: { tool: 'DoorFlow', generated: new Date().toISOString() },
      inputs: {
        ...inputs,
        leafConfigs: inputs.leafConfigs.map((cfg, i) => ({ leafIndex: i, ...cfg })),
      },
      result: {
        airflowM3s: result.airflowM3s,
        effectiveAreaM2: result.effectiveAreaM2,
        physicalAreaM2: result.physicalAreaM2,
        actualVelocityMs: result.actualVelocityMs,
        undercutHeightMm: result.undercutHeightMm,
        isSafe: result.isSafe,
        hasGlassInterference: result.hasGlassInterference,
        grilleContribRatio: result.grilleContribRatio,
        undercutContribRatio: result.undercutContribRatio,
        leafLayouts: result.leafLayouts,
        remediationHint: result.remediationHint,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `doorflow_${Date.now()}.json`);
  }

  function handlePngExport() {
    const svg = svgRef.current;
    if (!svg) return;

    const vbAttr = svg.getAttribute('viewBox') ?? '0 0 560 720';
    const [, , vbW, vbH] = vbAttr.split(' ').map(Number);
    const SCALE = 2;

    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svg);
    // Inject explicit dimensions so the image renders at the correct size
    svgStr = svgStr.replace(/(<svg\b[^>]*?)(?:\s+width="[^"]*")?(?:\s+height="[^"]*")?/, (_m, open) =>
      `${open} width="${vbW}" height="${vbH}"`
    );

    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = vbW * SCALE;
      canvas.height = vbH * SCALE;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0d1526';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0, vbW, vbH);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        if (b) downloadBlob(b, `doorflow_${Date.now()}.png`);
      }, 'image/png');
    };
    img.src = url;
  }

  function handleDxfExport() {
    const dxf = buildDxf(inputs, result);
    const blob = new Blob([dxf], { type: 'application/dxf' });
    downloadBlob(blob, `doorflow_${Date.now()}.dxf`);
  }

  const btnBase = 'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors duration-150';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Download size={13} className="text-slate-400" />
        <span className="text-[11px] uppercase tracking-widest text-slate-400 font-mono">
          設計結果エクスポート
        </span>
      </div>

      <button onClick={handleJsonExport}
        className={`${btnBase} border-sky-700/50 bg-sky-900/20 text-sky-300 hover:bg-sky-900/40`}>
        <FileJson size={14} />
        <span>JSON パラメータ書き出し</span>
      </button>

      <button onClick={handlePngExport}
        className={`${btnBase} border-violet-700/50 bg-violet-900/20 text-violet-300 hover:bg-violet-900/40`}>
        <Image size={14} />
        <span>PNG 立面図ダウンロード</span>
      </button>

      <button onClick={handleDxfExport}
        className={`${btnBase} border-amber-700/50 bg-amber-900/20 text-amber-300 hover:bg-amber-900/40`}>
        <FileText size={14} />
        <span>DXF 図面データ出力（CAD対応）</span>
      </button>

      <p className="text-[10px] text-slate-600 leading-tight pt-1">
        PNG は SVG を 2× 解像度でレンダリング。DXF は AutoCAD R12 形式（AC1009）、単位 mm、
        CAD ソフトで直接開いて寸法確認が可能。
      </p>
    </div>
  );
}
