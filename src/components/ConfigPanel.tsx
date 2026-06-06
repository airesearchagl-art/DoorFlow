import {
  Ruler,
  Wind,
  Sliders,
  Settings2,
  LayoutGrid,
} from 'lucide-react';
import { type VentilationInputs, type OpeningType, DEFAULTS } from '../core/ventilationEngine';

interface ConfigPanelProps {
  inputs: VentilationInputs;
  onChange: (updated: VentilationInputs) => void;
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
      <Icon size={14} className="text-sky-400" />
      <span className="text-xs font-semibold uppercase tracking-widest text-sky-400">{label}</span>
    </div>
  );
}

function NumberInput({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
        />
        <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>
      </div>
    </label>
  );
}

function SliderInput({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-mono text-sky-400">
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-sky-500 h-1.5"
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </label>
  );
}

const OPENING_TYPES: { value: OpeningType; label: string; desc: string }[] = [
  { value: 'louver', label: 'Louver', desc: 'Angled slat grille' },
  { value: 'punching', label: 'Punching', desc: 'Perforated panel' },
  { value: 'undercut', label: 'Undercut', desc: 'Bottom door gap' },
];

export function ConfigPanel({ inputs, onChange }: ConfigPanelProps) {
  function set<K extends keyof VentilationInputs>(key: K, value: VentilationInputs[K]) {
    onChange({ ...inputs, [key]: value });
  }

  return (
    <aside className="flex flex-col gap-0 bg-slate-900 border border-slate-800 rounded-xl p-5 h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <Settings2 size={15} className="text-sky-400" />
        </div>
        <h2 className="text-sm font-semibold text-slate-200">Parameters</h2>
      </div>

      {/* Door Dimensions */}
      <SectionHeader icon={Ruler} label="Door Dimensions" />
      <div className="flex flex-col gap-3">
        <NumberInput
          label="Width"
          value={inputs.doorWidthMm}
          unit="mm"
          min={500}
          max={1500}
          step={10}
          onChange={v => set('doorWidthMm', v)}
        />
        <NumberInput
          label="Height"
          value={inputs.doorHeightMm}
          unit="mm"
          min={1800}
          max={3000}
          step={10}
          onChange={v => set('doorHeightMm', v)}
        />
        <SliderInput
          label="Design Offset"
          value={inputs.designOffsetMm}
          unit="mm"
          min={50}
          max={300}
          step={5}
          onChange={v => set('designOffsetMm', v)}
        />
      </div>

      {/* Airflow */}
      <SectionHeader icon={Wind} label="Airflow Target" />
      <div className="flex flex-col gap-3">
        <SliderInput
          label="Required Airflow"
          value={inputs.requiredAirflowM3h}
          unit="m³/h"
          min={10}
          max={500}
          step={5}
          onChange={v => set('requiredAirflowM3h', v)}
        />
        <SliderInput
          label="Min Velocity"
          value={inputs.minVelocityMs}
          unit="m/s"
          min={0.5}
          max={2.5}
          step={0.1}
          onChange={v => set('minVelocityMs', v)}
        />
        <SliderInput
          label="Max Velocity"
          value={inputs.maxVelocityMs}
          unit="m/s"
          min={2.0}
          max={6.0}
          step={0.1}
          onChange={v => set('maxVelocityMs', v)}
        />
      </div>

      {/* Opening Type */}
      <SectionHeader icon={LayoutGrid} label="Opening Type" />
      <div className="flex flex-col gap-2">
        {OPENING_TYPES.map(opt => (
          <button
            key={opt.value}
            onClick={() => set('openingType', opt.value)}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
              inputs.openingType === opt.value
                ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${
                inputs.openingType === opt.value ? 'border-sky-400 bg-sky-400' : 'border-slate-600'
              }`}
            />
            <div>
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[11px] text-slate-500">{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Opening Rate */}
      <SectionHeader icon={Sliders} label="Opening Rate" />
      <SliderInput
        label={`Effective open area ratio`}
        value={inputs.openingRate}
        unit=""
        min={0.1}
        max={0.8}
        step={0.01}
        onChange={v => set('openingRate', v)}
      />
      <div className="mt-1 text-[11px] text-slate-500">
        Default: {(DEFAULTS.openingRate * 100).toFixed(0)}% (louver/grille industry standard)
      </div>

      {/* Reset */}
      <button
        onClick={() =>
          onChange({
            doorWidthMm: 900,
            doorHeightMm: 2100,
            designOffsetMm: DEFAULTS.designOffsetMm,
            requiredAirflowM3h: 120,
            minVelocityMs: DEFAULTS.minVelocityMs,
            maxVelocityMs: DEFAULTS.maxVelocityMs,
            openingType: 'louver',
            openingRate: DEFAULTS.openingRate,
          })
        }
        className="mt-6 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors text-center"
      >
        Reset to defaults
      </button>
    </aside>
  );
}
