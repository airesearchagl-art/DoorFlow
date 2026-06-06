import {
  Ruler,
  Wind,
  Sliders,
  Settings2,
  LayoutGrid,
  MoveHorizontal,
  DoorOpen,
  GlassWater,
  MoveVertical,
} from 'lucide-react';
import { type VentilationInputs, type OpeningType, type DoorType, DEFAULTS } from '../core/ventilationEngine';

interface ConfigPanelProps {
  inputs: VentilationInputs;
  onChange: (updated: VentilationInputs) => void;
  grilleContribRatio: number;
  undercutContribRatio: number;
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
  label, value, unit, min, max, step, onChange,
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
        />
        <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>
      </div>
    </label>
  );
}

function SliderInput({
  label, value, unit, min, max, step, onChange, highlight, color = 'sky',
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void; highlight?: boolean; color?: 'sky' | 'amber' | 'violet';
}) {
  const accentMap = { sky: 'accent-sky-500', amber: 'accent-amber-400', violet: 'accent-violet-400' };
  const labelColor = highlight
    ? (color === 'amber' ? 'text-amber-300' : color === 'violet' ? 'text-violet-300' : 'text-sky-300')
    : 'text-slate-400';
  const valColor = highlight
    ? (color === 'amber' ? 'text-amber-400' : color === 'violet' ? 'text-violet-400' : 'text-sky-400')
    : 'text-sky-400';

  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex justify-between">
        <span className={`text-xs ${labelColor}`}>{label}</span>
        <span className={`text-xs font-mono ${valColor}`}>
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full h-1.5 ${accentMap[color]}`}
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </label>
  );
}

const DOOR_TYPES: { value: DoorType; label: string; desc: string; icon: string }[] = [
  { value: 'single',       label: '片開き扉',  desc: '標準1枚扉（単体ガラリ配置）',          icon: '🚪' },
  { value: 'double',       label: '両開き扉',  desc: '2枚均等・各扉にガラリを分散配置',       icon: '🚪🚪' },
  { value: 'parent-child', label: '親子扉',    desc: '親60%+子40%・各扉に面積比例配置',      icon: '🚪◻' },
];

const OPENING_TYPES: { value: OpeningType; label: string; desc: string }[] = [
  { value: 'louver',   label: 'ガラリ',              desc: '有効開口率35%基準の羽板式換気口' },
  { value: 'punching', label: 'パンチングメタル',    desc: '打ち抜き孔加工パネル' },
  { value: 'undercut', label: 'ドア下アンダーカット', desc: 'ドア下端と床面のすき間による通気' },
];

export const OPENING_TYPE_LABELS: Record<OpeningType, string> = {
  louver:   'ガラリ',
  punching: 'パンチングメタル',
  undercut: 'アンダーカット',
};

// Contribution bar component
function ContribBar({ grilleRatio, undercutRatio }: { grilleRatio: number; undercutRatio: number }) {
  const grillePct = Math.round(grilleRatio * 100);
  const undercutPct = Math.round(undercutRatio * 100);
  if (grillePct === 0 && undercutPct === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">換気面積寄与率</div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-sky-500 transition-all duration-300"
          style={{ width: `${grillePct}%` }}
        />
        <div
          className="h-full bg-amber-500 transition-all duration-300"
          style={{ width: `${undercutPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-sky-400">ガラリ {grillePct}%</span>
        {undercutPct > 0 && <span className="text-amber-400">アンダーカット {undercutPct}%</span>}
      </div>
    </div>
  );
}

export function ConfigPanel({ inputs, onChange, grilleContribRatio, undercutContribRatio }: ConfigPanelProps) {
  function set<K extends keyof VentilationInputs>(key: K, value: VentilationInputs[K]) {
    onChange({ ...inputs, [key]: value });
  }

  const isGrille = inputs.openingType === 'louver' || inputs.openingType === 'punching';
  const maxGrilleWidth = Math.max(100, inputs.doorWidthMm - 2 * inputs.designOffsetMm);
  const maxGrilleHeight = Math.max(50, inputs.doorHeightMm - 2 * inputs.designOffsetMm);

  return (
    <aside className="flex flex-col gap-0 bg-slate-900 border border-slate-800 rounded-xl p-5 h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <Settings2 size={15} className="text-sky-400" />
        </div>
        <h2 className="text-sm font-semibold text-slate-200">設計パラメータ設定</h2>
      </div>

      {/* ドアタイプ */}
      <SectionHeader icon={DoorOpen} label="建具構成タイプ" />
      <div className="flex flex-col gap-1.5">
        {DOOR_TYPES.map(dt => (
          <button
            key={dt.value}
            onClick={() => set('doorType', dt.value)}
            className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
              inputs.doorType === dt.value
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${
              inputs.doorType === dt.value ? 'border-violet-400 bg-violet-400' : 'border-slate-600'
            }`} />
            <div>
              <div className="text-xs font-medium flex items-center gap-1.5">
                <span>{dt.icon}</span> {dt.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{dt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* 建具寸法 */}
      <SectionHeader icon={Ruler} label="建具寸法境界" />
      <div className="flex flex-col gap-3">
        <NumberInput label="ドア製品幅 (W)" value={inputs.doorWidthMm} unit="mm"
          min={500} max={2400} step={10} onChange={v => set('doorWidthMm', v)} />
        <NumberInput label="ドア製品高さ (H)" value={inputs.doorHeightMm} unit="mm"
          min={1800} max={3000} step={10} onChange={v => set('doorHeightMm', v)} />
        <SliderInput label="意匠境界オフセット（標準150mm）" value={inputs.designOffsetMm}
          unit="mm" min={50} max={300} step={5} onChange={v => set('designOffsetMm', v)} />
      </div>

      {/* 設備要求換気量 */}
      <SectionHeader icon={Wind} label="設備要求換気量" />
      <div className="flex flex-col gap-3">
        <SliderInput label="必要風量 (Q)" value={inputs.requiredAirflowM3h}
          unit="m³/h" min={10} max={500} step={5} onChange={v => set('requiredAirflowM3h', v)} />
        <SliderInput label="許容最小風速" value={inputs.minVelocityMs}
          unit="m/s" min={0.5} max={2.5} step={0.1} onChange={v => set('minVelocityMs', v)} />
        <SliderInput label="許容最大風速" value={inputs.maxVelocityMs}
          unit="m/s" min={2.0} max={6.0} step={0.1} onChange={v => set('maxVelocityMs', v)} />
      </div>

      {/* 開口部方式 */}
      <SectionHeader icon={LayoutGrid} label="開口部方式選択" />
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
            <div className={`w-3.5 h-3.5 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${
              inputs.openingType === opt.value ? 'border-sky-400 bg-sky-400' : 'border-slate-600'
            }`} />
            <div>
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[11px] text-slate-500">{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ガラリ寸法制御 */}
      {isGrille && (
        <>
          <SectionHeader icon={MoveHorizontal} label="固定開口幅 (W) 設定" />
          <div className="flex flex-col gap-2">
            <SliderInput label="ガラリ固定幅（0 = 自動最大幅）"
              value={inputs.selectedLouverWidth} unit="mm"
              min={0} max={maxGrilleWidth} step={10}
              onChange={v => set('selectedLouverWidth', v)}
              highlight color="amber" />
            <div className="text-[11px] text-slate-500 leading-snug">
              固定幅を設定すると、不足面積を<span className="text-amber-400 font-semibold">アンダーカット</span>で自動補償します。
              <br />0 = 意匠境界内の最大幅を自動採用。
            </div>
            {inputs.selectedLouverWidth > 0 && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                <span className="text-amber-400 text-[11px]">⚡</span>
                <span className="text-[11px] text-amber-300">
                  固定幅モード: {inputs.selectedLouverWidth} mm
                </span>
              </div>
            )}
          </div>

          <SectionHeader icon={MoveVertical} label="ガラリ高さ (H) 設定" />
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => set('louverHeightFixed', !inputs.louverHeightFixed)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                  inputs.louverHeightFixed ? 'bg-violet-500' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  inputs.louverHeightFixed ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              <span className="text-xs text-slate-400">ガラリ高さ(H)を固定する</span>
            </label>
            {inputs.louverHeightFixed && (
              <SliderInput label="ガラリ固定高さ"
                value={inputs.louverHeight} unit="mm"
                min={50} max={maxGrilleHeight} step={10}
                onChange={v => set('louverHeight', v)}
                highlight color="violet" />
            )}
            <div className="text-[11px] text-slate-500 leading-snug">
              {inputs.louverHeightFixed
                ? '指定高さで有効面積を算出し、不足分をアンダーカットで補償します。'
                : '必要換気量から最適高さを自動算出します。'}
            </div>
          </div>

          {/* スリットガラス下端位置 */}
          <SectionHeader icon={GlassWater} label="明かり窓制約（スリットガラス下端）" />
          <div className="flex flex-col gap-2">
            <SliderInput label="スリットガラス下端位置（ガラリ上端基準）"
              value={inputs.glassSlitYMm} unit="mm"
              min={0} max={Math.max(0, inputs.doorHeightMm - 400)} step={10}
              onChange={v => set('glassSlitYMm', v)} />
            <div className="text-[11px] text-slate-500 leading-snug">
              0 = 制約なし。値を設定するとガラリ配置可能ゾーンの上端が制限されます。
              <br />スリットガラス下端（ドア上端からの距離）を入力してください。
            </div>
            {inputs.glassSlitYMm > 0 && (
              <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2">
                <span className="text-sky-400 text-[11px]">🪟</span>
                <span className="text-[11px] text-sky-300">
                  スリットガラス下端: {inputs.glassSlitYMm} mm — ガラリゾーン上端に連動
                </span>
              </div>
            )}
          </div>

          {/* 寄与率グラフ */}
          <ContribBar grilleRatio={grilleContribRatio} undercutRatio={undercutContribRatio} />
        </>
      )}

      {/* 開口率設定 */}
      <SectionHeader icon={Sliders} label="開口率設定 (有効開口率 α)" />
      <SliderInput label="有効開口面積比率" value={inputs.openingRate}
        unit="" min={0.1} max={0.8} step={0.01} onChange={v => set('openingRate', v)} />
      <div className="mt-1 text-[11px] text-slate-500">
        標準値: {(DEFAULTS.openingRate * 100).toFixed(0)}%（ガラリ・グリル業界標準値）
      </div>

      {/* リセット */}
      <button
        onClick={() => onChange({
          doorWidthMm: 900, doorHeightMm: 2100,
          doorType: DEFAULTS.doorType,
          designOffsetMm: DEFAULTS.designOffsetMm,
          requiredAirflowM3h: 120,
          minVelocityMs: DEFAULTS.minVelocityMs,
          maxVelocityMs: DEFAULTS.maxVelocityMs,
          openingType: 'louver', openingRate: DEFAULTS.openingRate,
          selectedLouverWidth: DEFAULTS.selectedLouverWidth,
          louverHeightFixed: DEFAULTS.louverHeightFixed,
          louverHeight: DEFAULTS.louverHeight,
          glassSlitYMm: DEFAULTS.glassSlitYMm,
        })}
        className="mt-6 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors text-center"
      >
        デフォルト値にリセット
      </button>
    </aside>
  );
}
