import {
  resolveAndVerifyCore,
  type AiDisambiguator,
  type ResolverDiagnosticHandler,
} from './coreResolver.ts';
import { renderProjection } from './projectionEngine.ts';
import type {
  DisplayOptions,
  GeneratedStructureCard,
  GenerateStructuresRequest,
  GenerateStructuresResponse,
  ProjectionNotice,
  ProjectionType,
} from '../types/chemistry.ts';

const PROJECTION_LABELS: Record<ProjectionType, string> = {
  skelett: 'Skelettformel',
  fischer: 'Fischer-Projektion',
  haworth: 'Haworth-Projektion',
  sessel: 'Sesselkonformation',
};

export async function generateStructures(
  req: Partial<GenerateStructuresRequest>,
  aiDisambiguator?: AiDisambiguator,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<{ status: number; body: GenerateStructuresResponse }> {
  const query = (req.query || '').trim();
  const specifications = (req.specifications || '').trim();
  const projections: ProjectionType[] =
    Array.isArray(req.projections) && req.projections.length > 0
      ? req.projections
      : ['skelett'];

  const options: DisplayOptions = {
    uniformAlignment: req.options?.uniformAlignment ?? true,
    showCIP: req.options?.showCIP ?? false,
    colorHeteroatoms: req.options?.colorHeteroatoms ?? false,
    showCarbonNumbers: req.options?.showCarbonNumbers ?? false,
    zwitterionic: req.options?.zwitterionic ?? false,
  };

  if (!query) {
    return {
      status: 400,
      body: {
        query: '',
        specifications,
        interpretedNote: '',
        structures: [],
        notices: [],
        error:
          'Bitte gib eine chemische Bezeichnung (z. B. Glucose, L-Alanin, Aspirin) ein.',
      },
    };
  }

  const resolution = await resolveAndVerifyCore(
    query,
    specifications,
    projections,
    options,
    aiDisambiguator,
    onDiagnostic
  );

  if (resolution.candidates.length === 0) {
    const errorMsg =
      (resolution.upstreamUnavailable
        ? 'Die chemischen Informationsdienste sind derzeit nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.'
        : resolution.rejectedReasons[0]) ||
      `Für „${query}“ konnte keine gültige Struktur in PubChem verifiziert werden. Es wird bewusst keine Struktur ausgegeben.`;
    return {
      status: resolution.upstreamUnavailable ? 503 : 404,
      body: {
        query,
        specifications,
        interpretedNote: resolution.interpretedNote,
        structures: [],
        notices: [],
        error: errorMsg,
      },
    };
  }

  const structures: GeneratedStructureCard[] = [];
  const notices: ProjectionNotice[] = [];

  for (const item of resolution.candidates) {
    const applicableProjections = item.spec.forProjections
      ? projections.filter((p) => item.spec.forProjections!.includes(p))
      : projections;

    for (const proj of applicableProjections) {
      const rendered = renderProjection(proj, item.molecule, options);
      if (rendered.eligible && rendered.svg) {
        structures.push({
          id: `${item.compound.cid}-${proj}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          projection: proj,
          projectionLabel: rendered.titleSuffix || PROJECTION_LABELS[proj],
          title: item.compound.germanName,
          subtitle: item.spec.subtitle,
          svg: rendered.svg,
          alignmentNotes: rendered.alignmentNotes || '',
          compound: item.compound,
          confirmed: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        notices.push({
          projection: proj,
          projectionLabel: PROJECTION_LABELS[proj],
          compoundName: item.compound.germanName,
          reason:
            rendered.ineligibleReason ||
            `${PROJECTION_LABELS[proj]} ist für diese Molekülklasse nicht definiert.`,
        });
      }
    }
  }

  for (const reason of resolution.rejectedReasons) {
    notices.push({
      projection: projections[0],
      projectionLabel: 'Validierungshinweis',
      compoundName: query,
      reason,
    });
  }

  return {
    status: 200,
    body: {
      query,
      specifications,
      interpretedNote: resolution.interpretedNote,
      structures,
      notices,
    },
  };
}
