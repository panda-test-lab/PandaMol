export type ProjectionType = 'skelett' | 'fischer' | 'haworth' | 'sessel';

export interface DisplayOptions {
  uniformAlignment: boolean;
  showCIP: boolean;
  colorHeteroatoms: boolean;
  showCarbonNumbers: boolean;
  zwitterionic?: boolean;
}

export interface GenerateStructuresRequest {
  query: string;
  specifications: string;
  projections: ProjectionType[];
  options: DisplayOptions;
}

export type ValidationStatus = 'verified' | 'unlikely_form' | 'unverified';

export interface ValidationChecks {
  status: ValidationStatus;
  pubchemVerified: boolean;
  formulaMatch: boolean;
  stereochemistryMatch: boolean;
  secondarySourceChecked: boolean;
  secondarySourceName?: string;
  warningTitle?: string;
  warningMessage?: string;
}

export interface VerifiedCompoundMeta {
  cid: number;
  title: string;
  germanName: string;
  iupacName: string;
  molecularFormula: string;
  molecularWeight: string;
  isomericSmiles: string;
  inchiKey: string;
  pubchemUrl: string;
  stereocentersCount: number;
  cipSummary: string;
  validation: ValidationChecks;
}

export interface GeneratedStructureCard {
  id: string;
  projection: ProjectionType;
  projectionLabel: string;
  title: string;
  subtitle: string;
  svg: string;
  alignmentNotes: string;
  compound: VerifiedCompoundMeta;
  confirmed: boolean;
  createdAt: string;
}

export interface ProjectionNotice {
  projection: ProjectionType;
  projectionLabel: string;
  compoundName: string;
  reason: string;
}

export interface GenerateStructuresResponse {
  query: string;
  specifications: string;
  interpretedNote: string;
  structures: GeneratedStructureCard[];
  notices: ProjectionNotice[];
  error?: string;
  debugId?: string;
}

export interface HistoryEntry {
  id: string;
  query: string;
  specifications: string;
  structure: GeneratedStructureCard;
  savedAt: string;
}
