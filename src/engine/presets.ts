import { buildModelFromCompactToken } from './parser';
import type { BeamCandidate, NumberTreeModel } from './types';

/**
 * Real Eurocode / S355 Steel Beam Mechanics:
 * Span L = 6.0 m, Uniform distributed load q = 20 kN/m (including self-weight)
 * E = 210 GPa = 210,000 MPa, Unit Steel Price = 50 TL/kg
 * M_max = q * L^2 / 8 = 20 * 36 / 8 = 90 kN·m = 90e6 N·mm
 * σ_max = M_max / W_y (MPa)
 * δ_max = 5 * q * L^4 / (384 * E * I_y) (mm)
 */
const SPAN_MM = 6000;
const LOAD_N_PER_MM = 20; // 20 kN/m = 20 N/mm
const E_MPA = 210_000;
const M_MAX_NMM = (LOAD_N_PER_MM * SPAN_MM * SPAN_MM) / 8; // 90,000,000 N·mm
const UNIT_PRICE_TL_KG = 50;

interface RawIpeSpec {
  id: string;
  profile: string;
  heightMm: number;
  iyCm4: number;
  wyCm3: number;
  massKgPerM: number;
  deliveryDays: number;
}

const IPE_SPECS: RawIpeSpec[] = [
  { id: 'ipe-270', profile: 'IPE 270', heightMm: 270, iyCm4: 5790, wyCm3: 429, massKgPerM: 36.1, deliveryDays: 10 },
  { id: 'ipe-300', profile: 'IPE 300', heightMm: 300, iyCm4: 8356, wyCm3: 557, massKgPerM: 42.2, deliveryDays: 10 },
  { id: 'ipe-330', profile: 'IPE 330', heightMm: 330, iyCm4: 11770, wyCm3: 713, massKgPerM: 49.1, deliveryDays: 12 },
  { id: 'ipe-360', profile: 'IPE 360', heightMm: 360, iyCm4: 16270, wyCm3: 904, massKgPerM: 57.1, deliveryDays: 13 },
];

export function buildBeamCandidates(costWeight = 0.4): BeamCandidate[] {
  const remaining = Math.max(0.05, 1 - costWeight);
  const wDefl = Number((remaining * (0.25 / 0.6)).toFixed(3));
  const wStress = Number((remaining * (0.2 / 0.6)).toFixed(3));
  const wHeight = Number((remaining * (0.15 / 0.6)).toFixed(3));

  return IPE_SPECS.map((spec) => {
    const wyMm3 = spec.wyCm3 * 1000;
    const iyMm4 = spec.iyCm4 * 10_000;
    const stressMpa = Number((M_MAX_NMM / wyMm3).toFixed(1));
    const deflectionMm = Number(
      ((5 * LOAD_N_PER_MM * Math.pow(SPAN_MM, 4)) / (384 * E_MPA * iyMm4)).toFixed(1)
    );
    const totalMassKg = spec.massKgPerM * 6;
    const costTl = Math.round(totalMassKg * UNIT_PRICE_TL_KG);

    const model: NumberTreeModel = {
      id: spec.id,
      name: `Çelik Kiriş · ${spec.profile}`,
      domain: 'engineering',
      domainLabel: 'Mühendislik Şartnamesi',
      summary: `6 m açıklıklı S355 çelik kiriş (q = 20 kN/m). Gövde kesit yüksekliği h = ${spec.heightMm} mm üzerinde oturur; σ, δ, h ve maliyet birbirine bağlı (,), teslim süresi bağımsız (;) dallardır.`,
      anchorScalar: spec.heightMm,
      anchorLabel: 'Kesit Yüksekliği h',
      anchorUnit: 'mm',
      numberLineRange: [240, 390],
      rule: { kind: 'weighted', threshold: 0.25 },
      criteria: [
        {
          id: `${spec.id}-sig`,
          key: 'sig',
          label: 'Maksimum Gerilme σ',
          unit: 'MPa',
          value: stressMpa,
          upper: 200,
          lower: 0,
          ideal: 0,
          priority: 'mandatory',
          weight: wStress,
          direction: 'lower_better',
          dependencyGroup: 0,
          relationLevel: 1,
          sensitivity: -0.72,
          description: 'S355 akma güvenliği (Zorunlu kapı K1)',
        },
        {
          id: `${spec.id}-del`,
          key: 'del',
          label: 'Maksimum Sehim δ',
          unit: 'mm',
          value: deflectionMm,
          upper: 20,
          lower: 0,
          ideal: 0,
          priority: 'mandatory',
          weight: wDefl,
          direction: 'lower_better',
          dependencyGroup: 0,
          relationLevel: 1,
          sensitivity: -0.94,
          description: 'L/300 = 20 mm kullanılabilirlik sınırı (Zorunlu kapı K2)',
        },
        {
          id: `${spec.id}-h`,
          key: 'h',
          label: 'Yapısal Yükseklik h',
          unit: 'mm',
          value: spec.heightMm,
          upper: 340,
          lower: 200,
          ideal: 250,
          priority: 'mandatory',
          weight: wHeight,
          direction: 'lower_better',
          dependencyGroup: 0,
          relationLevel: 1,
          sensitivity: 0.55,
          description: 'Mimari tavan boşluğu kısıtı (Zorunlu kapı K3)',
        },
        {
          id: `${spec.id}-tl`,
          key: 'tl',
          label: 'Toplam Maliyet',
          unit: 'TL',
          value: costTl,
          upper: 16000,
          ideal: 12000,
          priority: 'normal',
          weight: costWeight,
          direction: 'lower_better',
          dependencyGroup: 0,
          relationLevel: 1,
          sensitivity: 0.68,
          description: '50 TL/kg birim maliyetle 6 m kiriş bedeli (Ağırlıklı K4)',
        },
        {
          id: `${spec.id}-dpay`,
          key: 'pay_d',
          label: 'Sehim Emniyet Payı',
          unit: '%',
          value: Number(Math.max(0, (1 - deflectionMm / 20) * 100).toFixed(1)),
          lower: 0,
          upper: 100,
          ideal: 60,
          priority: 'normal',
          weight: wDefl,
          direction: 'higher_better',
          dependencyGroup: 0,
          relationLevel: 2,
          parentId: `${spec.id}-del`,
          sensitivity: 0.85,
          description: 'Sehim dalından türeyen 2. derece güvenlik marjı (1 − δ/20)',
        },
        {
          id: `${spec.id}-spay`,
          key: 'pay_s',
          label: 'Gerilme Emniyet Payı',
          unit: '%',
          value: Number(Math.max(0, (1 - stressMpa / 200) * 100).toFixed(1)),
          lower: 0,
          upper: 100,
          ideal: 60,
          priority: 'normal',
          weight: wStress,
          direction: 'higher_better',
          dependencyGroup: 0,
          relationLevel: 2,
          parentId: `${spec.id}-sig`,
          sensitivity: 0.64,
          description: 'Gerilme dalından türeyen 2. derece dayanım rezervi (1 − σ/200)',
        },
        {
          id: `${spec.id}-gun`,
          key: 'gun',
          label: 'Tedarik Süresi (Tedarikçi A)',
          unit: 'gün',
          value: spec.deliveryDays,
          upper: 14,
          lower: 0,
          ideal: 5,
          priority: 'mandatory',
          weight: 0.15,
          direction: 'lower_better',
          dependencyGroup: 1,
          relationLevel: 1,
          sensitivity: -0.25,
          nestedRule: { kind: 'any' },
          description: 'Kesitten bağımsız (;) tedarik takvimi koşulu',
        },
        {
          id: `${spec.id}-gunB`,
          key: 'gunB',
          label: 'Yedek Tedarikçi B',
          unit: 'gün',
          value: 18,
          upper: 14,
          lower: 0,
          ideal: 7,
          priority: 'low',
          weight: 0.1,
          direction: 'lower_better',
          dependencyGroup: 1,
          relationLevel: 2,
          parentId: `${spec.id}-gun`,
          sensitivity: -0.18,
          description: 'Tedarik dalına bağlı 2. derece düşük öncelikli yedek seçenek (?)',
        },
      ],
    };

    return {
      ...spec,
      stressMpa,
      deflectionMm,
      costTl,
      model,
    };
  });
}

export function getPresetModels(): NumberTreeModel[] {
  const beam300 = buildBeamCandidates(0.4)[1].model; // IPE 300 flagship case
  const vectorTokenModel = buildModelFromCompactToken('3SDLFSLK21')!;

  const financeModel: NumberTreeModel = {
    id: 'finance-portfolio',
    name: 'Portföy Risk Şartnamesi',
    domain: 'finance',
    domainLabel: 'Finansal Risk',
    summary:
      'Yıllık %14.8 beklenen getiri gövdesi üzerinde volatilite, maksimum düşüş (drawdown), Sharpe oranı ve likidite limitlerini tek bir kural ağacında değerlendirir.',
    anchorScalar: 14.8,
    anchorLabel: 'Beklenen Getiri',
    anchorUnit: '%',
    numberLineRange: [4, 24],
    rule: { kind: 'weighted', threshold: 0.45 },
    criteria: [
      {
        id: 'fin-ret',
        key: 'getiri',
        label: 'Yıllık Getiri',
        unit: '%',
        value: 14.8,
        lower: 10,
        upper: 25,
        ideal: 20,
        priority: 'normal',
        weight: 0.35,
        direction: 'higher_better',
        dependencyGroup: 0,
        relationLevel: 1,
        sensitivity: 0.76,
        description: 'Hedef enflasyon üstü getiri bandı',
      },
      {
        id: 'fin-vol',
        key: 'vol',
        label: 'Yıllık Volatilite',
        unit: '%',
        value: 13.4,
        lower: 0,
        upper: 16,
        ideal: 8,
        priority: 'mandatory',
        weight: 0.25,
        direction: 'lower_better',
        dependencyGroup: 0,
        relationLevel: 1,
        sensitivity: -0.82,
        description: 'Yatırım komitesi zorunlu oynaklık tavanı',
      },
      {
        id: 'fin-mdd',
        key: 'mdd',
        label: 'Maksimum Kayıp (MDD)',
        unit: '%',
        value: 11.2,
        lower: 0,
        upper: 12,
        ideal: 4,
        priority: 'mandatory',
        weight: 0.2,
        direction: 'lower_better',
        dependencyGroup: 0,
        relationLevel: 2,
        parentId: 'fin-vol',
        sensitivity: -0.91,
        description: 'Volatiliteye bağlı kuyruk riski — sınıra çok yakın (◐)',
      },
      {
        id: 'fin-sharpe',
        key: 'sharpe',
        label: 'Sharpe Oranı',
        unit: '',
        value: 1.42,
        lower: 1.0,
        upper: 2.5,
        ideal: 2.0,
        priority: 'normal',
        weight: 0.25,
        direction: 'higher_better',
        dependencyGroup: 0,
        relationLevel: 1,
        sensitivity: 0.54,
        description: 'Riske göre düzeltilmiş verimlilik',
      },
      {
        id: 'fin-liq',
        key: 'likit',
        label: 'T+1 Likidite Payı',
        unit: '%',
        value: 28,
        lower: 20,
        upper: 100,
        ideal: 45,
        priority: 'low',
        weight: 0.15,
        direction: 'higher_better',
        dependencyGroup: 1,
        relationLevel: 1,
        sensitivity: 0.31,
        description: 'Piyasa riskinden bağımsız (;) operasyonel nakit tamponu',
      },
    ],
  };

  const statisticsModel: NumberTreeModel = {
    id: 'stats-model-eval',
    name: 'İstatistiksel Model Karşılaştırması',
    domain: 'statistics',
    domainLabel: 'İstatistik & Belirsizlik',
    summary:
      'Cohen d = 0.62 etki büyüklüğü ana gövdesi üzerinde %95 güven aralığı (belirsizlik zarfı), istatistiksel güç ve p-değeri tek notasyonda izlenir.',
    anchorScalar: 0.62,
    anchorLabel: 'Etki Büyüklüğü d',
    anchorUnit: '',
    numberLineRange: [-0.2, 1.4],
    rule: { kind: 'all' },
    criteria: [
      {
        id: 'st-d',
        key: 'etki_d',
        label: 'Etki Büyüklüğü (Cohen d)',
        unit: 'σ',
        value: 0.62,
        lower: 0.4,
        upper: 1.2,
        ideal: 0.85,
        uncertainty: 0.14,
        priority: 'mandatory',
        weight: 0.4,
        direction: 'higher_better',
        dependencyGroup: 0,
        relationLevel: 1,
        sensitivity: 0.78,
        description: '%95 Güven Aralığı [0.48, 0.76] — alt sınır 0.40 üzerinde',
      },
      {
        id: 'st-p',
        key: 'p_val',
        label: 'Anlamlılık (p-değeri)',
        unit: '',
        value: 0.014,
        lower: 0,
        upper: 0.05,
        ideal: 0.005,
        uncertainty: 0.006,
        priority: 'mandatory',
        weight: 0.25,
        direction: 'lower_better',
        dependencyGroup: 0,
        relationLevel: 2,
        parentId: 'st-d',
        sensitivity: -0.88,
        description: 'Etki büyüklüğü ve örneklemle ilişkili anlamlılık eşiği',
      },
      {
        id: 'st-pow',
        key: 'guc',
        label: 'İstatistiksel Güç (1 − β)',
        unit: '%',
        value: 86.5,
        lower: 80,
        upper: 100,
        ideal: 95,
        uncertainty: 3.2,
        priority: 'normal',
        weight: 0.2,
        direction: 'higher_better',
        dependencyGroup: 0,
        relationLevel: 1,
        sensitivity: 0.61,
        description: 'Tip-II hata koruması',
      },
      {
        id: 'st-n',
        key: 'ornek_n',
        label: 'Örneklem Yeterliliği',
        unit: 'kişi',
        value: 148,
        lower: 120,
        upper: 400,
        ideal: 220,
        priority: 'normal',
        weight: 0.15,
        direction: 'higher_better',
        dependencyGroup: 1,
        relationLevel: 1,
        sensitivity: 0.42,
        description: 'Bağımsız (;) deney tasarım parametresi',
      },
    ],
  };

  return [vectorTokenModel, beam300, financeModel, statisticsModel];
}

export const QUICK_NOTATION_EXAMPLES = [
  {
    label: '3SDLFSLK21 (Vektör)',
    code: '3SDLFSLK21',
  },
  {
    label: 'IPE 300 (Kabul)',
    code: '&(sig=161.6^200_0@0+, del=19.2^20_0@0+, h=300^340_200@250+, tl=12660^16000@12000+; !gun=10^14_0+)+',
  },
  {
    label: 'IPE 270 (3/4 Esnek)',
    code: '3/4(sig=210^200_0-, del=27.8^20_0-, h=270^340_200+, tl=10830^16000+; !gun=10^14_0+)-',
  },
  {
    label: 'Kullanıcı Takdiri (±)',
    code: '&(sig=198^200_0+, del=20.1^20_0-, h=300^340_200+)+-{0.1 mm aşım, baş mühendis onayı bekliyor}',
  },
  {
    label: 'IPE 360 (? Düşük Önem)',
    code: '&(sig=99.6^200_0+, del=9.9^20_0+, ?h=360^340_200-, tl=17130^18000+; !gun=10^14_0+)+',
  },
  {
    label: 'Çift Yönlü Tolerans (◆)',
    code: '&(cap=20.04^20.10_19.90@20.00+, puz=0.8^1.6_0@0.4+; !malz=355_320+)+',
  },
];
