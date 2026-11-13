import React from 'react';
import { Loader2, Search } from 'lucide-react';
import type { DisplayOptions, ProjectionType } from '../types/chemistry.ts';

interface GeneratorFormProps {
  query: string;
  onQueryChange: (val: string) => void;
  specifications: string;
  onSpecificationsChange: (val: string) => void;
  projections: ProjectionType[];
  onToggleProjection: (p: ProjectionType) => void;
  options: DisplayOptions;
  onUpdateOptions: (patch: Partial<DisplayOptions>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onApplyPreset: (preset: {
    query: string;
    specifications: string;
    projections: ProjectionType[];
  }) => void;
  isLoading: boolean;
}

const PROJECTION_ITEMS: Array<{
  id: ProjectionType;
  label: string;
  hint: string;
}> = [
  {
    id: 'skelett',
    label: 'Skelettformel',
    hint: 'Standardisierte 2D-Strukturformel',
  },
  {
    id: 'fischer',
    label: 'Fischer-Projektion',
    hint: 'Offenkettige Zucker & Aminosäuren',
  },
  {
    id: 'haworth',
    label: 'Haworth-Projektion',
    hint: 'Zyklische Pyranosen & Furanosen',
  },
  {
    id: 'sessel',
    label: 'Sesselkonformation',
    hint: '⁴C₁ / ¹C₄ für Sechsring-Zucker',
  },
];

const QUICK_PRESETS: Array<{
  label: string;
  query: string;
  specifications: string;
  projections: ProjectionType[];
}> = [
  {
    label: 'β-D-Glucose',
    query: 'Glucose',
    specifications: 'beta-D-Pyranose',
    projections: ['haworth', 'sessel'],
  },
  {
    label: 'D-Glucose (Fischer)',
    query: 'Glucose',
    specifications: 'offenkettig, D-Form',
    projections: ['fischer', 'skelett'],
  },
  {
    label: 'L-Alanin',
    query: 'L-Alanin',
    specifications: 'Zwitterion bei pH 7',
    projections: ['skelett', 'fischer'],
  },
  {
    label: 'β-D-Fructose',
    query: 'Fructose',
    specifications: 'beta-D-Furanose',
    projections: ['haworth', 'fischer'],
  },
  {
    label: 'Acetylsalicylsäure',
    query: 'Aspirin',
    specifications: '',
    projections: ['skelett'],
  },
  {
    label: 'Coffein',
    query: 'Coffein',
    specifications: '',
    projections: ['skelett'],
  },
];

export const GeneratorForm: React.FC<GeneratorFormProps> = ({
  query,
  onQueryChange,
  specifications,
  onSpecificationsChange,
  projections,
  onToggleProjection,
  options,
  onUpdateOptions,
  onSubmit,
  onApplyPreset,
  isLoading,
}) => {
  return (
    <aside className="w-full lg:w-[380px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-6 transition-colors">
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Strukturparameter
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Bezeichnung eingeben, Details ergänzen und gewünschte Darstellungen einzeln prüfen.
          </p>
        </div>

        {/* Feld 1: Bezeichnung */}
        <div className="space-y-1.5">
          <label
            htmlFor="compound-query"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Bezeichnung der Struktur
          </label>
          <input
            id="compound-query"
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="z. B. Glucose, L-Alanin, Ibuprofen, Atropin"
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            autoComplete="off"
          />
        </div>

        {/* Feld 2: Weitere Spezifikationen */}
        <div className="space-y-1.5">
          <label
            htmlFor="compound-specs"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Weitere Spezifikationen{' '}
            <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
          </label>
          <textarea
            id="compound-specs"
            rows={2}
            value={specifications}
            onChange={(e) => onSpecificationsChange(e.target.value)}
            placeholder="z. B. beta-D-Pyranose, offenkettig, L-Form, Zwitterion bei pH 7, (S)-Enantiomer"
            className="w-full px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Anfängerfreundlich: Angaben zu Anomer (α/β), D/L-Reihe, Ringgröße oder Ladungszustand.
          </p>
        </div>

        {/* Darstellungsauswahl (Checkboxen) */}
        <fieldset className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Darstellungsform
          </legend>
          <div className="space-y-2">
            {PROJECTION_ITEMS.map((item) => {
              const checked = projections.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-blue-50/60 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleProjection(item.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 dark:text-blue-500 focus:ring-blue-600 cursor-pointer"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                      {item.label}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Anfängerfreundliche Darstellungsoptionen */}
        <fieldset className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Anfängerfreundliche Optionen
          </legend>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={options.uniformAlignment}
              onChange={(e) => onUpdateOptions({ uniformAlignment: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600 cursor-pointer"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Einheitliche Grundgerüst-Ausrichtung
            </span>
          </label>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={options.colorHeteroatoms}
              onChange={(e) => onUpdateOptions({ colorHeteroatoms: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600 cursor-pointer"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Heteroatome farbig markieren (O, N, S)
            </span>
          </label>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={options.showCIP}
              onChange={(e) => onUpdateOptions({ showCIP: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600 cursor-pointer"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              CIP-Stereozentren (R/S) einblenden
            </span>
          </label>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={options.showCarbonNumbers}
              onChange={(e) => onUpdateOptions({ showCarbonNumbers: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-700 focus:ring-blue-600 cursor-pointer"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              C-Nummerierung (C1, C2 …) anzeigen
            </span>
          </label>
        </fieldset>

        <button
          type="submit"
          disabled={isLoading || !query.trim() || projections.length === 0}
          className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Datenbank wird abgefragt …</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              <span>Strukturen prüfen & generieren</span>
            </>
          )}
        </button>
      </form>

      {/* Schnellbeispiele */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Schnellbeispiele für Lernkarten
        </p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onApplyPreset(preset)}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};
