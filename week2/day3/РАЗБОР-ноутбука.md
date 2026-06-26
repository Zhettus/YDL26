# 📓 Разбор ноутбука `lab-day8-zh.ipynb` — по ячейкам

> **Задача проекта:** дан датасет семян пшеницы (`seeds_dataset.txt`) без целевого столбца.
> Настоящий сорт спрятан. Нужно: найти группы кластеризацией → превратить их в метку →
> проверить, предсказуема ли метка → честно оценить, реальные ли это группы.
> Принцип: **«не верь — проверь»**.

**Цепочка всей работы:**

```
EDA (0–20) → KMeans + выбор k (21–29) → имена кластерам (30–38)
          → PCA-визуализация (39–47) → классификатор + сверка с сортом (48–57)
```

Без учителя нашли структуру → с учителем доказали, что она реальна.

---

## 🌾 ШАГ 1 — Разведка данных (EDA) · ячейки 0–20

| Ячейка | Что делает |
|---|---|
| **0 [MD]** | Заголовок и легенда: что за датасет, что сорт прячем, принцип «не верь — проверь». |

**CELL 1 [CODE] — импорты и настройка**
```python
import numpy as np, pandas as pd, matplotlib.pyplot as plt, seaborn as sns
from sklearn.preprocessing import StandardScaler
sns.set_theme(...)               # единый стиль графиков
plt.rcParams["figure.dpi"] = 110 # чёткость картинок
pd.set_option("display.float_format", ...)  # числа с 3 знаками
```
Подключаю библиотеки: **numpy** (математика), **pandas** (таблицы), **matplotlib/seaborn** (графики), **sklearn** (ML). Остальное — косметика для опрятного вывода.

**CELL 2 [MD]** — Пояснение: файл без заголовка, поэтому имена колонок задаём вручную.

**CELL 3 [CODE] — загрузка данных**
```python
columns = [...7 признаков + variety...]
df = pd.read_csv("seeds_dataset.txt", sep=r"\s+", names=columns)
features = columns[:-1]   # 7 признаков
X = df[features]          # только геометрия
y = df["variety"]         # спрятанный сорт
```
`sep=r"\s+"` = разделитель «любые пробелы». Сразу делю данные: `X` — признаки, `y` — настоящий сорт, который **откладываем** и не трогаем до конца.

**CELL 4 [MD]** — Заголовок «Размер, типы, статистика».

**CELL 5 [CODE] — размер данных**
```python
df.shape[0]        # 210 объектов
y.nunique()        # 3 сорта
y.value_counts()   # по 70 — сбалансировано
df.dtypes          # типы столбцов
```
Базовая инвентаризация: сколько зёрен, сколько сортов, все ли числовые.

**CELL 6 [CODE]** — `X.describe().T` — таблица статистики (среднее, std, min, max, квартили) по каждому признаку.

**CELL 7 [MD]** — Заголовок «Пропуски и дубликаты».

**CELL 8 [CODE] — чистота данных**
```python
df.isnull().sum()      # пропусков по столбцам → 0
df.duplicated().sum()  # повторов строк → 0
```
Убеждаемся, что чинить нечего: **0 пропусков, 0 дубликатов**.

**CELL 9 [MD]** — Зачем смотреть масштабы и почему важен StandardScaler.

**CELL 10 [CODE] — проверка масштабов**
```python
scale_check = pd.DataFrame({"min", "max", "std", "max/min"}).sort_values("std")
ratio = X.std().max() / X.std().min()
```
Считаю разброс каждого признака. Вывод: std различается в **~120 раз** → признак `area` задавит остальные, если не масштабировать. Это обоснование шага 8.

**CELL 11 [MD]** — Заголовок «Распределения».

**CELL 12 [CODE] — гистограммы**
```python
fig, axes = plt.subplots(2, 4)              # сетка 2×4
for ax, col in zip(axes.flat, features):
    sns.histplot(X[col], kde=True, ax=ax)   # гистограмма + плавная кривая
axes.flat[-1].axis("off")                   # 8-ю пустую клетку прячем
```
Распределение каждого из 7 признаков — смотрю форму (одногорбая / скошенная).

**CELL 13 [MD]** — Заголовок «Выбросы», объяснение boxplot.

**CELL 14 [CODE] — выбросы**
```python
X_std_preview = StandardScaler().fit_transform(X)  # стандартизуем для сравнения
sns.boxplot(...)                                    # ящики с усами
outliers = ((X < Q1-1.5*IQR) | (X > Q3+1.5*IQR)).sum()
```
Boxplot на одной шкале + численный подсчёт. **IQR** = межквартильный размах; точки за 1.5·IQR — кандидаты в выбросы.

**CELL 15 [MD]** — Заголовок «Корреляции».

**CELL 16 [CODE] — матрица корреляций**
```python
corr = X.corr()
mask = np.triu(...)    # прячем зеркальный верхний треугольник
sns.heatmap(corr, annot=True, cmap="coolwarm", vmin=-1, vmax=1)
```
Тепловая карта связей. Видно: `area ↔ perimeter = 0.99` (дублируют друг друга). Сорт `variety` намеренно **не включаю** — он спрятан.

**CELL 17 [MD]** — Объяснение StandardScaler (вычесть среднее, поделить на std).

**CELL 18 [CODE] — масштабирование ⭐ (ключевая ячейка)**
```python
scaler = StandardScaler()
X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=features)
# проверка: mean≈0, std≈1; boxplot ДО и ПОСЛЕ
```
Создаю `X_scaled` — все признаки приведены к среднему 0 и std 1. **Именно `X_scaled` идёт во все дальнейшие шаги** (KMeans, PCA).

**CELL 19 [MD]** — 💡 Находка для выступления: `area` и `perimeter` = 0.994; 7 признаков → ~2–3 оси.

**CELL 20 [CODE] — доказательство находки**
```python
X.corr().loc["area","perimeter"]   # 0.994
# топ-5 сильнейших связей; корреляции asymmetry ≈ 0 (уникален)
```
Подтверждаю числами: размерные признаки дублируют друг друга, `asymmetry` стоит особняком.

---

## 🔍 ШАГ 2 — Кластеризация KMeans · ячейки 21–29

**CELL 21 [MD]** — Заголовок: ищем структуру без меток, k не угадываем.

**CELL 22 [CODE] — перебор k и метрики**
```python
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
for k in range(2, 9):
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = km.fit_predict(X_scaled)
    rows.append({k, km.inertia_, silhouette_score(...)})
scores["inertia_drop"] = -scores["inertia"].diff()
```
Прогоняю KMeans для k=2…8. Для каждого считаю **inertia** (плотность кластеров) и **силуэт** (чёткость разделения). `n_init=10` — 10 разных стартов; `random_state=42` — воспроизводимость.

**CELL 23 [MD]** — Заголовок «локоть + силуэт».

**CELL 24 [CODE] — графики выбора k**
```python
fig, (a1, a2) = plt.subplots(1, 2)
a1.plot(scores.index, scores["inertia"])     # метод локтя
a1.annotate("излом на k=3")
a2.plot(scores.index, scores["silhouette"])  # силуэт
a2.annotate("максимум на k=2")
```
Слева локоть (где «ломается» inertia), справа силуэт (где максимум). Стрелки подписывают ключевые точки.

**CELL 25 [MD]** — Почему метрики спорят (локоть → 3, силуэт → 2) и почему выбираем **k=3**.

**CELL 26 [CODE] — финальная кластеризация ⭐**
```python
K = 3
kmeans = KMeans(n_clusters=K, n_init=10, random_state=42)
df["cluster"] = kmeans.fit_predict(X_scaled)
```
Фиксирую k=3, обучаю KMeans, **создаю столбец `cluster`** — новая метка (0/1/2).

**CELL 27 [MD]** — Заголовок: смотрим кластеры через PCA.

**CELL 28 [CODE] — первая PCA-визуализация**
```python
from sklearn.decomposition import PCA
pcs = PCA(2).fit_transform(X_scaled)
df["pc1"], df["pc2"] = pcs[:,0], pcs[:,1]
sns.scatterplot(x="pc1", y="pc2", hue="cluster")
```
Сжимаю в 2D и крашу по кластеру — первый взгляд на форму групп (подробный PCA — в шаге 4).

**CELL 29 [MD]** — Промежуточный вывод: 3 кластера ~равного размера, два перекрываются.

---

## 🏷️ ШАГ 3 — Превращаем кластеры в осмысленную метку · ячейки 30–38

**CELL 30 [MD]** — Заголовок: номера кластеров = сконструированная метка.

**CELL 31 [MD]** — Объяснение профилей (исходные единицы vs z-score).

**CELL 32 [CODE] — профиль кластеров**
```python
profile_raw = df.groupby("cluster")[features].mean()       # средние в мм
profile_z   = (X_scaled).groupby("cluster").mean()         # средние в z-score
```
«Портрет» каждого кластера: средние признаки. В **z-score** видно, на сколько группа выше/ниже общего среднего (+ выше, − ниже).

**CELL 33 [CODE] — тепловая карта профилей**
```python
sns.heatmap(profile_z, annot=True, cmap="RdBu_r", center=0)
```
Красное = выше среднего, синее = ниже. Паттерн каждого кластера виден мгновенно.

**CELL 34 [MD]** — Чтение профилей и имена: «Мелкие кривые» / «Крупные ровные» / «Средние симметричные».

**CELL 35 [CODE] — закрепление имён ⭐**
```python
cluster_names = {0:"Мелкие кривые", 1:"Крупные ровные", 2:"Средние симметричные"}
df["segment"] = df["cluster"].map(cluster_names)
```
`.map()` заменяет номера на имена → новый столбец `segment` (человекочитаемая метка).

**CELL 36 [MD]** — Заголовок: имена на PCA-картинке.

**CELL 37 [CODE] — PCA с именами**
```python
sns.scatterplot(x="pc1", y="pc2", hue="segment")
```
Та же диаграмма, но в легенде имена вместо номеров.

**CELL 38 [MD]** — Итог шага 3: сами создали цель, имена объясняют отличия.

---

## 🗺️ ШАГ 4 — PCA (снижение размерности) · ячейки 39–47

**CELL 39 [MD]** — Заголовок: сжимаем 7→2; ключевой вопрос про долю дисперсии.

**CELL 40 [MD]** — Объяснение «сколько информации удерживают компоненты».

**CELL 41 [CODE] — доля дисперсии**
```python
pca_full = PCA().fit(X_scaled)            # все 7 компонент
evr = pca_full.explained_variance_ratio_  # доля каждой
var_table = ... np.cumsum(evr)            # накопленная
kept = evr[:2].sum()                      # PC1+PC2 = 0.89
```
Сколько разброса держит каждая компонента. Результат: **2 оси = 89%**.

**CELL 42 [CODE] — scree plot**
```python
ax.bar(xs, evr)               # столбики — доля каждой
ax.plot(xs, np.cumsum(evr))   # линия — накопленная
```
График «осыпи»: PC1 огромный, хвост пустой.

**CELL 43 [MD]** — Заголовок: объекты на плоскости.

**CELL 44 [CODE] — главный scatter ⭐**
```python
pca = PCA(n_components=2)
coords = pca.fit_transform(X_scaled)   # каждое зерно → 2 координаты
df["pc1"], df["pc2"] = coords[:,0], coords[:,1]
sns.scatterplot(x="pc1", y="pc2", hue="segment")
```
Перевожу зёрна в 2 компоненты и рисую, крашу по метке. На осях — доля дисперсии.

**CELL 45 [MD]** — Объяснение загрузок (PC1 = размер, PC2 = форма).

**CELL 46 [CODE] — загрузки (loadings)**
```python
loadings = pd.DataFrame(pca.components_.T, columns=["PC1","PC2"], index=features)
sns.heatmap(loadings, annot=True, cmap="RdBu_r", center=0)
```
Вклад каждого признака в оси: **PC1 = все размерные (~0.4)**, **PC2 = asymmetry (+0.72)**. Доказывает «7 признаков → 2 смысла».

**CELL 47 [MD]** — Вывод шага 4: **89% → картинка честная**; один кластер чистый, два налезают.

---

## ✅ ШАГ 5 — Проверка классификатором + сверка с сортом · ячейки 48–57

**CELL 48 [MD]** — Заголовок: проверяем, что метка не случайна.

**CELL 49 [MD]** — Объяснение train/test split и stratify.

**CELL 50 [CODE] — обучение модели**
```python
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
y_label = df["cluster"]                          # предсказываем НАШУ метку
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y_label, test_size=0.30, stratify=y_label)
logreg = LogisticRegression(max_iter=1000).fit(X_train, y_train)
y_pred = logreg.predict(X_test)
```
Делю 70/30, учу логистическую регрессию предсказывать `cluster`. `stratify` сохраняет пропорции групп.

**CELL 51 [MD]** — Объяснение метрик (accuracy, precision, recall, F1, macro).

**CELL 52 [CODE] — метрики ⭐**
```python
acc = accuracy_score(y_test, y_pred)                  # 0.968
prec, rec, f1, _ = precision_recall_fscore_support(..., average="macro")
print(classification_report(...))                     # по каждой группе
```
Качество: **accuracy 0.968, F1 0.969** + детальный отчёт по группам.

**CELL 53 [CODE] — матрица ошибок**
```python
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(cm, annot=True, fmt="d")
```
Что с чем путается: диагональ = верно, вне диагонали = ошибки.

**CELL 54 [MD]** — Заголовок: достаём настоящий сорт.

**CELL 55 [CODE] — таблица соответствия**
```python
variety_names = {1:"Kama", 2:"Rosa", 3:"Canadian"}
df["variety_name"] = df["variety"].map(variety_names)
match = pd.crosstab(df["segment"], df["variety_name"])  # кластер vs сорт
sns.heatmap(match, annot=True)
```
**Только теперь** открываю спрятанный сорт и строю кросс-таблицу.

**CELL 56 [CODE] — подсчёт совпадения ⭐**
```python
mapping = match.idxmax(axis=1)        # каждый кластер → преобладающий сорт
correct = sum(match.loc[seg, var] ...) # сколько совпало
# 193/210 = 91.9%, ошибка 8.1%
```
Сопоставляю кластеры сортам: **91.9% совпало, 8.1% — честная ошибка**.

**CELL 57 [MD]** — Итоговый вывод: метрики, таблица сортов, 92% совпадения, 8% — граница метода.

---

## 🎯 Итоговые числа (для выступления)

| Что | Результат |
|---|---|
| Объектов / признаков | 210 / 7 (+ спрятанный сорт) |
| Пропуски / дубликаты | 0 / 0 |
| Разброс масштабов (std) | до ~120× → нужен StandardScaler |
| Сильнейшая корреляция | `area ↔ perimeter` = **0.994** |
| Выбрано кластеров | **k = 3** (локоть; силуэт спорил за 2) |
| Дисперсия в PCA (PC1+PC2) | **89%** → картинка честная |
| Качество классификатора | **Accuracy 0.968 · F1 0.969** |
| Совпадение с реальным сортом | **91.9%** (193/210) |
| Ошибка кластеризации | **8.1%** (17 зёрен) |

**Главный вывод:** сорт при кластеризации не использовали, но группы почти точно его повторили →
геометрия зерна несёт информацию о сорте. Но ~8% зёрен (в основном **Kama ↔ Canadian**) попали
не в свой кластер — геометрии **не всегда достаточно**. Группы осмысленные, но не идеальные.
