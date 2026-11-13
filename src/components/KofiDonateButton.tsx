import React, { useEffect, useState } from 'react';
import { openExternalUrlInTauri } from '../utils/tauriBridge.ts';

declare global {
  interface Window {
    kofiwidget2?: {
      init: (text: string, color: string, id: string) => void;
      getHTML?: () => string;
    };
  }
}

const KOFI_SCRIPT_SRC = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js';
const KOFI_TEXT = 'Unterstütze meine Arbeit';
const KOFI_COLOR = '#ffaa00';
const KOFI_ID = 'H0G826CZMP';
const KOFI_URL = `https://ko-fi.com/${KOFI_ID}`;

export const KofiDonateButton: React.FC = () => {
  const [widgetHtml, setWidgetHtml] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initWidget = () => {
      try {
        if (window.kofiwidget2 && typeof window.kofiwidget2.init === 'function') {
          window.kofiwidget2.init(KOFI_TEXT, KOFI_COLOR, KOFI_ID);
          if (typeof window.kofiwidget2.getHTML === 'function') {
            const html = window.kofiwidget2.getHTML();
            if (mounted && html) {
              setWidgetHtml(html);
            }
          }
        }
      } catch {
        // Keep clean fallback link if external widget fails
      }
    };

    if (window.kofiwidget2) {
      initWidget();
      return () => {
        mounted = false;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${KOFI_SCRIPT_SRC}"]`
    );

    if (existing) {
      existing.addEventListener('load', initWidget);
      return () => {
        mounted = false;
        existing.removeEventListener('load', initWidget);
      };
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = KOFI_SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', initWidget);
    document.body.appendChild(script);

    return () => {
      mounted = false;
      script.removeEventListener('load', initWidget);
    };
  }, []);

  const handleContainerClick = async (e: React.MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement | null)?.closest('a');
    if (!target) return;
    const href = target.getAttribute('href') || KOFI_URL;
    const handled = await openExternalUrlInTauri(href);
    if (handled) {
      e.preventDefault();
    }
  };

  if (widgetHtml) {
    return (
      <div
        onClick={handleContainerClick}
        className="inline-flex items-center shrink-0"
        dangerouslySetInnerHTML={{ __html: widgetHtml }}
      />
    );
  }

  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Support me on ko-fi.com"
      onClick={handleContainerClick}
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
      style={{ backgroundColor: KOFI_COLOR }}
    >
      <span>{KOFI_TEXT}</span>
    </a>
  );
};
