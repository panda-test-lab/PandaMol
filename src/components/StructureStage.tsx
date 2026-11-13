import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FlaskConical,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  GeneratedStructureCard,
  ProjectionNotice,
} from '../types/chemistry.ts';
import { exportStructureFile } from '../utils/exportStructure.ts';
import { openExternalUrlInTauri } from '../utils/tauriBridge.ts';
import { themeSvgForDisplay } from '../utils/themeSvg.ts';

interface StructureStageProps {
  structures: GeneratedStructureCard[];
  activeIndex: number;
  onSelectIndex: (idx: number) => void;
  onConfirmStructure: (id: string) => void;
  onDiscardStructure: (id: string) => void;
  notices: ProjectionNotice[];
  interpretedNote: string;
  error: string | null;
  isLoading: boolean;
  isDark: boolean;
}

export const StructureStage: React.FC<StructureStageProps> = ({
  structures,
  activeIndex,
  onSelectIndex,
  onConfirmStructure,
  onDiscardStructure,
  notices,
  interpretedNote,
  error,
  isLoading,
  isDark,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [includeCaption, setIncludeCaption] = useState<boolean>(false);
  const [transparentPng, setTransparentPng] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportTimerRef = useRef<number | null>(null);

  const currentCard = structures[activeIndex] || null;
  const currentCardId = currentCard?.id;

  useEffect(() => {
    setExportStatus(null);
  }, [currentCardId]);

  useEffect(() => {
    return () => {
      if (exportTimerRef.current !== null) {
        window.clearTimeout(exportTimerRef.current);
      }
    };
  }, []);

  const handleExport = async (format: 'svg' | 'png' | 'jpg') => {
    if (!currentCard || !currentCard.confirmed) return;
    if (exportTimerRef.current !== null) {
      window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = null;
    }
    setExportStatus(`Exportiere ${format.toUpperCase()} …`);
    try {
      const result = await exportStructureFile(currentCard, format, {
        includeCaption,
        transparentPng,
      });
      if (result.canceled) {
        setExportStatus('Export abgebrochen.');
      } else if (result.path) {
        setExportStatus(`${format.toUpperCase()} gespeichert.`);
      } else {
        setExportStatus(`${format.toUpperCase()}-Datei wurde heruntergeladen.`);
      }
      exportTimerRef.current = window.setTimeout(() => setExportStatus(null), 3500);
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : 'Export fehlgeschlagen.'
      );
    }
  };

  const handleOpenPubChem = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    url: string
  ) => {
    const handled = await openExternalUrlInTauri(url);
    if (handled) {
      e.preventDefault();
    }
  };

  if (isLoading) {
    return (
      <section className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[540px] text-center transition-colors">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400 mb-4">
          <FlaskConical className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          Chemische Datenbank & Stereochemie werden geprüft …
        </h2>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md">
          Abgleich mit PubChem PUG REST, NCI/CADD Resolver und deterministischer OpenChemLib-Validierung.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex items-center justify-center min-h-[540px] transition-colors"
      >
        <div className="max-w-xl w-full rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/50 p-6">
          <div className="flex items-center gap-3 text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="font-display text-lg font-semibold">
              Struktur konnte nicht erstellt werden
            </h2>
          </div>
          <p className="mt-3 text-sm text-rose-900 dark:text-rose-100 leading-relaxed">
            {error}
          </p>
          <p className="mt-3 text-xs text-rose-800/80 dark:text-rose-200/80">
            Prüfe die Internetverbindung oder die chemische Bezeichnung.
            Fehlerereignisse werden in der PandaMol-Logdatei festgehalten.
          </p>
        </div>
      </section>
    );
  }

  if (!currentCard && notices.length > 0) {
    return (
      <section className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[540px] transition-colors">
        <div className="max-w-lg w-full bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-base font-display font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>Darstellung für diese Projektion nicht anwendbar</span>
          </div>
          <ul className="space-y-1.5 text-sm text-amber-900/90 dark:text-amber-100/90 pl-5 list-disc">
            {notices.map((n, i) => (
              <li key={i}>
                <strong>
                  {n.compoundName} ({n.projectionLabel}):
                </strong>{' '}
                {n.reason}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            Tipp: Wähle links z. B. zusätzlich „Skelettformel“ aus, um die reguläre 2D-Struktur darzustellen.
          </p>
        </div>
      </section>
    );
  }

  if (!currentCard) {
    return (
      <section className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[540px] text-center transition-colors">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 mb-4">
          <FlaskConical className="w-6 h-6" />
        </div>
        <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1.5">
          PandaMol · Weniger zeichnen. Mehr lernen.
        </p>
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100 text-balance">
          Bereit für deine erste Lernkarten-Struktur
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
          Gib links eine Bezeichnung (z. B. <strong className="text-slate-900 dark:text-slate-200">Glucose</strong>, <strong className="text-slate-900 dark:text-slate-200">L-Alanin</strong> oder <strong className="text-slate-900 dark:text-slate-200">Acetylsalicylsäure</strong>) ein und wähle die gewünschten Projektionen. Jede passende Struktur wird einzeln verifiziert und vor dem Export zur Bestätigung angezeigt.
        </p>
      </section>
    );
  }

  const vStatus = currentCard.compound.validation.status || 'verified';
  const hasValidationWarning = vStatus !== 'verified';
  const displaySvg = themeSvgForDisplay(currentCard.svg, isDark);

  return (
    <section className="flex-1 min-w-0 space-y-4">
      {/* Einzelauswahl-Chips (bei Unwahrscheinlichkeit / fehlender Validierung leicht rot hinterlegt) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-2 overflow-x-auto max-w-full">
          {structures.map((item, idx) => {
            const isWarningChip =
              item.compound.validation.status &&
              item.compound.validation.status !== 'verified';
            const isActive = idx === activeIndex;

            let chipClass = '';
            if (isWarningChip) {
              chipClass = isActive
                ? 'bg-rose-700 dark:bg-rose-600 text-white border border-rose-700 dark:border-rose-600'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-950';
            } else {
              chipClass = isActive
                ? 'bg-blue-700 dark:bg-blue-600 text-white border border-blue-700 dark:border-blue-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700';
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectIndex(idx)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${chipClass}`}
              >
                {isWarningChip ? '▲ ' : ''}
                {idx + 1}. {item.title} ({item.projectionLabel})
                {item.confirmed ? ' ✓' : ''}
              </button>
            );
          })}
        </div>

        {structures.length > 1 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Einzelansicht {activeIndex + 1} / {structures.length}
            </span>
            <button
              type="button"
              onClick={() => onSelectIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              aria-label="Vorherige Struktur"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectIndex(Math.min(structures.length - 1, activeIndex + 1))
              }
              disabled={activeIndex === structures.length - 1}
              aria-label="Nächste Struktur"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Hinweisfeld bei unwahrscheinlicher Bildung oder unvollständiger Validierung */}
      {hasValidationWarning && (
        <div
          role="alert"
          className="bg-rose-50/90 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm text-rose-950 dark:text-rose-100">
            <p className="font-display font-semibold">
              {currentCard.compound.validation.warningTitle ||
                'Hinweis zur Validierung / Bildungswahrscheinlichkeit'}
            </p>
            <p className="text-xs sm:text-sm text-rose-900 dark:text-rose-200 leading-relaxed">
              {currentCard.compound.validation.warningMessage}
            </p>
          </div>
        </div>
      )}

      {/* Hauptkarte: Verifizierte Einzelstruktur */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        {/* Header & Verifikations-Metadaten (ohne Pill-Kästen) */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                {currentCard.title}
              </h2>
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {currentCard.projectionLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              {vStatus === 'verified' ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold font-sans">
                  ✓ Datenbank-verifiziert
                </span>
              ) : vStatus === 'unlikely_form' ? (
                <span className="text-rose-700 dark:text-rose-400 font-semibold font-sans">
                  ▲ Geringe Bildungswahrscheinlichkeit
                </span>
              ) : (
                <span className="text-rose-700 dark:text-rose-400 font-semibold font-sans">
                  ▲ Nicht vollständig validiert
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {currentCard.compound.cid > 0
                  ? `PubChem CID ${currentCard.compound.cid}`
                  : 'Sekundärquelle (ohne PubChem-CID)'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentCard.compound.molecularFormula}</span>
              <span aria-hidden="true">·</span>
              <span>{currentCard.compound.molecularWeight}</span>
              {currentCard.compound.validation.secondarySourceChecked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans text-slate-600 dark:text-slate-400">
                    Zweitabgleich: {currentCard.compound.validation.secondarySourceName}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={currentCard.compound.pubchemUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => handleOpenPubChem(e, currentCard.compound.pubchemUrl)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <span>PubChem-Eintrag</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={() => onDiscardStructure(currentCard.id)}
              title="Diese Kandidaten-Struktur verwerfen"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Verwerfen</span>
            </button>
          </div>
        </div>

        {/* Canvas Toolbar */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {currentCard.subtitle}
            {interpretedNote ? ` · ${interpretedNote}` : ''}
          </span>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-700"
              />
              <span>Hilfsraster</span>
            </label>

            <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(70, z - 15))}
                aria-label="Verkleinern"
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(145, z + 15))}
                aria-label="Vergrößern"
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Hochauflösende SVG-Bühne */}
        <div
          className={`p-8 flex items-center justify-center min-h-[380px] overflow-auto ${
            showGrid ? 'specimen-grid' : 'bg-white dark:bg-[#0b1120]'
          }`}
        >
          <div
            className="transition-transform duration-150 ease-out flex items-center justify-center"
            style={{
              width: `${Math.round(520 * (zoom / 100))}px`,
              maxWidth: '100%',
              height: `${Math.round(320 * (zoom / 100))}px`,
            }}
            dangerouslySetInnerHTML={{ __html: displaySvg }}
          />
        </div>

        {/* Ausrichtungs- & Stereochemie-Details */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          {currentCard.alignmentNotes && (
            <p>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Darstellung & Ausrichtung:
              </span>{' '}
              {currentCard.alignmentNotes}
            </p>
          )}
          <p className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 break-all">
            IUPAC: {currentCard.compound.iupacName} · Stereozentren: {currentCard.compound.cipSummary} · InChIKey: {currentCard.compound.inchiKey}
          </p>
        </div>

        {/* Bestätigung & Hochauflösender Export */}
        <div className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          {!currentCard.confirmed ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-slate-700 dark:text-slate-300">
                Bitte prüfe die Strukturformel und bestätige sie, um den direkten Export (SVG, PNG, JPG) freizuschalten.
              </div>
              <button
                type="button"
                onClick={() => onConfirmStructure(currentCard.id)}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              >
                <Check className="w-4 h-4" />
                <span>Struktur bestätigen & Export freigeben</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="w-4 h-4" />
                  <span>
                    Struktur bestätigt — bereit für den Lernkarten-Export (2400 px / Vektor)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCaption}
                      onChange={(e) => setIncludeCaption(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-700"
                    />
                    <span>Name & Summenformel einbetten</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={transparentPng}
                      onChange={(e) => setTransparentPng(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-700"
                    />
                    <span>Transparenter PNG-Hintergrund</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleExport('svg')}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Download className="w-4 h-4" />
                  <span>SVG (Vektor)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('png')}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Download className="w-4 h-4" />
                  <span>PNG (2400 px)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('jpg')}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Download className="w-4 h-4" />
                  <span>JPG (2400 px)</span>
                </button>

                {exportStatus && (
                  <span className="text-xs text-slate-600 dark:text-slate-300 ml-2">
                    {exportStatus}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hinweise zu nicht anwendbaren Projektionen */}
      {notices.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>Chemische Validierungshinweise zu weiteren Projektionen</span>
          </div>
          <ul className="space-y-1 text-xs text-amber-900/90 dark:text-amber-100/90 pl-6 list-disc">
            {notices.map((n, i) => (
              <li key={i}>
                <strong>
                  {n.compoundName} ({n.projectionLabel}):
                </strong>{' '}
                {n.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
