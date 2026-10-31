import React from 'react';
import { LanguageCode, SupportedLanguage } from '../../types/debitlens';
import { Languages } from 'lucide-react';

interface LanguageSelectorProps {
  selectedLanguage: LanguageCode;
  languages: SupportedLanguage[];
  onChangeLanguage: (lang: LanguageCode) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  languages,
  onChangeLanguage,
}) => {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="bhasha-language-selector"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap"
      >
        <Languages className="w-3.5 h-3.5 text-teal-700" />
        <span>Bhasha:</span>
      </label>
      <select
        id="bhasha-language-selector"
        aria-label="DebitLens Bhasha Language Selector"
        value={selectedLanguage}
        onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
        className="px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 transition-colors"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName} · {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
};
