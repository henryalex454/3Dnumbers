import React, { useEffect, useState } from 'react';
import { Check, Copy, Play, ShieldAlert, ArrowRightLeft } from 'lucide-react';
import { decodeCompactToken, parseUserNotation } from '../engine/parser';
import { QUICK_NOTATION_EXAMPLES } from '../engine/presets';
import type { EvaluationSummary, NumberTreeModel, VerdictCode } from '../engine/types';

interface NotationLabViewProps {
  evaluation: EvaluationSummary;
  onApplyParsedModel: (model: NumberTreeModel) => void;
  onUpdateVerdictOverride: (verdict: VerdictCode | undefined, note: string) => void;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const NotationLabView: React.FC<NotationLabViewProps> = ({
  evaluation,
  onApplyParsedModel,
  onUpdateVerdictOverride,
}) => {
  const [inputCode, setInputCode] = useState(
    evaluation.model.domain === 'vector'
      ? evaluation.l2CompactToken
      : evaluation.l2ShortAlgebraic
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [overrideNoteInput, setOverrideNoteInput] = useState(
    evaluation.model.overrideNote ?? ''
  );

  // Keep editor synced when user switches presets from outside
  useEffect(() => {
    setInputCode(
      evaluation.model.domain === 'vector'
        ? evaluation.l2CompactToken
        : evaluation.l2ShortAlgebraic
    );
    setOverrideNoteInput(evaluation.model.overrideNote ?? '');
    setParseError(null);
  }, [evaluation.model.id, evaluation.l2CompactToken, evaluation.l2ShortAlgebraic, evaluation.model.overrideNote]);

  const handleParseAndApply = (codeToParse = inputCode) => {
    const res = parseUserNotation(codeToParse);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setParseError(null);
    onApplyParsedModel(res.model);
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore clipboard failures in restricted frames
    }
  };

  // Interactive 6-DOF Token Mutator (allows tweaking each character of e.g. 3SDLFSLK21 live)
  const anatomy = evaluation.tokenAnatomy;

  const mutateTokenDof = (dofIndex: number, normValue: number) => {
    const idx = Math.round(((Math.max(-1, Math.min(1, normValue)) + 1) / 2) * 25);
    const nextChar = ALPHABET[Math.max(0, Math.min(25, idx))];
    const chars = anatomy.dofComponents.map((c, i) => (i === dofIndex ? nextChar : c.char));
    const newToken = `${anatomy.anchorScalar}${anatomy.ruleChar}${chars.join('')}${anatomy.depthDigits}`;
    setInputCode(newToken);
    handleParseAndApply(newToken);
  };

  const mutateTokenAnchor = (newAnchor: number) => {
    const chars = anatomy.dofComponents.map((c) => c.char).join('');
    const newToken = `${newAnchor}${anatomy.ruleChar}${chars}${anatomy.depthDigits}`;
    setInputCode(newToken);
    handleParseAndApply(newToken);
  };

  const previewDecoded = decodeCompactToken(inputCode);

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-6xl mx-auto space-y-6">
      {/* Live Notation Parser & Quick Examples */}
      <section className="border border-slate-800 bg-[#0F172A] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Kayıpsız Dönüşüm Motoru</span>
              <span aria-hidden="true">·</span>
              <span>Cebirsel Sözdizimi &amp; 6-DOF Vektör İmzası</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              Canlı Notasyon Ayrıştırıcısı
            </h2>
          </div>

          <button
            type="button"
            onClick={() => handleParseAndApply(inputCode)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>3B Ağaca Uygula</span>
          </button>
        </div>

        <div className="space-y-2">
          <textarea
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            rows={2}
            spellCheck={false}
            className="w-full bg-[#090D16] border border-slate-700 focus:border-blue-500 focus:outline-none rounded-md px-3.5 py-2.5 font-mono text-sm text-slate-100 tabular-nums resize-none"
            placeholder="Örnek: 3SDLFSLK21 veya &(sig=161.6^200_0+, del=19.2^20_0+; !gun=10^14_0+)+"
            aria-label="Notasyon veya kompakt vektör imzası girişi"
          />
          {parseError && (
            <p className="text-xs text-rose-400 font-mono">{parseError}</p>
          )}
          {previewDecoded && !parseError && (
            <p className="text-xs text-sky-400 font-mono">
              Kompakt Vektör İmzası algılandı · Gövde={previewDecoded.anchorScalar} · Kural=
              {previewDecoded.ruleSummary} · |∇|={previewDecoded.gradientMagnitude}
            </p>
          )}
        </div>

        {/* Quick Preset Expression Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 mr-1">Hazır ifadeler:</span>
          {QUICK_NOTATION_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setInputCode(ex.code);
                handleParseAndApply(ex.code);
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#090D16] border border-slate-800 hover:border-blue-500/50 hover:text-white rounded-md transition-colors whitespace-nowrap"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      {/* 3SDLFSLK21 Interactive 6-DOF Vector & Gradient Codec Inspector */}
      <section className="border border-slate-800 bg-[#0F172A] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Kompakt Vektör-Gradyan Kodu</span>
              <span aria-hidden="true">·</span>
              <span>Örnek: 3SDLFSLK21</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-100">
              6 Serbestlik Dereceli (6-DOF) Token Anatomisi
            </h3>
          </div>

          {/* Character-by-character live token visualization */}
          <div className="flex items-center gap-1 font-mono bg-[#090D16] border border-slate-800 rounded-md px-3 py-2">
            <span
              className="text-lg font-bold text-white px-1.5 py-0.5 bg-blue-600/30 border border-blue-500/40 rounded"
              title="Sayı doğrusu ana gövde değeri"
            >
              {anatomy.anchorScalar}
            </span>
            <span
              className="text-base font-semibold text-amber-300 px-1.5 py-0.5 bg-amber-500/15 rounded"
              title={`Kabul kuralı: ${anatomy.ruleSummary}`}
            >
              {anatomy.ruleChar}
            </span>
            {anatomy.dofComponents.map((d, i) => (
              <span
                key={i}
                className="text-base font-semibold text-sky-300 px-1.5 py-0.5 bg-sky-500/12 rounded"
                title={`${d.name} (${d.axis}): ${d.value}`}
              >
                {d.char}
              </span>
            ))}
            <span
              className="text-base font-semibold text-emerald-300 px-1.5 py-0.5 bg-emerald-500/12 rounded"
              title={`Dal derinliği ${anatomy.branchDepth}, Grup sayısı ${anatomy.coupledGroups}`}
            >
              {anatomy.depthDigits}
            </span>
          </div>
        </div>

        {/* Anchor Scalar & 6-DOF Live Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {anatomy.dofComponents.map((comp, idx) => (
            <div
              key={comp.axis}
              className="bg-[#090D16] border border-slate-800 rounded-md p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-sky-400 font-semibold">
                  {comp.axis} · Karakter &apos;{comp.char}&apos;
                </span>
                <span className="text-slate-200 tabular-nums font-semibold">
                  {comp.value >= 0 ? '+' : ''}
                  {comp.value.toFixed(2)}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-200">{comp.name}</div>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.08}
                value={comp.value}
                onChange={(e) => mutateTokenDof(idx, parseFloat(e.target.value))}
                className="precision-slider w-full"
                aria-label={`${comp.name} ekseni`}
              />
              <p className="text-[11px] text-slate-500 leading-snug">{comp.description}</p>
            </div>
          ))}
        </div>

        {/* Resultant 3D Vector Summary Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800 text-xs font-mono text-slate-400 tabular-nums">
          <div className="flex items-center gap-3">
            <span>
              Bileşke Vektör V = ({anatomy.resultantVector.x}, {anatomy.resultantVector.y},{' '}
              {anatomy.resultantVector.z})
            </span>
            <span aria-hidden="true">·</span>
            <span>|∇| = {anatomy.gradientMagnitude}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Ana Sayı (Gövde):</span>
            {[3, 5, 8, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => mutateTokenAnchor(n)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  anatomy.anchorScalar === n
                    ? 'border-blue-500 bg-blue-500/20 text-white'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Two-Layer Lossless Representation Comparison (Zero-Shot Open Form vs Short Algebraic) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Layer 1: Self-Explaining Open Form (Human + Cold LLM Readable) */}
        <div className="border border-slate-800 bg-[#0F172A] rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs text-emerald-400 font-medium">
                  Katman 1 · Sıfır-Eğitim Okunabilir
                </span>
                <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                  Açık Biçim (İnsan &amp; Yapay Zekâ Uyumlu)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('open', evaluation.l2OpenMultiLine)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 bg-[#090D16] border border-slate-800 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap"
              >
                {copiedKey === 'open' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === 'open' ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </div>
            <pre className="mt-3 p-4 bg-[#090D16] border border-slate-800 rounded-md font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed tabular-nums">
              {evaluation.l2OpenMultiLine}
            </pre>
          </div>
          <p className="mt-3 text-xs text-slate-400 leading-relaxed">
            Zincir eşitsizlik (<span className="font-mono text-slate-300">alt &lt;= değer &lt;= üst</span>)
            ve doğal dil öncelikleri sayesinde kuralları hiç görmemiş bir okuyucu veya dil modeli
            ilk bakışta doğru hükme ulaşır.
          </p>
        </div>

        {/* Layer 2: Short Algebraic Form + Human Override Audit Trail */}
        <div className="border border-slate-800 bg-[#0F172A] rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs text-blue-400 font-medium">
                  Katman 2 · Uzman Kısaltması &amp; Denetim İzi
                </span>
                <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                  Kısa Cebirsel Biçim &amp; Kullanıcı Takdiri (±)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('short', evaluation.l2ShortAlgebraic)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 bg-[#090D16] border border-slate-800 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap"
              >
                {copiedKey === 'short' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === 'short' ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </div>

            <div className="mt-3 p-4 bg-[#090D16] border border-slate-800 rounded-md font-mono text-xs text-blue-200 break-all leading-relaxed tabular-nums">
              {evaluation.l2ShortAlgebraic}
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 font-mono">
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Virgül <strong className="text-slate-200">,</strong> bağlı parametreler · Noktalı
                virgül <strong className="text-slate-200">;</strong> bağımsız parametreler
              </span>
            </div>
          </div>

          {/* Explicit Verdict Override & Mandatory Audit Comment */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Yazar Hükmü (Kural Sonucu: {evaluation.computedVerdict})
              </span>
              <div className="flex items-center gap-1 bg-[#090D16] p-0.5 rounded-md border border-slate-800">
                {(
                  [
                    { val: undefined, label: 'Otomatik' },
                    { val: '+', label: '+ Kabul' },
                    { val: '+-', label: '± Takdir' },
                    { val: '-', label: '- Ret' },
                  ] as const
                ).map((item) => (
                  <button
                    key={String(item.val)}
                    type="button"
                    onClick={() => onUpdateVerdictOverride(item.val, overrideNoteInput)}
                    className={`px-2 py-1 text-xs rounded font-mono transition-colors whitespace-nowrap ${
                      evaluation.model.userVerdict === item.val
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={overrideNoteInput}
                onChange={(e) => {
                  setOverrideNoteInput(e.target.value);
                  onUpdateVerdictOverride(evaluation.model.userVerdict, e.target.value);
                }}
                placeholder="{istisna veya takdir gerekçesi yazın...}"
                className="flex-1 bg-[#090D16] border border-slate-800 focus:border-blue-500 focus:outline-none rounded-md px-3 py-1.5 text-xs font-mono text-slate-200"
              />
            </div>

            {evaluation.missingConflictNote && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Kural ile hüküm çeliştiğinde {'{gerekçe}'} alanı zorunludur.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
