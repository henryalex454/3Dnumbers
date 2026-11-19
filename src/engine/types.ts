export type PriorityLevel = 'mandatory' | 'normal' | 'low';

export type RuleKind = 'all' | 'any' | 'k_of_n' | 'weighted';

export type VerdictCode = '+' | '-' | '+-';

export type DirectionMode = 'lower_better' | 'higher_better' | 'target_center';

export type CriterionStatus = 'pass' | 'marginal' | 'fail' | 'info';

export interface AcceptanceRule {
  kind: RuleKind;
  k?: number;
  n?: number;
  threshold?: number; // for weighted %t
}

export interface CriterionNode {
  id: string;
  key: string; // short algebraic key e.g. 'sig', 'del', 'h', 'tl', 'gun'
  label: string; // human label e.g. 'Maksimum gerilme σ'
  unit: string;
  value: number;
  upper?: number;
  lower?: number;
  ideal?: number;
  uncertainty?: number; // ± half-width (e.g. 95% CI in statistics)
  priority: PriorityLevel;
  weight: number; // relative weight
  direction: DirectionMode;
  dependencyGroup: number; // items with same index are ',' coupled; different indices are ';' independent
  relationLevel: 1 | 2; // 1 = direct trunk branch, 2 = sub-branch / nested relation
  parentId?: string; // if relationLevel === 2
  sensitivity: number; // mathematical gradient ∂m/∂x in [-1, 1]
  nestedRule?: AcceptanceRule; // e.g., /(gunA; gunB)
  description?: string;
}

export interface EvaluatedCriterion extends CriterionNode {
  passed: boolean;
  margin: number; // normalized margin: 0 = boundary wall, 1 = ideal, <0 = rejection zone
  status: CriterionStatus;
  normalizedWeight: number;
  vector3: { x: number; y: number; z: number }; // local 3D tip coordinate relative to trunk
  gradientVec: { x: number; y: number; z: number }; // sensitivity vector direction
}

export interface OverrideAuditEntry {
  timestamp: string;
  author: string;
  ruleVerdict: '+' | '-';
  finalVerdict: VerdictCode;
  note: string;
}

export interface SixDofComponent {
  code: string;
  char: string;
  name: string;
  axis: 'X' | 'Y' | 'Z' | 'Rx' | 'Ry' | 'Rz';
  value: number; // normalized [-1, +1]
  unitLabel: string;
  description: string;
}

export interface CompactTokenAnatomy {
  rawToken: string;
  anchorScalar: number;
  ruleChar: string;
  ruleSummary: string;
  dofComponents: SixDofComponent[];
  depthDigits: string;
  branchDepth: number;
  coupledGroups: number;
  gradientMagnitude: number;
  resultantVector: { x: number; y: number; z: number };
}

export interface NumberTreeModel {
  id: string;
  name: string;
  domain: 'engineering' | 'vector' | 'finance' | 'statistics';
  domainLabel: string;
  summary: string;
  anchorScalar: number; // Dominant scalar sitting on the 1D real number line
  anchorLabel: string;
  anchorUnit: string;
  numberLineRange: [number, number];
  rule: AcceptanceRule;
  userVerdict?: VerdictCode; // optional explicit verdict override
  overrideNote?: string;
  criteria: CriterionNode[];
  compactToken?: string; // e.g. '3SDLFSLK21'
}

export interface EvaluationSummary {
  model: NumberTreeModel;
  evaluated: EvaluatedCriterion[];
  mandatoryPassed: boolean;
  mandatoryFailures: EvaluatedCriterion[];
  lowPriorityWarnings: EvaluatedCriterion[];
  normalPassedCount: number;
  normalTotalCount: number;
  weightedScore: number; // 0..1 average margin
  computedVerdict: '+' | '-';
  effectiveVerdict: VerdictCode;
  hasConflict: boolean; // userVerdict contradicts computedVerdict
  missingConflictNote: boolean; // conflict without {...} comment
  statusLabel: string;
  l0Scalar: string;
  l1Strip: string;
  l2OpenMultiLine: string;
  l2OpenSingleLine: string;
  l2ShortAlgebraic: string;
  l2CompactToken: string;
  tokenAnatomy: CompactTokenAnatomy;
}

export interface BeamCandidate {
  id: string;
  profile: string;
  heightMm: number;
  iyCm4: number;
  wyCm3: number;
  massKgPerM: number;
  stressMpa: number;
  deflectionMm: number;
  costTl: number;
  deliveryDays: number;
  model: NumberTreeModel;
}
