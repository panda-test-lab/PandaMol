import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../App.tsx';

export type ActiveTab = 'generator' | 'history' | 'validation';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  historyCount: number;
  onResetWorkspace: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  historyCount,
  onResetWorkspace,
  theme,
  onToggleTheme,
}) => {
  const isDark = theme === 'dark';

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#generator"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('generator');
          }}
          className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          PandaMol
        </a>

        <nav className="flex items-center gap-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelectTab('generator')}
            className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              activeTab === 'generator'
                ? 'text-blue-700 dark:text-blue-400 border-blue-700 dark:border-blue-400'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            Struktur-Generator
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('history')}
            className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              activeTab === 'history'
                ? 'text-blue-700 dark:text-blue-400 border-blue-700 dark:border-blue-400'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            Verlauf (<span className="tabular-nums">{historyCount}</span>)
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('validation')}
            className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              activeTab === 'validation'
                ? 'text-blue-700 dark:text-blue-400 border-blue-700 dark:border-blue-400'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            Validierungsprinzip
          </button>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
            title={isDark ? 'Hellmodus aktivieren' : 'Dark-Mode aktivieren'}
            className="p-2 text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onResetWorkspace}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Neue Anfrage
          </button>
        </div>
      </div>
    </header>
  );
};
