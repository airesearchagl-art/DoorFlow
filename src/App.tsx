import { useState, useMemo, useRef } from 'react';
import { DoorOpen } from 'lucide-react';
import {
  type VentilationInputs,
  type DoorType,
  DEFAULTS,
  DEFAULT_LEAF_CONFIG,
  DOOR_WIDTH_PRESETS,
  calculateVentilation,
} from './core/ventilationEngine';
import { ConfigPanel } from './components/ConfigPanel';
import { DoorCanvas } from './components/DoorCanvas';
import { HUDTelemetry } from './components/HUDTelemetry';
import { ExportPanel } from './components/ExportPanel';
import './index.css';

const DEFAULT_INPUTS: VentilationInputs = {
  doorWidthMm: DOOR_WIDTH_PRESETS['single'],
  doorHeightMm: 2100,
  doorType: DEFAULTS.doorType,
  childWidthMm: DEFAULTS.childWidthMm,
  designOffsetMm: DEFAULTS.designOffsetMm,
  requiredAirflowM3h: 120,
  minVelocityMs: DEFAULTS.minVelocityMs,
  maxVelocityMs: DEFAULTS.maxVelocityMs,
  openingType: 'louver',
  openingRate: DEFAULTS.openingRate,
  leafConfigs: [{ ...DEFAULT_LEAF_CONFIG }, { ...DEFAULT_LEAF_CONFIG }],
};

export default function App() {
  const [inputs, setInputs] = useState<VentilationInputs>(DEFAULT_INPUTS);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // When door type changes, auto-update total width preset
  function handleDoorTypeChange(newType: DoorType) {
    setInputs(prev => ({
      ...prev,
      doorType: newType,
      doorWidthMm: DOOR_WIDTH_PRESETS[newType],
    }));
  }

  const result = useMemo(() => calculateVentilation(inputs), [inputs]);

  const borderAccent = result.isSafe ? 'border-slate-800' : 'border-red-600/60';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Topbar */}
      <header className={`border-b ${borderAccent} bg-slate-900/80 backdrop-blur-sm transition-colors duration-300`}>
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <DoorOpen size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 leading-none">DoorFlow</h1>
              <p className="text-[10px] text-slate-500 leading-tight">建具換気シミュレーションツール</p>
            </div>
          </div>

          <div className="ml-6 h-5 w-px bg-slate-700" />

          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400">
              風速:{' '}
              <span className={`font-mono font-bold ${
                result.isSafe ? 'text-emerald-400'
                  : result.velocityTooHigh ? 'text-red-400'
                  : 'text-amber-400'
              }`}>
                {result.actualVelocityMs.toFixed(2)} m/s
              </span>
            </span>
            <span className="text-slate-400">
              有効面積:{' '}
              <span className="font-mono font-bold text-sky-400">
                {(result.effectiveAreaM2 * 1e4).toFixed(1)} cm²
              </span>
            </span>
            <span className="text-slate-400">
              Q:{' '}
              <span className="font-mono font-bold text-slate-300">
                {inputs.requiredAirflowM3h} m³/h
              </span>
            </span>
            {result.undercutHeightMm > 0 && (inputs.openingType === 'louver' || inputs.openingType === 'punching') && (
              <span className="text-amber-400 font-mono font-bold">
                ＋UC {result.undercutHeightMm.toFixed(1)}mm
              </span>
            )}
          </div>

          <div className="ml-auto">
            <div className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors duration-300 ${
              result.isSafe
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-red-500/50 bg-red-500/10 text-red-400 animate-pulse'
            }`}>
              {result.isSafe ? '● 設備要件適合' : '● 要件違反'}
            </div>
          </div>
        </div>
      </header>

      {/* Alert banner */}
      {!result.isSafe && result.remediationHint && (
        <div className="bg-red-950/60 border-b border-red-600/40 px-6 py-2">
          <div className="max-w-[1440px] mx-auto text-xs text-red-300 flex items-center gap-2">
            <span className="font-bold text-red-400 flex-shrink-0">⚠ 警告:</span>
            <span>{result.remediationHint}</span>
          </div>
        </div>
      )}

      {/* Main layout */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto grid grid-cols-[320px_1fr_340px] gap-0 divide-x divide-slate-800">
        {/* Left: Config panel */}
        <div className="overflow-y-auto">
          <ConfigPanel
            inputs={inputs}
            onChange={setInputs}
            onDoorTypeChange={handleDoorTypeChange}
            grilleContribRatio={result.grilleContribRatio}
            undercutContribRatio={result.undercutContribRatio}
          />
        </div>

        {/* Centre: Blueprint canvas */}
        <div className="p-6 flex flex-col items-center justify-start gap-4 bg-slate-950/50 overflow-y-auto">
          <div className="w-full max-w-[560px]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-slate-500 font-mono">
                建具立面図（換気開口レイアウト）
              </span>
              <span className="text-[10px] text-slate-600 font-mono">縮尺: 1/10 概略</span>
            </div>
            <DoorCanvas inputs={inputs} result={result} svgRef={svgRef} />
          </div>

          {/* Physics formula footer */}
          <div className="w-full max-w-[560px] bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-3">設備換気力学・逆算根拠式</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Q = V_flow / 3600', sub: '通過秒風量 Q (m³/s)', value: `${result.airflowM3s.toFixed(4)} m³/s` },
                { label: 'A_eff = Q / V',     sub: '必要有効面積 A_eff (㎡)', value: `${result.effectiveAreaM2.toFixed(4)} m²` },
                { label: 'A_phys = A_eff / η', sub: '必要製品面積 A_phys (㎡)', value: `${result.physicalAreaM2.toFixed(4)} m²` },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-slate-500 italic">{f.label}</span>
                  <span className="text-[10px] text-slate-600">{f.sub}</span>
                  <span className="text-sm font-mono font-bold text-sky-400">{f.value}</span>
                </div>
              ))}
            </div>
            {result.undercutHeightMm > 0 && (inputs.openingType === 'louver' || inputs.openingType === 'punching') && (
              <div className="mt-3 border-t border-slate-800 pt-3 grid grid-cols-2 gap-3 text-center">
                {[
                  {
                    label: 'A_shortage = A_eff − A_grille',
                    sub: 'アンダーカット必要面積 (㎡)',
                    value: `${((result.effectiveAreaM2 - result.grilleEffectiveAreaM2) * 1e4).toFixed(1)} cm²`,
                    color: 'text-amber-400',
                  },
                  {
                    label: 'UC_h = A_shortage / W_door',
                    sub: 'アンダーカット高さ (mm)',
                    value: `${result.undercutHeightMm.toFixed(1)} mm`,
                    color: result.undercutOverflowsStructural ? 'text-red-400' : 'text-amber-400',
                  },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-500 italic">{f.label}</span>
                    <span className="text-[10px] text-slate-600">{f.sub}</span>
                    <span className={`text-sm font-mono font-bold ${f.color}`}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export panel */}
          <div className="w-full max-w-[560px] bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <ExportPanel inputs={inputs} result={result} svgRef={svgRef} />
          </div>
        </div>

        {/* Right: HUD Telemetry */}
        <div className="p-5 overflow-y-auto">
          <HUDTelemetry result={result} inputs={inputs} />
        </div>
      </main>
    </div>
  );
}
