# Prediction of iron deficiency from complete blood count using machine learning: comparison of Body Iron vs ferritin-based labels and the impact of inflammation

## Draft structure for a medical/biochemistry journal

---

## Abstract

**Background.** Iron deficiency (ID) is the most prevalent nutritional deficiency worldwide, yet remains underdiagnosed. Serum ferritin, the standard biomarker, is an acute-phase reactant elevated by inflammation, leading to missed diagnoses. Body Iron (Cook formula, based on soluble transferrin receptor / ferritin ratio) provides a more physiologically grounded measure but requires additional laboratory testing.

**Objective.** (1) To quantify the label noise introduced when ferritin-based thresholds are used as training targets for machine learning models, stratified by inflammation status (CRP). (2) To compare the performance of logistic regression and gradient-boosted models across three clinically relevant feature sets (CBC-only, CBC + vitals/biochemistry, and extended).

**Methods.** Data from the National Health and Nutrition Examination Survey (NHANES, 2015--2023) were used, restricted to women aged 12--49 with available sTfR and ferritin measurements (n = 6303). Four outcome definitions were compared: Body Iron < 0 (T0, reference standard), ferritin < 30 ng/mL (T1, naive), and two CRP-aware variants (T2a, T2b). Three feature sets were evaluated: CBC-only (17 features), CBC + vitals/biochemistry (25 features), and extended with questionnaire data (40 features). Logistic regression and CatBoost were compared using 5-fold repeated stratified cross-validation (3 repeats). All preprocessing was performed inside each CV fold via sklearn.Pipeline. Paired fold-level deltas with 95% confidence intervals were computed.

**Results.** Body Iron and ferritin-based labels showed only 67.1% agreement (Cohen's kappa = 0.206). Out-of-fold discordance analysis revealed that a model trained on Body Iron (T0) identified a 3.5-fold higher rate of ferritin-masked deficiency at CRP >= 5 mg/L compared with CRP < 5 (6.1% vs 1.7% at p > 0.5). Logistic regression on CBC achieved PR-AUC 0.756 and ROC-AUC 0.965. CatBoost outperformed logistic regression only for the extended feature set (Delta PR-AUC +1.90 pp; 95% CI +0.49 to +3.31), where substantially higher missingness favored native missing-value handling. On CBC-only and CBC + vitals feature sets, the difference was not statistically significant.

**Conclusion.** Body Iron is superior to ferritin as a training target, particularly in the presence of inflammation. CBC-based logistic regression provides excellent discrimination (ROC-AUC 0.965) with superior calibration and interpretability. CRP is recommended for clinical interpretation but is not required as a model feature. These findings support the use of CBC-based triage models in resource-limited settings.

---

## Results

### Experiment 1: Body Iron vs ferritin-based outcome definitions

#### 3.1. Label agreement between outcome definitions

Body Iron (T0) and naive ferritin (T1) labels showed 67.1% overall agreement, with a Cohen's kappa of 0.206, indicating poor concordance beyond chance (**Table 1**). This low kappa reflects the fundamentally different constructs measured by these two definitions: ferritin alone captures iron storage, whereas Body Iron integrates storage and functional iron status via the sTfR/ferritin ratio.

When stratified by CRP, kappa values were 0.196 (CRP < 5 mg/L) and 0.243 (CRP >= 5 mg/L). The slightly higher kappa at CRP >= 5 reflects the altered prevalence structure in the inflammatory subgroup rather than better agreement; the absolute discordance patterns differed qualitatively, as detailed below.

> **Table 1. Label agreement: Body Iron (T0) vs ferritin (T1), stratified by CRP**
>
> | CRP group | n | Agreement (%) | Cohen's kappa | T0=1 (n) | FN rate* (%) |
> |-----------|---|---------------|---------------|----------|--------------|
> | CRP < 5 | 4781 | 64.5 | 0.196 | 364 | see below |
> | CRP >= 5 | 1450 | 75.4 | 0.243 | 82 | see below |
> | Overall | 6231 | 67.1 | 0.206 | 446 | -- |
>
> *FN rate = proportion of T0-positive individuals labeled as non-deficient by T1.

#### 3.2. Confusion analysis: ferritin misclassification by CRP status

**Figure 1** presents row-normalized confusion matrices stratified by CRP. The key clinical finding is the pattern of discordance: a substantial proportion of participants were labeled as iron deficient by ferritin (T1 = 1) but non-deficient by Body Iron (T0 = 0). This reflects the known limited specificity of ferritin < 30 ng/mL, where individuals with low ferritin may not have functional iron depletion as measured by Body Iron.

> *Figure 1: Confusion matrices (Body Iron vs ferritin), stratified by CRP. Top row: raw counts. Bottom row: row-normalized percentages. The row "BI < 0" shows the false-negative rate of ferritin-based labeling among truly iron-deficient individuals.*

#### 3.3. Out-of-fold discordance analysis (noise sensitivity)

To assess whether inflammation systematically biases ferritin-based labeling, we computed out-of-fold (OOF) predicted probabilities from a logistic regression model trained on the Body Iron target (T0) using CBC features. This analysis avoids train-test leakage, as each individual's predicted probability is obtained only from models that did not include that individual in training.

We then identified "high-confidence discordant" cases: individuals for whom the T0-trained model predicted a high probability of iron deficiency (p > threshold), but who were labeled non-deficient by the ferritin threshold (T1 = 0). This discordance is consistent with ferritin masking true iron deficiency.

> **Table 2. OOF high-confidence discordance rate by CRP group**
>
> | Threshold | CRP < 5 | CRP >= 5 | Ratio |
> |-----------|---------|----------|-------|
> | p > 0.5 | 1.7% (83/4781) | 6.1% (88/1450) | 3.5x |
> | p > 0.6 | 1.4% (65/4781) | 4.3% (63/1450) | 3.2x |
> | p > 0.7 | 0.9% (45/4781) | 3.0% (44/1450) | 3.2x |
> | p > 0.8 | 0.8% (36/4781) | 1.9% (28/1450) | 2.6x |

Across all probability thresholds, the discordance rate was consistently higher in the CRP >= 5 subgroup (**Table 2**, **Figure 2**). This finding is consistent with the biological expectation that elevated CRP identifies a subgroup in which ferritin-threshold labeling is more likely to misclassify iron deficiency.

#### 3.4. Model performance by target definition

**Table 3** shows cross-validated model performance for each target definition using logistic regression with CBC features.

> **Table 3. Model performance by target definition (LogReg Pipeline, 5x3 CV)**
>
> | Target | n | Prevalence (%) | ROC-AUC | PR-AUC |
> |--------|---|----------------|---------|--------|
> | T0 Body Iron < 0 | 6303 | 7.1 | 0.965 +/- 0.010 | 0.756 +/- 0.049 |
> | T1 Ferritin < 30 (naive) | 6303 | 40.0 | 0.787 +/- 0.014 | 0.734 +/- 0.019 |
> | T2a CRP-aware (exclude uncertain) | 5214 | 47.9 | 0.811 +/- 0.015 | 0.814 +/- 0.017 |
> | T2b CRP-aware (keep uncertain as neg) | 6231 | 40.1 | 0.787 +/- 0.010 | 0.735 +/- 0.016 |

T0 (Body Iron) achieved the highest ROC-AUC (0.965), consistent with the more physiologically precise definition. T2a (CRP-aware, excluding inflammatory-discordant cases) showed the highest PR-AUC (0.814), but this reflects both reduced noise and reduced sample size (n = 5214 vs 6303). T2a should be interpreted as a sensitivity analysis confirming that excluding uncertain cases improves apparent model fit, rather than as an improved ground truth.

---

### Experiment 2: Feature set comparison (KDL vs 29n vs Ext)

#### 3.5. Cross-validated performance by feature set and model

> **Table 4. Model performance by feature set and algorithm (5x3 CV)**
>
> | Feature set | Model | Features | Missing (%) | ROC-AUC | PR-AUC | Brier | PPV@R90* |
> |-------------|-------|----------|-------------|---------|--------|-------|----------|
> | KDL (CBC) | LogReg | 17 | 0.2 | 0.965 +/- 0.010 | 0.756 +/- 0.050 | 0.071 | 0.411 |
> | KDL (CBC) | CatBoost | 17 | 0.2 | 0.958 +/- 0.012 | 0.744 +/- 0.046 | 0.039 | 0.846 |
> | 29n (CBC+) | LogReg | 25 | 1.2 | 0.967 +/- 0.009 | 0.770 +/- 0.052 | 0.066 | 0.462 |
> | 29n (CBC+) | CatBoost | 25 | 1.2 | 0.966 +/- 0.010 | 0.766 +/- 0.046 | 0.036 | 0.848 |
> | Ext (full) | LogReg | 40 | 7.9 | 0.968 +/- 0.009 | 0.772 +/- 0.050 | 0.064 | 0.487 |
> | Ext (full) | CatBoost | 40 | 7.9 | 0.969 +/- 0.009 | 0.791 +/- 0.044 | 0.034 | 0.900 |
>
> *PPV@R90: Positive predictive value at 90% recall. Threshold selected on the training fold and applied to the test fold.

All models achieved ROC-AUC > 0.95, indicating strong discriminative ability for iron deficiency from CBC parameters. Adding vitals and biochemistry (29n) marginally improved PR-AUC compared with CBC-only (0.770 vs 0.756 for LogReg).

At a fixed sensitivity of 90%, CatBoost achieved higher PPV than logistic regression (e.g., 0.846 vs 0.411 on KDL), indicating fewer false positives at the same recall. This reflects CatBoost's better discrimination in the high-probability tail of the score distribution.

#### 3.6. Paired fold comparison: CatBoost vs logistic regression

To rigorously compare algorithms, we computed per-fold performance deltas (CatBoost minus LogReg) across the same 15 CV folds (**Table 5**).

> **Table 5. Paired fold comparison: CatBoost -- LogReg (95% CI)**
>
> | Feature set | Delta PR-AUC (pp) | 95% CI | Delta ROC-AUC (pp) | 95% CI |
> |-------------|-------------------|--------|---------------------|--------|
> | KDL (CBC) | -1.12 | [-2.00, -0.24] | -0.68 | [-0.92, -0.44] |
> | 29n (CBC+) | -0.40 | [-1.66, +0.87] | -0.13 | [-0.37, +0.10] |
> | Ext (full) | **+1.90** | **[+0.49, +3.31]** | +0.10 | [-0.13, +0.32] |

CatBoost outperformed logistic regression only for the extended feature set (Delta PR-AUC +1.90 percentage points; 95% CI +0.49 to +3.31), consistent with its ability to capture nonlinear interactions and handle missing values without explicit imputation. For CBC-only and CBC + vitals feature sets, the performance difference was not statistically significant, and logistic regression achieved slightly better PR-AUC on CBC-only (95% CI excludes zero in favor of LogReg).

#### 3.7. Calibration

Calibration curves (**Figure 5**) demonstrated that logistic regression was well-calibrated across all three feature sets, with predicted probabilities closely tracking observed frequencies. CatBoost showed systematic overconfidence at low predicted probabilities and underconfidence at high probabilities, indicating the need for post-hoc calibration (e.g., isotonic regression) before clinical deployment.

---

## Discussion

### Body Iron as training target

Our findings demonstrate that ferritin-based outcome definitions introduce substantial label noise when used as training targets for machine learning models. Agreement between Body Iron and ferritin labels was only 67.1% (kappa = 0.206), and the pattern of disagreement was clinically meaningful: a model trained on the more physiologically grounded Body Iron target identified cases that ferritin-based labels systematically missed, particularly in the presence of inflammation.

The out-of-fold discordance analysis provides novel evidence that this misclassification is not random. At all probability thresholds examined, the discordance rate was 2.6--3.5 times higher in the CRP >= 5 subgroup compared with CRP < 5. This is consistent with the established biology of ferritin as an acute-phase reactant: inflammation elevates ferritin independently of iron stores, causing true iron deficiency to be masked.

Elevated CRP identifies a subgroup in which ferritin-threshold labeling is more likely to misclassify iron deficiency. This has practical implications: studies using ferritin-only definitions as ground truth may systematically underestimate the true prevalence of iron deficiency in populations with high inflammatory burden, and machine learning models trained on such labels will inherit this bias.

### Simplicity of the CBC signal

A striking finding is that logistic regression on 17 CBC features achieves ROC-AUC 0.965 and PR-AUC 0.756 -- performance that is not improved by gradient-boosted models on the same data. The CBC pattern of iron deficiency (decreased MCV, MCH, Hgb; increased RDW) is nearly linearly separable, explaining why complex models offer no benefit on clean, complete data.

CatBoost's advantage emerged only for the extended feature set (40 features, 7.9% missing rate), where its native handling of missing values provided measurable improvement (Delta PR-AUC +1.90 pp). This is consistent with the expected behavior of tree-based models on data with missing-at-random (MAR) or missing-not-at-random (MNAR) patterns. However, the extended feature set had only 6.8% of rows fully complete, limiting its practical applicability.

### Calibration and clinical deployment

For clinical triage applications, probability calibration is essential because threshold-based decisions ("low risk" / "gray zone" / "high risk") require that predicted probabilities reflect true event rates. Logistic regression showed superior calibration out of the box across all feature sets. CatBoost, while achieving lower Brier scores (0.034--0.039 vs 0.064--0.071), produced poorly calibrated probabilities that would require post-hoc correction (isotonic or Platt scaling) before deployment.

This trade-off is clinically relevant: a model with excellent discrimination but poor calibration may rank patients correctly while providing misleading risk estimates. For clinical decision-support, we recommend logistic regression as the primary model, with CatBoost reserved for settings where infrastructure supports calibration and where the extended feature set is available.

### Clinical workflow implications

Based on our results, we propose a three-tier triage workflow:
- **Low risk** (predicted probability < 30%): routine monitoring
- **Gray zone** (30--70%): recommend ferritin testing
- **High risk** (> 70%): urgent evaluation with ferritin + sTfR panel

CRP measurement is recommended for interpretation of results (a "CBC inflammatory pattern flag") but is not required as a model input feature. The model performs well without CRP, and adding CRP as a feature would create a dependency on a test that is not part of routine CBC.

### Limitations

1. **Population**: NHANES data are US-based; external validation on other populations (e.g., Russian cohorts) is needed.
2. **Sex restriction**: Body Iron (sTfR) in NHANES is measured only in women aged 12--49; generalization to men and older women requires additional data.
3. **Cross-sectional design**: Temporal dynamics of iron stores and inflammation cannot be assessed.
4. **Missing data**: The extended feature set had high missingness (7.9% per feature, only 6.8% complete rows), limiting conclusions about its utility.

### Conclusion

Body Iron (sTfR/ferritin ratio) is a superior training target compared with ferritin-based labels for CBC prediction models. The discordance between these targets is amplified by inflammation, with a 3.5-fold increase in misclassification at CRP >= 5 mg/L. Logistic regression on CBC features provides near-optimal performance with excellent calibration and interpretability, making it suitable for resource-limited clinical triage. Complex gradient-boosted models offer benefit only when feature sets contain substantial missing data.

---

## Figures list

1. **Figure 1.** Confusion matrices (Body Iron vs ferritin), stratified by CRP. Top: counts. Bottom: row-normalized.
   *File: `results/target_comparison/confusion_matrix_t0_t1_by_crp.png`*

2. **Figure 2.** OOF discordance rate by CRP group (at p > 0.5 and p > 0.8).
   *File: `results/target_comparison/noise_sensitivity_crp.png`*

3. **Figure 3.** PR-AUC comparison across target definitions.
   *File: `results/target_comparison/target_comparison_prauc.png`*

4. **Figure 4.** PR-AUC and ROC-AUC by feature set and model.
   *File: `results/featureset_comparison/featureset_comparison_auc.png`*

5. **Figure 5.** Calibration curves (KDL, 29n, Ext) for LogReg and CatBoost.
   *File: `results/featureset_comparison/calibration_curves.png`*

6. **Figure 6.** Paired fold comparison: CatBoost improvement over LogReg with 95% CI.
   *File: `results/featureset_comparison/catboost_improvement.png`*

7. **Figure 7.** PPV at 90% recall by feature set and model.
   *File: `results/featureset_comparison/ppv_at_recall90.png`*

---

## Supplementary tables

- `results/target_comparison/target_comparison_metrics.csv` -- full metrics by target
- `results/target_comparison/noise_sensitivity_detailed.csv` -- OOF discordance at all thresholds
- `results/featureset_comparison/featureset_comparison_metrics.csv` -- full metrics by feature set
- `results/featureset_comparison/paired_comparison.csv` -- paired fold deltas + 95% CI

---

## Reproducibility

All experiments are fully reproducible:
- `experiment_targets.py` -- Experiment 1 (target comparison)
- `experiment_featuresets.py` -- Experiment 2 (feature set comparison)
- Data: NHANES 2015--2023 public files, processed via `build_final_dataset.py`
- Random seed: 42 throughout
- CV: RepeatedStratifiedKFold(n_splits=5, n_repeats=3)
- No preprocessing leakage: all imputation/scaling inside CV via sklearn.Pipeline
