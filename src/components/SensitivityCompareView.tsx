import React, { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { evaluateNumberTree } from '../engine/parser';
import { buildBeamCandidates } from '../engine/presets';
import type { NumberTreeModel } from '../engine/types';

interface SensitivityCompareViewProps {
  costWeight: number;
  onChangeCostWeight: (w: number) => void;
  activeModelId: string;
  onSelectBeamModel: (model: NumberTreeModel) => void;
}

export const SensitivityCompareView: React.FC<SensitivityCompareViewProps> = ({
  costWeight,
  onChangeCostWeight,
  activeModelId,
  onSelectBeamModel,
}) => {
  const candidates = useMemo(() => buildBeamCandidates(costWeight), [costWeight]);
  const evaluations = useMemo(
    () =>
      candidates.map((cand) => ({
        candidate: cand,
        evalResult: evaluateNumberTree(cand.model),
      })),
    [candidates]
  );

  // Sweep costWeight from 0.05 to 0.85 to compute exact sensitivity curves for passing profiles (IPE 300 vs IPE 330)
  const sweepData = useMemo(() => {
    const pts: Array<{ w: number; s300: number; s330: number }> = [];
    for (let i = 0; i <= 32; i++) {
      const w = Number((0.05 + (i / 32) * 0.8).toFixed(3));
      const cands = buildBeamCandidates(w);
      const e300 = evaluateNumberTree(cands[1].model).weightedScore;
      const e330 = evaluateNumberTree(cands[2].model).weightedScore;
      pts.push({ w, s300: e300, s330: e330 });
    }
    return pts;
  }, []);

  // Detect tipping point where IPE 300 and IPE 330 scores cross
  const tippingPoint = useMemo(() => {
    for (let i = 1; i < sweepData.length; i++) {
      const prev = sweepData[i - 1];
      const curr = sweepData[i];
      const dPrev = prev.s300 - prev.s330;
      const dCurr = curr.s300 - curr.s330;
      if ((dPrev <= 0 && dCurr >= 0) || (dPrev >= 0 && dCurr <= 0)) {
        const frac = Math.abs(dPrev) / Math.max(1e-6, Math.abs(dPrev) + Math.abs(dCurr));
        return Number((prev.w + frac * (curr.w - prev.w)).toFixed(2));
      }
    }
    return null;
  }, [sweepData]);

  const passingSorted = evaluations
    .filter((item) => item.evalResult.mandatoryPassed)
    .sort((a, b) => b.evalResult.weightedScore - a.evalResult.weightedScore);
  const winner = passingSorted[0];

  // SVG chart dimensions
  const chartW = 680;
  const chartH = 220;
  const padL = 48;
  const padR = 24;
  const padT = 18;
  const padB = 34;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const xOf = (w: number) => padL + ((w - 0.05) / 0.8) * innerW;
  const yOf = (score: number) => padT + (1 - Math.max(0, Math.min(0.8, score)) / 0.8) * innerH;

  const path300 = sweepData
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.w).toFixed(1)} ${yOf(p.s300).toFixed(1)}`)
    .join(' ');
  const path330 = sweepData
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.w).toFixed(1)} ${yOf(p.s330).toFixed(1)}`)
    .join(' ');

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-6xl mx-auto space-y-6">
      {/* Header & Interactive Weight Sensitivity Control */}
      <section className="border border-slate-800 bg-[#0F172A] rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Ana Mühendislik Vakası</span>
              <span aria-hidden="true">·</span>
              <span>L = 6 m · q = 20 kN/m · Çelik S355 (E = 210 GPa)</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">
              Çelik Kiriş Adayları &amp; Ağırlık Duyarlılık Analizi
            </h2>
          </div>

          {winner && (
            <div className="text-right font-mono tabular-nums">
              <div className="text-xs text-slate-400">Güncel Önerilen Kesit</div>
              <div className="text-lg font-semibold text-emerald-400">
                ✓ {winner.candidate.profile} ({(winner.evalResult.weightedScore * 100).toFixed(1)}%)
              </div>
            </div>
          )}
        </div>

        {/* Cost Weight Slider */}
        <div className="bg-[#090D16] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-slate-200">
              Maliyet Ağırlığı (w<sub>tl</sub>)
            </div>
            <div className="text-xs text-slate-400">
              {tippingPoint !== null
                ? `Karar dönüm noktası: w_tl ≈ ${tippingPoint.toFixed(2)} (altında IPE 330, üstünde IPE 300 öne geçer)`
                : 'Kalan ağırlık sehim ve gerilme emniyet paylarına orantılı dağıtılır.'}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-72">
            <span className="text-xs font-mono text-slate-500">0.05</span>
            <input
              type="range"
              min={0.05}
              max={0.85}
              step={0.01}
              value={costWeight}
              onChange={(e) => onChangeCostWeight(parseFloat(e.target.value))}
              className="precision-slider flex-1"
              aria-label="Maliyet ağırlığı"
            />
            <span className="text-xs font-mono text-slate-500">0.85</span>
            <span className="font-mono text-sm font-semibold text-blue-300 tabular-nums w-12 text-right">
              {costWeight.toFixed(2)}
            </span>
          </div>
        </div>

        {/* SVG Sensitivity Crossover Curve */}
        <div className="bg-[#090D16] border border-slate-800 rounded-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
            <span className="font-medium text-slate-300">
              Ağırlık Değişimine Göre Aday Skor Eğrileri (Zorunlu Kapıları Geçenler)
            </span>
            <div className="flex items-center gap-4 font-mono">
              <span className="text-blue-400">━━ IPE 300 (h=300 mm, δ=19.2 mm ◐)</span>
              <span className="text-emerald-400">━━ IPE 330 (h=330 mm, δ=13.7 mm ✓)</span>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-56 overflow-visible"
            role="img"
            aria-label="Maliyet ağırlığına göre IPE 300 ve IPE 330 skor karşılaştırma grafiği"
          >
            {/* Horizontal grid lines */}
            {[0, 0.2, 0.4, 0.6, 0.8].map((val) => (
              <g key={val}>
                <line
                  x1={padL}
                  y1={yOf(val)}
                  x2={chartW - padR}
                  y2={yOf(val)}
                  stroke="#1e293b"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={yOf(val) + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {(val * 100).toFixed(0)}%
                </text>
              </g>
            ))}

            {/* X-axis ticks */}
            {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((wTick) => (
              <text
                key={wTick}
                x={xOf(wTick)}
                y={chartH - 10}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-mono"
              >
                w={wTick.toFixed(2)}
              </text>
            ))}

            {/* Tipping point vertical guide */}
            {tippingPoint !== null && (
              <g>
                <line
                  x1={xOf(tippingPoint)}
                  y1={padT}
                  x2={xOf(tippingPoint)}
                  y2={chartH - padB}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.25}
                />
                <text
                  x={xOf(tippingPoint) + 6}
                  y={padT + 12}
                  className="fill-amber-400 text-[10px] font-mono"
                >
                  Dönüm w≈{tippingPoint.toFixed(2)}
                </text>
              </g>
            )}

            {/* Current weight crosshair */}
            <line
              x1={xOf(costWeight)}
              y1={padT}
              x2={xOf(costWeight)}
              y2={chartH - padB}
              stroke="#60a5fa"
              strokeWidth={1.5}
              opacity={0.7}
            />

            {/* Curves */}
            <path d={path300} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
            <path d={path330} fill="none" stroke="#10b981" strokeWidth={2.5} />

            {/* Active dots on current costWeight */}
            {evaluations[1] && (
              <circle
                cx={xOf(costWeight)}
                cy={yOf(evaluations[1].evalResult.weightedScore)}
                r={4.5}
                fill="#3b82f6"
                stroke="#090D16"
                strokeWidth={2}
              />
            )}
            {evaluations[2] && (
              <circle
                cx={xOf(costWeight)}
                cy={yOf(evaluations[2].evalResult.weightedScore)}
                r={4.5}
                fill="#10b981"
                stroke="#090D16"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>
      </section>

      {/* Candidate Comparison Table */}
      <section className="border border-slate-800 bg-[#0F172A] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            Şartname Aday Karşılaştırması (Zorunlu Kapılar + Ağırlıklı Sıralama)
          </h3>
          <span className="text-xs text-slate-400">
            3B ağaçta incelemek için satıra tıklayın
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 font-mono">
                <th className="py-3 px-4 font-medium">Aday Kesit</th>
                <th className="py-3 px-4 font-medium text-right">σ (≤200 MPa)</th>
                <th className="py-3 px-4 font-medium text-right">δ (≤20 mm)</th>
                <th className="py-3 px-4 font-medium text-right">h (≤340 mm)</th>
                <th className="py-3 px-4 font-medium text-right">Maliyet (TL)</th>
                <th className="py-3 px-4 font-medium">Kapı Durumu</th>
                <th className="py-3 px-4 font-medium text-right">Skor</th>
                <th className="py-3 px-4 font-medium text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm font-mono tabular-nums">
              {evaluations.map(({ candidate, evalResult }) => {
                const isSelected = activeModelId === candidate.model.id;
                const isWinner = winner?.candidate.id === candidate.id;
                const deflMargin = (1 - candidate.deflectionMm / 20) * 100;

                return (
                  <tr
                    key={candidate.id}
                    onClick={() => onSelectBeamModel(candidate.model)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-500/12'
                        : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-sans font-semibold text-slate-100">
                      {candidate.profile}
                      {isWinner && (
                        <span className="ml-2 text-xs font-mono text-emerald-400">
                          · Önerilen
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right ${
                        candidate.stressMpa > 200 ? 'text-rose-400 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      {candidate.stressMpa.toFixed(1)}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right ${
                        candidate.deflectionMm > 20
                          ? 'text-rose-400 font-semibold'
                          : deflMargin < 10
                            ? 'text-amber-400 font-semibold'
                            : 'text-slate-200'
                      }`}
                    >
                      {candidate.deflectionMm.toFixed(1)}
                      {candidate.deflectionMm <= 20 && deflMargin < 10 ? ' ◐' : ''}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right ${
                        candidate.heightMm > 340 ? 'text-rose-400 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      {candidate.heightMm}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-200">
                      {candidate.costTl.toLocaleString('tr-TR')}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {evalResult.mandatoryPassed ? (
                        <span className="text-emerald-400">✓ Tüm Z kapıları geçti</span>
                      ) : (
                        <span className="text-rose-400">
                          ✕ Ret:{' '}
                          {evalResult.mandatoryFailures.map((f) => f.key).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-100">
                      {evalResult.mandatoryPassed
                        ? `${(evalResult.weightedScore * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectBeamModel(candidate.model);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-sans font-medium text-blue-400 hover:text-blue-300"
                      >
                        <span>3B İncele</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
