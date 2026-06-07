import { useState, useEffect } from 'react';
import {
  Ruler, Wind, Sliders, Settings2, LayoutGrid,
  MoveHorizontal, DoorOpen, GlassWater, MoveVertical, Layers, AlignCenter,
  FlaskConical, Calculator,
} from 'lucide-react';
import {
  type VentilationInputs, type OpeningType, type DoorType, type LeafConfig, type GrilleAlign,
  type SimMode, type ValidationConfig, type ValidationLeafConfig,
  DEFAULTS, DEFAULT_LEAF_CONFIG, DOOR_WIDTH_PRESETS, GRILLE_ALIGN_LABELS,
} from '../core/ventilationEngine';

interface ConfigPanelProps {
  inputs: VentilationInputs;
  onChange: (updated: VentilationInputs) => void;
  onDoorTypeChange: (newType: DoorType) => void;
  grilleContribRatio: number;
  undercutContribRatio: number;
  simMode: SimMode;
  onSimModeChange: (m: SimMode) => void;
  validationConfig: ValidationConfig;
  onValidationConfigChange: (c: ValidationConfig) => void;
}

// ---------------------------------------------------------------------------
// Number input with blur-commit (avoids slider/input conflicts during typing)
// ---------------------------------------------------------------------------
function NumInput({
  value, min, max, step, onChange, color = 'sky', freeMax = false,
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; color?: 'sky' | 'amber' | 'violet' | 'emerald'; freeMax?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Keep local in sync when external value changes while not focused
  useEffect(() => {
    if (!focused) setLocal(String(value));
  }, [value, focused]);

  const textMap = {
    sky: 'text-sky-400', amber: 'text-amber-400',
    violet: 'text-violet-400', emerald: 'text-emerald-400',
  };

  function commit(raw: string) {
    const n = parseFloat(raw);
    if (isNaN(n)) { setLocal(String(value)); return; }
    const clamped = freeMax ? Math.max(min, n) : Math.max(min, Math.min(max, n));
    const rounded = Math.round(clamped / step) * step;
    onChange(rounded);
    setLocal(String(rounded));
  }

  return (
    <input
      type="number" min={min} max={freeMax ? undefined : max} step={step}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={e => { setFocused(false); commit(e.target.value); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`w-20 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono ${textMap[color]} focus:outline-none focus:border-sky-500 text-right`}
    />
  );
}

// Slider + number pair — bidirectional, number commits on blur
function SliderNumberInput({
  label, value, unit, min, max, step, onChange, color = 'sky', freeMax = false,
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  color?: 'sky' | 'amber' | 'violet' | 'emerald';
  freeMax?: boolean;
}) {
  const accentMap = {
    sky: 'accent-sky-500', amber: 'accent-amber-400',
    violet: 'accent-violet-400', emerald: 'accent-emerald-500',
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs text-slate-400 flex-1 leading-tight">{label}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <NumInput value={value} min={min} max={max} step={step} onChange={onChange} color={color} freeMax={freeMax} />
          <span className="text-[10px] text-slate-500 whitespace-nowrap w-8">{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={freeMax ? Math.min(value, max) : value}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full h-1.5 ${accentMap[color]}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static UI helpers
// ---------------------------------------------------------------------------

function SectionHeader({ icon: Icon, label, accent = 'sky' }: {
  icon: React.ElementType; label: string; accent?: 'sky' | 'violet' | 'amber' | 'emerald';
}) {
  const colors = {
    sky: 'text-sky-400', violet: 'text-violet-400',
    amber: 'text-amber-400', emerald: 'text-emerald-400',
  };
  return (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
      <Icon size={14} className={colors[accent]} />
      <span className={`text-xs font-semibold uppercase tracking-widest ${colors[accent]}`}>{label}</span>
    </div>
  );
}

const DOOR_TYPES: { value: DoorType; label: string; presetW: string }[] = [
  { value: 'single',       label: '片開き',  presetW: `${DOOR_WIDTH_PRESETS.single}mm` },
  { value: 'parent-child', label: '親子扉',  presetW: `${DOOR_WIDTH_PRESETS['parent-child']}mm` },
  { value: 'double',       label: '両開き',  presetW: `${DOOR_WIDTH_PRESETS.double}mm` },
];

const OPENING_TYPES: { value: OpeningType; label: string; desc: string }[] = [
  { value: 'louver',   label: 'ガラリ',              desc: '有効開口率35%・羽板式換気口' },
  { value: 'punching', label: 'パンチングメタル',    desc: '打ち抜き孔加工パネル' },
  { value: 'undercut', label: 'ドア下アンダーカット', desc: 'ドア下端すき間による通気' },
];

export const OPENING_TYPE_LABELS: Record<OpeningType, string> = {
  louver: 'ガラリ', punching: 'パンチングメタル', undercut: 'アンダーカット',
};

const GRILLE_ALIGN_OPTIONS: { value: GrilleAlign; label: string }[] = [
  { value: 'left',      label: '左下' },
  { value: 'center',    label: '中央下' },
  { value: 'right',     label: '右下' },
  { value: 'far-left',  label: '左端' },
  { value: 'far-right', label: '右端' },
];

function ContribBar({ grilleRatio, undercutRatio }: { grilleRatio: number; undercutRatio: number }) {
  const grillePct = Math.round(grilleRatio * 100);
  const undercutPct = Math.round(undercutRatio * 100);
  if (grillePct === 0 && undercutPct === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">換気面積寄与率</div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
        <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${grillePct}%` }} />
        <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${undercutPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-sky-400">ガラリ {grillePct}%</span>
        {undercutPct > 0 && <span className="text-amber-400">アンダーカット {undercutPct}%</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-leaf grille + glass settings
// ---------------------------------------------------------------------------
function LeafConfigPanel({
  leafCfg, doorHeightMm, designOffsetMm, maxLeafW, onChange,
}: {
  leafCfg: LeafConfig;
  doorHeightMm: number;
  designOffsetMm: number;
  maxLeafW: number;
  onChange: (updated: LeafConfig) => void;
}) {
  const maxGrilleW = Math.max(50, maxLeafW - 2 * designOffsetMm);
  const maxGrilleH = Math.max(50, doorHeightMm - 2 * designOffsetMm);
  const maxSlitY   = Math.max(0, doorHeightMm - designOffsetMm - 50);

  function set<K extends keyof LeafConfig>(key: K, v: LeafConfig[K]) {
    onChange({ ...leafCfg, [key]: v });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Grille width */}
      <div>
        <SectionHeader icon={MoveHorizontal} label="開口幅 (W)" accent="amber" />
        <SliderNumberInput
          label="ガラリ固定幅（0 = 自動最大幅）"
          value={leafCfg.selectedLouverWidth} unit="mm"
          min={0} max={maxGrilleW} step={10}
          onChange={v => set('selectedLouverWidth', v)} color="amber"
        />
      </div>

      {/* Grille align preset */}
      <div>
        <SectionHeader icon={AlignCenter} label="ガラリ配置プリセット" accent="amber" />
        <div className="flex gap-1 flex-wrap">
          {GRILLE_ALIGN_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => set('grilleAlign', opt.value)}
              className={`px-2.5 py-1 rounded text-xs border transition-all ${
                leafCfg.grilleAlign === opt.value
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
              }`}
            >
              {GRILLE_ALIGN_LABELS[opt.value]}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">
          {GRILLE_ALIGN_LABELS[leafCfg.grilleAlign]} — {
            leafCfg.grilleAlign === 'center' ? '意匠ゾーン内中央配置' :
            leafCfg.grilleAlign === 'left'   ? '意匠ゾーン左寄せ' :
            leafCfg.grilleAlign === 'right'  ? '意匠ゾーン右寄せ' :
            leafCfg.grilleAlign === 'far-left' ? '扉左端（オフセットなし）' :
                                                 '扉右端（オフセットなし）'
          }
        </p>
      </div>

      {/* Grille height */}
      <div>
        <SectionHeader icon={MoveVertical} label="開口高さ (H)" accent="violet" />
        <label className="flex items-center gap-2.5 cursor-pointer mb-2">
          <div
            onClick={() => set('louverHeightFixed', !leafCfg.louverHeightFixed)}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              leafCfg.louverHeightFixed ? 'bg-violet-500' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              leafCfg.louverHeightFixed ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
          <span className="text-xs text-slate-400">ガラリ高さ(H)を固定する</span>
        </label>
        {leafCfg.louverHeightFixed && (
          <SliderNumberInput
            label="ガラリ固定高さ"
            value={leafCfg.louverHeight} unit="mm"
            min={50} max={maxGrilleH} step={10}
            onChange={v => set('louverHeight', v)} color="violet"
          />
        )}
        <p className="text-[11px] text-slate-500 leading-snug mt-1">
          {leafCfg.louverHeightFixed
            ? '指定高さで算出し、不足分はアンダーカットで補償します。'
            : '必要換気量から最適高さを自動算出します。'}
        </p>
      </div>

      {/* Glass slit */}
      <div>
        <SectionHeader icon={GlassWater} label="スリットガラス" accent="sky" />

        {/* Linked mode toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer mb-2">
          <div
            onClick={() => set('glassSlitLinked', !leafCfg.glassSlitLinked)}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              leafCfg.glassSlitLinked ? 'bg-sky-500' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              leafCfg.glassSlitLinked ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
          <span className="text-xs text-slate-400">ガラリ連動モード</span>
        </label>

        {leafCfg.glassSlitLinked ? (
          <div className="bg-sky-900/20 border border-sky-700/40 rounded-lg px-3 py-2 text-[11px] text-sky-300 space-y-0.5">
            <div>🪟 ガラス幅 = ガラリ幅に自動同期</div>
            <div>📐 ガラス下端Y = ガラリ上端に自動スナップ</div>
          </div>
        ) : (
          <>
            <SliderNumberInput
              label="スリットガラス下端位置（ドア上端から）"
              value={leafCfg.glassSlitYMm} unit="mm"
              min={0} max={maxSlitY} step={10}
              onChange={v => set('glassSlitYMm', v)} color="sky"
            />
            <p className="text-[11px] text-slate-500 leading-snug mt-1">
              0 = スリットガラスなし。値を設定するとガラリゾーンの上端が制限されます。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation mode panel
// ---------------------------------------------------------------------------
function ValidationPanel({
  inputs, validationConfig, onChange,
}: {
  inputs: VentilationInputs;
  validationConfig: ValidationConfig;
  onChange: (c: ValidationConfig) => void;
}) {
  const leaves = inputs.doorType === 'single' ? 1 : 2;
  const isParentChild = inputs.doorType === 'parent-child';
  const leafLabels = isParentChild ? ['親扉', '子扉'] : inputs.doorType === 'double' ? ['左扉', '右扉'] : ['扉'];

  function setLeaf(idx: 0 | 1, key: keyof ValidationLeafConfig, v: number) {
    const next = [...validationConfig.leafConfigs] as [ValidationLeafConfig, ValidationLeafConfig];
    next[idx] = { ...next[idx], [key]: Math.max(0, v) };
    onChange({ ...validationConfig, leafConfigs: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-violet-900/20 border border-violet-600/40 rounded-lg px-3 py-2 text-[11px] text-violet-300 leading-snug">
        検証モード：実寸法を入力し、発生する通過風速をリアルタイム確認します。
        算出モードの「必要サイズ計算」入力は無効化されます。
      </div>

      {Array.from({ length: leaves }).map((_, i) => {
        const idx = i as 0 | 1;
        const lc = validationConfig.leafConfigs[idx];
        return (
          <div key={idx} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-widest text-violet-400 font-semibold mb-1">
              {leafLabels[i]} — 寸法入力
            </div>
            <SliderNumberInput label="ガラリ幅 (W)" value={lc.grilleWidthMm} unit="mm"
              min={0} max={Math.max(50, inputs.doorWidthMm)} step={10}
              onChange={v => setLeaf(idx, 'grilleWidthMm', v)} color="amber" />
            <SliderNumberInput label="ガラリ高さ (H)" value={lc.grilleHeightMm} unit="mm"
              min={0} max={Math.max(50, inputs.doorHeightMm)} step={10}
              onChange={v => setLeaf(idx, 'grilleHeightMm', v)} color="violet" />
          </div>
        );
      })}

      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold mb-1">
          アンダーカット補足
        </div>
        <SliderNumberInput label="アンダーカット高さ" value={validationConfig.undercutHeightMm} unit="mm"
          min={0} max={30} step={1}
          onChange={v => onChange({ ...validationConfig, undercutHeightMm: v })} color="amber" />
        {validationConfig.undercutHeightMm > 25 && (
          <span className="text-[11px] text-red-400">⚠ 構造上限（25mm）を超過</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ConfigPanel
// ---------------------------------------------------------------------------
export function ConfigPanel({
  inputs, onChange, onDoorTypeChange, grilleContribRatio, undercutContribRatio,
  simMode, onSimModeChange, validationConfig, onValidationConfigChange,
}: ConfigPanelProps) {
  const [activeLeafTab, setActiveLeafTab] = useState<0 | 1>(0);

  function set<K extends keyof VentilationInputs>(key: K, value: VentilationInputs[K]) {
    onChange({ ...inputs, [key]: value });
  }

  function setLeafCfg(idx: 0 | 1, cfg: LeafConfig) {
    const newConfigs: [LeafConfig, LeafConfig] = [...inputs.leafConfigs] as [LeafConfig, LeafConfig];
    newConfigs[idx] = cfg;
    onChange({ ...inputs, leafConfigs: newConfigs });
  }

  const isMultiLeaf  = inputs.doorType !== 'single';
  const isGrille     = inputs.openingType === 'louver' || inputs.openingType === 'punching';
  const isParentChild = inputs.doorType === 'parent-child';
  const isDouble     = inputs.doorType === 'double';

  const mainLeafW = isParentChild
    ? inputs.doorWidthMm - inputs.childWidthMm
    : isDouble ? inputs.doorWidthMm / 2 : inputs.doorWidthMm;
  const childLeafW = isParentChild ? inputs.childWidthMm : inputs.doorWidthMm / 2;
  const currentLeafW = activeLeafTab === 0 ? mainLeafW : childLeafW;
  const leafTabLabels = isParentChild ? ['親扉', '子扉'] : ['左扉', '右扉'];

  const isValidate = simMode === 'validate';

  return (
    <aside className="flex flex-col gap-0 bg-slate-900 border-r border-slate-800 p-5 min-h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <Settings2 size={15} className="text-sky-400" />
        </div>
        <h2 className="text-sm font-semibold text-slate-200">設計パラメータ設定</h2>
      </div>

      {/* ── モード切替 ────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-800 rounded-xl mb-5 border border-slate-700">
        <button
          onClick={() => onSimModeChange('calculate')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            !isValidate ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calculator size={12} />
          算出モード
        </button>
        <button
          onClick={() => onSimModeChange('validate')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            isValidate ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical size={12} />
          検証モード
        </button>
      </div>

      {/* ── 検証モードパネル ──────────────────────── */}
      {isValidate && (
        <ValidationPanel
          inputs={inputs}
          validationConfig={validationConfig}
          onChange={onValidationConfigChange}
        />
      )}

      {/* ── ドアタイプ ─────────────────────────────── */}
      <SectionHeader icon={DoorOpen} label="建具構成タイプ" accent="violet" />
      <div className="flex gap-1.5 mb-2">
        {DOOR_TYPES.map(dt => (
          <button key={dt.value} onClick={() => onDoorTypeChange(dt.value)}
            className={`flex-1 flex flex-col items-center px-2 py-2 rounded-lg border text-center transition-all ${
              inputs.doorType === dt.value
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
            }`}>
            <span className="text-xs font-medium leading-tight">{dt.label}</span>
            <span className="text-[9px] text-slate-500 mt-0.5">{dt.presetW}</span>
          </button>
        ))}
      </div>

      {/* ── 建具寸法 ───────────────────────────────── */}
      <SectionHeader icon={Ruler} label="建具寸法" />
      <div className="flex flex-col gap-3">
        <SliderNumberInput label="ドア製品幅 (W)" value={inputs.doorWidthMm} unit="mm"
          min={500} max={2400} step={10} onChange={v => set('doorWidthMm', v)} />
        <SliderNumberInput label="ドア製品高さ (H)" value={inputs.doorHeightMm} unit="mm"
          min={1800} max={3000} step={10} onChange={v => set('doorHeightMm', v)} />
        <SliderNumberInput label="意匠境界オフセット" value={inputs.designOffsetMm} unit="mm"
          min={50} max={300} step={5} onChange={v => set('designOffsetMm', v)} />

        {isParentChild && (
          <div className="bg-violet-900/20 border border-violet-700/40 rounded-lg p-3 flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-violet-400">子扉幅 (W_child)</span>
            <SliderNumberInput
              label={`子扉幅（親扉 = ${(inputs.doorWidthMm - inputs.childWidthMm).toFixed(0)} mm 自動算出）`}
              value={inputs.childWidthMm} unit="mm"
              min={100} max={Math.max(100, inputs.doorWidthMm - 200)} step={10}
              onChange={v => set('childWidthMm', v)} color="violet"
            />
          </div>
        )}

        {isDouble && (
          <div className="bg-violet-900/10 border border-violet-700/30 rounded-lg px-3 py-2 text-[11px] text-violet-400">
            左扉・右扉 各 {(inputs.doorWidthMm / 2).toFixed(0)} mm（左右対称）
          </div>
        )}
      </div>

      {/* ── 換気量 ─────────────────────────────────── */}
      <SectionHeader icon={Wind} label="設備要求換気量" />
      <div className={`flex flex-col gap-3 ${isValidate ? 'opacity-40 pointer-events-none select-none' : ''}`}>
        <SliderNumberInput label="必要風量 (Q)" value={inputs.requiredAirflowM3h} unit="m³/h"
          min={10} max={1000} step={5} onChange={v => set('requiredAirflowM3h', v)}
          color="emerald" freeMax />
        <SliderNumberInput label="許容最小風速" value={inputs.minVelocityMs} unit="m/s"
          min={0.5} max={2.5} step={0.1} onChange={v => set('minVelocityMs', v)} />
        <SliderNumberInput label="許容最大風速" value={inputs.maxVelocityMs} unit="m/s"
          min={2.0} max={6.0} step={0.1} onChange={v => set('maxVelocityMs', v)} />
        {isValidate && (
          <p className="text-[10px] text-violet-400 -mt-1">検証モード中は無効（寸法入力欄を使用）</p>
        )}
      </div>

      {/* ── 開口方式 ───────────────────────────────── */}
      <SectionHeader icon={LayoutGrid} label="開口部方式選択" />
      <div className="flex flex-col gap-1.5">
        {OPENING_TYPES.map(opt => (
          <button key={opt.value} onClick={() => set('openingType', opt.value)}
            className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
              inputs.openingType === opt.value
                ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
            }`}>
            <div className={`w-3 h-3 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${
              inputs.openingType === opt.value ? 'border-sky-400 bg-sky-400' : 'border-slate-600'
            }`} />
            <div>
              <div className="text-xs font-medium">{opt.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── ガラリ・ガラス設定（per-leaf tabs）— calc mode only ── */}
      {isGrille && !isValidate && (
        <>
          <SectionHeader icon={Layers} label="ガラリ・ガラス設定" accent="amber" />

          {isMultiLeaf && (
            <div className="flex gap-1 mb-3 p-1 bg-slate-800 rounded-lg">
              {([0, 1] as const).map(idx => (
                <button key={idx} onClick={() => setActiveLeafTab(idx)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    activeLeafTab === idx
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}>
                  {leafTabLabels[idx]}
                  {idx === 1 && isParentChild && (
                    <span className="text-[9px] ml-1 opacity-70">({inputs.childWidthMm}mm)</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <LeafConfigPanel
            leafCfg={inputs.leafConfigs[isMultiLeaf ? activeLeafTab : 0]}
            doorHeightMm={inputs.doorHeightMm}
            designOffsetMm={inputs.designOffsetMm}
            maxLeafW={currentLeafW}
            onChange={cfg => setLeafCfg(isMultiLeaf ? activeLeafTab : 0, cfg)}
          />

          <ContribBar grilleRatio={grilleContribRatio} undercutRatio={undercutContribRatio} />
        </>
      )}

      {/* ── 開口率 ─────────────────────────────────── */}
      <SectionHeader icon={Sliders} label="開口率設定 (有効開口率 α)" />
      <SliderNumberInput label="有効開口面積比率" value={inputs.openingRate} unit=""
        min={0.1} max={0.8} step={0.01} onChange={v => set('openingRate', v)} />
      <div className="mt-1 text-[11px] text-slate-500">
        標準値: {(DEFAULTS.openingRate * 100).toFixed(0)}%（ガラリ・グリル業界標準値）
      </div>

      {/* ── リセット ───────────────────────────────── */}
      <button
        onClick={() => onChange({
          doorWidthMm: DOOR_WIDTH_PRESETS['single'], doorHeightMm: 2100,
          doorType: DEFAULTS.doorType, childWidthMm: DEFAULTS.childWidthMm,
          designOffsetMm: DEFAULTS.designOffsetMm, requiredAirflowM3h: 120,
          minVelocityMs: DEFAULTS.minVelocityMs, maxVelocityMs: DEFAULTS.maxVelocityMs,
          openingType: 'louver', openingRate: DEFAULTS.openingRate,
          leafConfigs: [{ ...DEFAULT_LEAF_CONFIG }, { ...DEFAULT_LEAF_CONFIG }],
        })}
        className="mt-6 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors text-center"
      >
        デフォルト値にリセット
      </button>
    </aside>
  );
}
