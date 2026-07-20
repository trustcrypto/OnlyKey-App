export interface KeyCandidate {
  id: string;
  name: string;
  type: number;
  keyData: number[];
}

export interface KeyLoadAssignment {
  candidate: KeyCandidate;
  slot: number;
}

export interface KeyImportResult {
  assignments: KeyLoadAssignment[];
  requiresSelection: boolean;
  candidates: KeyCandidate[];
}