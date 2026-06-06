import { Activity, Maximize2, Zap, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { type VentilationResult, type VentilationInputs } from '../core/ventilationEngine';

interface HUDTelemetryProps {
  result: VentilationResult;
  inputs: VentilationInputs;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  status,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit: string;
  sub?: string;
  status?: 'ok' | 'warn' | 'error';
}) {
  const statusColors = {
    ok: 'border-emerald-500/30 bg-emerald-500/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    error: 'border-red-500/30 bg-red-500/5',
    undefined: 'border-slate-700 bg-slate-800/30',
  };
  const valueColors = {
    ok: 'text-emerald-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
    undefined: 'text-slate-200',
  };

  const colorKey = status ?? 'undefined';

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${statusColors[colorKey]}`}>
      <div className="flex items-center gap-2">
        <Icon size={13} className="text-slate-400" />
        <span className="text-[10px] uppercase tracking-widest text-slate-400 leading-tight">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono ${valueColors[colorKey]}`}>{value}</span>
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function VelocityMeter({
  velocity,
  min,
  max,
}: {
  velocity: number;
  min: number;
  max: number;
}) {
  const displayMax = max * 1.5;
  const pct = Math.min(velocity / displayMax, 1) * 100;
  const safeLow = (min / displayMax) * 100;
  const safeHigh = (max / displayMax) * 100;

  const isSafe = velocity >= min && velocity <= max;
  const needleColor = velocity < min ? '#f59e0b' : velocity > max ? '#ef4444' : '#10b981';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>0 m/s</span>
        <span className="text-emerald-400 font-mono">
          {min}–{max} m/s 定石適正風速レンジ
        </span>
        <span>{displayMax.toFixed(1)} m/s</span>
      </div>
      <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
        {/* 適正風速帯 */}
        <div
          className="absolute h-full bg-emerald-500/20 border-x border-emerald-500/40"
          style={{ left: `${safeLow}%`, width: `${safeHigh - safeLow}%` }}
        />
        {/* 充填バー */}
        <div
          className="absolute h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, #1e3a5f, ${needleColor})`,
            opacity: 0.85,
          }}
        />
        {/* 針 */}
        <div
          className="absolute top-0 w-0.5 h-full rounded-full transition-all duration-300"
          style={{ left: `${pct}%`, background: needleColor, boxShadow: `0 0 6px ${needleColor}` }}
        />
      </div>
      <div className="flex justify-center">
        <span
          className={`text-xs font-mono font-bold ${isSafe ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {velocity.toFixed(3)} m/s {isSafe ? '✓ 適正風速内' : '✗ 適正風速範囲外'}
        </span>
      </div>
    </div>
  );
}

const OPENING_TYPE_JA: Record<string, string> = {
  louver:   'ガラリ',
  punching: 'パンチングメタル',
  undercut: 'アンダーカット',
};

export function HUDTelemetry({ result, inputs }: HUDTelemetryProps) {
  const velocityStatus = result.velocityTooHigh
    ? 'error'
    : result.velocityTooLow
    ? 'warn'
    : 'ok';

  return (
    <div className="flex flex-col gap-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Activity size={15} className="text-sky-400" />
        <h2 className="text-sm font-semibold text-slate-200 tracking-wide">
          リアルタイム性能検証HUD
        </h2>
        <div
          className={`ml-auto flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border ${
            result.isSafe
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/40 bg-red-500/10 text-red-400'
          }`}
        >
          {result.isSafe ? (
            <CheckCircle2 size={11} />
          ) : (
            <AlertTriangle size={11} />
          )}
          {result.isSafe ? '適合' : '不適合'}
        </div>
      </div>

      {/* 風速メーター */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
          <Zap size={11} />
          開口部通過風速メーター
        </div>
        <VelocityMeter
          velocity={result.actualVelocityMs}
          min={inputs.minVelocityMs}
          max={inputs.maxVelocityMs}
        />
      </div>

      {/* メトリクスカード */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Zap}
          label="計算風速"
          value={result.actualVelocityMs.toFixed(2)}
          unit="m/s"
          sub={`許容範囲: ${inputs.minVelocityMs}–${inputs.maxVelocityMs} m/s`}
          status={velocityStatus}
        />
        <MetricCard
          icon={Activity}
          label="通過風量換算"
          value={(result.airflowM3s * 1000).toFixed(2)}
          unit="L/s"
          sub={`= ${inputs.requiredAirflowM3h} m³/h`}
        />
        <MetricCard
          icon={Maximize2}
          label="必要有効開口面積"
          value={(result.effectiveAreaM2 * 1e4).toFixed(1)}
          unit="cm²"
          sub={`製品面積: ${(result.physicalAreaM2 * 1e4).toFixed(1)} cm²`}
        />
        <MetricCard
          icon={Maximize2}
          label="推奨製品開口寸法"
          value={`${result.requiredOpeningWidthMm.toFixed(0)}×${result.requiredOpeningHeightMm.toFixed(0)}`}
          unit="mm"
          sub={`最大許容: ${result.maxAllowedWidthMm.toFixed(0)}×${result.maxAllowedHeightMm.toFixed(0)} mm`}
          status={result.hasGeometryViolation ? 'error' : 'ok'}
        />
      </div>

      {/* 意匠境界制約クリアランス */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="text-[11px] uppercase tracking-widest text-slate-400">意匠境界制約クリアランス</div>
        {[
          {
            label: '横幅方向利用率',
            used: result.requiredOpeningWidthMm,
            max: result.maxAllowedWidthMm,
            overflow: result.overflowsWidth,
          },
          {
            label: inputs.openingType === 'undercut' ? 'アンダーカット隙間高さ' : '縦幅方向利用率',
            used: result.requiredOpeningHeightMm,
            max: inputs.openingType === 'undercut' ? 25 : result.maxAllowedHeightMm,
            overflow: result.overflowsHeight,
          },
        ].map(bar => {
          const pct = Math.min((bar.used / bar.max) * 100, 120);
          return (
            <div key={bar.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">{bar.label}</span>
                <span className={`font-mono ${bar.overflow ? 'text-red-400' : 'text-emerald-400'}`}>
                  {bar.used.toFixed(1)} / {bar.max.toFixed(0)} mm
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    bar.overflow ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 是正措置アラート */}
      {result.remediationHint && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-semibold text-red-400 tracking-wider">
              建築的是正措置が必要です
            </div>
            {result.remediationHint.split(' · ').map((hint, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-red-300/90">
                <ArrowRight size={11} className="flex-shrink-0 mt-0.5 text-red-500" />
                {hint}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フッター統計 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '開口率 α', value: `${(inputs.openingRate * 100).toFixed(0)}%` },
          { label: '開口方式', value: OPENING_TYPE_JA[inputs.openingType] ?? inputs.openingType },
          { label: '意匠オフセット', value: `${inputs.designOffsetMm}mm` },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] text-slate-500 tracking-wide">{stat.label}</div>
            <div className="text-sm font-mono text-slate-300 mt-0.5">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
