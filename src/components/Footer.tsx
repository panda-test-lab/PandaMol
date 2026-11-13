import React from 'react';
import tauriConfig from '../../src-tauri/tauri.conf.json';
import { KofiDonateButton } from './KofiDonateButton.tsx';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors">
      <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-display font-semibold text-slate-900 dark:text-slate-100">
            PandaMol
          </span>
          <span aria-hidden="true">·</span>
          <span>Weniger zeichnen. Mehr lernen.</span>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium font-mono tabular-nums rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            v{tauriConfig.version}
          </span>
        </div>

        <KofiDonateButton />
      </div>
    </footer>
  );
};
