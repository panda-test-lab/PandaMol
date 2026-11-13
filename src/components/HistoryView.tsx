import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Download, Search, Trash2 } from 'lucide-react';
import type { HistoryEntry } from '../types/chemistry.ts';
import { exportStructureFile } from '../utils/exportStructure.ts';
import { themeSvgForDisplay } from '../utils/themeSvg.ts';

interface HistoryViewProps {
  entries: HistoryEntry[];
  onReopenEntry: (entry: HistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClearHistory: () => void;
  isDark: boolean;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  entries,
  onReopenEntry,
  onDeleteEntry,
  onClearHistory,
  isDark,
}) => {
  const [filterText, setFilterText] = useState('');
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return entries.filter((item) => {
      if (onlyConfirmed && !item.structure.confirmed) return false;
      if (!q) return true;
      return (
        item.structure.title.toLowerCase().includes(q) ||
        item.structure.projectionLabel.toLowerCase().includes(q) ||
        item.structure.compound.molecularFormula.toLowerCase().includes(q) ||
        item.query.toLowerCase().includes(q)
      );
    });
  }, [entries, filterText, onlyConfirmed]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Lernkarten-Verlauf
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Bereits generierte und bestätigte Strukturformeln jederzeit wieder öffnen oder direkt exportieren.
          </p>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="px-3.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-950 border border-rose-200 dark:border-rose-800/80 rounded-lg transition-colors cursor-pointer"
          >
            Verlauf vollständig leeren
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 transition-colors">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Verlauf durchsuchen (Name, Projektion, Summenformel) …"
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setOnlyConfirmed(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                !onlyConfirmed
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Alle (<span className="tabular-nums">{entries.length}</span>)
            </button>
            <button
              type="button"
              onClick={() => setOnlyConfirmed(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                onlyConfirmed
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Nur bestätigte
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center transition-colors">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {entries.length === 0
              ? 'Noch keine Strukturformeln im Verlauf gespeichert. Generiere eine Struktur im Generator, um sie hier abzulegen.'
              : 'Keine passenden Einträge für den aktuellen Filter gefunden.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry) => {
            const s = entry.structure;
            const dateStr = new Date(entry.savedAt).toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            const isWarning =
              s.compound.validation?.status &&
              s.compound.validation.status !== 'verified';

            const displaySvg = themeSvgForDisplay(s.svg, isDark);

            return (
              <article
                key={entry.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden flex flex-col transition-colors ${
                  isWarning
                    ? 'border-rose-200 dark:border-rose-800/80'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div
                  className={`p-4 border-b flex items-start justify-between gap-2 ${
                    isWarning
                      ? 'bg-rose-50/70 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/80'
                      : 'border-slate-100 dark:border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {s.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="text-blue-700 dark:text-blue-400 font-medium">
                        {s.projectionLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {s.compound.molecularFormula}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{s.confirmed ? '✓ Bestätigt' : 'Offen'}</span>
                      {isWarning && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-rose-700 dark:text-rose-400 font-medium">
                            ▲ Hinweis
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteEntry(entry.id)}
                    aria-label="Aus Verlauf entfernen"
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div
                  onClick={() => onReopenEntry(entry)}
                  className="p-4 h-44 bg-white dark:bg-[#0b1120] flex items-center justify-center cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div
                    className="w-full h-full flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: displaySvg }}
                  />
                </div>

                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/70 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-auto">
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {dateStr}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {s.confirmed && (
                      <button
                        type="button"
                        onClick={() =>
                          exportStructureFile(s, 'png', {
                            includeCaption: false,
                          })
                        }
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>PNG</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onReopenEntry(entry)}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-md inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Öffnen</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
