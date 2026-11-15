import * as OCL from 'openchemlib';
import {
  resolveAndVerifyCore,
  type AiDisambiguator,
  type ResolverDiagnosticHandler,
} from './coreResolver.ts';
import {
  extractGlyTouCanAccession,
  extractWurcsSequence,
  fetchGlycanChemicalData,
  fetchGlyTouCanDiagram,
  fetchGlyTouCanWurcs,
  fetchWurcsDiagram,
} from './glycanResolver.ts';
import { renderProjection } from './projectionEngine.ts';
import { cyclizeSugar } from './sugarCyclization.ts';
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
  glycan: 'Glykan-Diagramm (SNFG)',
};

type CyclizedRingForm = {
  smiles: string;
  inchiKey: string;
  molecule: OCL.Molecule;
  haworth: ReturnType<typeof renderProjection>;
  generatedFromOpenChain: boolean;
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
    hideNonAtomAnnotations: req.options?.hideNonAtomAnnotations ?? false,
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

  const accession = extractGlyTouCanAccession(`${query} ${specifications}`);
  if (accession) {
    const wantsGlycan = projections.includes('glycan');
    const wantsChemicalStructure = projections.some(
      (projection) => projection === 'skelett' || projection === 'haworth'
    );
    if (!wantsGlycan && !wantsChemicalStructure) {
      return {
        status: 400,
        body: {
          query,
          specifications,
          interpretedNote: '',
          structures: [],
          notices: [],
          error: `Die GlyTouCan-ID ${accession} unterstützt das SNFG-Diagramm und – sofern verfügbar – eine chemische Skelett- oder Haworth-Projektion. Wähle eine dieser Darstellungsformen aus.`,
        },
      };
    }

    const structureResult = await fetchGlyTouCanWurcs(accession, onDiagnostic);
    if (structureResult.status !== 'found') {
      const notFound = structureResult.status === 'not-found';
      return {
        status: notFound ? 404 : 503,
        body: {
          query,
          specifications,
          interpretedNote: '',
          structures: [],
          notices: [],
          error: notFound
            ? `Die GlyTouCan-ID ${accession} wurde nicht gefunden.`
            : `Die GlyTouCan-Struktur ${accession} konnte derzeit nicht abgerufen oder dargestellt werden. Bitte versuche es später erneut.`,
        },
      };
    }

    const wurcs = structureResult.structure.wurcs;
    const [diagramResult, chemicalData] = await Promise.all([
      wantsGlycan ? fetchWurcsDiagram(wurcs, onDiagnostic) : Promise.resolve(null),
      wantsChemicalStructure
        ? fetchGlycanChemicalData(accession, wurcs, onDiagnostic)
        : Promise.resolve(null),
    ]);

    let molecule: OCL.Molecule | undefined;
    if (chemicalData) {
      try {
        molecule = OCL.Molecule.fromSmiles(chemicalData.smiles);
        molecule.ensureHelperArrays(OCL.Molecule.cHelperCIP);
        if (molecule.getAllAtoms() === 0) molecule = undefined;
      } catch {
        molecule = undefined;
      }
      if (!molecule) {
        await onDiagnostic?.({
          provider: 'GlyGen API',
          operation: 'lookup',
          failure: 'invalid-response',
        });
      }
    }

    const formula = molecule?.getMolecularFormula();
    let stereocentersCount = 0;
    if (molecule) {
      for (let atom = 0; atom < molecule.getAllAtoms(); atom++) {
        if (molecule.getAtomCIPParity(atom) > 0) stereocentersCount++;
      }
    }

    const glyTouCanUrl = `https://glytoucan.org/Structures/Glycans/${accession}`;
    const compound = {
      cid: 0,
      title: accession,
      germanName: accession,
      iupacName: wurcs,
      molecularFormula: formula?.formula || '',
      molecularWeight: formula ? `${formula.relativeWeight.toFixed(2)} g/mol` : '',
      isomericSmiles: molecule ? chemicalData?.smiles || '' : '',
      inchiKey: molecule ? chemicalData?.inchiKey || '' : '',
      sourceDatabase: 'GlyTouCan' as const,
      sourceId: accession,
      sourceUrl: glyTouCanUrl,
      glytoucanAccession: accession,
      wurcs,
      stereocentersCount,
      cipSummary: molecule
        ? `${stereocentersCount} Stereozentren`
        : 'Stereochemie über WURCS-Sequenz registriert',
      validation: {
        status: 'verified' as const,
        pubchemVerified: false,
        formulaMatch: Boolean(formula),
        stereochemistryMatch: Boolean(molecule),
        secondarySourceChecked: Boolean(molecule),
        secondarySourceName: molecule ? 'GlyGen (SMILES/WURCS-Abgleich)' : undefined,
      },
    };

    const structures: GeneratedStructureCard[] = [];
    const notices: ProjectionNotice[] = [];
    for (const projection of projections) {
      if (projection === 'glycan') {
        if (diagramResult?.status === 'found') {
          structures.push({
            id: `${accession}-glycan-${Date.now()}`,
            projection,
            projectionLabel: PROJECTION_LABELS.glycan,
            title: accession,
            subtitle: 'Registriertes Glykan · WURCS 2.0',
            svg: diagramResult.diagram.svg,
            alignmentNotes: 'SNFG-Darstellung aus der registrierten GlyTouCan-WURCS-Sequenz.',
            compound,
            confirmed: false,
            createdAt: new Date().toISOString(),
          });
        } else {
          notices.push({
            projection,
            projectionLabel: PROJECTION_LABELS.glycan,
            compoundName: accession,
            reason: 'Das SNFG-Diagramm konnte derzeit nicht vom GlyCosmos-Dienst abgerufen werden.',
          });
        }
        continue;
      }

      if (
        (projection === 'skelett' || projection === 'haworth') &&
        molecule
      ) {
        const rendered = renderProjection(projection, molecule, options);
        if (rendered.eligible && rendered.svg) {
          structures.push({
            id: `${accession}-${projection}-${Date.now()}`,
            projection,
            projectionLabel:
              rendered.titleSuffix || PROJECTION_LABELS[projection],
            title: accession,
            subtitle: `${PROJECTION_LABELS[projection]} · GlyGen-SMILES mit WURCS abgeglichen`,
            svg: rendered.svg,
            alignmentNotes: rendered.alignmentNotes || '',
            compound,
            confirmed: false,
            createdAt: new Date().toISOString(),
          });
        } else {
          notices.push({
            projection,
            projectionLabel: PROJECTION_LABELS[projection],
            compoundName: accession,
            reason:
              rendered.ineligibleReason ||
              `${PROJECTION_LABELS[projection]} ist für diese Struktur nicht verfügbar.`,
          });
        }
        continue;
      }

      notices.push({
        projection,
        projectionLabel: PROJECTION_LABELS[projection],
        compoundName: accession,
        reason:
          projection === 'skelett'
            ? 'Für diese GlyTouCan-ID war keine mit der WURCS-Sequenz abgeglichene chemische Skelettstruktur verfügbar.'
            : projection === 'haworth'
              ? 'Für diese GlyTouCan-ID war keine mit der WURCS-Sequenz abgeglichene chemische SMILES-Struktur verfügbar, aus der sich eine Haworth-Projektion ableiten lässt.'
              : 'Komplexe Glykane werden als SNFG-Diagramm oder – sofern eine verknüpfte SMILES-Struktur vorliegt – als chemische Struktur dargestellt.',
      });
    }

    if (structures.length === 0) {
      return {
        status: 503,
        body: {
          query,
          specifications,
          interpretedNote: 'Die GlyTouCan-Sequenz wurde abgerufen, aber keine ausgewählte Darstellung konnte erzeugt werden.',
          structures,
          notices,
          error: 'Für die ausgewählten Glykan-Darstellungen waren die erforderlichen WURCS- oder SMILES-Daten nicht verfügbar. Bitte versuche es später erneut oder wähle SNFG.',
        },
      };
    }

    return {
      status: 200,
      body: {
        query,
        specifications,
        interpretedNote: 'GlyTouCan-Accession über die registrierte WURCS-Sequenz aufgelöst.',
        structures,
        notices,
      },
    };
  }

  const glycanInput = `${query} ${specifications}`;
  const wurcs = extractWurcsSequence(glycanInput);
  if (!wurcs && /WURCS=/i.test(glycanInput)) {
    return {
      status: 400,
      body: {
        query,
        specifications,
        interpretedNote: '',
        structures: [],
        notices: [],
        error: 'Die Sequenz ist keine gültige WURCS-2.0-Eingabe.',
      },
    };
  }

  if (wurcs) {
    if (!projections.includes('glycan')) {
      return {
        status: 400,
        body: {
          query,
          specifications,
          interpretedNote: '',
          structures: [],
          notices: [],
          error: 'Eine eingegebene WURCS-Sequenz kann als SNFG-Glykan-Diagramm dargestellt werden. Bitte wähle diese Darstellungsform aus.',
        },
      };
    }

    const result = await fetchWurcsDiagram(wurcs, onDiagnostic);
    if (result.status !== 'found') {
      return {
        status: result.status === 'not-found' ? 400 : 503,
        body: {
          query,
          specifications,
          interpretedNote: '',
          structures: [],
          notices: [],
          error:
            result.status === 'not-found'
              ? 'Die eingegebene WURCS-Sequenz ist ungültig.'
              : 'Die WURCS-Sequenz konnte derzeit nicht als SNFG-Diagramm dargestellt werden.',
        },
      };
    }

    const compound = {
      cid: 0,
      title: 'Benutzerdefinierte WURCS-Sequenz',
      germanName: 'Benutzerdefiniertes Glykan',
      iupacName: wurcs,
      molecularFormula: '',
      molecularWeight: '',
      isomericSmiles: '',
      inchiKey: '',
      sourceDatabase: 'WURCS' as const,
      sourceId: 'Benutzereingabe',
      sourceUrl: `https://api.glycosmos.org/wurcs2image/1.25.4/png/json/${encodeURIComponent(wurcs)}`,
      wurcs,
      stereocentersCount: 0,
      cipSummary: 'Stereochemie in WURCS-Sequenz kodiert',
      validation: {
        status: 'unverified' as const,
        pubchemVerified: false,
        formulaMatch: false,
        stereochemistryMatch: false,
        secondarySourceChecked: false,
        warningTitle: 'Eigene Sequenz · keine chemische SMILES-Konvertierung',
        warningMessage:
          'Diese SNFG-Darstellung wurde aus der eingegebenen WURCS-Sequenz erzeugt. Eine chemische Skelettformel wird nur ausgegeben, wenn eine verifizierte SMILES-Struktur verfügbar ist.',
      },
    };
    const structures: GeneratedStructureCard[] = [
      {
        id: `wurcs-glycan-${Date.now()}`,
        projection: 'glycan',
        projectionLabel: PROJECTION_LABELS.glycan,
        title: 'Benutzerdefiniertes Glykan',
        subtitle: 'SNFG-Darstellung · eingegebene WURCS 2.0-Sequenz',
        svg: result.diagram.svg,
        alignmentNotes: 'SNFG-Darstellung aus der eingegebenen WURCS 2.0-Sequenz.',
        compound,
        confirmed: false,
        createdAt: new Date().toISOString(),
      },
    ];
    const notices: ProjectionNotice[] = projections
      .filter((projection) => projection !== 'glycan')
      .map((projection) => ({
        projection,
        projectionLabel: PROJECTION_LABELS[projection],
        compoundName: compound.germanName,
        reason:
          'Für eine freie WURCS-Sequenz liegt keine verifizierte chemische SMILES-Struktur vor; eine Skelettformel wird daher nicht erfunden.',
      }));

    return {
      status: 200,
      body: {
        query,
        specifications,
        interpretedNote: 'Eigene WURCS 2.0-Sequenz direkt an den SNFG-Renderer übergeben.',
        structures,
        notices,
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
      `Für „${query}“ konnte keine gültige Struktur in ChEBI oder PubChem verifiziert werden. Es wird bewusst keine Struktur ausgegeben.`;
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
  const renderedCyclicNames = new Set<string>();
  let upstreamUnavailable = Boolean(resolution.upstreamUnavailable);

  for (const item of resolution.candidates) {
    const applicableProjections = item.spec.forProjections
      ? projections.filter((p) => item.spec.forProjections!.includes(p))
      : projections;

    for (const proj of applicableProjections) {
      if (item.spec.representativeFragmentNote) {
        notices.push({
          projection: proj,
          projectionLabel: PROJECTION_LABELS[proj],
          compoundName: item.compound.germanName,
          reason: item.spec.representativeFragmentNote,
        });
      }

      if (proj === 'glycan') {
        const glyTouCanAccession = item.compound.glytoucanAccession;
        if (!item.compound.wurcs && !glyTouCanAccession) {
          notices.push({
            projection: proj,
            projectionLabel: PROJECTION_LABELS[proj],
            compoundName: item.compound.germanName,
            reason: 'Für diesen Eintrag ist keine WURCS-Sequenz verfügbar. Komplexe Glykane kannst du über eine GlyTouCan-ID oder eine eigene WURCS-Sequenz eingeben.',
          });
          continue;
        }

        const glycanResult = item.compound.wurcs
          ? await fetchWurcsDiagram(item.compound.wurcs, onDiagnostic)
          : await fetchGlyTouCanDiagram(glyTouCanAccession!, onDiagnostic);
        if (glycanResult.status !== 'found') {
          upstreamUnavailable ||= glycanResult.status === 'unavailable';
          notices.push({
            projection: proj,
            projectionLabel: PROJECTION_LABELS[proj],
            compoundName: item.compound.germanName,
            reason:
              glycanResult.status === 'not-found'
                ? `Für ${item.compound.germanName} wurde keine gültige WURCS-Sequenz gefunden.`
                : `Die WURCS-Sequenz für ${item.compound.germanName} konnte derzeit nicht dargestellt werden.`,
          });
          continue;
        }

        const glycanSourceDatabase = glyTouCanAccession
          ? 'GlyTouCan'
          : item.compound.sourceDatabase;
        structures.push({
          id: `${glyTouCanAccession || item.compound.sourceId}-glycan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          projection: proj,
          projectionLabel: PROJECTION_LABELS[proj],
          title: item.compound.germanName,
          subtitle: glyTouCanAccession
            ? `Registriertes Glykan · ${glyTouCanAccession}`
            : 'ChEBI-WURCS-Sequenz · SNFG-Diagramm',
          svg: glycanResult.diagram.svg,
          alignmentNotes: glyTouCanAccession
            ? 'SNFG-Darstellung aus der registrierten GlyTouCan-WURCS-Sequenz.'
            : 'SNFG-Darstellung aus der WURCS-Sequenz des ChEBI-Eintrags.',
          compound: {
            ...item.compound,
            sourceDatabase: glycanSourceDatabase,
            sourceId: glyTouCanAccession || item.compound.sourceId,
            sourceUrl: glyTouCanAccession
              ? `https://glytoucan.org/Structures/Glycans/${glyTouCanAccession}`
              : item.compound.sourceUrl,
            wurcs: glycanResult.diagram.wurcs,
          },
          confirmed: false,
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      const rendered = renderProjection(proj, item.molecule, options);
      if (rendered.eligible && rendered.svg) {
        if (proj === 'haworth' || proj === 'sessel') {
          renderedCyclicNames.add(`${proj}:${item.spec.searchName}`);
        }
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

  for (const source of resolution.candidates) {
    const targets = source.spec.sugarCyclizationTargets;
    if (!targets) continue;

    const sourceHaworth = renderProjection('haworth', source.molecule, options);
    const generatedFormsByRingSize = new Map<
      5 | 6,
      Promise<CyclizedRingForm[]>
    >();
    const getGeneratedForms = (ringSize: 5 | 6): Promise<CyclizedRingForm[]> => {
      let forms = generatedFormsByRingSize.get(ringSize);
      if (!forms) {
        forms = cyclizeSugar(source.compound.isomericSmiles, ringSize).then(
          (products) =>
            products.map((product) => {
              const molecule = OCL.Molecule.fromSmiles(product.isomericSmiles);
              molecule.ensureHelperArrays(OCL.Molecule.cHelperCIP);
              return {
                smiles: product.isomericSmiles,
                inchiKey: product.inchiKey,
                molecule,
                haworth: renderProjection('haworth', molecule, options),
                generatedFromOpenChain: true,
              };
            })
        );
        generatedFormsByRingSize.set(ringSize, forms);
      }
      return forms;
    };

    for (const target of targets) {
      const selectedCyclicProjections = projections.filter(
        (projection) => projection === 'haworth' || projection === 'sessel'
      );
      const missingProjections = selectedCyclicProjections.filter(
        (projection) => !renderedCyclicNames.has(`${projection}:${target.searchName}`)
      );
      if (missingProjections.length === 0) continue;

      const sourceMatchesTarget =
        sourceHaworth.eligible &&
        sourceHaworth.svg &&
        sourceHaworth.alignmentNotes?.includes(
          target.anomer === 'alpha' ? 'α-Anomer' : 'β-Anomer'
        );
      const sourceForm: CyclizedRingForm = {
        smiles: source.compound.isomericSmiles,
        inchiKey: source.compound.inchiKey,
        molecule: source.molecule,
        haworth: sourceHaworth,
        generatedFromOpenChain: false,
      };
      const forms = sourceMatchesTarget
        ? [sourceForm]
        : await getGeneratedForms(target.ringSize);
      const anomerLabel = target.anomer === 'alpha' ? 'α-Anomer' : 'β-Anomer';

      for (const projection of missingProjections) {
        const renderedKey = `${projection}:${target.searchName}`;

        let generated = false;
        for (const form of forms) {
          if (
            !form.haworth.eligible ||
            !form.haworth.svg ||
            !form.haworth.alignmentNotes?.includes(anomerLabel)
          ) {
            continue;
          }
          const rendered =
            projection === 'haworth'
              ? form.haworth
              : renderProjection('sessel', form.molecule, options);
          if (!rendered.eligible || !rendered.svg) continue;

          const formula = form.molecule.getMolecularFormula();
          if (formula.formula !== source.compound.molecularFormula) continue;

          let stereocentersCount = 0;
          for (let atom = 0; atom < form.molecule.getAllAtoms(); atom++) {
            if (form.molecule.getAtomCIPParity(atom) > 0) stereocentersCount++;
          }
          const warningMessage = target.unlikelyReason
            ? `${target.unlikelyReason} Diese Ringform wurde aus der datenbankverifizierten offenkettigen Struktur mit RDKit abgeleitet.`
            : 'Diese Ringform wurde mit RDKit aus der datenbankverifizierten offenkettigen Struktur abgeleitet. Die natürliche Häufigkeit und Stabilität dieser Form sind nicht durch einen eigenen Ring-Datensatz bestätigt.';
          const compound = form.generatedFromOpenChain
            ? {
                ...source.compound,
                title: target.searchName,
                germanName: target.germanName,
                molecularFormula: formula.formula,
                molecularWeight: `${formula.relativeWeight.toFixed(2)} g/mol`,
                isomericSmiles: form.smiles,
                inchiKey: form.inchiKey,
                stereocentersCount,
                cipSummary: `${stereocentersCount} Stereozentren (RDKit-generierte Ringform)`,
                validation: {
                  status: target.unlikelyReason ? 'unlikely_form' as const : 'unverified' as const,
                  pubchemVerified: false,
                  formulaMatch: true,
                  stereochemistryMatch: true,
                  secondarySourceChecked: false,
                  warningTitle: target.unlikelyReason
                    ? 'Geringe Bildungswahrscheinlichkeit / seltenes Isomer'
                    : 'Theoretische zyklische Form',
                  warningMessage,
                },
              }
            : { ...source.compound, germanName: target.germanName };

          structures.push({
            id: `${source.compound.cid}-${projection}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            projection,
            projectionLabel: rendered.titleSuffix || PROJECTION_LABELS[projection],
            title: target.germanName,
            subtitle: form.generatedFromOpenChain
              ? `Zyklisches Halbacetal · RDKit-Generierung · ${target.ringSize === 6 ? 'Pyranose' : 'Furanose'}`
              : 'Zyklisches Halbacetal · Datenbankeintrag',
            svg: rendered.svg,
            alignmentNotes: rendered.alignmentNotes || '',
            compound,
            confirmed: false,
            createdAt: new Date().toISOString(),
          });
          for (let index = notices.length - 1; index >= 0; index--) {
            const notice = notices[index];
            if (
              notice.projection === projection &&
              notice.compoundName === target.germanName
            ) {
              notices.splice(index, 1);
            }
          }
          renderedCyclicNames.add(renderedKey);
          generated = true;
          break;
        }

        if (!generated) {
          notices.push({
            projection,
            projectionLabel: PROJECTION_LABELS[projection],
            compoundName: target.germanName,
            reason: `RDKit konnte aus der verifizierten Datenbankstruktur keine stereochemisch passende ${target.ringSize === 6 ? 'Pyranose' : 'Furanose'}-Ringform bilden.`,
          });
        }
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

  const error =
    upstreamUnavailable && structures.length === 0
      ? 'Die chemischen Informationsdienste sind derzeit nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.'
      : undefined;
  return {
    status: error ? 503 : 200,
    body: {
      query,
      specifications,
      interpretedNote: resolution.interpretedNote,
      structures,
      notices,
      error,
    },
  };
}
