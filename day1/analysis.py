import pandas as pd, numpy as np
from scipy import stats
pd.set_option('display.width',200); pd.set_option('display.max_columns',30)
F="/Users/zadyra/.cache/kagglehub/datasets/uciml/wall-following-robot/versions/1/sensor_readings_24.csv"

print("="*70); print("TASK A: AUDIT + HEADER CHECK"); print("="*70)
# --- WRONG way (notebook's default) ---
wrong = pd.read_csv(F)
print("\n[WRONG] pd.read_csv default header=0")
print(" shape:", wrong.shape)
print(" columns:", list(wrong.columns)[:6], "...", list(wrong.columns)[-2:])

# --- RIGHT way ---
cols = [f"US{i}" for i in range(1,25)] + ["Class"]
df = pd.read_csv(F, header=None, names=cols)
print("\n[RIGHT] header=None, names=US1..US24+Class")
print(" shape:", df.shape)
print(df.head(3))
print("\n dtypes:\n", df.dtypes.value_counts())
print("\n isna:", df.isna().sum().sum(), " duplicated rows:", df.duplicated().sum())
print("\n Class value_counts:\n", df['Class'].value_counts())
print(" pct:\n", (df['Class'].value_counts(normalize=True)*100).round(1))

print("\n"+"="*70); print("TASK 1: INTERROGATE ONE SENSOR (US1, forward-facing)"); print("="*70)
s=df['US1']
print(s.describe())
print(" mean=%.4f median=%.4f  -> mean %s median (skew %s)" % (s.mean(), s.median(), ">" if s.mean()>s.median() else "<", "%.3f"%s.skew()))
mx=s.max()
print(" max=%.3f  rows exactly at max: %d (%.2f%%)" % (mx,(s==mx).sum(),(s==mx).mean()*100))
# saturation scan across all sensors
print("\n Saturation scan (fraction of rows exactly == that sensor's max):")
sat={c:(df[c]==df[c].max()).mean() for c in cols[:-1]}
sat=pd.Series(sat).sort_values(ascending=False)
print((sat*100).round(2).head(8).to_string())
print(" any sensor max == 5.000 ceiling?:", {c:round(df[c].max(),3) for c in sat.head(5).index})

print("\n"+"="*70); print("TASK 2: CORRELATION (predicted first)"); print("="*70)
print(" corr US1 vs US2 (adjacent, 15deg):", round(df['US1'].corr(df['US2']),3))
print(" corr US1 vs US13 (near-opposite):", round(df['US1'].corr(df['US13']),3))
print(" corr US1 vs US7 (90deg side):", round(df['US1'].corr(df['US7']),3))
# full neighbor decay
print(" US1 vs US_k decay:", {f"US{k}":round(df['US1'].corr(df[f'US{k}']),2) for k in [2,3,4,6,10,13,19,24]})

print("\n"+"="*70); print("TASK 3: VERIFY BY HAND (10-row slice, mean US1)"); print("="*70)
sl=df['US1'].iloc[0:10]
print(" raw 10 values:", list(sl.values))
manual=sum(sl.values)/len(sl.values)
print(" manual sum/n = %.6f   pandas .mean() = %.6f   match=%s" % (manual, sl.mean(), np.isclose(manual,sl.mean())))

print("\n"+"="*70); print("TASK 4: SHAPE (US1 distribution)"); print("="*70)
print(" skew=%.3f kurtosis=%.3f" % (s.skew(), s.kurtosis()))
# histogram as text
h,edges=np.histogram(s,bins=10)
for i in range(10):
    print("  [%.2f-%.2f] %s %d"%(edges[i],edges[i+1],'#'*int(h[i]/h.max()*40),h[i]))
sample=s.sample(min(5000,len(s)),random_state=0)
W,p=stats.shapiro(sample)
print(" Shapiro-Wilk on n=%d: W=%.4f p=%.2e (normal? %s)"%(len(sample),W,p,p>0.05))
print(" spike at ceiling 5.000:", (s==5.0).sum(),"rows")

print("\n"+"="*70); print("TASK 5: Z-SCORE OUTLIERS (US1)"); print("="*70)
z=(s-s.mean())/s.std()
out=df.loc[z.abs()>3,['US1']].copy(); out['z']=z[z.abs()>3]
print(" |z|>3 count:", len(out))
print(out.assign(at_ceiling=lambda d:np.isclose(d['US1'],5.0)).head(12).to_string())
print(" of those, fraction at 5.0 ceiling:", round(np.isclose(out['US1'],5.0).mean(),3))
print(" z of a 5.0 reading:", round((5.0-s.mean())/s.std(),2))

print("\n"+"="*70); print("TASK 6: MEAN THAT MISLEADS + SIMPSON"); print("="*70)
print(" GLOBAL mean US1=%.4f"%s.mean())
print(df.groupby('Class')['US1'].agg(['mean','count']).round(4).to_string())
print("\n Simpson check: corr(US1,US2) pooled vs within class")
print("  pooled:", round(df['US1'].corr(df['US2']),3))
for c,g in df.groupby('Class'):
    print("  %-18s r=%.3f (n=%d)"%(c,g['US1'].corr(g['US2']),len(g)))

print("\n"+"="*70); print("TASK 7: BIAS THE SAMPLE (filter to Sharp-Right-Turn)"); print("="*70)
sub=df[df['Class']=='Sharp-Right-Turn']
print(" full US1 mean=%.4f   Sharp-Right-only mean=%.4f  drift=%.4f"%(s.mean(),sub['US1'].mean(),sub['US1'].mean()-s.mean()))
print(" full corr(US1,US2)=%.3f   Sharp-Right-only=%.3f"%(df['US1'].corr(df['US2']),sub['US1'].corr(sub['US2'])))
print(" dropped out:", (len(df)-len(sub)),"rows, mostly", df['Class'].value_counts().idxmax())

print("\n"+"="*70); print("TASK 8: EFFECT vs SIGNIFICANCE + TIME-SERIES"); print("="*70)
a=df[df['Class']=='Move-Forward']['US1']; b=df[df['Class']=='Sharp-Right-Turn']['US1']
def cohend(x,y):
    nx,ny=len(x),len(y); sp=np.sqrt(((nx-1)*x.var()+(ny-1)*y.var())/(nx+ny-2))
    return (x.mean()-y.mean())/sp
t,p=stats.ttest_ind(a,b,equal_var=False)
print(" FULL: MF mean=%.3f (n=%d)  SharpR mean=%.3f (n=%d)"%(a.mean(),len(a),b.mean(),len(b)))
print("       t=%.2f p=%.2e Cohen d=%.3f"%(t,p,cohend(a,b)))
dft=df.iloc[::20]
a2=dft[dft['Class']=='Move-Forward']['US1']; b2=dft[dft['Class']=='Sharp-Right-Turn']['US1']
t2,p2=stats.ttest_ind(a2,b2,equal_var=False)
print(" THINNED ::20: MF n=%d SharpR n=%d  t=%.2f p=%.4f Cohen d=%.3f"%(len(a2),len(b2),t2,p2,cohend(a2,b2)))
# autocorrelation evidence of non-independence
print(" lag-1 autocorr of US1: %.3f (rows NOT independent)"%df['US1'].autocorr(1))

print("\n"+"="*70); print("SPECIAL CHALLENGE: GHOST HUNT (p-hacking)"); print("="*70)
rng=np.random.default_rng(20260622)
real=df['US1'].values
res=[]
for i in range(20):
    noise=rng.normal(size=len(df))
    r,pv=stats.pearsonr(real,noise)
    res.append((i,r,pv))
res.sort(key=lambda x:abs(x[1]),reverse=True)
i,r,pv=res[0]
print(" 20 pure-noise columns vs US1. Largest |r|: noise#%d r=%.4f p=%.4f"%(i,r,pv))
print(" how many of 20 had p<0.05:", sum(1 for _,_,q in res if q<0.05))
print(" expected false positives at alpha=.05 over 20 tests: ~1.0")
