# Sleep-Stage Classification — Project Summary

Predict the **sleep stage** (`sleep_stage` ∈ {0,1,2,3}) for each 30-second epoch in an
unlabeled test set, given a labeled train set. All work lives in `hackathon.ipynb`
(81 cells: EDA → baseline modeling → tuning/ensembles).

| File | What it is |
|---|---|
| `hackathon.ipynb` | Full narrated notebook (EDA + modeling) |
| `train.csv` | 9,000 labeled epochs, 21 features + target |
| `final-check.csv` | 5,000 unlabeled epochs (the test set) |
| `submission.csv` | Baseline predictions (HistGradientBoosting, CV 0.817) |
| **`submission_v2.csv`** | **Final predictions — Stacking ensemble, CV 0.833 — submit this** |
| `hackathon_backup_152302.ipynb` | Backup of the original notebook |

---

## 1. The data

- **9,000 train / 5,000 test rows**, **21 numeric features**, target `sleep_stage`.
- Features are **polysomnography signals** in four families:
  - **EEG** (brain waves): delta/theta/alpha/sigma/beta/gamma power, slow-osc power,
    spectral entropy, spindle density, K-complex rate
  - **EMG** (muscle): chin tone, tone variance
  - **EOG** (eyes): movement density, amplitude, burst index
  - **Autonomic**: heart rate (mean & variability), respiration (rate & variability),
    SpO₂, body-movement index
- All features are **already standardized** (mean ≈ 0) but with **unequal variance**
  (std ≈ 1–5).

---

## 2. EDA — key findings & why they mattered

| Finding | Consequence for modeling |
|---|---|
| 21 numeric features, **no categoricals** | No encoding needed |
| Target = **4 balanced classes** (22–27%) | Multiclass; accuracy is fair, also track macro-F1; use **StratifiedKFold** |
| **`eog_burst_index` ~50% missing** in *both* train & test, yet highly predictive | **Impute (median) + add a missing-indicator flag**; do **not** drop |
| Features standardized but **unequal variance** | Scale for linear/KNN/SVM; trees don't need it |
| **No covariate shift** (train ≈ test; KS distances tiny) | Local CV score is **trustworthy** for the leaderboard |
| **No redundant feature pairs** (\|corr\| < 0.95) | Keep all 21 features |
| **Every feature significant** (ANOVA F); strongest: `heart_rate_variability`, `eog_movement_density`, `eeg_alpha_power`, `eog_burst_index` | Problem is highly learnable |
| Each stage has a **clean physiological fingerprint** | Labels are coherent & interpretable |
| Classes **separable even in 2D PCA** | Use full feature set; PCA for viz only |

### Per-stage physiological interpretation (hypothesis from signal profiles)
- **Stage 0 ≈ N2 (light sleep)** — highest spindle density **and** K-complex rate (the
  textbook N2 hallmark).
- **Stage 1 ≈ Wake / drowsy** — dominant alpha power, high muscle tone, high heart rate,
  lowest HRV.
- **Stage 2 ≈ REM** — highest EEG spectral entropy (desynchronized) + high eye-movement
  density + low spindles.
- **Stage 3 ≈ N3 (deep slow-wave sleep)** — high delta/sigma power, lowest muscle tone,
  low heart rate, high HRV.

> The Kaggle leaderboard score (~0.82) matched the local CV (0.817) almost exactly —
> confirming the "no covariate shift" finding.

---

## 3. Modeling pipeline

Driven directly by the EDA:
1. **Feature matrix** = 21 features + a binary `eog_burst_missing` flag.
2. **Native-NaN models** (HistGB, XGBoost, CatBoost) use the raw matrix.
   **Other models** (SVM, KNN, RF, ExtraTrees, AdaBoost, GradientBoosting) are wrapped in
   a `Pipeline` with **median imputation** (+ **StandardScaler** for distance/margin models).
3. **Evaluation** = 5-fold `StratifiedKFold`, scoring accuracy + macro-F1.
4. **Hyperparameter search** with `RandomizedSearchCV` / `GridSearchCV` (cheap inner
   3-fold), then every finalist re-scored on the **same outer 5-fold** for a fair
   comparison.

---

## 4. Results — 5-fold CV leaderboard

| Model | Accuracy | Macro-F1 | vs baseline |
|---|---|---|---|
| **Stacking (top-3)** 🥇 | **0.8328** | 0.8330 | **+0.0160** |
| Voting (soft, top-3) | 0.8326 | 0.8326 | +0.0158 |
| **SVM (tuned, RBF)** | 0.8308 | 0.8309 | +0.0140 |
| CatBoost (tuned) | 0.8220 | 0.8217 | +0.0052 |
| XGBoost (tuned) | 0.8200 | 0.8201 | +0.0032 |
| HistGB (tuned) | 0.8162 | 0.8163 | −0.0006 |
| ExtraTrees | 0.8006 | 0.7996 | −0.0162 |
| GradientBoosting | 0.7999 | 0.8000 | −0.0169 |
| RandomForest | 0.7972 | 0.7960 | −0.0196 |
| Bagging(DecisionTree) | 0.7896 | 0.7891 | −0.0272 |
| AdaBoost | 0.7880 | 0.7883 | −0.0288 |

**Baseline (HistGB, default) = 0.8168 → best (Stacking) = 0.8328, a +1.6-point gain.**

### Winning model
- **Stacking ensemble**: base learners = tuned **SVM + CatBoost + XGBoost**;
  meta-model = **Logistic Regression** trained on their out-of-fold predictions.
- Retrained on **all** training data → `submission_v2.csv`.
- Predicted class distribution (22.3 / 25.8 / 25.9 / 26.1%) matches the training set —
  a clean sanity check.

### Best hyperparameters found
- **SVM**: `C=1`, `gamma=0.05` (RBF) — *the single highest-value search.*
- **XGBoost**: `n_estimators=800`, `max_depth=6`, `learning_rate=0.02`, `subsample=0.7`,
  `colsample_bytree=1.0`, `reg_lambda=1.0`.
- **CatBoost**: `depth=8`, `learning_rate=0.1`, `l2_leaf_reg=1`, `iterations=400`.
- **HistGB**: `max_iter=1200`, `learning_rate=0.1`, `max_leaf_nodes=63`,
  `min_samples_leaf=20`, `l2_regularization=0.5`.

---

## 5. What worked, what didn't

- **Surprise:** a tuned **RBF-SVM beat every boosting model** on its own (0.831). The
  classes are smoothly, near-linearly separable in scaled space, which favours a
  large-margin classifier over trees — vindicating the choice to try multiple model
  *families*.
- **Stacking/Voting** won overall but only edged the best single model — the base models
  agree on most epochs, so error cancellation is limited.
- **Bagging & AdaBoost were the weakest** — useful for the bagging-vs-boosting contrast,
  but pure variance reduction doesn't help on data this clean.
- **Tuning mattered**: it lifted CatBoost/XGBoost above the baseline; the SVM grid search
  was the biggest lever.

---

## 6. Techniques used (course Week 2, Days 8–9)

EDA & stats · StandardScaler · SimpleImputer + missing-indicator · PCA ·
ANOVA feature ranking · StratifiedKFold cross-validation · Logistic Regression · KNN ·
SVM (GridSearchCV) · Decision Trees · Random Forest · ExtraTrees · **Bagging** ·
AdaBoost · Gradient Boosting · HistGradientBoosting · **XGBoost** · **CatBoost** ·
**Voting** & **Stacking** ensembles · RandomizedSearchCV / GridSearchCV ·
permutation importance · confusion matrix / classification report.

---

## 7. Next steps to push past 0.83

1. **Feature engineering** — EEG band ratios (e.g. delta/beta, theta/alpha) often carry
   sleep-stage signal beyond raw bands; a strong lever given the SVM's success.
2. **Richer stacking** — add KNN / LogReg as base learners; try a GBM meta-model.
3. **Probability calibration** + per-class threshold tuning if macro-F1 is the true metric.
4. **Temporal features** — if `id` encodes within-night epoch order, previous-epoch stage
   and rolling means would be very powerful (sleep stages are highly autocorrelated).
