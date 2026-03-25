export type RefRange = {
  normalMin: number;
  normalMax: number;
  /** Опционально: жёсткие границы шкалы для отрисовки (по умолчанию выводятся из данных) */
  scaleMin?: number;
  scaleMax?: number;
};

/** Показатели без половых различий. */
const SHARED: Record<string, RefRange> = {
  LBXMCVSI: { normalMin: 80,   normalMax: 100,  scaleMin: 60,  scaleMax: 120 },
  // MCHC: 300–380 г/л (30–38 г/дл × 10)
  LBXMCHSI: { normalMin: 300,  normalMax: 380,  scaleMin: 260, scaleMax: 420 },
  LBXRDW:   { normalMin: 11.5, normalMax: 14.5, scaleMin: 10,  scaleMax: 20  },
  LBXWBCSI: { normalMin: 4,    normalMax: 10,   scaleMin: 2,   scaleMax: 15  },
  LBXPLTSI: { normalMin: 150,  normalMax: 400,  scaleMin: 100, scaleMax: 500 },
  LBXMPSI:  { normalMin: 9,    normalMax: 12,   scaleMin: 7,   scaleMax: 14  },
  LBXSGL:   { normalMin: 3.9,  normalMax: 6.1,  scaleMin: 2.5, scaleMax: 10  },
  LBXSCH:   { normalMin: 3.0,  normalMax: 5.2,  scaleMin: 2,   scaleMax: 8   },
  BP_SYS:   { normalMin: 90,   normalMax: 120,  scaleMin: 80,  scaleMax: 160 },
  BP_DIA:   { normalMin: 60,   normalMax: 80,   scaleMin: 50,  scaleMax: 100 },
};

/** Мужские референсы (Hb г/л, RBC ×10¹²/л, Hct %). */
const MEN: Record<string, RefRange> = {
  LBXHGB:   { normalMin: 130, normalMax: 170, scaleMin: 90,  scaleMax: 200 },
  LBXRBCSI: { normalMin: 4.0, normalMax: 5.0, scaleMin: 3,   scaleMax: 7   },
  LBXHCT:   { normalMin: 40,  normalMax: 48,  scaleMin: 28,  scaleMax: 60  },
};

/** Женские референсы. */
const WOMEN: Record<string, RefRange> = {
  LBXHGB:   { normalMin: 120, normalMax: 160, scaleMin: 80,  scaleMax: 190 },
  LBXRBCSI: { normalMin: 3.9, normalMax: 4.7, scaleMin: 3,   scaleMax: 6.5 },
  LBXHCT:   { normalMin: 36,  normalMax: 42,  scaleMin: 24,  scaleMax: 56  },
};

/**
 * ИМТ-референс с учётом возраста и пола.
 * Взрослые (≥18): 18.5–24.9 (оба пола).
 * Подростки 12–14 и 15–17: возрастные нормы ВОЗ/Росстат.
 */
function bmiRange(gender: 1 | 2, age: number | undefined): RefRange {
  if (age == null || age >= 18) {
    return { normalMin: 18.5, normalMax: 24.9, scaleMin: 15, scaleMax: 40 };
  }
  const m = gender === 1;
  if (age <= 14) {
    // Мальчики 12-14: 17.6–22.6 | Девочки 12-14: 17.7–23.5
    return m
      ? { normalMin: 17.6, normalMax: 22.6, scaleMin: 12, scaleMax: 34 }
      : { normalMin: 17.7, normalMax: 23.5, scaleMin: 12, scaleMax: 34 };
  }
  // Мальчики 15-17: 18.6–24.8 | Девочки 15-17: 19.2–24.9
  return m
    ? { normalMin: 18.6, normalMax: 24.8, scaleMin: 13, scaleMax: 37 }
    : { normalMin: 19.2, normalMax: 24.9, scaleMin: 13, scaleMax: 37 };
}

/**
 * Гендерно- и возрастно-зависимые референсные диапазоны.
 * gender: 1 = мужчины, 2 = женщины.
 */
export function getRefRanges(
  gender: 1 | 2,
  ageYears?: number
): Record<string, RefRange> {
  return {
    ...SHARED,
    ...(gender === 1 ? MEN : WOMEN),
    BMXBMI: bmiRange(gender, ageYears),
  };
}

/**
 * Усреднённый набор — оставлен для обратной совместимости
 * (используется там, где пол ещё не известен).
 */
export const REF_RANGES: Record<string, RefRange> = {
  ...SHARED,
  LBXHGB:   { normalMin: 120, normalMax: 170, scaleMin: 80,  scaleMax: 200 },
  LBXRBCSI: { normalMin: 3.9, normalMax: 5.0, scaleMin: 3,   scaleMax: 7   },
  LBXHCT:   { normalMin: 36,  normalMax: 48,  scaleMin: 24,  scaleMax: 60  },
  BMXBMI:   { normalMin: 18.5, normalMax: 24.9, scaleMin: 15, scaleMax: 40 },
};
