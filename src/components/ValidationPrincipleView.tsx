import React from 'react';
import { CheckCircle2, Compass, Database, ShieldCheck } from 'lucide-react';

export const ValidationPrincipleView: React.FC = () => {
  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2 transition-colors">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 text-balance">
          Validierungslogik & Anfängerfreundliche Ausrichtung
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
          Jede Kleinmolekül-Strukturformel durchläuft eine dreistufige deterministische Prüfung. Komplexe Glykan-Diagramme werden aus verknüpften oder selbst eingegebenen WURCS-Sequenzen gerendert; PandaMol erfindet keine Struktur frei.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 transition-colors">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-display font-semibold text-base">
            <Database className="w-5 h-5 shrink-0" />
            <h2>01. Autoritative Datenbank-Abfrage</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Biochemische Namen und stereochemische Spezifikationen werden bevorzugt über <strong className="text-slate-900 dark:text-slate-200">ChEBI</strong> aufgelöst; <strong className="text-slate-900 dark:text-slate-200">PubChem PUG REST</strong> bleibt der Fallback. Bei Verfügbarkeit prüft der <strong className="text-slate-900 dark:text-slate-200">NCI/CADD Chemical Identifier Resolver</strong> zusätzlich den InChIKey.
          </p>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 transition-colors">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-display font-semibold text-base">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <h2>02. OpenChemLib Summenformel- & Stereo-Gate</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Die abgerufene Isomeric-SMILES-Notation wird lokal durch <strong className="text-slate-900 dark:text-slate-200">OpenChemLib</strong> geparst. Summenformel, Valenzen und alle CIP-Stereozentren (R/S) müssen exakt mit dem Datenbank-Eintrag übereinstimmen. Unmögliche Angaben (z. B. „D-Glycin“) werden strikt abgewiesen.
          </p>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 transition-colors">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-display font-semibold text-base">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-700 dark:text-blue-400" />
            <h2>03. Mathematische IDCode-Verifikation</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Für <strong className="text-slate-900 dark:text-slate-200">Haworth-Projektionen</strong>, <strong className="text-slate-900 dark:text-slate-200">Sesselkonformationen</strong> (⁴C₁ / ¹C₄) und <strong className="text-slate-900 dark:text-slate-200">Fischer-Projektionen</strong> wird die Ausrichtung jedes Substituenten (oben/unten bzw. links/rechts) direkt aus der 3D-Tetraedergeometrie berechnet und gegen den kanonischen OpenChemLib-IDCode rückverifiziert.
          </p>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 transition-colors">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-display font-semibold text-base">
            <Compass className="w-5 h-5 shrink-0 text-blue-700 dark:text-blue-400" />
            <h2>04. Einheitliche Lernkarten-Ausrichtung</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Alle L-Aminosäuren werden einheitlich mit Aminogruppe oben, Carboxylgruppe rechts und Rest nach links ausgerichtet. Haworth-Ringe tragen den Ringsauerstoff oben rechts und C1 rechts; Sesselkonformationen orientieren die C5-CH₂OH-Gruppe stets äquatorial.
          </p>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 transition-colors">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-display font-semibold text-base">
            <Database className="w-5 h-5 shrink-0 text-blue-700 dark:text-blue-400" />
            <h2>05. Registrierte Glykane</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            ChEBI-Einträge mit WURCS-Sequenz und GlyTouCan-IDs liefern SNFG-Diagramme. Für registrierte Glykane wird zusätzlich eine chemische Skelettformel erzeugt, wenn GlyGen eine SMILES-Struktur mit exakt derselben WURCS-Sequenz bereitstellt. Eigene WURCS-Sequenzen werden als SNFG gerendert; ohne verifizierte SMILES-Konvertierung wird keine chemische Formel erfunden.
          </p>
        </article>
      </div>
    </div>
  );
};
