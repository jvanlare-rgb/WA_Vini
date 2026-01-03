import pandas as pd
import numpy as np
import json
from pathlib import Path

IN_CSV = Path("ava_prism_monthly_stats.csv")
OUT_JSON = Path("assets/data/ava_panel_stats.json")  # adjust if needed

def slope_per_decade(x_year, y):
    """Linear trend slope in units per decade. Returns NaN if insufficient data."""
    x = np.asarray(x_year, dtype="float64")
    y = np.asarray(y, dtype="float64")
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 2:
        return np.nan
    m, b = np.polyfit(x[ok], y[ok], 1)  # units per year
    return float(m * 10.0)

def main():
    df = pd.read_csv(IN_CSV)

    # Parse year/month from ym (YYYYMM)
    df["ym"] = df["ym"].astype(str)
    df["year"] = df["ym"].str.slice(0, 4).astype(int)
    df["month"] = df["ym"].str.slice(4, 6).astype(int)

    # Annual aggregates per AVA
    annual = (
        df.groupby(["ava_id", "name", "year"], as_index=False)
          .agg(
              tmean_annual_c=("tmean_mean", "mean"),     # mean across months
              ppt_annual_mm=("ppt_mean", "sum"),         # sum across months
              n_months=("ym", "count")
          )
    )

    # Panel stats per AVA (using annual series for trends)
    panel_rows = []
    for (ava_id, name), g in df.groupby(["ava_id", "name"]):
        # Overall + summer from monthly
        all_mean_c = float(np.nanmean(g["tmean_mean"].values))
        summer = g[g["month"].isin([6, 7, 8])]
        summer_mean_c = float(np.nanmean(summer["tmean_mean"].values))

        # Annual series for trends + annual precip normal
        ga = annual[(annual["ava_id"] == ava_id)]
        years = ga["year"].values
        t_ann = ga["tmean_annual_c"].values
        p_ann = ga["ppt_annual_mm"].values

        t_trend_c_decade = slope_per_decade(years, t_ann)
        p_trend_mm_decade = slope_per_decade(years, p_ann)

        mean_annual_ppt = float(np.nanmean(p_ann))
        start_year = int(np.nanmin(years)) if len(years) else None
        end_year = int(np.nanmax(years)) if len(years) else None

        panel_rows.append({
            "ava_id": str(ava_id),
            "name": str(name),
            "period": f"{start_year}–{end_year}" if start_year and end_year else "",
            "tmean_all_c": all_mean_c,
            "tmean_summer_c": summer_mean_c,
            "ppt_annual_mm": mean_annual_ppt,
            "tmean_trend_c_decade": t_trend_c_decade,
            "ppt_trend_mm_decade": p_trend_mm_decade,
            # Optional series for sparkline / later details
            "years": years.astype(int).tolist(),
            "tmean_annual_c": np.asarray(t_ann, dtype="float64").tolist(),
            "ppt_annual_mm_series": np.asarray(p_ann, dtype="float64").tolist(),
        })

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(panel_rows, f, indent=2)

    print(f"✅ Wrote {len(panel_rows)} AVAs to {OUT_JSON}")

if __name__ == "__main__":
    main()
