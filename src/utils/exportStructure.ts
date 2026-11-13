import type { GeneratedStructureCard } from '../types/chemistry.ts';
import { isTauriRuntime, saveExportFileInTauri } from './tauriBridge.ts';

export interface ExportResult {
  saved: boolean;
  canceled?: boolean;
  path?: string;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseSvgDimensions(svgString: string): { vx: number; vy: number; vw: number; vh: number } {
  const vbMatch = svgString.match(/viewBox="([^"]+)"/);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
      return { vx: parts[0], vy: parts[1], vw: parts[2], vh: parts[3] };
    }
  }
  return { vx: 0, vy: 0, vw: 600, vh: 400 };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildExportableSvg(
  card: GeneratedStructureCard,
  includeCaption: boolean,
  transparentBg = false
): string {
  const { vx, vy, vw, vh } = parseSvgDimensions(card.svg);
  const pad = Math.max(24, Math.round(Math.max(vw, vh) * 0.08));
  const captionH = includeCaption ? 46 : 0;
  const totalW = vw + pad * 2;
  const totalH = vh + pad * 2 + captionH;

  const innerMatch = card.svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  const inner = innerMatch ? innerMatch[1] : card.svg;

  const bgRect = transparentBg
    ? ''
    : `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#FFFFFF" />`;

  const captionGroup = includeCaption
    ? `
  <line x1="${pad}" y1="${vh + pad * 1.6}" x2="${totalW - pad}" y2="${vh + pad * 1.6}" stroke="#E2E8F0" stroke-width="1" />
  <text x="${totalW / 2}" y="${vh + pad * 1.6 + 24}" text-anchor="middle" font-family="'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif" font-size="14" font-weight="600" fill="#0F172A">${escapeXml(card.title)} · ${escapeXml(card.projectionLabel)} (${escapeXml(card.compound.molecularFormula)})</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
  ${bgRect}
  <g transform="translate(${pad - vx}, ${pad - vy})">
    ${inner}
  </g>${captionGroup}
</svg>`;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function deliverExportBlob(
  blob: Blob,
  filename: string,
  extension: 'svg' | 'png' | 'jpg'
): Promise<ExportResult> {
  if (isTauriRuntime()) {
    const buffer = await blob.arrayBuffer();
    return saveExportFileInTauri(new Uint8Array(buffer), filename, extension);
  }
  triggerBrowserDownload(blob, filename);
  return { saved: true };
}

export async function exportStructureFile(
  card: GeneratedStructureCard,
  format: 'svg' | 'png' | 'jpg',
  options: { includeCaption: boolean; transparentPng?: boolean }
): Promise<ExportResult> {
  const baseName = `${sanitizeFilename(card.title)}_${sanitizeFilename(card.projectionLabel)}`;

  if (format === 'svg') {
    const svgContent = buildExportableSvg(card, options.includeCaption, false);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    return deliverExportBlob(blob, `${baseName}.svg`, 'svg');
  }

  const transparent = format === 'png' && Boolean(options.transparentPng);
  const svgContent = buildExportableSvg(card, options.includeCaption, transparent);
  const { vw, vh } = parseSvgDimensions(svgContent);

  const targetWidth = 2400;
  const targetHeight = Math.max(800, Math.round((vh / vw) * targetWidth));

  const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('SVG-Rendering für Export fehlgeschlagen.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D Kontext nicht verfügbar.');

    if (!transparent) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'jpg' ? 0.98 : 1.0;

    const outBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Raster-Export fehlgeschlagen.'))),
        mime,
        quality
      );
    });

    return deliverExportBlob(outBlob, `${baseName}.${format}`, format);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
