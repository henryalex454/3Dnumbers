import React from 'react';
import { Sliders, AlertTriangle } from 'lucide-react';
import type { EvaluatedCriterion, EvaluationSummary, PriorityLevel } from '../engine/types';

interface NormalizedRulerViewProps {
  evaluation: EvaluationSummary;
  selectedCriterionId: string | null;
  onSelectCriterion: (id: string | null) => void;
  onUpdateCriterionValue: (id: string, value: number) => void;
  onUpdateCriterionPriority: (id: string, priority: PriorityLevel) => void;
  onUpdateAnchorScalar: (val: number) => void;
}

export const NormalizedRulerView: React.FC<NormalizedRulerViewProps> = ({
  evaluation,
  selectedCriterionId,
  onSelectCriterion,
  onUpdateCriterionValue,
  onUpdateCriterionPriority,
  onUpdateAnchorScalar,
}) => {
  const { model, evaluated, weightedScore, statusLabel, effectiveVerdict, l1Strip } = evaluation;
  const [rangeMin, rangeMax] = model.numberLineRange;

  // Map normalized margin [-0.6 .. 1.1] onto ruler percentage [0% .. 100%]
  // Zero boundary wall (m = 0) sits reliably at 35% from the left so rejection zone is visible
  const marginToPct = (m: number) => {
    const clamped = Math.max(-0.6, Math.min(1.15, m));
    return ((clamped + 0.6) / 1.75) * 100;
  };
  const zeroWallPct = marginToPct(0); // ~34.28%
  const idealPct = marginToPct(1); // ~91.42%

  const getRangeBounds = (c: EvaluatedCriterion): { min: number; max: number; step: number } => {
    const baseMin = c.lower !== undefined ? c.lower : 0;
    const baseMax = c.upper !== undefined ? c.upper : Math.max(c.value * 1.5, 10);
    const span = Math.max(1e-3, Math.abs(baseMax - baseMin));
    const min = Number((baseMin - span * 0.25).toFixed(3));
    const max = Number((baseMax + span * 0.35).toFixed(3));
    const step = span > 500 ? 10 : span > 50 ? 1 : span > 5 ? 0.1 : 0.005;
    return { min, max, step };
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-6xl mx-auto space-y-6">
      {/* Section Header & L1 Single-Line Decision Strip */}
      <div className="border border-slate-800 bg-[#0F172A] rounded-lg p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Seviye L1–L2</span>
              <span aria-hidden="true">·</span>
              <span>Normalize 0–1 Marj Cetveli</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-blue-400">{evaluation.l2CompactToken}</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">
              {model.name}
            </h2>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div
              className={`text-lg font-semibold ${
                effectiveVerdict === '+'
                  ? 'text-emerald-400'
                  : effectiveVerdict === '+-'
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }`}
            >
              {effectiveVerdict === '+' ? '✓' : effectiveVerdict === '+-' ? '±' : '✕'}{' '}
              {statusLabel}
            </div>
            <div className="text-xs text-slate-400">
              Ağırlıklı Marj Skoru: {(weightedScore * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* L1 Compact Decision Strip */}
        <div className="mt-4 border border-slate-800 bg-[#090D16] rounded-md px-4 py-3 font-mono text-sm text-slate-200 overflow-x-auto whitespace-nowrap tabular-nums">
          {l1Strip}
        </div>

        {/* Dominant Anchor Scalar Scrubber on Real Number Line */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Sliders className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>
              Sayı Doğrusu Ana Gövde Konumu ({model.anchorLabel}):
            </span>
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <span className="text-xs font-mono text-slate-500 tabular-nums">{rangeMin}</span>
            <input
              type="range"
              min={rangeMin}
              max={rangeMax}
              step={rangeMax - rangeMin > 50 ? 1 : 0.1}
              value={model.anchorScalar}
              onChange={(e) => onUpdateAnchorScalar(parseFloat(e.target.value))}
              className="precision-slider flex-1"
              aria-label="Sayı doğrusu ana gövde değeri"
            />
            <span className="text-xs font-mono text-slate-500 tabular-nums">{rangeMax}</span>
            <span className="font-mono text-sm font-semibold text-blue-300 tabular-nums min-w-[72px] text-right">
              {evaluation.l0Scalar}
            </span>
          </div>
        </div>
      </div>

      {/* Legend Bar (Unboxed clean metadata) */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-1 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-4 font-mono">
          <span>
            <strong className="text-slate-200">‖</strong> Zorunlu kapı (!)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-slate-200">|</strong> Ağırlıklı / Esnek
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-rose-400">m &lt; 0</strong> Ret bölgesi
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-amber-400">0 ≤ m &lt; 0.12</strong> Sınır uyarısı ◐
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-emerald-400">m → 1</strong> İdeal hedef
          </span>
        </div>
        <span className="font-mono text-slate-500">
          Formül: m = (sınır − değer) / (sınır − ideal)
        </span>
      </div>

      {/* Criteria 0-1 Normalized Ruler Rows */}
      <div className="border border-slate-800 bg-[#0F172A] rounded-lg divide-y divide-slate-800/80">
        {evaluated.map((c) => {
          const dotPct = marginToPct(c.margin);
          const { min, max, step } = getRangeBounds(c);
          const isSelected = selectedCriterionId === c.id;
          const statusGlyph =
            c.status === 'fail' ? '✕' : c.status === 'marginal' ? '◐' : '✓';
          const statusTone =
            c.status === 'fail'
              ? 'text-rose-400'
              : c.status === 'marginal'
                ? 'text-amber-400'
                : 'text-emerald-400';

          return (
            <div
              key={c.id}
              onClick={() => onSelectCriterion(isSelected ? null : c.id)}
              className={`p-4 transition-colors cursor-pointer ${
                isSelected ? 'bg-blue-500/8' : 'hover:bg-slate-900/60'
              }`}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                {/* Left: Criterion identity + superscript/subscript notation */}
                <div className="lg:col-span-4 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>Seviye L{c.relationLevel}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {c.dependencyGroup === 0 ? 'Bağlı Grup (,)' : `Bağımsız Grup ${c.dependencyGroup + 1} (;)`}
                    </span>
                    {c.priority !== 'mandatory' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>w={(c.normalizedWeight * 100).toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate">
                      {c.label}
                    </span>
                  </div>
                  {/* Mathematical superscript/subscript representation */}
                  <div className="mt-1 font-mono text-xs text-slate-300 tabular-nums flex items-center gap-1.5">
                    <span className="text-blue-400">
                      {c.priority === 'mandatory' ? '!' : c.priority === 'low' ? '?' : ''}
                      {c.key}
                    </span>
                    <span className="text-slate-500">=</span>
                    <span className="text-white font-semibold">{c.value}</span>
                    <span className="inline-flex flex-col leading-none text-[10px] text-slate-400 ml-0.5">
                      <span>{c.upper !== undefined ? `^${c.upper}` : ''}</span>
                      <span>{c.lower !== undefined ? `_${c.lower}` : ''}</span>
                    </span>
                    {c.unit && <span className="text-slate-500 ml-0.5">{c.unit}</span>}
                    <span className={`ml-1 font-semibold ${statusTone}`}>{statusGlyph}</span>
                    {c.direction === 'target_center' && (
                      <span className="text-sky-400 ml-1" title="Çift yönlü hedef tolerans">
                        ◆
                      </span>
                    )}
                  </div>
                </div>

                {/* Center: 0-1 Normalized Ruler Visualization */}
                <div className="lg:col-span-5">
                  <div className="relative h-10 flex items-center">
                    {/* Track background */}
                    <div className="relative w-full h-2.5 bg-slate-900 border border-slate-800 rounded-sm overflow-hidden">
                      {/* Rejection zone shading (< 0) */}
                      <div
                        className="absolute inset-y-0 left-0 bg-rose-500/18"
                        style={{
                          width: `${zeroWallPct}%`,
                          backgroundImage:
                            'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(244,63,94,0.18) 4px, rgba(244,63,94,0.18) 8px)',
                        }}
                      />
                      {/* Warning band (0 .. 0.12) */}
                      <div
                        className="absolute inset-y-0 bg-amber-500/20"
                        style={{
                          left: `${zeroWallPct}%`,
                          width: `${marginToPct(0.12) - zeroWallPct}%`,
                        }}
                      />
                      {/* Acceptance zone fill up to dot */}
                      {c.margin > 0 && (
                        <div
                          className={`absolute inset-y-0 ${
                            c.status === 'marginal' ? 'bg-amber-400/55' : 'bg-emerald-500/45'
                          }`}
                          style={{
                            left: `${zeroWallPct}%`,
                            width: `${Math.max(0, dotPct - zeroWallPct)}%`,
                          }}
                        />
                      )}
                    </div>

                    {/* Boundary Wall: Double wall (‖) for mandatory, single wall (|) for flexible */}
                    <div
                      className="absolute top-1 bottom-1 flex items-center pointer-events-none"
                      style={{ left: `${zeroWallPct}%`, transform: 'translateX(-50%)' }}
                    >
                      {c.priority === 'mandatory' ? (
                        <div className="flex gap-[2px] h-full">
                          <div className="w-[2px] h-full bg-slate-200" />
                          <div className="w-[2px] h-full bg-slate-200" />
                        </div>
                      ) : (
                        <div className="w-[2px] h-full bg-slate-400" />
                      )}
                    </div>

                    {/* Ideal marker (m = 1) */}
                    <div
                      className="absolute top-2 bottom-2 w-px bg-emerald-400/70 pointer-events-none"
                      style={{ left: `${idealPct}%` }}
                    />

                    {/* Uncertainty spread bar if present */}
                    {c.uncertainty && c.uncertainty > 0 && (
                      <div
                        className="absolute h-4 border-x border-sky-400/80 bg-sky-400/20 pointer-events-none"
                        style={{
                          left: `${Math.max(2, dotPct - 6)}%`,
                          width: '12%',
                        }}
                      />
                    )}

                    {/* Criterion Value Dot / Fail Cross */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                      style={{ left: `${dotPct}%` }}
                    >
                      {c.passed ? (
                        <div
                          className={`w-3.5 h-3.5 rounded-full border-2 border-[#0F172A] ${
                            c.status === 'marginal' ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                        />
                      ) : (
                        <span className="text-sm font-bold text-rose-400 leading-none">✕</span>
                      )}
                    </div>
                  </div>

                  {/* Ruler Scale Labels */}
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
                    <span>Ret (&lt;0)</span>
                    <span>Sınır (0)</span>
                    <span>
                      Marj:{' '}
                      <strong className={statusTone}>
                        {c.margin >= 0 ? '+' : ''}
                        {(c.margin * 100).toFixed(0)}%
                      </strong>
                    </span>
                    <span>İdeal (1)</span>
                  </div>
                </div>

                {/* Right: Live Value Scrubber & Priority Switch */}
                <div
                  className="lg:col-span-3 flex flex-col gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={c.value}
                      onChange={(e) => onUpdateCriterionValue(c.id, parseFloat(e.target.value))}
                      className="precision-slider flex-1"
                      aria-label={`${c.label} değerini değiştir`}
                    />
                    <span className="text-xs font-mono text-slate-200 tabular-nums w-16 text-right">
                      {c.value}
                    </span>
                  </div>

                  {/* Priority selector (! / Normal / ?) */}
                  <div className="flex items-center gap-1 bg-[#090D16] p-0.5 rounded-md border border-slate-800">
                    {(
                      [
                        { id: 'mandatory', label: '! Zorunlu' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'low', label: '? Esnek' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdateCriterionPriority(c.id, opt.id)}
                        className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                          c.priority === opt.id
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Warning callout if conflict without audit note */}
      {evaluation.missingConflictNote && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <strong>Kural–Hüküm Çelişkisi:</strong> Seçili kullanıcı hükmü (
            <span className="font-mono">{evaluation.effectiveVerdict}</span>), matematiksel kural
            sonucuyla (<span className="font-mono">{evaluation.computedVerdict}</span>) çelişiyor.
            İzlenebilirlik ilkesi gereği Notasyon sekmesinden <span className="font-mono">{'{yorum}'}</span>{' '}
            gerekçesi girilmelidir.
          </div>
        </div>
      )}
    </div>
  );
};
