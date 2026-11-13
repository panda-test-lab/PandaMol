import React, { useCallback, useEffect, useRef, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { generateStructures } from './chemistry/generateLocal.ts';
import { Footer } from './components/Footer.tsx';
import { GeneratorForm } from './components/GeneratorForm.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { StructureStage } from './components/StructureStage.tsx';
import { TopBar, type ActiveTab } from './components/TopBar.tsx';
import { ValidationPrincipleView } from './components/ValidationPrincipleView.tsx';
import type {
  DisplayOptions,
  GeneratedStructureCard,
  GenerateStructuresResponse,
  HistoryEntry,
  ProjectionNotice,
  ProjectionType,
} from './types/chemistry.ts';
import {
  isTauriRuntime,
  logAppErrorInTauri,
  type TauriErrorEvent,
} from './utils/tauriBridge.ts';

interface AppErrorEntry {
  id: number;
  timestamp: string;
  event: TauriErrorEvent;
  message: string;
}

const HISTORY_STORAGE_KEY = 'pandamol_history_v1';
const LEGACY_HISTORY_STORAGE_KEY = 'molkarte_history_v1';
const THEME_STORAGE_KEY = 'pandamol_theme_v1';
const LEGACY_THEME_STORAGE_KEY = 'molkarte_theme_v1';

export type ThemeMode = 'light' | 'dark';

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function loadInitialTheme(): ThemeMode {
  try {
    const stored =
      localStorage.getItem(THEME_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Ignore storage read errors
  }
  return 'light';
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw =
      localStorage.getItem(HISTORY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [activeTab, setActiveTab] = useState<ActiveTab>('generator');
  const [query, setQuery] = useState<string>('');
  const [specifications, setSpecifications] = useState<string>('');
  const [projections, setProjections] = useState<ProjectionType[]>(['skelett']);
  const [options, setOptions] = useState<DisplayOptions>({
    uniformAlignment: true,
    showCIP: false,
    colorHeteroatoms: false,
    showCarbonNumbers: false,
    zwitterionic: false,
  });

  const [structures, setStructures] = useState<GeneratedStructureCard[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [notices, setNotices] = useState<ProjectionNotice[]>([]);
  const [interpretedNote, setInterpretedNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorLog, setErrorLog] = useState<AppErrorEntry[]>([]);
  const [availableUpdate, setAvailableUpdate] =
    useState<Awaited<ReturnType<typeof check>>>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState<boolean>(false);

  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const generationRequestId = useRef(0);

  const reportError = useCallback((event: TauriErrorEvent, message: string) => {
    const entry: AppErrorEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleString(),
      event,
      message,
    };
    setErrorLog((previous) => [...previous, entry].slice(-20));
    console.error(`[PandaMol] ${event}: ${message}`);
    void logAppErrorInTauri(event, message).catch((logError: unknown) => {
      console.error('PandaMol konnte den Fehler nicht protokollieren:', logError);
    });
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const location = event.filename
        ? ` (${event.filename}:${event.lineno}:${event.colno})`
        : '';
      const detail =
        event.error instanceof Error ? event.error.stack || event.error.message : '';
      reportError(
        'frontend_runtime_error',
        `${event.message || 'Unbekannter Laufzeitfehler'}${location}${detail ? `\n${detail}` : ''}`
      );
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportError(
        'frontend_runtime_error',
        `Nicht abgefangene Promise-Ablehnung: ${errorMessage(event.reason)}`
      );
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [reportError]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;

    void check()
      .then((update) => {
        if (active && update) setAvailableUpdate(update);
      })
      .catch((updateError: unknown) => {
        if (active) {
          reportError(
            'update_check_failed',
            `Automatische Update-Prüfung fehlgeschlagen: ${errorMessage(updateError)}`
          );
        }
      });

    return () => {
      active = false;
    };
  }, [reportError]);

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setIsInstallingUpdate(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (updateError) {
      reportError(
        'update_install_failed',
        `Update ${availableUpdate.version} konnte nicht installiert werden: ${errorMessage(updateError)}`
      );
      setIsInstallingUpdate(false);
    }
  };

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [history]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleToggleProjection = (p: ProjectionType) => {
    setProjections((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  };

  const handleUpdateOptions = (patch: Partial<DisplayOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }));
  };

  const runGeneration = async (
    targetQuery: string,
    targetSpecs: string,
    targetProjections: ProjectionType[],
    targetOptions: DisplayOptions
  ) => {
    const requestId = ++generationRequestId.current;
    setIsLoading(true);
    setError(null);
    setNotices([]);
    setStructures([]);
    setActiveIndex(0);
    setInterpretedNote('');
    setActiveTab('generator');

    try {
      const payload = {
        query: targetQuery,
        specifications: targetSpecs,
        projections: targetProjections,
        options: targetOptions,
      };

      let data: GenerateStructuresResponse | null = null;
      let ok = false;
      let statusCode = 0;

      // In Tauri standalone builds (tauri://localhost / http://tauri.localhost), resolve locally without Express.
      // When served via HTTP (web preview or `tauri dev` with devUrl), prefer the backend API and fall back cleanly.
      const useLocalOnly =
        isTauriRuntime() &&
        typeof window !== 'undefined' &&
        (window.location.protocol === 'tauri:' ||
          window.location.hostname === 'tauri.localhost');

      if (!useLocalOnly) {
        try {
          const res = await fetch('/api/structures/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          statusCode = res.status;
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            data = (await res.json()) as GenerateStructuresResponse;
            ok = res.ok;
          }
        } catch {
          // Fall back to direct client-side resolution if API server is not running
        }
      }

      if (!data) {
        const localRes = await generateStructures(payload);
        data = localRes.body;
        statusCode = localRes.status;
        ok = localRes.status >= 200 && localRes.status < 300;
      }

      if (requestId !== generationRequestId.current) return;

      if (!ok || data.error) {
        reportError(
          statusCode >= 500 ? 'upstream_unavailable' : 'structure_validation_failed',
          data.error || 'Struktur konnte nicht validiert werden.'
        );
        const debugSuffix = data.debugId ? ` (Debug-ID: ${data.debugId})` : '';
        setError(`${data.error || 'Struktur konnte nicht validiert werden.'}${debugSuffix}`);
        setNotices(data.notices || []);
        return;
      }

      setStructures(data.structures);
      setNotices(data.notices || []);
      setInterpretedNote(data.interpretedNote || '');
      setActiveIndex(0);

      if (data.structures.length > 0) {
        const now = new Date().toISOString();
        const newEntries: HistoryEntry[] = data.structures.map((card) => ({
          id: card.id,
          query: targetQuery,
          specifications: targetSpecs,
          structure: card,
          savedAt: now,
        }));
        setHistory((prev) => [...newEntries, ...prev].slice(0, 60));
      }
    } catch (generationError) {
      if (requestId === generationRequestId.current) {
        reportError(
          'structure_generation_failed',
          `Strukturgenerierung fehlgeschlagen: ${errorMessage(generationError)}`
        );
        setError(
          'Struktur konnte nicht validiert werden. Bitte Verbindung prüfen und erneut versuchen.'
        );
      }
    } finally {
      if (requestId === generationRequestId.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || projections.length === 0) return;
    runGeneration(query, specifications, projections, options);
  };

  const handleApplyPreset = (preset: {
    query: string;
    specifications: string;
    projections: ProjectionType[];
  }) => {
    setQuery(preset.query);
    setSpecifications(preset.specifications);
    setProjections(preset.projections);
    runGeneration(preset.query, preset.specifications, preset.projections, options);
  };

  const handleConfirmStructure = (id: string) => {
    setStructures((prev) =>
      prev.map((card) => (card.id === id ? { ...card, confirmed: true } : card))
    );
    setHistory((prev) =>
      prev.map((entry) =>
        entry.structure.id === id
          ? { ...entry, structure: { ...entry.structure, confirmed: true } }
          : entry
      )
    );
  };

  const handleDiscardStructure = (id: string) => {
    setStructures((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeIndex >= next.length && next.length > 0) {
        setActiveIndex(next.length - 1);
      } else if (next.length === 0) {
        setActiveIndex(0);
      }
      return next;
    });
  };

  const handleReopenHistoryEntry = (entry: HistoryEntry) => {
    generationRequestId.current += 1;
    setIsLoading(false);
    setQuery(entry.query);
    setSpecifications(entry.specifications);
    setStructures([entry.structure]);
    setActiveIndex(0);
    setNotices([]);
    setError(null);
    setInterpretedNote('Aus dem Verlauf geladen.');
    setActiveTab('generator');
  };

  const handleDeleteHistoryEntry = (id: string) => {
    setHistory((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleResetWorkspace = () => {
    generationRequestId.current += 1;
    setIsLoading(false);
    setQuery('');
    setSpecifications('');
    setStructures([]);
    setNotices([]);
    setError(null);
    setInterpretedNote('');
    setActiveIndex(0);
    setActiveTab('generator');
  };

  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        historyCount={history.length}
        onResetWorkspace={handleResetWorkspace}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {availableUpdate && (
          <section
            aria-live="polite"
            className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
          >
            <div>
              <h2 className="font-semibold">Update verfügbar: v{availableUpdate.version}</h2>
              {availableUpdate.body && (
                <p className="mt-1 whitespace-pre-line text-sm">{availableUpdate.body}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleInstallUpdate()}
              disabled={isInstallingUpdate}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {isInstallingUpdate ? 'Update wird installiert …' : 'Jetzt installieren'}
            </button>
          </section>
        )}

        {errorLog.length > 0 && (
          <section
            role="log"
            aria-label="Fehlerprotokoll"
            aria-live="polite"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Fehlerprotokoll (letzte {errorLog.length})</h2>
              <button
                type="button"
                onClick={() => setErrorLog([])}
                className="text-sm underline underline-offset-2"
              >
                Anzeige leeren
              </button>
            </div>
            <ul className="space-y-3">
              {errorLog.map((entry) => (
                <li key={entry.id} className="border-t border-rose-200 pt-2 dark:border-rose-900">
                  <p className="text-xs font-medium">
                    {entry.timestamp} · {entry.event}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
                    {entry.message}
                  </pre>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'generator' && (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            <GeneratorForm
              query={query}
              onQueryChange={setQuery}
              specifications={specifications}
              onSpecificationsChange={setSpecifications}
              projections={projections}
              onToggleProjection={handleToggleProjection}
              options={options}
              onUpdateOptions={handleUpdateOptions}
              onSubmit={handleSubmit}
              onApplyPreset={handleApplyPreset}
              isLoading={isLoading}
            />

            <StructureStage
              structures={structures}
              activeIndex={activeIndex}
              onSelectIndex={setActiveIndex}
              onConfirmStructure={handleConfirmStructure}
              onDiscardStructure={handleDiscardStructure}
              notices={notices}
              interpretedNote={interpretedNote}
              error={error}
              isLoading={isLoading}
              isDark={isDark}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryView
            entries={history}
            onReopenEntry={handleReopenHistoryEntry}
            onDeleteEntry={handleDeleteHistoryEntry}
            onClearHistory={handleClearHistory}
            isDark={isDark}
          />
        )}

        {activeTab === 'validation' && <ValidationPrincipleView />}
      </main>

      <Footer />
    </div>
  );
}
