/**
 * Quantiles_long_29n.csv: возрастные группы, перцентили q10–q90, медиана q50.
 * Используется для блока «Ваш результат» (отклонение от медианы) и блока «Перцентиль».
 */

const AGE_GROUPS = [
  "12-14",
  "15-17",
  "18-24",
  "25-34",
  "35-44",
  "45-49",
] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

export interface QuantileRow {
  ageGroup: string;
  code: string;
  n: number;
  q10: number;
  q20: number;
  q30: number;
  q40: number;
  q50: number;
  q60: number;
  q70: number;
  q80: number;
  q90: number;
  /** Full p0–p100 array when available (from gender-specific CSV). */
  p0toP100?: number[];
}

/** Маппинг кода показателя в приложении на код в CSV (если отличается). */
const APP_CODE_TO_CSV: Record<string, string> = {
  LBXMCHSI: "LBXMC", // MCHC в приложении — в CSV как LBXMC (г/дл)
};

/** Коды, для которых в CSV значения в г/дл; в приложении г/л → множитель 10. */
const CSV_G_DL_CODES = new Set(["LBXHGB", "LBXMC"]);

/**
 * Возвращает возрастную группу по возрасту в годах.
 * Вне диапазона 12–49: ближайшая граница.
 */
export function ageToGroup(age: number): AgeGroup | null {
  if (typeof age !== "number" || Number.isNaN(age) || age < 12) return "12-14";
  if (age <= 14) return "12-14";
  if (age <= 17) return "15-17";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 49) return "45-49";
  return "45-49";
}

function csvCode(appCode: string): string {
  return APP_CODE_TO_CSV[appCode] ?? appCode;
}

/** Приводит значение из CSV к единицам приложения (г/дл → г/л для Hb, MCHC). */
function csvValueToApp(value: number, appCode: string): number {
  const code = csvCode(appCode);
  return CSV_G_DL_CODES.has(code) ? value * 10 : value;
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Парсит CSV текст Quantiles_long (заголовок: Возрастная группа, Показатель (код), ..., q10, ..., q90).
 */
export function parseQuantilesCsv(csvText: string): QuantileRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const ageIdx = header.findIndex((h) => h === "Возрастная группа" || h.includes("озраст"));
  const codeIdx = header.findIndex((h) => h.includes("код") || h === "Показатель (код)");
  const nIdx = header.findIndex((h) => h === "n");
  const qIdx = header.findIndex((h) => h === "q10");
  if (ageIdx < 0 || codeIdx < 0 || nIdx < 0 || qIdx < 0) return [];
  const rows: QuantileRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const ageGroup = parts[ageIdx]?.trim() ?? "";
    const code = parts[codeIdx]?.trim() ?? "";
    const n = parseNum(parts[nIdx] ?? "0");
    const q10 = parseNum(parts[qIdx] ?? "0");
    const q20 = parseNum(parts[qIdx + 1] ?? "0");
    const q30 = parseNum(parts[qIdx + 2] ?? "0");
    const q40 = parseNum(parts[qIdx + 3] ?? "0");
    const q50 = parseNum(parts[qIdx + 4] ?? "0");
    const q60 = parseNum(parts[qIdx + 5] ?? "0");
    const q70 = parseNum(parts[qIdx + 6] ?? "0");
    const q80 = parseNum(parts[qIdx + 7] ?? "0");
    const q90 = parseNum(parts[qIdx + 8] ?? "0");
    rows.push({
      ageGroup,
      code,
      n,
      q10,
      q20,
      q30,
      q40,
      q50,
      q60,
      q70,
      q80,
      q90,
    });
  }
  return rows;
}

/**
 * Возвращает строку перцентилей для возрастной группы и кода показателя (код приложения).
 * Для LBXMCHSI ищется строка с code LBXMC в CSV.
 */
export function getQuantileRow(
  rows: QuantileRow[],
  ageGroup: AgeGroup | null,
  appCode: string
): QuantileRow | null {
  if (!ageGroup || !rows.length) return null;
  const code = csvCode(appCode);
  return (
    rows.find(
      (r) => r.ageGroup === ageGroup && r.code === code
    ) ?? null
  );
}

/**
 * Медиана для возраста в единицах приложения (q50 с конвертацией г/дл → г/л при необходимости).
 */
export function getMedianForApp(
  row: QuantileRow | null,
  appCode: string
): number | null {
  if (!row) return null;
  return csvValueToApp(row.q50, appCode);
}

/**
 * Вычисляет перцентиль (0–100) по значению и строке квантилей; значение в единицах приложения.
 * Если в строке есть p0toP100 — использует полный массив (точная интерполяция).
 * Иначе — линейная интерполяция между q10…q90.
 */
export function computePercentile(
  value: number,
  row: QuantileRow | null,
  appCode: string
): number | null {
  if (!row) return null;
  if (row.p0toP100) {
    const scaled = csvValueToApp(1, appCode) !== 1
      ? row.p0toP100.map((v) => csvValueToApp(v, appCode))
      : row.p0toP100;
    return computePercentileFromP100(value, scaled);
  }
  const qs = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;
  const vals = qs.map((q) => csvValueToApp((row as unknown as Record<string, number>)[`q${q}`], appCode));
  if (value <= vals[0]) return 10;
  if (value >= vals[vals.length - 1]) return 90;
  for (let i = 0; i < vals.length - 1; i++) {
    if (value >= vals[i] && value <= vals[i + 1]) {
      const t = (value - vals[i]) / (vals[i + 1] - vals[i] || 1);
      return qs[i] + t * (qs[i + 1] - qs[i]);
    }
  }
  return 50;
}

/** Отклонение в процентах от медианы: (value - median) / median * 100. */
export function deviationPercent(value: number, median: number): number {
  if (median === 0) return 0;
  return Math.round(((value - median) / median) * 100);
}

/** Загружает и парсит Quantiles_long_29n.csv. */
export async function fetchQuantiles(): Promise<QuantileRow[]> {
  const res = await fetch("/Quantiles_long_29n.csv");
  if (!res.ok) return [];
  const text = await res.text();
  return parseQuantilesCsv(text);
}

// --- Gender-specific p0–p100 format (men/women CSV from backend) ---

const IRON_CODE_MEN = "predBI";
const IRON_CODE_WOMEN = "BODY_IRON";

export interface QuantilesByGenderResult {
  labRows: QuantileRow[];
  ironByAge: Partial<Record<AgeGroup, number[]>>;
}

/**
 * Строит маппинг перцентиль 0…100 → индекс колонки по заголовку.
 * При дубликатах (p28, p56 в мужском файле) берётся первое вхождение.
 * Если какой-то p отсутствует (напр. p29), используется индекс предыдущего.
 */
function buildP100ColumnMap(header: string[]): number[] | null {
  const map: number[] = [];
  for (let i = 0; i < header.length; i++) {
    const m = header[i].trim().match(/^p(\d+)$/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p >= 0 && p <= 100 && map[p] === undefined) map[p] = i;
    }
  }
  for (let p = 0; p <= 100; p++) {
    if (map[p] === undefined) map[p] = p === 0 ? 0 : map[p - 1];
  }
  return map;
}

/**
 * Парсит CSV с колонками p0…p100 (мужской или женский формат).
 * Возвращает labRows для лабораторных показателей и ironByAge для железа (predBI/BODY_IRON).
 */
export function parseQuantilesCsvByGender(
  csvText: string,
  gender: "men" | "women"
): QuantilesByGenderResult {
  const labRows: QuantileRow[] = [];
  const ironByAge: Partial<Record<AgeGroup, number[]>> = {};
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { labRows, ironByAge };

  const header = lines[0].split(",").map((h) => h.trim());
  const isMen = header.some((h) => h === "Возрастная группа" || h.includes("озраст"));
  const ageCol = isMen
    ? header.findIndex((h) => h === "Возрастная группа" || h.includes("озраст"))
    : header.findIndex((h) => h === "age_group");
  const codeCol = isMen
    ? header.findIndex((h) => h === "Показатель (код)")
    : header.findIndex((h) => h === "feature_code");
  const nCol = header.findIndex((h) => h === "n");
  const p100Cols = buildP100ColumnMap(header);

  if (ageCol < 0 || codeCol < 0 || nCol < 0 || !p100Cols) return { labRows, ironByAge };

  const ironCode = gender === "men" ? IRON_CODE_MEN : IRON_CODE_WOMEN;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const ageGroup = (parts[ageCol]?.trim() ?? "") as AgeGroup;
    const code = parts[codeCol]?.trim() ?? "";
    const n = parseNum(parts[nCol] ?? "0");
    const pValues: number[] = [];
    for (let p = 0; p <= 100; p++) pValues.push(parseNum(parts[p100Cols[p]] ?? "0"));

    if (code === ironCode) {
      if (AGE_GROUPS.includes(ageGroup)) ironByAge[ageGroup] = pValues;
      continue;
    }

    const q10 = pValues[10];
    const q20 = pValues[20];
    const q30 = pValues[30];
    const q40 = pValues[40];
    const q50 = pValues[50];
    const q60 = pValues[60];
    const q70 = pValues[70];
    const q80 = pValues[80];
    const q90 = pValues[90];
    labRows.push({
      ageGroup,
      code,
      n,
      q10,
      q20,
      q30,
      q40,
      q50,
      q60,
      q70,
      q80,
      q90,
      p0toP100: pValues,
    });
  }
  return { labRows, ironByAge };
}

/**
 * Вычисляет перцентиль (0–100) по значению и массиву p0…p100 (линейная интерполяция).
 */
export function computePercentileFromP100(
  value: number,
  p0toP100: number[] | undefined
): number | null {
  if (!p0toP100 || p0toP100.length !== 101) return null;
  const p0 = p0toP100[0];
  const p100 = p0toP100[100];
  if (value <= p0) return 0;
  if (value >= p100) return 100;
  for (let i = 0; i < 100; i++) {
    const lo = p0toP100[i];
    const hi = p0toP100[i + 1];
    if (value >= lo && value <= hi) {
      const t = hi === lo ? 0 : (value - lo) / (hi - lo);
      return i + t;
    }
  }
  return 50;
}

/**
 * Возвращает типичный диапазон (p25–p75) в единицах приложения.
 * Используется для блока «Среди сверстников» (Sweet Spot).
 */
export function getTypicalRange(
  row: QuantileRow | null,
  appCode: string
): { p25: number; p75: number } | null {
  if (!row?.p0toP100 || row.p0toP100.length < 76) return null;
  return {
    p25: csvValueToApp(row.p0toP100[25], appCode),
    p75: csvValueToApp(row.p0toP100[75], appCode),
  };
}

/** Хардкод: CSV по полу лежат в public. */
const QUANTILES_CSV_MEN =
  "/Quantiles_long_29n_men_p0_p100_with_predBI.csv";
const QUANTILES_CSV_WOMEN =
  "/Quantiles_long_29n_women_p0_p100_with_trueBI.csv";

/**
 * Загружает перцентили по полу из public (хардкод путей).
 * gender: 1 = мужчины, 2 = женщины.
 */
export async function fetchQuantilesByGender(
  gender: 1 | 2
): Promise<QuantilesByGenderResult> {
  const path = gender === 1 ? "men" : "women";
  const url = gender === 1 ? QUANTILES_CSV_MEN : QUANTILES_CSV_WOMEN;
  const res = await fetch(url);
  if (!res.ok) return { labRows: [], ironByAge: {} };
  const text = await res.text();
  if (!text.trim()) return { labRows: [], ironByAge: {} };
  return parseQuantilesCsvByGender(text, path);
}
