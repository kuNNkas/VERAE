export const REQUIRED_BASE = ["LBXHGB", "LBXMCVSI", "LBXMCHSI", "LBXRDW", "LBXRBCSI", "LBXHCT", "RIDAGEYR"];
export const BMI_ALTERNATIVE = ["BMXBMI", "BMXHT", "BMXWT"];

export function computeProgress(values) {
  const doneBase = REQUIRED_BASE.filter((name) => values[name] !== "" && values[name] !== undefined).length;
  const hasBmi = values.BMXBMI !== "" && values.BMXBMI !== undefined;
  const hasHw =
    values.BMXHT !== "" && values.BMXHT !== undefined && values.BMXWT !== "" && values.BMXWT !== undefined;
  return doneBase + (hasBmi || hasHw ? 1 : 0);
}

export function computeMissingRequired(payload) {
  const missing = REQUIRED_BASE.filter((name) => payload[name] === undefined);
  const hasBmi = payload.BMXBMI !== undefined;
  const hasHw = payload.BMXHT !== undefined && payload.BMXWT !== undefined;
  if (!hasBmi && !hasHw) {
    missing.push("BMXBMI_or_BMXHT_BMXWT");
  }
  return missing;
}
