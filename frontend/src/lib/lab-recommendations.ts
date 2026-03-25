/**
 * Decision engine для блока «На что обратить внимание» в LabInfoPopover.
 * Контекст и комбинации показателей, без прямого диагноза.
 */

import type { RefRange } from "./ref-ranges";

const BORDERLINE_MARGIN = 0.05; // 5% от ширины референса — пограничная зона

function getRef(
  payload: Record<string, number | null | undefined>,
  ranges: Record<string, RefRange>,
  code: string
): RefRange | null {
  return ranges[code] ?? null;
}

function getValue(
  payload: Record<string, number | null | undefined>,
  code: string
): number | null {
  const v = payload[code];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function isBelowNormal(value: number, ref: RefRange): boolean {
  return value < ref.normalMin;
}

function isAboveNormal(value: number, ref: RefRange): boolean {
  return value > ref.normalMax;
}

function isBorderline(value: number, ref: RefRange): boolean {
  const width = ref.normalMax - ref.normalMin;
  const margin = width * BORDERLINE_MARGIN;
  return (
    (value >= ref.normalMin - margin && value < ref.normalMin) ||
    (value > ref.normalMax && value <= ref.normalMax + margin)
  );
}

function isLowOrBorderlineLow(
  value: number,
  ref: RefRange
): boolean {
  const width = ref.normalMax - ref.normalMin;
  const margin = width * BORDERLINE_MARGIN;
  return value < ref.normalMin + margin;
}

function isHighOrBorderlineHigh(
  value: number,
  ref: RefRange
): boolean {
  const width = ref.normalMax - ref.normalMin;
  const margin = width * BORDERLINE_MARGIN;
  return value > ref.normalMax - margin;
}

/**
 * Возвращает текст рекомендации для показателя по ключу и введённым данным.
 * Без прямых формулировок диагноза; контекст, комбинации, маршрут (что рассмотреть).
 */
export function getRecommendation(
  key: string,
  inputPayload: Record<string, number | null | undefined>,
  refRanges: Record<string, RefRange>
): string {
  const hgb = getValue(inputPayload, "LBXHGB");
  const mcv = getValue(inputPayload, "LBXMCVSI");
  const mch = getValue(inputPayload, "LBXMCHSI");
  const rdw = getValue(inputPayload, "LBXRDW");
  const rbc = getValue(inputPayload, "LBXRBCSI");
  const hct = getValue(inputPayload, "LBXHCT");

  const refHgb = getRef(inputPayload, refRanges, "LBXHGB");
  const refMcv = getRef(inputPayload, refRanges, "LBXMCVSI");
  const refMch = getRef(inputPayload, refRanges, "LBXMCHSI");
  const refRdw = getRef(inputPayload, refRanges, "LBXRDW");
  const refRbc = getRef(inputPayload, refRanges, "LBXRBCSI");
  const refHct = getRef(inputPayload, refRanges, "LBXHCT");

  const hgbLow = hgb !== null && refHgb && isLowOrBorderlineLow(hgb, refHgb);
  const mcvLow = mcv !== null && refMcv && isLowOrBorderlineLow(mcv, refMcv);
  const mchLow = mch !== null && refMch && isLowOrBorderlineLow(mch, refMch);
  const rdwHigh = rdw !== null && refRdw && isHighOrBorderlineHigh(rdw, refRdw);
  const rbcLow = rbc !== null && refRbc && isBelowNormal(rbc, refRbc);
  const hctLow = hct !== null && refHct && isLowOrBorderlineLow(hct, refHct);

  switch (key) {
    case "LBXHGB":
      if (hgbLow && mcvLow && rdwHigh) {
        return "В сочетании с низким MCV и повышенным RDW это может указывать на возможный дефицит железа. Рекомендуем сдать ферритин для уточнения.";
      }
      if (hgbLow && mcvLow) {
        return "Сниженный гемоглобин вместе с низким MCV часто встречается при дефиците железа. Имеет смысл обсудить с врачом сдачу ферритина.";
      }
      if (hgbLow) {
        return "Сниженный гемоглобин может иметь разные причины. Рекомендуем обсудить результат с врачом и при необходимости пройти дообследование.";
      }
      if (refHgb && hgb !== null && isBorderline(hgb, refHgb)) {
        return "Значение у нижней границы нормы. При наличии симптомов (слабость, головокружение) обсудите с врачом.";
      }
      return "Значение в пределах нормы. При вопросах обсудите с врачом.";

    case "LBXMCVSI":
      if (mcvLow && hgbLow && rdwHigh) {
        return "Низкий MCV в сочетании с низким гемоглобином и повышенным RDW может указывать на дефицит железа. Рекомендуем сдать ферритин.";
      }
      if (mcvLow) {
        return "Средний объём эритроцитов ниже нормы. В сочетании с другими показателями (Hb, RDW) врач может назначить дообследование, включая ферритин.";
      }
      if (refMcv && mcv !== null && isBorderline(mcv, refMcv)) {
        return "Значение у границы нормы. Имеет смысл учитывать в комплексе с гемоглобином и RDW.";
      }
      return "Значение в пределах нормы.";

    case "LBXMCHSI":
      if (mchLow && mcvLow) {
        return "Снижение MCH вместе с низким MCV может сопровождать дефицит железа. Рекомендуем обсудить с врачом и при необходимости сдать ферритин.";
      }
      if (mchLow) {
        return "Сниженное содержание гемоглобина в эритроците. Интерпретируется в комплексе с MCV и гемоглобином — обсудите с врачом.";
      }
      return "Значение в пределах нормы.";

    case "LBXRDW":
      if (rdwHigh && hgbLow && mcvLow) {
        return "Повышенный RDW вместе с низким гемоглобином и MCV часто встречается при железодефицитной анемии. Рекомендуем сдать ферритин.";
      }
      if (rdwHigh) {
        return "Повышенная ширина распределения эритроцитов. В сочетании с другими показателями врач может порекомендовать дообследование.";
      }
      return "Значение в пределах нормы.";

    case "LBXRBCSI":
      if (rbcLow && hgbLow) {
        return "Снижение эритроцитов и гемоглобина — обсудите с врачом. Может понадобиться дообследование (ферритин, витамин B12, фолиевая кислота).";
      }
      if (rbcLow) {
        return "Количество эритроцитов ниже нормы. Рекомендуем обсудить результат с врачом.";
      }
      return "Значение в пределах нормы.";

    case "LBXHCT":
      if (hctLow && hgbLow) {
        return "Сниженный гематокрит вместе с гемоглобином может указывать на анемию. Обсудите с врачом и при необходимости сдайте ферритин.";
      }
      if (hctLow) {
        return "Гематокрит ниже нормы. Интерпретируется вместе с гемоглобином и эритроцитами — обсудите с врачом.";
      }
      return "Значение в пределах нормы.";

    case "LBXWBCSI": {
      const wbc = getValue(inputPayload, "LBXWBCSI");
      const refWbc = getRef(inputPayload, refRanges, "LBXWBCSI");
      if (wbc !== null && refWbc) {
        if (isAboveNormal(wbc, refWbc)) {
          return "Повышенное количество лейкоцитов может указывать на воспаление, инфекцию или стресс. Рекомендуем обсудить с врачом при сохранении симптомов.";
        }
        if (isBelowNormal(wbc, refWbc)) {
          return "Снижение лейкоцитов может быть связано с вирусными инфекциями или угнетением иммунитета. Рекомендуем обсудить с врачом.";
        }
      }
      return "Значение в пределах нормы.";
    }

    case "LBXPLTSI": {
      const plt = getValue(inputPayload, "LBXPLTSI");
      const refPlt = getRef(inputPayload, refRanges, "LBXPLTSI");
      if (plt !== null && refPlt) {
        if (isAboveNormal(plt, refPlt)) {
          return "Повышенное количество тромбоцитов может встречаться при воспалении, дефиците железа или после нагрузки. Обсудите с врачом при значительном превышении.";
        }
        if (isBelowNormal(plt, refPlt)) {
          return "Снижение тромбоцитов может влиять на свёртываемость крови. Обсудите результат с врачом.";
        }
      }
      return "Значение в пределах нормы.";
    }

    case "LBXMPSI": {
      const mpv = getValue(inputPayload, "LBXMPSI");
      const refMpv = getRef(inputPayload, refRanges, "LBXMPSI");
      if (mpv !== null && refMpv && isAboveNormal(mpv, refMpv)) {
        return "Повышенный средний объём тромбоцитов может указывать на их повышенную активность. Интерпретируется в комплексе с числом тромбоцитов.";
      }
      return "Значение в пределах нормы.";
    }

    case "LBXSGL": {
      const gl = getValue(inputPayload, "LBXSGL");
      const refGl = getRef(inputPayload, refRanges, "LBXSGL");
      if (gl !== null && refGl) {
        if (isAboveNormal(gl, refGl)) {
          return "Глюкоза выше нормы. При уровне 6.1–6.9 ммоль/л натощак говорят о преддиабете, выше 7.0 — возможен диабет. Рекомендуем обсудить с врачом и пересдать натощак.";
        }
        if (isBorderline(gl, refGl)) {
          return "Глюкоза у верхней границы нормы. Следите за питанием и при повторном повышении обсудите с врачом.";
        }
      }
      return "Значение в пределах нормы.";
    }

    case "LBXSCH": {
      const chol = getValue(inputPayload, "LBXSCH");
      const refChol = getRef(inputPayload, refRanges, "LBXSCH");
      if (chol !== null && refChol && isAboveNormal(chol, refChol)) {
        return "Повышенный холестерин — фактор риска сердечно-сосудистых заболеваний. Рекомендуем пересмотреть диету и обсудить с врачом необходимость дополнительного обследования (ЛПНП, ЛПВП, триглицериды).";
      }
      return "Значение в пределах нормы.";
    }

    case "BMXBMI": {
      const bmi = getValue(inputPayload, "BMXBMI");
      if (bmi !== null) {
        if (bmi >= 30) return "ИМТ соответствует ожирению. Это фактор риска ряда заболеваний. Рекомендуем обсудить с врачом коррекцию веса.";
        if (bmi >= 25) return "ИМТ соответствует избыточному весу. Умеренная физическая активность и сбалансированное питание помогут снизить риски.";
        if (bmi < 18.5) return "ИМТ ниже нормы. Низкая масса тела может быть связана с дефицитом питательных веществ, включая железо.";
      }
      return "Значение в пределах нормы.";
    }

    case "BP_SYS": {
      const sys = getValue(inputPayload, "BP_SYS");
      const refSys = getRef(inputPayload, refRanges, "BP_SYS");
      if (sys !== null && refSys) {
        if (sys >= 140) return "Систолическое давление ≥140 мм рт.ст. — артериальная гипертензия. Рекомендуем регулярный контроль и консультацию врача.";
        if (isAboveNormal(sys, refSys)) return "Давление повышено. Повторные измерения и снижение нагрузки/стресса помогут прояснить картину. При сохранении — обсудите с врачом.";
      }
      return "Значение в пределах нормы.";
    }

    case "BP_DIA": {
      const dia = getValue(inputPayload, "BP_DIA");
      const refDia = getRef(inputPayload, refRanges, "BP_DIA");
      if (dia !== null && refDia && isAboveNormal(dia, refDia)) {
        return "Диастолическое давление выше нормы. Рекомендуем повторные измерения и при сохранении — консультацию врача.";
      }
      return "Значение в пределах нормы.";
    }

    default:
      return "Обсудите результат с врачом при необходимости.";
  }
}
