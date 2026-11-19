import React, { useMemo, useState } from 'react';
import { Check, Copy, ArrowRight } from 'lucide-react';
import { evaluateNumberTree, parseUserNotation } from './engine/parser';
import { getPresetModels } from './engine/presets';
import type { NumberTreeModel, PriorityLevel, VerdictCode } from './engine/types';
import { TreeViewport3D } from './components/TreeViewport3D';
import { NormalizedRulerView } from './components/NormalizedRulerView';
import { NotationLabView } from './components/NotationLabView';
import { SensitivityCompareView } from './components/SensitivityCompareView';

type ActiveTab = 'tree3d' | 'ruler' | 'notation' | 'sensitivity';

export default function App() {
  const presets = useMemo(() => getPresetModels(), []);
  // Start on the 3SDLFSLK21 vector number OR IPE 300 — let's default to 3SDLFSLK21 since user specifically highlighted it, with IPE 300 one click away!
  const [model, setModel] = useState<NumberTreeModel>(presets[0]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tree3d');
  const [selectedCriterionId, setSelectedCriterionId] = useState<string | null>(null);
  const [costWeight, setCostWeight] = useState<number>(0.4);
  const [quickInput, setQuickInput] = useState<string>(presets[0].compactToken ?? '3SDLFSLK21');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [copiedHeader, setCopiedHeader] = useState(false);

  const evaluation = useMemo(() => evaluateNumberTree(model), [model]);

  const handleSelectPreset = (preset: NumberTreeModel) => {
    setModel(preset);
    setSelectedCriterionId(null);
    setQuickInput(preset.domain === 'vector' ? preset.compactToken ?? '3SDLFSLK21' : preset.name);
    setQuickError(null);
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = parseUserNotation(quickInput);
    if (!res.ok) {
      setQuickError(res.error);
      return;
    }
    setQuickError(null);
    setModel(res.model);
    setSelectedCriterionId(null);
  };

  const handleUpdateCriterionValue = (id: string, value: number) => {
    setModel((prev) => ({
      ...prev,
      compactToken: undefined, // allow dynamic re-encoding
      criteria: prev.criteria.map((c) => (c.id === id ? { ...c, value } : c)),
    }));
  };

  const handleUpdateCriterionPriority = (id: string, priority: PriorityLevel) => {
    setModel((prev) => ({
      ...prev,
      compactToken: undefined,
      criteria: prev.criteria.map((c) => (c.id === id ? { ...c, priority } : c)),
    }));
  };

  const handleUpdateAnchorScalar = (val: number) => {
    setModel((prev) => ({
      ...prev,
      anchorScalar: val,
      compactToken: undefined,
    }));
  };

  const handleUpdateVerdictOverride = (verdict: VerdictCode | undefined, note: string) => {
    setModel((prev) => ({
      ...prev,
      userVerdict: verdict,
      overrideNote: note,
    }));
  };

  const handleCopyCurrentNotation = async () => {
    const text =
      model.domain === 'vector'
        ? `${evaluation.l2CompactToken} | ${evaluation.l2ShortAlgebraic}`
        : evaluation.l2ShortAlgebraic;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHeader(true);
      window.setTimeout(() => setCopiedHeader(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'tree3d', label: '3B Ağaç' },
    { id: 'ruler', label: 'Cetvel' },
    { id: 'notation', label: 'Notasyon' },
    { id: 'sensitivity', label: 'Duyarlılık' },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090D16] text-slate-100 overflow-hidden">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-14 shrink-0 flex items-center justify-between gap-8 px-6 border-b border-slate-800/90 bg-[#090D16]">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('tree3d')}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-blue-300 transition-colors"
        >
          3D Numbers
        </button>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium" aria-label="Ana görünümler">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-[17px] h-[2px] bg-blue-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleCopyCurrentNotation}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {copiedHeader ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedHeader ? 'Kopyalandı' : 'Notasyonu Kopyala'}</span>
          </button>
        </div>
      </header>

      {/* Workspace Toolbar (Presets + Quick Token/Notation Entry) */}
      <div className="shrink-0 border-b border-slate-800/80 bg-[#0C1220] px-6 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Domain Presets Segmented Controls */}
        <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-slate-800 overflow-x-auto">
          {presets.map((preset) => {
            const isActive = model.id === preset.id;
            const shortLabel =
              preset.domain === 'vector'
                ? '3SDLFSLK21'
                : preset.domain === 'engineering'
                  ? 'Kiriş (IPE 300)'
                  : preset.domain === 'finance'
                    ? 'Portföy Riski'
                    : 'İstatistik (d)';
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>

        {/* Inline Live Token / Notation Jump Bar */}
        <form onSubmit={handleQuickSubmit} className="flex items-center gap-2 flex-1 max-w-md min-w-[240px]">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => {
              setQuickInput(e.target.value);
              if (quickError) setQuickError(null);
            }}
            spellCheck={false}
            placeholder="3SDLFSLK21 veya &(sig=161.6^200_0+)+"
            aria-label="Hızlı token veya cebirsel ifade"
            className={`w-full bg-[#090D16] border rounded-md px-3 py-1.5 font-mono text-xs text-slate-100 focus:outline-none ${
              quickError
                ? 'border-rose-500'
                : 'border-slate-800 focus:border-blue-500'
            }`}
          />
          <button
            type="submit"
            title="İfadeyi çözümle ve 3B ağaca yansıt"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <span>Çözümle</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Main Viewport Stage */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        {activeTab === 'tree3d' && (
          <TreeViewport3D
            evaluation={evaluation}
            selectedCriterionId={selectedCriterionId}
            onSelectCriterion={setSelectedCriterionId}
          />
        )}

        {activeTab === 'ruler' && (
          <NormalizedRulerView
            evaluation={evaluation}
            selectedCriterionId={selectedCriterionId}
            onSelectCriterion={setSelectedCriterionId}
            onUpdateCriterionValue={handleUpdateCriterionValue}
            onUpdateCriterionPriority={handleUpdateCriterionPriority}
            onUpdateAnchorScalar={handleUpdateAnchorScalar}
          />
        )}

        {activeTab === 'notation' && (
          <NotationLabView
            evaluation={evaluation}
            onApplyParsedModel={(parsed) => {
              setModel(parsed);
              setQuickInput(
                parsed.domain === 'vector'
                  ? parsed.compactToken ?? '3SDLFSLK21'
                  : parsed.name
              );
              setSelectedCriterionId(null);
            }}
            onUpdateVerdictOverride={handleUpdateVerdictOverride}
          />
        )}

        {activeTab === 'sensitivity' && (
          <SensitivityCompareView
            costWeight={costWeight}
            onChangeCostWeight={setCostWeight}
            activeModelId={model.id}
            onSelectBeamModel={(beamModel) => {
              setModel(beamModel);
              setQuickInput(beamModel.name);
              setSelectedCriterionId(null);
              setActiveTab('tree3d');
            }}
          />
        )}
      </main>
    </div>
  );
}
