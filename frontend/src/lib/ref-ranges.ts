/**
 * Референсные диапазоны для показателей ОАК (упрощённо, взрослые).
 * Используются для цветовых зон на странице результата.
 * normalMin/normalMax — зелёная зона; ниже/выше — жёлтый или красный.
 */
export type RefRange = {
  normalMin: number;
  normalMax: number;
  /** Опционально: жёсткие границы шкалы для отрисовки (по умолчанию выводятся из данных) */
  scaleMin?: number;
  scaleMax?: number;
};

export const REF_RANGES: Record<string, RefRange> = {
  LBXHGB:   { normalMin: 120, normalMax: 160, scaleMin: 80, scaleMax: 180 },
  LBXMCVSI: { normalMin: 80,  normalMax: 100, scaleMin: 60, scaleMax: 120 },
  LBXMCHSI: { normalMin: 320, normalMax: 360, scaleMin: 280, scaleMax: 380 },
  LBXRDW:   { normalMin: 11.5, normalMax: 14.5, scaleMin: 10, scaleMax: 20 },
  LBXRBCSI: { normalMin: 4.0,  normalMax: 5.5, scaleMin: 3, scaleMax: 7 },
  LBXHCT:   { normalMin: 36,   normalMax: 48, scaleMin: 28, scaleMax: 54 },
  LBXWBCSI: { normalMin: 4,    normalMax: 10, scaleMin: 2, scaleMax: 15 },
  LBXPLTSI: { normalMin: 150,  normalMax: 400, scaleMin: 100, scaleMax: 500 },
  LBXMPSI:  { normalMin: 9,    normalMax: 12, scaleMin: 7, scaleMax: 14 },
  LBXSGL:   { normalMin: 3.9,  normalMax: 6.1, scaleMin: 2.5, scaleMax: 10 },
  LBXSCH:   { normalMin: 3.0,  normalMax: 5.2, scaleMin: 2, scaleMax: 8 },
  BMXBMI:   { normalMin: 18.5, normalMax: 25, scaleMin: 15, scaleMax: 40 },
  BP_SYS:   { normalMin: 90,   normalMax: 120, scaleMin: 80, scaleMax: 160 },
  BP_DIA:   { normalMin: 60,   normalMax: 80, scaleMin: 50, scaleMax: 100 },
};
