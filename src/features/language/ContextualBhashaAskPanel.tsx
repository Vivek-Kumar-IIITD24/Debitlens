import React, { useEffect, useState } from 'react';
import { MessageSquareText, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  CommitmentRecord,
  LanguageCode,
  BhashaContextualQuestionResponse,
} from '../../types/debitlens';
import { sarvamService } from '../../services/sarvamService';

interface ContextualBhashaAskPanelProps {
  commitments: CommitmentRecord[];
  selectedCommitmentId: string;
  onSelectCommitmentId: (id: string) => void;
  language: LanguageCode;
}

const PRESET_QUESTIONS = [
  'Why did this recurring charge happen and how does it compare with my mandate and invoice?',
  'Why did the amount increase while my UPI AutoPay mandate did not block it?',
  'How do I stop future auto-debits completely across both Layer A and Layer B?',
];

export const ContextualBhashaAskPanel: React.FC<ContextualBhashaAskPanelProps> = ({
  commitments,
  selectedCommitmentId,
  onSelectCommitmentId,
  language,
}) => {
  const [question, setQuestion] = useState<string>(PRESET_QUESTIONS[0]);
  const [response, setResponse] = useState<BhashaContextualQuestionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const runAsk = async (cmtId: string, q: string, lang: LanguageCode) => {
    setLoading(true);
    try {
      const res = await sarvamService.askContextualQuestion({
        commitmentId: cmtId,
        question: q,
        language: lang,
      });
      setResponse(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCommitmentId) {
      runAsk(selectedCommitmentId, question, language).catch(() => {});
    }
  }, [selectedCommitmentId, language]);

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-800 font-semibold">
            <MessageSquareText className="w-4 h-4" />
            CONTEXTUAL BHASHA FINANCIAL Q&A (GROUNDED IN RECONCILIATION & GRAPH FACTS)
          </div>
          <h3 className="text-base font-semibold text-slate-900 mt-0.5">
            Ask Why a Charge Happened, Why an Amount Changed, or How to Stop It
          </h3>
        </div>
        <select
          aria-label="Select commitment for Contextual Bhasha Q&A"
          value={selectedCommitmentId}
          onChange={(e) => onSelectCommitmentId(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
        >
          {commitments.map((c) => (
            <option key={c.id} value={c.id}>
              {c.serviceName} ({c.merchantName})
            </option>
          ))}
        </select>
      </div>

      {/* Preset Question Chips & Input */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((pq, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuestion(pq);
                runAsk(selectedCommitmentId, pq, language);
              }}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                question === pq
                  ? 'bg-indigo-900 text-white border-indigo-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {pq}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAsk(selectedCommitmentId, question, language);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a grounded financial question about this commitment..."
            className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-800 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loading ? 'Translating...' : `Ask in ${language}`}
          </button>
        </form>
      </div>

      {response && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-950">
              <span>Localized Grounded Answer ({response.languageName})</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-800">
                {response.sarvamMeta.status}
              </span>
            </div>
            <p className="text-sm text-slate-900 leading-relaxed font-medium">
              {response.localizedAnswer}
            </p>
            <div className="text-[11px] font-mono text-slate-500 pt-1">
              Evidence IDs: {response.evidenceRecordIds.join(' · ')}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
              Verified English Source & Grounded Facts Used
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{response.englishAnswer}</p>
            <ul className="text-[11px] font-mono text-slate-600 space-y-0.5 pt-1 border-t border-slate-200">
              {response.groundedFactsUsed.map((fact, idx) => (
                <li key={idx}>• {fact}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
