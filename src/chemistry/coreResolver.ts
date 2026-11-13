import * as OCL from 'openchemlib';
import type {
  DisplayOptions,
  ProjectionType,
  ValidationStatus,
  VerifiedCompoundMeta,
} from '../types/chemistry.ts';

export interface CandidateSpec {
  searchName: string;
  germanName: string;
  subtitle: string;
  /** Optional restriction to specific projections (e.g. open-chain for Fischer vs cyclic for Haworth) */
  forProjections?: ProjectionType[];
  /** Optional deterministic SMILES transform for zwitterion if PubChem returns neutral amino acid */
  preferZwitterion?: boolean;
  /** True when entry comes from our curated pharmaceutical/biochemical register */
  isCurated?: boolean;
  /** Set when structure is chemically valid/possible but occurs only with minimal equilibrium probability */
  unlikelyReason?: string;
}

export interface ResolutionResult {
  candidates: Array<{
    spec: CandidateSpec;
    compound: VerifiedCompoundMeta;
    molecule: OCL.Molecule;
  }>;
  interpretedNote: string;
  rejectedReasons: string[];
  upstreamUnavailable?: boolean;
}

export interface ResolverDiagnostic {
  provider: 'PubChem PUG REST' | 'NCI/CADD Cactus';
  operation: 'lookup' | 'secondary-verification' | 'structure-fallback';
  failure: 'network' | 'upstream' | 'invalid-response';
  statusCode?: number;
}

export type ResolverDiagnosticHandler = (
  diagnostic: ResolverDiagnostic
) => void | Promise<void>;

export interface AiDisambiguationResult {
  possible: boolean;
  rejectionReason?: string;
  interpretedNote: string;
  queries: Array<{
    searchName: string;
    germanName: string;
    subtitle: string;
    isOpenChainForFischer?: boolean;
  }>;
}

export type AiDisambiguator = (
  query: string,
  specifications: string,
  projections: ProjectionType[]
) => Promise<AiDisambiguationResult | null>;

interface PubChemProperty {
  CID: number;
  MolecularFormula: string;
  MolecularWeight: string;
  SMILES?: string;
  IsomericSMILES?: string;
  ConnectivitySMILES?: string;
  CanonicalSMILES?: string;
  InChIKey: string;
  IUPACName?: string;
  Title?: string;
}

const AMINO_ACIDS: Record<string, { en: string; de: string; chiral: boolean }> = {
  alanin: { en: 'alanine', de: 'Alanin', chiral: true },
  arginin: { en: 'arginine', de: 'Arginin', chiral: true },
  asparagin: { en: 'asparagine', de: 'Asparagin', chiral: true },
  asparaginsaeure: { en: 'aspartic acid', de: 'Asparaginsäure', chiral: true },
  aspartat: { en: 'aspartic acid', de: 'Asparaginsäure', chiral: true },
  cystein: { en: 'cysteine', de: 'Cystein', chiral: true },
  glutamin: { en: 'glutamine', de: 'Glutamin', chiral: true },
  glutaminsaeure: { en: 'glutamic acid', de: 'Glutaminsäure', chiral: true },
  glutamat: { en: 'glutamic acid', de: 'Glutaminsäure', chiral: true },
  glycin: { en: 'glycine', de: 'Glycin', chiral: false },
  histidin: { en: 'histidine', de: 'Histidin', chiral: true },
  isoleucin: { en: 'isoleucine', de: 'Isoleucin', chiral: true },
  leucin: { en: 'leucine', de: 'Leucin', chiral: true },
  lysin: { en: 'lysine', de: 'Lysin', chiral: true },
  methionin: { en: 'methionine', de: 'Methionin', chiral: true },
  phenylalanin: { en: 'phenylalanine', de: 'Phenylalanin', chiral: true },
  prolin: { en: 'proline', de: 'Prolin', chiral: true },
  serin: { en: 'serine', de: 'Serin', chiral: true },
  threonin: { en: 'threonine', de: 'Threonin', chiral: true },
  tryptophan: { en: 'tryptophan', de: 'Tryptophan', chiral: true },
  tyrosin: { en: 'tyrosine', de: 'Tyrosin', chiral: true },
  valin: { en: 'valine', de: 'Valin', chiral: true },
};

interface SugarConfig {
  de: string;
  openChainD: string;
  openChainL?: string;
  pyranoseAlphaD?: string;
  pyranoseBetaD?: string;
  furanoseAlphaD?: string;
  furanoseBetaD?: string;
  pyranoseAlphaL?: string;
  pyranoseBetaL?: string;
  furanoseAlphaL?: string;
  furanoseBetaL?: string;
  defaultRing: 'pyranose' | 'furanose';
}

const MONOSACCHARIDES: Record<string, SugarConfig> = {
  glucose: {
    de: 'Glucose',
    openChainD: 'aldehydo-D-glucose',
    openChainL: 'aldehydo-L-glucose',
    pyranoseAlphaD: 'alpha-D-glucopyranose',
    pyranoseBetaD: 'beta-D-glucopyranose',
    furanoseAlphaD: 'alpha-D-glucofuranose',
    furanoseBetaD: 'beta-D-glucofuranose',
    pyranoseAlphaL: 'alpha-L-glucopyranose',
    pyranoseBetaL: 'beta-L-glucopyranose',
    defaultRing: 'pyranose',
  },
  glukose: {
    de: 'Glucose',
    openChainD: 'aldehydo-D-glucose',
    openChainL: 'aldehydo-L-glucose',
    pyranoseAlphaD: 'alpha-D-glucopyranose',
    pyranoseBetaD: 'beta-D-glucopyranose',
    furanoseAlphaD: 'alpha-D-glucofuranose',
    furanoseBetaD: 'beta-D-glucofuranose',
    defaultRing: 'pyranose',
  },
  traubenzucker: {
    de: 'Glucose (Traubenzucker)',
    openChainD: 'aldehydo-D-glucose',
    pyranoseAlphaD: 'alpha-D-glucopyranose',
    pyranoseBetaD: 'beta-D-glucopyranose',
    defaultRing: 'pyranose',
  },
  dextrose: {
    de: 'D-Glucose (Dextrose)',
    openChainD: 'aldehydo-D-glucose',
    pyranoseAlphaD: 'alpha-D-glucopyranose',
    pyranoseBetaD: 'beta-D-glucopyranose',
    defaultRing: 'pyranose',
  },
  fructose: {
    de: 'Fructose',
    openChainD: 'keto-D-fructose',
    pyranoseAlphaD: 'alpha-D-fructopyranose',
    pyranoseBetaD: 'beta-D-fructopyranose',
    furanoseAlphaD: 'alpha-D-fructofuranose',
    furanoseBetaD: 'beta-D-fructofuranose',
    defaultRing: 'furanose',
  },
  fruktose: {
    de: 'Fructose',
    openChainD: 'keto-D-fructose',
    pyranoseAlphaD: 'alpha-D-fructopyranose',
    pyranoseBetaD: 'beta-D-fructopyranose',
    furanoseAlphaD: 'alpha-D-fructofuranose',
    furanoseBetaD: 'beta-D-fructofuranose',
    defaultRing: 'furanose',
  },
  fruchtzucker: {
    de: 'Fructose (Fruchtzucker)',
    openChainD: 'keto-D-fructose',
    pyranoseBetaD: 'beta-D-fructopyranose',
    furanoseAlphaD: 'alpha-D-fructofuranose',
    furanoseBetaD: 'beta-D-fructofuranose',
    defaultRing: 'furanose',
  },
  galactose: {
    de: 'Galactose',
    openChainD: 'aldehydo-D-galactose',
    pyranoseAlphaD: 'alpha-D-galactopyranose',
    pyranoseBetaD: 'beta-D-galactopyranose',
    furanoseAlphaD: 'alpha-D-galactofuranose',
    furanoseBetaD: 'beta-D-galactofuranose',
    defaultRing: 'pyranose',
  },
  galaktose: {
    de: 'Galactose',
    openChainD: 'aldehydo-D-galactose',
    pyranoseAlphaD: 'alpha-D-galactopyranose',
    pyranoseBetaD: 'beta-D-galactopyranose',
    furanoseAlphaD: 'alpha-D-galactofuranose',
    furanoseBetaD: 'beta-D-galactofuranose',
    defaultRing: 'pyranose',
  },
  mannose: {
    de: 'Mannose',
    openChainD: 'aldehydo-D-mannose',
    pyranoseAlphaD: 'alpha-D-mannopyranose',
    pyranoseBetaD: 'beta-D-mannopyranose',
    furanoseAlphaD: 'alpha-D-mannofuranose',
    furanoseBetaD: 'beta-D-mannofuranose',
    defaultRing: 'pyranose',
  },
  ribose: {
    de: 'Ribose',
    openChainD: 'aldehydo-D-ribose',
    furanoseAlphaD: 'alpha-D-ribofuranose',
    furanoseBetaD: 'beta-D-ribofuranose',
    pyranoseAlphaD: 'alpha-D-ribopyranose',
    pyranoseBetaD: 'beta-D-ribopyranose',
    defaultRing: 'furanose',
  },
  desoxyribose: {
    de: '2-Desoxyribose',
    openChainD: '2-deoxy-D-erythro-pentose',
    furanoseAlphaD: '2-deoxy-alpha-D-ribofuranose',
    furanoseBetaD: '2-deoxy-beta-D-ribofuranose',
    defaultRing: 'furanose',
  },
  deoxyribose: {
    de: '2-Desoxyribose',
    openChainD: '2-deoxy-D-erythro-pentose',
    furanoseAlphaD: '2-deoxy-alpha-D-ribofuranose',
    furanoseBetaD: '2-deoxy-beta-D-ribofuranose',
    defaultRing: 'furanose',
  },
  xylose: {
    de: 'Xylose',
    openChainD: 'aldehydo-D-xylose',
    pyranoseAlphaD: 'alpha-D-xylopyranose',
    pyranoseBetaD: 'beta-D-xylopyranose',
    defaultRing: 'pyranose',
  },
  arabinose: {
    de: 'Arabinose',
    openChainD: 'aldehydo-L-arabinose',
    pyranoseAlphaL: 'alpha-L-arabinopyranose',
    pyranoseBetaL: 'beta-L-arabinopyranose',
    pyranoseAlphaD: 'alpha-D-arabinopyranose',
    pyranoseBetaD: 'beta-D-arabinopyranose',
    defaultRing: 'pyranose',
  },
  glucosamin: {
    de: 'Glucosamin',
    openChainD: 'D-glucosamine',
    pyranoseAlphaD: 'alpha-D-glucosamine',
    pyranoseBetaD: 'beta-D-glucosamine',
    defaultRing: 'pyranose',
  },
  glucuronsaeure: {
    de: 'Glucuronsäure',
    openChainD: 'D-glucuronic acid',
    pyranoseAlphaD: 'alpha-D-glucopyranuronic acid',
    pyranoseBetaD: 'beta-D-glucopyranuronic acid',
    defaultRing: 'pyranose',
  },
};

const GERMAN_PHARMA_ALIASES: Record<string, { en: string; de: string }> = {
  saccharose: { en: 'sucrose', de: 'Saccharose' },
  rohrzucker: { en: 'sucrose', de: 'Saccharose (Rohrzucker)' },
  lactose: { en: 'beta-lactose', de: 'Lactose' },
  laktose: { en: 'beta-lactose', de: 'Lactose' },
  milchzucker: { en: 'beta-lactose', de: 'Lactose (Milchzucker)' },
  maltose: { en: 'alpha-maltose', de: 'Maltose' },
  malzzucker: { en: 'alpha-maltose', de: 'Maltose' },
  cellobiose: { en: 'beta-D-cellobiose', de: 'Cellobiose' },
  trehalose: { en: 'alpha,alpha-trehalose', de: 'Trehalose' },
  aspirin: { en: 'aspirin', de: 'Acetylsalicylsäure (Aspirin)' },
  acetylsalicylsaeure: { en: 'aspirin', de: 'Acetylsalicylsäure' },
  ass: { en: 'aspirin', de: 'Acetylsalicylsäure (ASS)' },
  salicylsaeure: { en: 'salicylic acid', de: 'Salicylsäure' },
  ibuprofen: { en: 'ibuprofen', de: 'Ibuprofen' },
  paracetamol: { en: 'acetaminophen', de: 'Paracetamol' },
  acetaminophen: { en: 'acetaminophen', de: 'Paracetamol' },
  coffein: { en: 'caffeine', de: 'Coffein' },
  koffein: { en: 'caffeine', de: 'Coffein' },
  theophyllin: { en: 'theophylline', de: 'Theophyllin' },
  theobromin: { en: 'theobromine', de: 'Theobromin' },
  morphin: { en: 'morphine', de: 'Morphin' },
  codein: { en: 'codeine', de: 'Codein' },
  atropin: { en: 'atropine', de: 'Atropin' },
  scopolamin: { en: 'scopolamine', de: 'Scopolamin' },
  adrenalin: { en: 'epinephrine', de: 'Adrenalin (Epinephrin)' },
  epinephrin: { en: 'epinephrine', de: 'Epinephrin (Adrenalin)' },
  noradrenalin: { en: 'norepinephrine', de: 'Noradrenalin' },
  dopamin: { en: 'dopamine', de: 'Dopamin' },
  serotonin: { en: 'serotonin', de: 'Serotonin' },
  histamin: { en: 'histamine', de: 'Histamin' },
  acetylcholin: { en: 'acetylcholine', de: 'Acetylcholin' },
  gaba: { en: 'gamma-aminobutyric acid', de: 'GABA (γ-Aminobuttersäure)' },
  ascorbinsaeure: { en: 'L-ascorbic acid', de: 'L-Ascorbinsäure (Vitamin C)' },
  'vitamin c': { en: 'L-ascorbic acid', de: 'Vitamin C (L-Ascorbinsäure)' },
  nicotinamid: { en: 'nicotinamide', de: 'Nicotinamid' },
  nikotinamid: { en: 'nicotinamide', de: 'Nicotinamid' },
  nicotinsaeure: { en: 'niacin', de: 'Nicotinsäure' },
  folsaeure: { en: 'folic acid', de: 'Folsäure' },
  cholesterin: { en: 'cholesterol', de: 'Cholesterin' },
  cholesterol: { en: 'cholesterol', de: 'Cholesterin' },
  testosteron: { en: 'testosterone', de: 'Testosteron' },
  estradiol: { en: 'estradiol', de: 'Estradiol' },
  oestradiol: { en: 'estradiol', de: 'Estradiol' },
  cortisol: { en: 'hydrocortisone', de: 'Cortisol (Hydrocortison)' },
  hydrocortison: { en: 'hydrocortisone', de: 'Hydrocortison' },
  penicillin: { en: 'penicillin G', de: 'Benzylpenicillin (Penicillin G)' },
  'penicillin g': { en: 'penicillin G', de: 'Penicillin G' },
  amoxicillin: { en: 'amoxicillin', de: 'Amoxicillin' },
  metformin: { en: 'metformin', de: 'Metformin' },
  lidocain: { en: 'lidocaine', de: 'Lidocain' },
  diazepam: { en: 'diazepam', de: 'Diazepam' },
  diclofenac: { en: 'diclofenac', de: 'Diclofenac' },
  naproxen: { en: '(S)-naproxen', de: '(S)-Naproxen' },
  milchsaeure: { en: 'L-lactic acid', de: 'L-Milchsäure' },
  weinsaeure: { en: 'L-(+)-tartaric acid', de: 'L-(+)-Weinsäure' },
  aepfelsaeure: { en: 'L-malic acid', de: 'L-Äpfelsäure' },
  citronensaeure: { en: 'citric acid', de: 'Citronensäure' },
  zitronensaeure: { en: 'citric acid', de: 'Citronensäure' },
  harnstoff: { en: 'urea', de: 'Harnstoff' },
  benzol: { en: 'benzene', de: 'Benzol' },
  adenin: { en: 'adenine', de: 'Adenin' },
  guanin: { en: 'guanine', de: 'Guanin' },
  cytosin: { en: 'cytosine', de: 'Cytosin' },
  thymin: { en: 'thymine', de: 'Thymin' },
  uracil: { en: 'uracil', de: 'Uracil' },
  adenosin: { en: 'adenosine', de: 'Adenosin' },
  atp: { en: 'adenosine triphosphate', de: 'Adenosintriphosphat (ATP)' },
  glycerin: { en: 'glycerol', de: 'Glycerin (Glycerol)' },
  glycerol: { en: 'glycerol', de: 'Glycerol' },
  glycerinaldehyd: { en: 'D-glyceraldehyde', de: 'D-Glycerinaldehyd' },
  brenztraubensaeure: { en: 'pyruvic acid', de: 'Brenztraubensäure (Pyruvat)' },
  oxalsaeure: { en: 'oxalic acid', de: 'Oxalsäure' },
  essigsaeure: { en: 'acetic acid', de: 'Essigsäure' },
  ameisensaeure: { en: 'formic acid', de: 'Ameisensäure' },
  palmitinsaeure: { en: 'palmitic acid', de: 'Palmitinsäure' },
  oelsaeure: { en: 'oleic acid', de: 'Ölsäure' },
  arachidonsaeure: { en: 'arachidonic acid', de: 'Arachidonsäure' },
};

function normalizeGerman(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/\s+/g, ' ');
}

function stripStereoPrefix(norm: string): {
  core: string;
  stereoDL: 'D' | 'L' | null;
  anomer: 'alpha' | 'beta' | null;
  ring: 'pyranose' | 'furanose' | null;
  openChain: boolean;
  cipRS: 'R' | 'S' | null;
} {
  let s = norm;
  let stereoDL: 'D' | 'L' | null = null;
  let anomer: 'alpha' | 'beta' | null = null;
  let ring: 'pyranose' | 'furanose' | null = null;
  let openChain = false;
  let cipRS: 'R' | 'S' | null = null;

  if (/\balpha\b|alpha-/.test(s)) anomer = 'alpha';
  if (/\bbeta\b|beta-/.test(s)) anomer = 'beta';
  if (/pyranos/.test(s)) ring = 'pyranose';
  if (/furanos/.test(s)) ring = 'furanose';
  if (/offenkett|aldehydo|keto-|kette|acycli/.test(s)) openChain = true;
  if (/(^|[\s(-])d-|\bd\b/.test(s)) stereoDL = 'D';
  if (/(^|[\s(-])l-|\bl\b/.test(s)) stereoDL = 'L';
  if (/\(r\)|\br-/.test(s)) cipRS = 'R';
  if (/\(s\)|\bs-/.test(s)) cipRS = 'S';

  s = s
    .replace(/^(alpha|beta)-/g, '')
    .replace(/^[dl]-/g, '')
    .replace(/^(alpha|beta)-/g, '')
    .replace(/^[dl]-/g, '')
    .replace(/\((r|s)\)-?/gi, '')
    .replace(/pyranose$/g, '')
    .replace(/furanose$/g, '')
    .trim();

  return { core: s, stereoDL, anomer, ring, openChain, cipRS };
}

function buildDeterministicCandidates(
  query: string,
  specifications: string,
  projections: ProjectionType[],
  options: DisplayOptions
): {
  candidates: CandidateSpec[];
  interpretedNote: string;
  impossibleReason?: string;
} {
  const combinedNorm = normalizeGerman(`${query} ${specifications}`);
  const queryNorm = normalizeGerman(query);
  const specNorm = normalizeGerman(specifications);

  const qParsed = stripStereoPrefix(queryNorm);
  const cParsed = stripStereoPrefix(combinedNorm);

  const stereoDL = cParsed.stereoDL || qParsed.stereoDL;
  const anomer = cParsed.anomer || qParsed.anomer;
  const ring = cParsed.ring || qParsed.ring;
  const openChain = cParsed.openChain || qParsed.openChain;
  const preferZwitterion =
    Boolean(options.zwitterionic) ||
    /zwitterion|ph\s*7|physiologisch|inneres\s*salz/.test(specNorm);

  const candidates: CandidateSpec[] = [];

  // 1. Check Amino Acids
  const aaKey = AMINO_ACIDS[qParsed.core] ? qParsed.core : undefined;
  if (aaKey) {
    const aa = AMINO_ACIDS[aaKey];
    if (!aa.chiral && stereoDL) {
      return {
        candidates: [],
        interpretedNote: '',
        impossibleReason: `${aa.de} besitzt kein Chiralitätszentrum (achiral). Eine ${stereoDL}-Konfiguration existiert chemisch nicht.`,
      };
    }

    if (!aa.chiral) {
      candidates.push({
        searchName: aa.en,
        germanName: aa.de,
        subtitle: 'Achirale proteinogene Aminosäure',
        preferZwitterion,
      });
      return {
        candidates,
        interpretedNote: `${aa.de} erkannt (achiral). Validierung über PubChem & OpenChemLib.`,
      };
    }

    const dl = stereoDL || 'L';
    candidates.push({
      searchName: `${dl}-${aa.en}`,
      germanName: `${dl}-${aa.de}`,
      subtitle: `${dl}-Konfiguration · Proteinogene Aminosäure${preferZwitterion ? ' (Zwitterion bei pH 7)' : ''}`,
      preferZwitterion,
    });
    return {
      candidates,
      interpretedNote: `${dl}-${aa.de} (${stereoDL ? 'explizite D/L-Angabe' : 'Standard: biogene L-Form'}) ausgewählt.`,
    };
  }

  // 2. Check Monosaccharides (longest-first so 'desoxyribose' beats 'ribose')
  const sortedSugarKeys = Object.keys(MONOSACCHARIDES).sort((a, b) => b.length - a.length);
  const sugarKey = sortedSugarKeys.find((k) => {
    const stem = k.replace(/e$/, '');
    const oStem = k.replace(/ose$/i, 'o');
    const core = qParsed.core;
    return (
      core === k ||
      core === stem ||
      core === oStem ||
      core === `2-${k}` ||
      core === `2-${stem}` ||
      core === `2-${oStem}` ||
      core === `${stem}pyranose` ||
      core === `${stem}furanose` ||
      core === `${oStem}pyranose` ||
      core === `${oStem}furanose`
    );
  });

  if (sugarKey) {
    const sugar = MONOSACCHARIDES[sugarKey];
    const dl = stereoDL || (sugarKey === 'arabinose' ? 'L' : 'D');
    const wantsFischer = projections.includes('fischer');
    const wantsCyclic = projections.includes('haworth') || projections.includes('sessel');
    const wantsSkelett = projections.includes('skelett');

    const isRareAldohexoseFuranose =
      ring === 'furanose' &&
      ['glucose', 'glukose', 'traubenzucker', 'dextrose', 'galactose', 'galaktose', 'mannose'].includes(sugarKey);

    const isRareLEnantiomer = dl === 'L' && sugarKey !== 'arabinose';

    if (wantsFischer || openChain) {
      const openName = dl === 'L' && sugar.openChainL ? sugar.openChainL : sugar.openChainD;
      candidates.push({
        searchName: openName,
        germanName: `${dl}-${sugar.de} (offenkettig)`,
        subtitle: `Offenkettige Form (${dl}-Reihe) für Fischer-Projektion`,
        forProjections: openChain ? undefined : ['fischer', ...(wantsCyclic ? [] : (['skelett'] as ProjectionType[]))],
        isCurated: true,
        unlikelyReason: isRareLEnantiomer
          ? `Seltene ${dl}-Konfiguration: Natürliche Vertreter dieser Monosaccharid-Reihe kommen biochemisch fast ausschließlich als D-Enantiomere vor.`
          : undefined,
      });
    }

    if (!openChain && (wantsCyclic || wantsSkelett)) {
      const targetRing = ring || sugar.defaultRing;
      const cyclicProjs: ProjectionType[] = [];
      if (projections.includes('haworth')) cyclicProjs.push('haworth');
      if (projections.includes('sessel')) cyclicProjs.push('sessel');
      if (wantsSkelett) cyclicProjs.push('skelett');

      const getCyclicName = (an: 'alpha' | 'beta') => {
        if (dl === 'D') {
          if (targetRing === 'pyranose') return an === 'alpha' ? sugar.pyranoseAlphaD : sugar.pyranoseBetaD;
          return an === 'alpha' ? sugar.furanoseAlphaD : sugar.furanoseBetaD;
        } else {
          if (targetRing === 'pyranose') return an === 'alpha' ? sugar.pyranoseAlphaL : sugar.pyranoseBetaL;
          return an === 'alpha' ? sugar.furanoseAlphaL : sugar.furanoseBetaL;
        }
      };

      const formatRingDe = (baseDe: string, r: 'pyranose' | 'furanose') => {
        const clean = baseDe.replace(/\s*\([^)]+\)/g, '').trim();
        if (clean.endsWith('säure')) return `${clean} (${r === 'pyranose' ? 'Pyranose' : 'Furanose'})`;
        if (clean.endsWith('amin')) return `${clean} (${r === 'pyranose' ? 'Pyranose' : 'Furanose'})`;
        const stem = clean.replace(/ose$/i, 'o');
        return `${stem}${r}`;
      };

      let unlikelyReason: string | undefined;
      if (isRareAldohexoseFuranose) {
        unlikelyReason = `Minimale Bildungswahrscheinlichkeit (< 1 %): ${dl}-${formatRingDe(sugar.de, 'furanose')} existiert zwar chemisch, bildet sich im wässrigen Gleichgewicht jedoch nur in Spuren – es dominiert zu über 99 % der Pyranose-Sechsring.`;
      } else if (isRareLEnantiomer) {
        unlikelyReason = `Seltene L-Konfiguration: Biogen kommt dieses Monosaccharid nahezu ausschließlich in der D-Reihe vor.`;
      }

      const anomersToTry: Array<'alpha' | 'beta'> = anomer ? [anomer] : ['alpha', 'beta'];
      for (const an of anomersToTry) {
        const name = getCyclicName(an);
        if (name) {
          const ringLabel = targetRing === 'pyranose' ? 'Pyranose (Sechsring)' : 'Furanose (Fünfring)';
          candidates.push({
            searchName: name,
            germanName: `${an === 'alpha' ? 'α' : 'β'}-${dl}-${formatRingDe(sugar.de, targetRing)}`,
            subtitle: `Zyklisches Halbacetal · ${ringLabel}`,
            forProjections: cyclicProjs,
            isCurated: true,
            unlikelyReason,
          });
        }
      }
    }

    if (candidates.length > 0) {
      return {
        candidates,
        interpretedNote: `Monosaccharid ${sugar.de} (${dl}-Reihe) passend zu den gewählten Projektionen aufgelöst.`,
      };
    }
  }

  // 3. Check German Pharmaceutical & Biochemical Aliases
  const aliasKey = Object.keys(GERMAN_PHARMA_ALIASES).find(
    (k) => queryNorm === k || qParsed.core === k
  );
  if (aliasKey) {
    const alias = GERMAN_PHARMA_ALIASES[aliasKey];
    if (
      [
        'benzol',
        'harnstoff',
        'coffein',
        'koffein',
        'paracetamol',
        'acetylsalicylsaeure',
        'aspirin',
        'ass',
        'metformin',
        'lidocain',
        'diazepam',
        'histamin',
        'dopamin',
        'serotonin',
        'acetylcholin',
        'gaba',
        'citronensaeure',
        'zitronensaeure',
        'essigsaeure',
        'ameisensaeure',
        'oxalsaeure',
      ].includes(aliasKey) &&
      stereoDL
    ) {
      return {
        candidates: [],
        interpretedNote: '',
        impossibleReason: `${alias.de} ist achiral und besitzt keine ${stereoDL}-Konfiguration.`,
      };
    }

    let searchName = alias.en;
    let germanName = alias.de;
    if (cParsed.cipRS && ['ibuprofen', 'naproxen'].includes(aliasKey)) {
      searchName = `(${cParsed.cipRS})-${aliasKey}`;
      germanName = `(${cParsed.cipRS})-${alias.de}`;
    }

    candidates.push({
      searchName,
      germanName,
      subtitle: 'Pharmazeutische / biogene Referenzstruktur',
      isCurated: true,
    });
    return {
      candidates,
      interpretedNote: `${germanName} über pharmazeutisches Referenzregister aufgelöst.`,
    };
  }

  return { candidates: [], interpretedNote: '' };
}

function buildFallbackEnglishName(query: string, specifications: string): string {
  const combined = `${specifications ? specifications + ' ' : ''}${query}`.trim();
  return combined
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/gi, 'ss')
    .replace(/saeure$/i, 'ic acid')
    .replace(/in$/i, 'ine')
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta');
}

async function fetchPubChemCompound(
  name: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<PubChemProperty | null> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
    name
  )}/property/IsomericSMILES,MolecularFormula,MolecularWeight,InChIKey,IUPACName,Title/JSON`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        await onDiagnostic?.({
          provider: 'PubChem PUG REST',
          operation: 'lookup',
          failure: 'upstream',
          statusCode: res.status,
        });
      }
      return null;
    }
    const data = (await res.json()) as { PropertyTable?: { Properties?: PubChemProperty[] } };
    const prop = data?.PropertyTable?.Properties?.[0];
    if (!prop) {
      await onDiagnostic?.({
        provider: 'PubChem PUG REST',
        operation: 'lookup',
        failure: 'invalid-response',
      });
      return null;
    }
    return prop;
  } catch {
    await onDiagnostic?.({
      provider: 'PubChem PUG REST',
      operation: 'lookup',
      failure: 'network',
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifySecondaryCactus(
  name: string,
  expectedInchiKey: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<{ checked: boolean; sourceName?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(
      `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(name)}/stdinchikey`,
      { signal: controller.signal, redirect: 'error' }
    );
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        await onDiagnostic?.({
          provider: 'NCI/CADD Cactus',
          operation: 'secondary-verification',
          failure: 'upstream',
          statusCode: res.status,
        });
      }
      return { checked: false };
    }
    const text = (await res.text()).trim();
    if (text.includes('InChIKey=')) {
      const cactusKey = text.replace('InChIKey=', '').trim();
      if (cactusKey.slice(0, 14) === expectedInchiKey.slice(0, 14)) {
        return { checked: true, sourceName: 'NCI/CADD Cactus' };
      }
    }
    return { checked: false };
  } catch {
    await onDiagnostic?.({
      provider: 'NCI/CADD Cactus',
      operation: 'secondary-verification',
      failure: 'network',
    });
    return { checked: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCactusSmilesFallback(
  name: string,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<{ smiles: string; inchiKey: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const [smRes, ikRes] = await Promise.all([
      fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(name)}/smiles`, {
        signal: controller.signal,
        redirect: 'error',
      }),
      fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(name)}/stdinchikey`, {
        signal: controller.signal,
        redirect: 'error',
      }),
    ]);
    if (!smRes.ok) {
      if (smRes.status === 429 || smRes.status >= 500) {
        await onDiagnostic?.({
          provider: 'NCI/CADD Cactus',
          operation: 'structure-fallback',
          failure: 'upstream',
          statusCode: smRes.status,
        });
      }
      return null;
    }
    const smiles = (await smRes.text()).trim().split('\n')[0]?.trim();
    if (!smiles || smiles.includes('<html') || smiles.includes('Page not found')) {
      await onDiagnostic?.({
        provider: 'NCI/CADD Cactus',
        operation: 'structure-fallback',
        failure: 'invalid-response',
      });
      return null;
    }
    let inchiKey = 'Nicht über PubChem bestätigt';
    if (ikRes.ok) {
      const ik = (await ikRes.text()).trim();
      if (ik.includes('InChIKey=')) inchiKey = ik.replace('InChIKey=', '').trim();
    }
    return { smiles, inchiKey };
  } catch {
    await onDiagnostic?.({
      provider: 'NCI/CADD Cactus',
      operation: 'structure-fallback',
      failure: 'network',
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function convertAminoAcidToZwitterion(mol: OCL.Molecule): OCL.Molecule | null {
  const copy = mol.getCompactCopy();
  copy.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);

  let nh2Atom = -1;
  let ohAtom = -1;

  for (let i = 0; i < copy.getAllAtoms(); i++) {
    if (copy.getAtomicNo(i) === 7 && copy.getAtomCharge(i) === 0 && copy.getConnAtoms(i) === 1) {
      const nb = copy.getConnAtom(i, 0);
      if (copy.getAtomicNo(nb) === 6) {
        for (let j = 0; j < copy.getConnAtoms(nb); j++) {
          const c2 = copy.getConnAtom(nb, j);
          if (copy.getAtomicNo(c2) === 6) {
            let hasDoubleO = false;
            let singleO = -1;
            for (let k = 0; k < copy.getConnAtoms(c2); k++) {
              const ox = copy.getConnAtom(c2, k);
              const b = copy.getConnBond(c2, k);
              if (copy.getAtomicNo(ox) === 8) {
                if (copy.getBondOrder(b) === 2) hasDoubleO = true;
                else if (copy.getConnAtoms(ox) === 1 && copy.getAtomCharge(ox) === 0) singleO = ox;
              }
            }
            if (hasDoubleO && singleO !== -1) {
              nh2Atom = i;
              ohAtom = singleO;
            }
          }
        }
      }
    }
  }

  if (nh2Atom === -1 || ohAtom === -1) return null;
  copy.setAtomCharge(nh2Atom, 1);
  copy.setAtomCharge(ohAtom, -1);
  copy.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  return copy;
}

function summarizeCip(mol: OCL.Molecule): { count: number; summary: string } {
  mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  const items: string[] = [];
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    const cip = mol.getAtomCIPParity(i);
    if (cip === OCL.Molecule.cAtomCIPParityRorM) {
      items.push(`C${i + 1}: (R)`);
    } else if (cip === OCL.Molecule.cAtomCIPParitySorP) {
      items.push(`C${i + 1}: (S)`);
    }
  }
  return {
    count: items.length,
    summary: items.length > 0 ? items.join(', ') : 'Achirale Struktur (0 Stereozentren)',
  };
}

export async function resolveAndVerifyCore(
  query: string,
  specifications: string,
  projections: ProjectionType[],
  options: DisplayOptions,
  aiDisambiguator?: AiDisambiguator,
  onDiagnostic?: ResolverDiagnosticHandler
): Promise<ResolutionResult> {
  const rejectedReasons: string[] = [];
  let upstreamUnavailable = false;
  const reportDiagnostic: ResolverDiagnosticHandler = async (diagnostic) => {
    upstreamUnavailable = true;
    await onDiagnostic?.(diagnostic);
  };
  const deterministic = buildDeterministicCandidates(query, specifications, projections, options);

  if (deterministic.impossibleReason) {
    return {
      candidates: [],
      interpretedNote: '',
      rejectedReasons: [deterministic.impossibleReason],
    };
  }

  let specs = deterministic.candidates;
  let interpretedNote = deterministic.interpretedNote;

  if (specs.length === 0 && aiDisambiguator) {
    const aiRes = await aiDisambiguator(query, specifications, projections);
    if (aiRes) {
      if (!aiRes.possible) {
        return {
          candidates: [],
          interpretedNote: '',
          rejectedReasons: [
            aiRes.rejectionReason ||
              `Für "${query}" (${specifications || 'keine Spezifikation'}) existiert keine gültige chemische Struktur.`,
          ],
        };
      }
      interpretedNote = aiRes.interpretedNote;
      specs = aiRes.queries.map((q) => ({
        searchName: q.searchName,
        germanName: q.germanName,
        subtitle: q.subtitle,
        forProjections: q.isOpenChainForFischer
          ? ['fischer']
          : projections.includes('fischer') && (projections.includes('haworth') || projections.includes('sessel'))
            ? projections.filter((p) => p !== 'fischer')
            : undefined,
        preferZwitterion: /zwitterion|ph\s*7/.test(normalizeGerman(specifications)),
      }));
    }
  }

  if (specs.length === 0) {
    const fallbackName = buildFallbackEnglishName(query, specifications);
    specs = [
      {
        searchName: fallbackName,
        germanName: query.trim(),
        subtitle: specifications.trim() || 'Datenbankabfrage',
      },
    ];
    interpretedNote = `Direkte PubChem-Validierung für "${fallbackName}".`;
  }

  const verifiedResults: ResolutionResult['candidates'] = [];
  const seenKey = new Set<string>();

  for (const spec of specs) {
    let prop = await fetchPubChemCompound(spec.searchName, reportDiagnostic);
    if (!prop && spec.searchName !== query.trim()) {
      prop = await fetchPubChemCompound(query.trim(), reportDiagnostic);
    }

    if (!prop) {
      const cactusFallback = await fetchCactusSmilesFallback(
        spec.searchName,
        reportDiagnostic
      );
      if (!cactusFallback) {
        rejectedReasons.push(
          `Kein validierter PubChem- oder NCI-Cactus-Eintrag für "${spec.searchName}" gefunden.`
        );
        continue;
      }

      let mol: OCL.Molecule;
      try {
        mol = OCL.Molecule.fromSmiles(cactusFallback.smiles);
        mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);
      } catch {
        rejectedReasons.push(`Struktur für "${spec.searchName}" konnte nicht geparst werden.`);
        continue;
      }
      if (mol.getAllAtoms() === 0) continue;

      const fallbackDedupId = `cactus:${cactusFallback.inchiKey}:${(spec.forProjections || ['all']).join(',')}`;
      if (seenKey.has(fallbackDedupId)) continue;
      seenKey.add(fallbackDedupId);

      const cipInfo = summarizeCip(mol);
      const mf = mol.getMolecularFormula();
      verifiedResults.push({
        spec,
        molecule: mol,
        compound: {
          cid: 0,
          title: spec.searchName,
          germanName: spec.germanName,
          iupacName: spec.searchName,
          molecularFormula: mf.formula,
          molecularWeight: `${mf.relativeWeight.toFixed(2)} g/mol`,
          isomericSmiles: cactusFallback.smiles,
          inchiKey: cactusFallback.inchiKey,
          pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(spec.searchName)}`,
          stereocentersCount: cipInfo.count,
          cipSummary: cipInfo.summary,
          validation: {
            status: 'unverified',
            pubchemVerified: false,
            formulaMatch: false,
            stereochemistryMatch: true,
            secondarySourceChecked: true,
            secondarySourceName: 'NCI/CADD Cactus (Fallback)',
            warningTitle: 'Nicht vollständig gegen PubChem validiert',
            warningMessage:
              'Diese Struktur konnte nicht in PubChem verifiziert werden und stammt aus einer sekundären Auflösung über NCI/CADD Cactus. Bitte prüfe die Formel vor der Übernahme auf Lernkarten.',
          },
        },
      });
      continue;
    }

    const activeProp = prop;
    const smiles =
      activeProp.IsomericSMILES ||
      activeProp.SMILES ||
      activeProp.CanonicalSMILES ||
      activeProp.ConnectivitySMILES;

    if (!smiles) {
      rejectedReasons.push(`PubChem CID ${activeProp.CID} enthält keine gültige SMILES-Notation.`);
      continue;
    }

    let mol: OCL.Molecule;
    try {
      mol = OCL.Molecule.fromSmiles(smiles);
      mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);
    } catch {
      rejectedReasons.push(
        `Struktur für CID ${activeProp.CID} konnte von OpenChemLib nicht geparst werden.`
      );
      continue;
    }

    if (mol.getAllAtoms() === 0) {
      rejectedReasons.push(`Leere Molekülstruktur für "${spec.searchName}".`);
      continue;
    }

    const oclFormula = mol.getMolecularFormula().formula;
    const pubchemFormula = activeProp.MolecularFormula;
    const formulaMatch = oclFormula === pubchemFormula;
    if (!formulaMatch) {
      rejectedReasons.push(
        `Validierungsfehler bei ${spec.germanName}: Summenformel-Abweichung (PubChem: ${pubchemFormula}, OpenChemLib: ${oclFormula}).`
      );
      continue;
    }

    let finalSmiles = smiles;
    if (spec.preferZwitterion) {
      const zw = convertAminoAcidToZwitterion(mol);
      if (zw && zw.getMolecularFormula().formula === pubchemFormula) {
        mol = zw;
        finalSmiles = mol.toIsomericSmiles();
      }
    }

    const cipInfo = summarizeCip(mol);
    if (
      cipInfo.count === 0 &&
      (/\b[dl]-/i.test(`${query} ${specifications}`) || /\([rs]\)/i.test(`${query} ${specifications}`))
    ) {
      rejectedReasons.push(
        `${spec.germanName} (CID ${activeProp.CID}) ist achiral (0 Stereozentren) — eine D/L- oder R/S-Form existiert nicht.`
      );
      continue;
    }

    const dedupId = `${activeProp.CID}:${(spec.forProjections || ['all']).join(',')}:${spec.preferZwitterion ? 'zw' : 'n'}`;
    if (seenKey.has(dedupId)) continue;
    seenKey.add(dedupId);

    const secondary = await verifySecondaryCactus(
      spec.searchName,
      activeProp.InChIKey,
      reportDiagnostic
    );

    let status: ValidationStatus = 'verified';
    let warningTitle: string | undefined;
    let warningMessage: string | undefined;

    if (spec.unlikelyReason) {
      status = 'unlikely_form';
      warningTitle = 'Geringe Bildungswahrscheinlichkeit / seltenes Isomer';
      warningMessage = spec.unlikelyReason;
    } else if (!spec.isCurated && !secondary.checked) {
      status = 'unverified';
      warningTitle = 'Nur einfach verifiziert (Sekundärabgleich ausstehend)';
      warningMessage =
        'PubChem-Eintrag und Summenformel sind gültig, jedoch konnte kein bestätigender InChIKey-Zweitabgleich über NCI/CADD Cactus erzielt werden. Bitte Darstellung fachlich prüfen.';
    }

    verifiedResults.push({
      spec,
      molecule: mol,
      compound: {
        cid: activeProp.CID,
        title: activeProp.Title || spec.searchName,
        germanName: spec.germanName,
        iupacName: activeProp.IUPACName || activeProp.Title || spec.searchName,
        molecularFormula: pubchemFormula,
        molecularWeight: `${Number(activeProp.MolecularWeight).toFixed(2)} g/mol`,
        isomericSmiles: finalSmiles,
        inchiKey: activeProp.InChIKey,
        pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${activeProp.CID}`,
        stereocentersCount: cipInfo.count,
        cipSummary: cipInfo.summary,
        validation: {
          status,
          pubchemVerified: true,
          formulaMatch: true,
          stereochemistryMatch: true,
          secondarySourceChecked: secondary.checked,
          secondarySourceName: secondary.sourceName,
          warningTitle,
          warningMessage,
        },
      },
    });
  }

  return {
    candidates: verifiedResults,
    interpretedNote,
    rejectedReasons,
    upstreamUnavailable,
  };
}
