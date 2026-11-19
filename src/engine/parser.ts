import type {
  AcceptanceRule,
  CompactTokenAnatomy,
  CriterionNode,
  CriterionStatus,
  DirectionMode,
  EvaluatedCriterion,
  EvaluationSummary,
  NumberTreeModel,
  PriorityLevel,
  SixDofComponent,
  VerdictCode,
} from './types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function charToNorm(ch: string): number {
  const idx = ALPHABET.indexOf(ch.toUpperCase());
  if (idx < 0) return 0;
  // Map A..Z (0..25) linearly to [-1.0, +1.0]
  return Number((((idx / 25) * 2) - 1).toFixed(3));
}

function normToChar(val: number): string {
  const clamped = Math.max(-1, Math.min(1, val));
  const idx = Math.round(((clamped + 1) / 2) * 25);
  return ALPHABET[Math.max(0, Math.min(25, idx))];
}

const RULE_CHAR_MAP: Record<string, { kind: AcceptanceRule['kind']; label: string }> = {
  A: { kind: 'all', label: 'Hepsi Zorunlu (&)' },
  S: { kind: 'weighted', label: 'Ağırlıklı Skor (%)' },
  K: { kind: 'k_of_n', label: 'En Az k/n Kriteri' },
  O: { kind: 'any', label: 'En Az Biri (/)' },
  G: { kind: 'weighted', label: 'Gradyan Dengeli (%)' },
};

const KIND_TO_RULE_CHAR: Record<AcceptanceRule['kind'], string> = {
  all: 'A',
  weighted: 'S',
  k_of_n: 'K',
  any: 'O',
};

const DOF_META: Array<{
  code: string;
  name: string;
  axis: SixDofComponent['axis'];
  unitLabel: string;
  description: string;
}> = [
  {
    code: 'M',
    name: 'Konum Marjı',
    axis: 'X',
    unitLabel: 'm ∈ [-1, 1]',
    description: 'Ana skaler değerin sınır duvarına göre normalize uzaklığı',
  },
  {
    code: '∇',
    name: 'Duyarlılık Gradyanı',
    axis: 'Y',
    unitLabel: '∂f/∂x',
    description: 'Tasarım değişkenindeki birim kaymaya karşı tepki eğimi',
  },
  {
    code: 'C',
    name: 'Bağımlılık Kuplajı',
    axis: 'Z',
    unitLabel: 'ρ',
    description: 'Kardeş dallarla (,) mekanik/istatistiksel bağlılık katsayısı',
  },
  {
    code: 'σ',
    name: 'Belirsizlik Zarfı',
    axis: 'Rx',
    unitLabel: '±Δ',
    description: 'Ölçüm veya olasılıksal güven aralığı yayılımı',
  },
  {
    code: 'W',
    name: 'Öncelik Ağırlığı',
    axis: 'Ry',
    unitLabel: 'w',
    description: 'Karar skoru üzerindeki göreli ağırlık ve dal kalınlığı',
  },
  {
    code: 'τ',
    name: 'Hedef Sapması',
    axis: 'Rz',
    unitLabel: 'δ*',
    description: 'İdeal eksen noktasına göre yönelim ve simetri sapması',
  },
];

/**
 * Decodes a compact vector-gradient token like "3SDLFSLK21"
 * into its dominant scalar anchor + 6-DOF orthogonal components + branch topology.
 */
export function decodeCompactToken(rawInput: string): CompactTokenAnatomy | null {
  const trimmed = rawInput.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([A-Za-z]{2,12})(\d{0,4})$/);
  if (!match) return null;

  const anchorScalar = parseFloat(match[1]);
  const letters = match[2].toUpperCase();
  const digits = match[3] || '21';

  const ruleChar = letters[0] || 'S';
  const ruleEntry = RULE_CHAR_MAP[ruleChar] ?? {
    kind: 'weighted' as const,
    label: `Vektör Kuralı (${ruleChar})`,
  };

  // Next 6 letters (padded cyclically if shorter) encode the 6 local degrees of freedom
  const dofChars = (letters.slice(1) + 'MNMNMN').slice(0, 6);
  const dofComponents: SixDofComponent[] = DOF_META.map((meta, i) => {
    const ch = dofChars[i] || 'M';
    return {
      ...meta,
      char: ch,
      value: charToNorm(ch),
    };
  });

  const branchDepth = Math.max(1, Math.min(3, parseInt(digits[0] || '2', 10) || 2));
  const coupledGroups = Math.max(1, Math.min(4, parseInt(digits[1] || '1', 10) || 1));

  const vx = dofComponents[0].value;
  const vy = dofComponents[1].value;
  const vz = dofComponents[2].value;
  const gradientMagnitude = Number(Math.hypot(vx, vy, vz).toFixed(3));

  return {
    rawToken: `${anchorScalar}${letters}${digits}`,
    anchorScalar,
    ruleChar,
    ruleSummary: ruleEntry.label,
    dofComponents,
    depthDigits: digits,
    branchDepth,
    coupledGroups,
    gradientMagnitude,
    resultantVector: {
      x: Number(vx.toFixed(3)),
      y: Number(vy.toFixed(3)),
      z: Number(vz.toFixed(3)),
    },
  };
}

/**
 * Encodes an evaluated NumberTreeModel into a deterministic compact vector token
 * (e.g., "3SDLFSLK21") that compresses its dominant anchor + 6-DOF vector signature.
 */
export function encodeCompactToken(
  model: NumberTreeModel,
  evaluated: EvaluatedCriterion[]
): string {
  if (model.compactToken && model.domain === 'vector') {
    return model.compactToken;
  }

  const ruleChar = KIND_TO_RULE_CHAR[model.rule.kind] || 'S';

  const avgMargin =
    evaluated.length > 0
      ? evaluated.reduce((acc, c) => acc + Math.max(-1, Math.min(1, c.margin)), 0) /
        evaluated.length
      : 0;
  const avgSens =
    evaluated.length > 0
      ? evaluated.reduce((acc, c) => acc + c.sensitivity, 0) / evaluated.length
      : 0;

  const groups = new Set(evaluated.map((c) => c.dependencyGroup)).size;
  const coupling = evaluated.length > 0 ? 1 - (groups - 1) / Math.max(1, evaluated.length) : 0.5;
  const avgUncertainty =
    evaluated.length > 0
      ? evaluated.reduce(
          (acc, c) =>
            acc +
            (c.uncertainty && c.upper && c.lower !== undefined
              ? Math.min(1, (c.uncertainty * 4) / Math.max(1e-6, c.upper - c.lower))
              : 0.1),
          0
        ) / evaluated.length
      : 0;
  const mandatoryRatio =
    evaluated.length > 0
      ? evaluated.filter((c) => c.priority === 'mandatory').length / evaluated.length
      : 0.5;
  const maxLevel = evaluated.some((c) => c.relationLevel === 2) ? 2 : 1;
  const bias =
    evaluated.length > 0
      ? evaluated.reduce((acc, c) => acc + (c.passed ? 0.6 : -0.8), 0) / evaluated.length
      : 0;

  const codeLetters =
    ruleChar +
    normToChar(avgMargin) +
    normToChar(avgSens) +
    normToChar(coupling * 2 - 1) +
    normToChar(avgUncertainty * 2 - 1) +
    normToChar(mandatoryRatio * 2 - 1) +
    normToChar(bias);

  const anchorStr = Number.isInteger(model.anchorScalar)
    ? String(model.anchorScalar)
    : model.anchorScalar.toFixed(1).replace(/\.0$/, '');

  return `${anchorStr}${codeLetters}${maxLevel}${Math.min(9, groups)}`;
}

/**
 * Builds a complete NumberTreeModel directly from a compact vector token like "3SDLFSLK21".
 */
export function buildModelFromCompactToken(rawToken: string): NumberTreeModel | null {
  const decoded = decodeCompactToken(rawToken);
  if (!decoded) return null;

  const { anchorScalar, dofComponents, ruleChar, branchDepth, coupledGroups } = decoded;
  const ruleInfo = RULE_CHAR_MAP[ruleChar] ?? { kind: 'weighted' as const, label: 'Skor' };

  const criteria: CriterionNode[] = dofComponents.map((comp, idx) => {
    // Convert normalized [-1, +1] value into an intuitive [0, 10] local axis scale with boundary at 3.5 or 7.5
    const mappedValue = Number(((comp.value + 1) * 5).toFixed(2)); // 0 .. 10
    const isCoupled = idx < 3 ? 0 : idx < 5 ? 1 : Math.min(2, coupledGroups);
    const relationLevel: 1 | 2 = branchDepth >= 2 && idx >= 4 ? 2 : 1;
    const priority: PriorityLevel =
      idx === 0 ? 'mandatory' : idx === 5 ? 'low' : 'normal';

    return {
      id: `dof-${idx}`,
      key: `${comp.axis.toLowerCase()}_${comp.char.toLowerCase()}`,
      label: `${comp.name} (${comp.axis} · '${comp.char}')`,
      unit: comp.unitLabel,
      value: mappedValue,
      lower: 1.5,
      upper: 8.5,
      ideal: 5.0,
      uncertainty: idx === 3 ? Number((Math.abs(comp.value) * 1.1 + 0.25).toFixed(2)) : undefined,
      priority,
      weight: Number((0.28 - idx * 0.03).toFixed(2)),
      direction: idx === 0 || idx === 1 ? 'higher_better' : 'target_center',
      dependencyGroup: isCoupled,
      relationLevel,
      parentId: relationLevel === 2 ? `dof-${idx - 3}` : undefined,
      sensitivity: Number(comp.value.toFixed(2)),
      description: comp.description,
    };
  });

  const minR = Math.floor(anchorScalar - 5);
  const maxR = Math.ceil(anchorScalar + 5);

  return {
    id: `token-${decoded.rawToken}`,
    name: `Vektör Sayısı · ${decoded.rawToken}`,
    domain: 'vector',
    domainLabel: '6-DOF Vektör İmzası',
    summary: `Sayı doğrusu üzerindeki ${anchorScalar} gövdesinden türeyen 6 serbestlik dereceli gradyan ve yerel eksenli ağaç temsili.`,
    anchorScalar,
    anchorLabel: 'Ana Sayı (Gövde)',
    anchorUnit: '',
    numberLineRange: [minR, maxR],
    rule:
      ruleInfo.kind === 'weighted'
        ? { kind: 'weighted', threshold: 0.35 }
        : ruleInfo.kind === 'k_of_n'
          ? { kind: 'k_of_n', k: 3, n: 4 }
          : { kind: ruleInfo.kind },
    criteria,
    compactToken: decoded.rawToken,
  };
}

/**
 * Computes normalized margin m for a single criterion:
 *  - m = 1 at ideal
 *  - m = 0 at boundary wall
 *  - m < 0 in rejection zone (uncapped so severity is visible)
 */
export function evaluateCriterionMargin(c: CriterionNode): {
  passed: boolean;
  margin: number;
  status: CriterionStatus;
} {
  const { value, upper, lower, ideal, direction } = c;

  const withinUpper = upper === undefined ? true : value <= upper + 1e-9;
  const withinLower = lower === undefined ? true : value >= lower - 1e-9;
  const passed = withinUpper && withinLower;

  let margin = 0.5;

  if (direction === 'target_center' && upper !== undefined && lower !== undefined) {
    const center = ideal !== undefined ? ideal : (upper + lower) / 2;
    const halfSpan = Math.max(1e-9, Math.min(upper - center, center - lower));
    margin = 1 - Math.abs(value - center) / halfSpan;
  } else if (direction === 'lower_better' && upper !== undefined) {
    const target = ideal !== undefined ? ideal : lower !== undefined ? lower : 0;
    const span = Math.max(1e-9, upper - target);
    margin = (upper - value) / span;
    if (!withinLower && lower !== undefined) {
      const underMargin = (value - lower) / Math.max(1e-9, upper - lower);
      margin = Math.min(margin, underMargin);
    }
  } else if (direction === 'higher_better' && lower !== undefined) {
    const target = ideal !== undefined ? ideal : upper !== undefined ? upper : lower * 2 || 10;
    const span = Math.max(1e-9, target - lower);
    margin = (value - lower) / span;
    if (!withinUpper && upper !== undefined) {
      const overMargin = (upper - value) / Math.max(1e-9, upper - lower);
      margin = Math.min(margin, overMargin);
    }
  } else if (upper !== undefined) {
    const span = Math.max(1e-9, upper - (lower ?? 0));
    margin = (upper - value) / span;
  } else if (lower !== undefined) {
    const span = Math.max(1e-9, Math.abs(lower) || 1);
    margin = (value - lower) / span;
  }

  // Clamp upper display margin softly to 1.25 while keeping negative failures clear
  const clampedMargin = Math.max(-1.2, Math.min(1.25, Number(margin.toFixed(3))));

  let status: CriterionStatus = 'pass';
  if (!passed) {
    status = 'fail';
  } else if (clampedMargin < 0.12) {
    status = 'marginal';
  }

  return { passed, margin: clampedMargin, status };
}

/**
 * Evaluates a full NumberTreeModel and produces ALL lossless representations (L0 -> L3).
 */
export function evaluateNumberTree(model: NumberTreeModel): EvaluationSummary {
  const normalCriteria = model.criteria.filter((c) => c.priority !== 'mandatory');
  const totalWeight = normalCriteria.reduce(
    (sum, c) => sum + (c.weight > 0 ? c.weight : c.priority === 'low' ? 0.5 : 1),
    0
  );

  // Compute unique dependency groups for clean 3D angular sectors
  const groupIndices = Array.from(new Set(model.criteria.map((c) => c.dependencyGroup))).sort(
    (a, b) => a - b
  );

  const evaluated: EvaluatedCriterion[] = model.criteria.map((c, idx) => {
    const { passed, margin, status } = evaluateCriterionMargin(c);
    const rawW = c.weight > 0 ? c.weight : c.priority === 'low' ? 0.5 : 1;
    const normalizedWeight =
      c.priority === 'mandatory' || totalWeight <= 0 ? 0 : rawW / totalWeight;

    // Spatial placement in local 3D tree around the dominant trunk (0, y, 0)
    const gRank = Math.max(0, groupIndices.indexOf(c.dependencyGroup));
    const siblingsInGroup = model.criteria.filter(
      (item) => item.dependencyGroup === c.dependencyGroup && item.relationLevel === c.relationLevel
    );
    const sRank = Math.max(0, siblingsInGroup.findIndex((item) => item.id === c.id));
    const groupSectorSpan = (Math.PI * 2) / Math.max(1, groupIndices.length);
    const baseAngle = gRank * groupSectorSpan + 0.35;
    const spreadAngle =
      siblingsInGroup.length > 1
        ? ((sRank / (siblingsInGroup.length - 1)) - 0.5) * Math.min(groupSectorSpan * 0.68, 1.65)
        : 0;
    const angle = baseAngle + spreadAngle + (c.relationLevel === 2 ? 0.25 : 0);

    const radialLen = (c.relationLevel === 2 ? 3.2 : 2.15) + Math.min(0.9, Math.abs(margin) * 0.65);
    // Y elevation directly encodes normalized margin relative to m = 0 plane (y = 2.0 is the boundary wall)
    const yBase = 2.0 + margin * 1.45 + (c.relationLevel === 2 ? 0.35 : 0);

    const vx = Number((Math.cos(angle) * radialLen).toFixed(3));
    const vz = Number((Math.sin(angle) * radialLen).toFixed(3));
    const vy = Number(Math.max(0.35, Math.min(4.6, yBase)).toFixed(3));

    // Sensitivity gradient vector (tangent + vertical slope)
    const gradScale = 0.55 + Math.abs(c.sensitivity) * 0.75;
    const gradientVec = {
      x: Number((-Math.sin(angle) * c.sensitivity * 0.45).toFixed(3)),
      y: Number((c.sensitivity * gradScale).toFixed(3)),
      z: Number((Math.cos(angle) * c.sensitivity * 0.45).toFixed(3)),
    };

    return {
      ...c,
      passed,
      margin,
      status,
      normalizedWeight: Number(normalizedWeight.toFixed(3)),
      vector3: { x: vx, y: vy, z: vz },
      gradientVec,
    };
  });

  const mandatoryList = evaluated.filter((c) => c.priority === 'mandatory');
  const mandatoryFailures = mandatoryList.filter((c) => !c.passed);
  const mandatoryPassed = mandatoryFailures.length === 0;

  const lowPriorityWarnings = evaluated.filter((c) => c.priority === 'low' && !c.passed);

  const normalOnly = evaluated.filter((c) => c.priority === 'normal');
  const normalPassedCount = normalOnly.filter((c) => c.passed).length;
  const normalTotalCount = normalOnly.length;

  // Weighted margin score across non-mandatory criteria
  const scoredCriteria = evaluated.filter((c) => c.priority !== 'mandatory');
  const weightedScore =
    scoredCriteria.length > 0
      ? Number(
          scoredCriteria
            .reduce(
              (sum, c) =>
                sum + Math.max(0, Math.min(1, c.margin)) * c.normalizedWeight,
              0
            )
            .toFixed(3)
        )
      : evaluated.length > 0
        ? Number(
            (
              evaluated.reduce((s, c) => s + Math.max(0, Math.min(1, c.margin)), 0) /
              evaluated.length
            ).toFixed(3)
          )
        : 0;

  let computedVerdict: '+' | '-' = '+';

  if (!mandatoryPassed) {
    computedVerdict = '-';
  } else {
    switch (model.rule.kind) {
      case 'all':
        computedVerdict = normalOnly.every((c) => c.passed) ? '+' : '-';
        break;
      case 'any':
        computedVerdict = normalOnly.length === 0 || normalPassedCount >= 1 ? '+' : '-';
        break;
      case 'k_of_n': {
        const k = model.rule.k ?? Math.ceil(normalTotalCount / 2);
        computedVerdict = normalPassedCount >= k ? '+' : '-';
        break;
      }
      case 'weighted': {
        const threshold = model.rule.threshold ?? 0.5;
        computedVerdict = weightedScore >= threshold ? '+' : '-';
        break;
      }
    }
  }

  const effectiveVerdict: VerdictCode = model.userVerdict ?? computedVerdict;
  const hasConflict =
    model.userVerdict !== undefined && model.userVerdict !== computedVerdict;
  const missingConflictNote =
    hasConflict && (!model.overrideNote || model.overrideNote.trim().length < 3);

  const statusLabel =
    effectiveVerdict === '+'
      ? lowPriorityWarnings.length > 0 || evaluated.some((c) => c.status === 'marginal')
        ? 'KABUL (UYARILI)'
        : 'KABUL'
      : effectiveVerdict === '+-'
        ? 'KULLANICI TAKDİRİ'
        : 'RET';

  // L0: Pure scalar
  const l0Scalar = `${model.anchorScalar}${model.anchorUnit ? ' ' + model.anchorUnit : ''}`;

  // L1: Single-line decision strip
  const glyphFor = (c: EvaluatedCriterion) =>
    c.status === 'fail' ? '✕' : c.status === 'marginal' ? '◐' : '✓';
  const blockFor = (m: number) => {
    if (m < 0) return '✕';
    if (m < 0.2) return '▂';
    if (m < 0.45) return '▄';
    if (m < 0.72) return '▆';
    return '█';
  };
  const zPart = mandatoryList.map((c) => `${c.key}${glyphFor(c)}`).join(' ');
  const aPart = scoredCriteria.map((c) => `${c.key}${blockFor(c.margin)}`).join(' ');
  const l1Strip = `${zPart ? `Z[ ${zPart} ] │ ` : ''}A[ ${aPart} ] → ${statusLabel} (${(
    weightedScore * 100
  ).toFixed(0)}%)`;

  // L2 Open Format (Self-explaining zero-shot human & LLM readable)
  const rulePhrase =
    model.rule.kind === 'all'
      ? 'hepsi sağlanmalı'
      : model.rule.kind === 'any'
        ? 'en az biri sağlanmalı'
        : model.rule.kind === 'k_of_n'
          ? `en az ${model.rule.k}/${model.rule.n ?? normalTotalCount} sağlanmalı`
          : `ağırlıklı skor >= ${model.rule.threshold ?? 0.5}`;

  const formatInequality = (c: EvaluatedCriterion) => {
    const valStr = `${c.value}${c.uncertainty ? ` ± ${c.uncertainty}` : ''}`;
    if (c.lower !== undefined && c.upper !== undefined) {
      return `${c.lower} <= ${valStr} <= ${c.upper}${c.unit ? ' ' + c.unit : ''}`;
    }
    if (c.upper !== undefined) {
      return `${valStr} <= ${c.upper}${c.unit ? ' ' + c.unit : ''}`;
    }
    if (c.lower !== undefined) {
      return `${c.lower} <= ${valStr}${c.unit ? ' ' + c.unit : ''}`;
    }
    return `${valStr}${c.unit ? ' ' + c.unit : ''}`;
  };

  const openLines = evaluated.map((c) => {
    const pref =
      c.priority === 'mandatory'
        ? 'zorunlu '
        : c.priority === 'low'
          ? 'esnek '
          : '        ';
    const keyPad = c.key.padEnd(7, ' ');
    const ineq = formatInequality(c).padEnd(28, ' ');
    const mark = c.status === 'fail' ? '✕' : c.status === 'marginal' ? '◐' : '✓';
    const marginPct = `${c.margin >= 0 ? '+' : ''}${Math.round(c.margin * 100)}%`;
    return `  ${pref}${keyPad} ${ineq} ${mark}  (marj ${marginPct})`;
  });

  const l2OpenMultiLine = [
    `${rulePhrase} (ana=${l0Scalar}):`,
    ...openLines,
    `sonuç: ${statusLabel}${model.overrideNote ? ` — "${model.overrideNote}"` : ''}`,
  ].join('\n');

  const l2OpenSingleLine = `${rulePhrase.split(' ')[0]}(${evaluated
    .map((c) => {
      const tag = c.priority === 'mandatory' ? 'zorunlu ' : c.priority === 'low' ? 'esnek ' : '';
      return `${tag}${c.key} ${formatInequality(c)} ${glyphFor(c)}`;
    })
    .join(', ')}) → ${statusLabel}`;

  // L2 Short Algebraic Notation (&, /, k/n, %t, !, ?, ^upper, _lower, @ideal, *weight, ',' coupled, ';' independent)
  const rulePrefix =
    model.rule.kind === 'all'
      ? '&'
      : model.rule.kind === 'any'
        ? '/'
        : model.rule.kind === 'k_of_n'
          ? `${model.rule.k ?? 1}/${model.rule.n ?? normalTotalCount}`
          : `%${model.rule.threshold ?? 0.5}`;

  const groupedChunks = groupIndices.map((gId) => {
    const items = evaluated.filter((c) => c.dependencyGroup === gId);
    return items
      .map((c) => {
        const prefix = c.priority === 'mandatory' ? '!' : c.priority === 'low' ? '?' : '';
        const up = c.upper !== undefined ? `^${c.upper}` : '';
        const lo = c.lower !== undefined ? `_${c.lower}` : '';
        const idl = c.ideal !== undefined ? `@${c.ideal}` : '';
        const sgn = c.passed ? '+' : '-';
        const wt =
          model.rule.kind === 'weighted' && c.priority !== 'mandatory'
            ? `*${Number(c.weight.toFixed(2))}`
            : '';
        return `${prefix}${c.key}=${c.value}${up}${lo}${idl}${sgn}${wt}`;
      })
      .join(', ');
  });

  const noteBlock = model.overrideNote ? `{${model.overrideNote}}` : '';
  const l2ShortAlgebraic = `${rulePrefix}(${groupedChunks.join('; ')})${effectiveVerdict}${noteBlock}`;

  // L2 Compact Vector Signature (e.g. 3SDLFSLK21)
  const l2CompactToken = encodeCompactToken(model, evaluated);
  const tokenAnatomy =
    decodeCompactToken(l2CompactToken) ?? decodeCompactToken('3SDLFSLK21')!;

  return {
    model,
    evaluated,
    mandatoryPassed,
    mandatoryFailures,
    lowPriorityWarnings,
    normalPassedCount,
    normalTotalCount,
    weightedScore,
    computedVerdict,
    effectiveVerdict,
    hasConflict,
    missingConflictNote,
    statusLabel,
    l0Scalar,
    l1Strip,
    l2OpenMultiLine,
    l2OpenSingleLine,
    l2ShortAlgebraic,
    l2CompactToken,
    tokenAnatomy,
  };
}

/**
 * Parses either:
 *  1) A compact vector-signature token (e.g., "3SDLFSLK21")
 *  2) A formal short algebraic expression (e.g., "&(sig=161.6^200_0+, del=19.2^20_0+; !gun=10^14_0+)+")
 */
export function parseUserNotation(
  input: string
): { ok: true; model: NumberTreeModel } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: 'Notasyon alanı boş olamaz.' };
  }

  // Case 1: Compact Vector Token (e.g. "3SDLFSLK21")
  if (/^-?\d+(?:\.\d+)?[A-Za-z]{2,12}\d{0,4}$/.test(raw)) {
    const tokenModel = buildModelFromCompactToken(raw);
    if (tokenModel) {
      return { ok: true, model: tokenModel };
    }
  }

  // Case 2: Formal Short Algebraic Notation
  // ifade := [tip] "(" grup { ";" grup } ")" [hüküm] [ "{" yorum "}" ]
  const outerMatch = raw.match(
    /^(&|\/|\d+\/\d+|%\d*(?:\.\d+)?)?\s*\((.+)\)\s*(\+-|\+|-)?\s*(?:\{([^}]*)\})?$/
  );

  if (!outerMatch) {
    // Allow single-element bare notation: e.g., x=8^10_0+ or D=20.04^20.10_19.90+
    const singleNode = parseSingleElement(raw, 0, 0);
    if (singleNode) {
      return {
        ok: true,
        model: {
          id: 'custom-single',
          name: `Tekil Sayı · ${singleNode.key}`,
          domain: 'engineering',
          domainLabel: 'Özel İfade',
          summary: 'Tek parametreli bağlamsal sayı çözümlemesi.',
          anchorScalar: singleNode.value,
          anchorLabel: singleNode.key,
          anchorUnit: '',
          numberLineRange: [
            Math.floor(Math.min(singleNode.lower ?? singleNode.value - 5, singleNode.value - 5)),
            Math.ceil(Math.max(singleNode.upper ?? singleNode.value + 5, singleNode.value + 5)),
          ],
          rule: { kind: 'all' },
          criteria: [singleNode],
        },
      };
    }
    return {
      ok: false,
      error:
        'Geçersiz sözdizimi. Örnek: &(sig=161.6^200_0+, del=19.2^20_0+; !gun=10^14_0+)+ veya 3SDLFSLK21',
    };
  }

  const [, ruleToken = '&', body, verdictStr, commentStr] = outerMatch;

  let rule: AcceptanceRule = { kind: 'all' };
  if (ruleToken === '&') {
    rule = { kind: 'all' };
  } else if (ruleToken === '/') {
    rule = { kind: 'any' };
  } else if (ruleToken.startsWith('%')) {
    const t = parseFloat(ruleToken.slice(1));
    rule = { kind: 'weighted', threshold: Number.isFinite(t) ? t : 0.5 };
  } else if (ruleToken.includes('/')) {
    const [kStr, nStr] = ruleToken.split('/');
    rule = { kind: 'k_of_n', k: parseInt(kStr, 10) || 1, n: parseInt(nStr, 10) || 1 };
  }

  // Split top-level groups by ';' (independent) while respecting nested parentheses
  const independentGroups = splitTopLevel(body, ';');
  const criteria: CriterionNode[] = [];

  let counter = 0;
  for (let gIdx = 0; gIdx < independentGroups.length; gIdx++) {
    const groupStr = independentGroups[gIdx].trim();
    if (!groupStr) continue;

    const coupledItems = splitTopLevel(groupStr, ',');
    for (const itemStr of coupledItems) {
      const cleaned = itemStr.trim();
      if (!cleaned) continue;

      // Handle nested rule like /(gunA=10^14_0+; gunB=21^14_0-)
      const nestedMatch = cleaned.match(/^(&|\/|\d+\/\d+|%\d*(?:\.\d+)?)\s*\((.+)\)$/);
      if (nestedMatch) {
        const [, subRuleTok, subBody] = nestedMatch;
        const subItems = splitTopLevel(subBody, ';').flatMap((s) => splitTopLevel(s, ','));
        let parentId: string | undefined;
        subItems.forEach((sub, subIdx) => {
          const parsed = parseSingleElement(sub.trim(), gIdx, counter++);
          if (parsed) {
            if (subIdx === 0) {
              parentId = parsed.id;
              parsed.nestedRule = { kind: subRuleTok === '/' ? 'any' : 'all' };
            } else {
              parsed.relationLevel = 2;
              parsed.parentId = parentId;
            }
            criteria.push(parsed);
          }
        });
      } else {
        const parsed = parseSingleElement(cleaned, gIdx, counter++);
        if (!parsed) {
          return {
            ok: false,
            error: `Eleman çözümlenemedi: "${cleaned}". Biçim: [!|?]ad=değer[^üst][_alt][@ideal][+|-][*ağırlık]`,
          };
        }
        criteria.push(parsed);
      }
    }
  }

  if (criteria.length === 0) {
    return { ok: false, error: 'İfade içinde en az bir kriter bulunmalıdır.' };
  }

  // Anchor scalar defaults to the first criterion's value or normalized index
  const anchorVal = criteria[0].value;
  const span = Math.max(5, Math.abs(anchorVal) * 0.4);

  return {
    ok: true,
    model: {
      id: 'custom-parsed',
      name: 'Çözümlenen İfade',
      domain: 'engineering',
      domainLabel: 'Canlı Ayrıştırıcı',
      summary: `${criteria.length} kriter ve ${independentGroups.length} bağımsız grup içeren canlı notasyon ağacı.`,
      anchorScalar: anchorVal,
      anchorLabel: criteria[0].key,
      anchorUnit: '',
      numberLineRange: [
        Math.floor(anchorVal - span),
        Math.ceil(anchorVal + span),
      ],
      rule,
      userVerdict: (verdictStr as VerdictCode | undefined) || undefined,
      overrideNote: commentStr?.trim() || undefined,
      criteria,
    },
  };
}

function splitTopLevel(str: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === delimiter && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

function parseSingleElement(
  token: string,
  dependencyGroup: number,
  index: number
): CriterionNode | null {
  const m = token.match(
    /^([!?])?([A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-z0-9ÇĞİÖŞÜçğıöşü_]*)\s*=\s*(-?\d+(?:\.\d+)?)(?:\^(-?\d+(?:\.\d+)?))?(?:_(-?\d+(?:\.\d+)?))?(?:@(-?\d+(?:\.\d+)?))?([+-])?(?:\*(-?\d+(?:\.\d+)?))?$/
  );
  if (!m) return null;

  const [, pref, key, valStr, upStr, loStr, idealStr, , weightStr] = m;
  const value = parseFloat(valStr);
  const upper = upStr !== undefined ? parseFloat(upStr) : undefined;
  const lower = loStr !== undefined ? parseFloat(loStr) : undefined;
  const ideal = idealStr !== undefined ? parseFloat(idealStr) : undefined;
  const weight = weightStr !== undefined ? parseFloat(weightStr) : pref === '?' ? 0.5 : 1;

  const priority: PriorityLevel =
    pref === '!' ? 'mandatory' : pref === '?' ? 'low' : 'normal';

  let direction: DirectionMode = 'lower_better';
  if (upper !== undefined && lower !== undefined) {
    if (ideal !== undefined && ideal > lower && ideal < upper) {
      direction = 'target_center';
    } else if (ideal !== undefined && ideal >= upper) {
      direction = 'higher_better';
    } else if (lower === 0) {
      direction = 'lower_better';
    } else {
      direction = 'target_center';
    }
  } else if (lower !== undefined && upper === undefined) {
    direction = 'higher_better';
  }

  return {
    id: `parsed-${index}-${key}`,
    key,
    label: key,
    unit: '',
    value,
    upper,
    lower,
    ideal,
    priority,
    weight,
    direction,
    dependencyGroup,
    relationLevel: 1,
    sensitivity: Number((((index % 3) - 1) * 0.45 + 0.25).toFixed(2)),
  };
}
