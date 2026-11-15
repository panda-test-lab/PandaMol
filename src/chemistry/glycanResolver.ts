import type { ResolverDiagnosticHandler } from './coreResolver.ts';

const GLYTOCAN_ACCESSION = /^G\d{5}[A-Z]{2}$/i;
const WURCS2IMAGE_VERSION = '1.25.4';

export interface GlycanDiagram {
  accession?: string;
  wurcs: string;
  svg: string;
}

export interface GlyTouCanStructure {
  accession: string;
  wurcs: string;
}

export interface GlycanChemicalData {
  smiles: string;
  inchiKey: string;
}

export type GlycanLookupResult =
  | { status: 'found'; diagram: GlycanDiagram }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export type GlyTouCanStructureLookupResult =
  | { status: 'found'; structure: GlyTouCanStructure }
  | { status: 'not-found' }
  | { status: 'unavailable' };

interface GlyTouCanEntryResponse {
  errcode?: string;
  contents?: {
    accession?: string;
    validated_wurcstext?: string;
  };
}

interface GlycanImageResponse {
  image?: string;
  wurcs?: string;
}

interface GlyGenDetailResponse {
  glytoucan?: { glytoucan_ac?: string };
  wurcs?: string;
  smiles_isomeric?: string;
  inchi_key?: { key?: string };
}

export function extractGlyTouCanAccession(text: string): string | undefined {
  return text.match(/\bG\d{5}[A-Z]{2}\b/i)?.[0].toUpperCase();
}

export function extractWurcsSequence(text: string): string | undefined {
  const sequence = text.match(/WURCS=2\.0\/\d+,\d+,\d+\/[^\s]+/)?.[0];
  return sequence && sequence.length <= 4000 ? sequence : undefined;
}

function isGlyTouCanAccession(value: string): boolean {
  return GLYTOCAN_ACCESSION.test(value);
}

function isWurcsSequence(value: string): boolean {
  return value.length <= 4000 && /^WURCS=2\.0\/\d+,\d+,\d+\/[^\s]+$/.test(value);
}

async function reportFailure(
  onDiagnostic: ResolverDiagnosticHandler | undefined,
  provider: 'GlyTouCan API' | 'GlyCosmos WURCS2Image API' | 'GlyGen API',
  operation: 'lookup' | 'structure-fallback',
  failure: 'network' | 'upstream' | 'invalid-response',
  statusCode?: number
): Promise<void> {
  await onDiagnostic?.({ provider, operation, failure, statusCode });
}

async function fetchJson(
  url: string,
  provider: 'GlyTouCan API' | 'GlyCosmos WURCS2Image API' | 'GlyGen API',
  operation: 'lookup' | 'structure-fallback',
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<{ status: number; data?: unknown } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: 'error',
      });
    } catch {
      await reportFailure(onDiagnostic, provider, operation, 'network');
      return null;
    }

    if (!response.ok) {
      if (response.status === 404 && provider === 'GlyTouCan API') {
        return { status: 404 };
      }
      await reportFailure(
        onDiagnostic,
        provider,
        operation,
        response.status === 429 || response.status >= 500 ? 'upstream' : 'invalid-response',
        response.status
      );
      return null;
    }

    try {
      return { status: response.status, data: await response.json() };
    } catch {
      await reportFailure(onDiagnostic, provider, operation, 'invalid-response');
      return null;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function createGlycanSvg(image: string): string | undefined {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return undefined;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="100%" height="100%">
  <image href="${image}" x="0" y="0" width="640" height="360" preserveAspectRatio="xMidYMid meet" />
</svg>`;
}

export async function fetchGlyTouCanWurcs(
  rawAccession: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<GlyTouCanStructureLookupResult> {
  const accession = rawAccession.toUpperCase();
  if (!isGlyTouCanAccession(accession)) return { status: 'not-found' };

  const entryResult = await fetchJson(
    `https://glytoucan.org/api/entry/data/${accession}`,
    'GlyTouCan API',
    'lookup',
    onDiagnostic
  );
  if (!entryResult) return { status: 'unavailable' };
  if (entryResult.status === 404) return { status: 'not-found' };

  const entry = entryResult.data as GlyTouCanEntryResponse | undefined;
  const wurcs = entry?.contents?.validated_wurcstext;
  if (
    entry?.errcode !== '' ||
    entry.contents?.accession?.toUpperCase() !== accession ||
    !wurcs ||
    !isWurcsSequence(wurcs)
  ) {
    await reportFailure(onDiagnostic, 'GlyTouCan API', 'lookup', 'invalid-response');
    return { status: 'unavailable' };
  }

  return { status: 'found', structure: { accession, wurcs } };
}

export async function fetchWurcsDiagram(
  wurcs: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<GlycanLookupResult> {
  if (!isWurcsSequence(wurcs)) return { status: 'not-found' };

  const imageResult = await fetchJson(
    `https://api.glycosmos.org/wurcs2image/${WURCS2IMAGE_VERSION}/png/json/${encodeURIComponent(wurcs)}`,
    'GlyCosmos WURCS2Image API',
    'structure-fallback',
    onDiagnostic
  );
  if (!imageResult || imageResult.status === 404) return { status: 'unavailable' };
  const imageResponse = imageResult.data as GlycanImageResponse | undefined;
  const svg = imageResponse?.image ? createGlycanSvg(imageResponse.image) : undefined;
  if (!svg) {
    await reportFailure(
      onDiagnostic,
      'GlyCosmos WURCS2Image API',
      'structure-fallback',
      'invalid-response'
    );
    return { status: 'unavailable' };
  }

  return { status: 'found', diagram: { wurcs, svg } };
}

export async function fetchGlyTouCanDiagram(
  rawAccession: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<GlycanLookupResult> {
  const structureResult = await fetchGlyTouCanWurcs(rawAccession, onDiagnostic);
  if (structureResult.status !== 'found') return structureResult;

  const diagramResult = await fetchWurcsDiagram(
    structureResult.structure.wurcs,
    onDiagnostic
  );
  if (diagramResult.status !== 'found') return diagramResult;
  return {
    status: 'found',
    diagram: {
      ...diagramResult.diagram,
      accession: structureResult.structure.accession,
    },
  };
}

export async function fetchGlycanChemicalData(
  accession: string,
  expectedWurcs: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<GlycanChemicalData | null> {
  if (!isGlyTouCanAccession(accession) || !isWurcsSequence(expectedWurcs)) {
    return null;
  }

  const detailResult = await fetchJson(
    `https://api.glygen.org/glycan/detail/${accession}/`,
    'GlyGen API',
    'lookup',
    onDiagnostic
  );
  if (!detailResult || detailResult.status === 404) return null;

  const detail = detailResult.data as GlyGenDetailResponse | undefined;
  const inchiKey = detail?.inchi_key?.key;
  if (
    detail?.glytoucan?.glytoucan_ac?.toUpperCase() !== accession.toUpperCase() ||
    detail.wurcs !== expectedWurcs ||
    !detail.smiles_isomeric ||
    !inchiKey ||
    !/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(inchiKey)
  ) {
    await reportFailure(onDiagnostic, 'GlyGen API', 'lookup', 'invalid-response');
    return null;
  }

  return {
    smiles: detail.smiles_isomeric,
    inchiKey,
  };
}
