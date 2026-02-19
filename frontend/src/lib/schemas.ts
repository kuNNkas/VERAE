import { z } from "zod";

const numField = z.coerce.number().finite().optional();

export const REQUIRED_BASE = ["LBXHGB", "LBXMCVSI", "LBXMCHSI", "LBXRDW", "LBXRBCSI", "LBXHCT", "RIDAGEYR"] as const;
export const BMI_ALTERNATIVE = ["BMXBMI", "BMXHT", "BMXWT"] as const;

export const RECOMMENDED = [
  "LBXWBCSI", "LBXLYPCT", "LBXMOPCT", "LBXNEPCT", "LBXEOPCT", "LBXBAPCT",
  "LBXPLTSI", "LBXMPSI", "RIAGENDR", "LBXSGL", "LBXSCH", "BMXWAIST", "BP_SYS", "BP_DIA",
] as const;

export const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
});

export const registerSchema = loginSchema;

export const labFormSchema = z
  .object({
    LBXHGB: numField,
    LBXMCVSI: numField,
    LBXMCHSI: numField,
    LBXRDW: numField,
    LBXRBCSI: numField,
    LBXHCT: numField,
    RIDAGEYR: numField,
    BMXBMI: numField,
    BMXHT: numField,
    BMXWT: numField,
    LBXWBCSI: numField,
    LBXLYPCT: numField,
    LBXMOPCT: numField,
    LBXNEPCT: numField,
    LBXEOPCT: numField,
    LBXBAPCT: numField,
    LBXPLTSI: numField,
    LBXMPSI: numField,
    RIAGENDR: numField,
    LBXSGL: numField,
    LBXSCH: numField,
    BMXWAIST: numField,
    BP_SYS: numField,
    BP_DIA: numField,
  })
  .superRefine((data, ctx) => {
    for (const key of REQUIRED_BASE) {
      if (data[key] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Обязательное поле",
          path: [key],
        });
      }
    }

    const hasBmi = data.BMXBMI != null;
    const hasHeightWeight = data.BMXHT != null && data.BMXWT != null;
    if (!hasBmi && !hasHeightWeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите BMXBMI или пару BMXHT+BMXWT",
        path: ["BMXBMI"],
      });
      if (data.BMXHT == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Укажите BMXHT или BMXBMI",
          path: ["BMXHT"],
        });
      }
      if (data.BMXWT == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Укажите BMXWT или BMXBMI",
          path: ["BMXWT"],
        });
      }
    }
  });

export type LabFormValues = z.infer<typeof labFormSchema>;

export const FIELD_META: Record<string, { label: string; unit: string; hint?: string }> = {
  LBXHGB:   { label: "Гемоглобин (Hb)",                       unit: "г/л",       hint: "как в бланке, напр. 130" },
  LBXMCVSI: { label: "Средний объём эритроцита (MCV)",         unit: "фл" },
  LBXMCHSI: { label: "Концентрация гемоглобина в эритроцитах (MCHC)", unit: "г/л", hint: "как в бланке, напр. 340" },
  LBXRDW:   { label: "Ширина распределения эритроцитов (RDW)", unit: "%" },
  LBXRBCSI: { label: "Эритроциты (RBC)",                       unit: "×10¹²/л" },
  LBXHCT:   { label: "Гематокрит (Hct)",                       unit: "%" },
  RIDAGEYR: { label: "Возраст",                                unit: "лет" },
  BMXBMI:   { label: "ИМТ",                                   unit: "кг/м²" },
  BMXHT:    { label: "Рост",                                  unit: "см" },
  BMXWT:    { label: "Вес",                                   unit: "кг" },
  LBXWBCSI: { label: "Лейкоциты (WBC)",                        unit: "×10⁹/л" },
  LBXLYPCT: { label: "Лимфоциты",                             unit: "%" },
  LBXMOPCT: { label: "Моноциты",                              unit: "%" },
  LBXNEPCT: { label: "Нейтрофилы",                            unit: "%" },
  LBXEOPCT: { label: "Эозинофилы",                            unit: "%" },
  LBXBAPCT: { label: "Базофилы",                              unit: "%" },
  LBXPLTSI: { label: "Тромбоциты (PLT)",                       unit: "×10⁹/л" },
  LBXMPSI:  { label: "Средний объём тромбоцита (MPV)",         unit: "фл" },
  RIAGENDR: { label: "Пол",                                   unit: "1=муж., 2=жен." },
  LBXSGL:   { label: "Глюкоза",                               unit: "ммоль/л",   hint: "как в бланке, напр. 5.5" },
  LBXSCH:   { label: "Холестерин общий",                      unit: "ммоль/л",   hint: "как в бланке, напр. 5.0" },
  BMXWAIST: { label: "Окружность талии",                      unit: "см" },
  BP_SYS:   { label: "АД систолическое",                      unit: "мм рт.ст." },
  BP_DIA:   { label: "АД диастолическое",                     unit: "мм рт.ст." },
};
