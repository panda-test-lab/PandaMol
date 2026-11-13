import React, { useState } from 'react';
import {
  isTauriRuntime,
  logAppErrorInTauri,
  openExternalUrlInTauri,
} from '../utils/tauriBridge.ts';

const KOFI_TEXT = 'Unterstütze meine Arbeit';
const KOFI_COLOR = '#ffaa00';
const KOFI_URL = 'https://ko-fi.com/H0G826CZMP';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const KofiDonateButton: React.FC = () => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isTauriRuntime()) return;

    event.preventDefault();
    setErrorMessage(null);
    void openExternalUrlInTauri(KOFI_URL).catch((error: unknown) => {
      const message = `Ko-fi konnte nicht im Standardbrowser geöffnet werden: ${getErrorMessage(error)}`;
      setErrorMessage(message);
      void logAppErrorInTauri('external_link_failed', message).catch((logError: unknown) => {
        console.error('PandaMol konnte den Fehler nicht protokollieren:', logError);
      });
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Support me on ko-fi.com"
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
        style={{ backgroundColor: KOFI_COLOR }}
      >
        <span>{KOFI_TEXT}</span>
      </a>
      {errorMessage && (
        <p role="alert" className="max-w-xs text-xs text-rose-700 dark:text-rose-300">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
