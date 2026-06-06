import { Download, FileJson, Image, FileCode2 } from 'lucide-react';
import type { VentilationInputs, VentilationResult } from '../core/ventilationEngine';

interface ExportPanelProps {
  inputs: VentilationInputs;
  result: VentilationResult;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

function buildDxfJson(inputs: VentilationInputs, result: VentilationResult) {
  const { doorWidthMm, doorHeightMm, designOffsetMm } = inputs;
  const entities = [];

  // Door outer frame
  entities.push({
    type: 'LWPOLYLINE', layer: 'DOOR_FRAME', closed: true,
    vertices: [
      { x: 0, y: 0 }, { x: doorWidthMm, y: 0 },
      { x: doorWidthMm, y: doorHeightMm }, { x: 0, y: doorHeightMm },
    ],
  });

  // Design boundary
  entities.push({
    type: 'LWPOLYLINE', layer: 'DESIGN_BOUNDARY', closed: true,
    vertices: [
      { x: designOffsetMm, y: designOffsetMm },
      { x: doorWidthMm - designOffsetMm, y: designOffsetMm },
      { x: doorWidthMm - designOffsetMm, y: doorHeightMm - designOffsetMm },
      { x: designOffsetMm, y: doorHeightMm - designOffsetMm },
    ],
  });

  // Per-leaf grille rectangles
  for (const leaf of result.leafLayouts) {
    const cx = leaf.leafOffsetMm + leaf.leafWidthMm / 2;
    const gx = cx - leaf.grilleWidthMm / 2;
    const gy = doorHeightMm - designOffsetMm - leaf.grilleHeightMm;
    if (leaf.grilleWidthMm > 0 && leaf.grilleHeightMm > 0) {
      entities.push({
        type: 'LWPOLYLINE', layer: 'GRILLE', closed: true,
        vertices: [
          { x: gx, y: gy }, { x: gx + leaf.grilleWidthMm, y: gy },
          { x: gx + leaf.grilleWidthMm, y: gy + leaf.grilleHeightMm },
          { x: gx, y: gy + leaf.grilleHeightMm },
        ],
      });
    }
  }

  // Undercut at bottom
  if (result.undercutHeightMm > 0) {
    entities.push({
      type: 'LWPOLYLINE', layer: 'UNDERCUT', closed: true,
      vertices: [
        { x: 0, y: 0 }, { x: doorWidthMm, y: 0 },
        { x: doorWidthMm, y: result.undercutHeightMm },
        { x: 0, y: result.undercutHeightMm },
      ],
    });
  }

  return {
    format: 'DXF-JSON/1.0',
    units: 'mm',
    entities,
    metadata: {
      generated: new Date().toISOString(),
      tool: 'DoorFlow',
      doorType: inputs.doorType,
      openingType: inputs.openingType,
    },
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ inputs, result, svgRef }: ExportPanelProps) {
  function handleJsonExport() {
    const payload = {
      meta: { tool: 'DoorFlow', generated: new Date().toISOString() },
      inputs: {
        ...inputs,
        leafConfigs: inputs.leafConfigs.map((cfg, i) => ({
          leafIndex: i,
          ...cfg,
        })),
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

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth * 2;
      canvas.height = svg.clientHeight * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        if (b) downloadBlob(b, `doorflow_${Date.now()}.png`);
      }, 'image/png');
    };
    img.src = url;
  }

  function handleDxfJsonExport() {
    const dxf = buildDxfJson(inputs, result);
    const blob = new Blob([JSON.stringify(dxf, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `doorflow_dxf_${Date.now()}.json`);
  }

  const btnBase =
    'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors duration-150';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Download size={13} className="text-slate-400" />
        <span className="text-[11px] uppercase tracking-widest text-slate-400 font-mono">
          設計結果エクスポート
        </span>
      </div>

      <button
        onClick={handleJsonExport}
        className={`${btnBase} border-sky-700/50 bg-sky-900/20 text-sky-300 hover:bg-sky-900/40`}
      >
        <FileJson size={14} />
        <span>JSON パラメータ書き出し</span>
      </button>

      <button
        onClick={handlePngExport}
        className={`${btnBase} border-violet-700/50 bg-violet-900/20 text-violet-300 hover:bg-violet-900/40`}
      >
        <Image size={14} />
        <span>PNG 立面図ダウンロード</span>
      </button>

      <button
        onClick={handleDxfJsonExport}
        className={`${btnBase} border-amber-700/50 bg-amber-900/20 text-amber-300 hover:bg-amber-900/40`}
      >
        <FileCode2 size={14} />
        <span>DXF-JSON 図面データ出力</span>
      </button>

      <p className="text-[10px] text-slate-600 leading-tight pt-1">
        PNG は現在の立面図 SVG を 2× 解像度でレンダリング。DXF-JSON は外部 CAD ツールへのインポート用途向け簡易フォーマット。
      </p>
    </div>
  );
}
