#!/usr/bin/env python3
"""
Compute AVA-scale climate suitability stats from ava_prism_monthly_stats.csv.

Outputs JSON keyed by ava_id:
{
  "ancient_lakes_of_columbia_valley": {
     "name": "...",
     "avg_gdd_estimated": 1234.5,
     "frost_free_days": null,
     "avg_precip_growing_season": 210.3,
     "heat_risk_days": null,
     "meta": {
        "gdd_base_c": 10,
        "growing_season_months": [4,5,6,7,8,9,10],
        "years_used": [1981, 2023]
     }
  },
  ...
}
"""

import argparse
import calendar
import json
from pathlib import Path

import pandas as pd


DEFAULT_GS_MONTHS = [4, 5, 6, 7, 8, 9, 10]  # Apr–Oct (good default for WA viticulture)
DEFAULT_GDD_BASE_C = 10.0


def parse_ym_to_year_month(ym: str) -> tuple[int, int]:
    # ym like "198101"
    s = str(ym)
    if len(s) != 6:
        raise ValueError(f"ym must be YYYYMM, got: {ym}")
    return int(s[:4]), int(s[4:6])


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def compute_stats(
    csv_path: Path,
    out_path: Path,
    gs_months: list[int],
    gdd_base_c: float,
) -> None:
    df = pd.read_csv(csv_path)

    required = {"ava_id", "name", "ym", "tmean_mean", "ppt_mean"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing required columns: {sorted(missing)}")

    # Split ym into year, month
    ym_parsed = df["ym"].astype(str).apply(parse_ym_to_year_month)
    df["year"] = ym_parsed.apply(lambda x: x[0])
    df["month"] = ym_parsed.apply(lambda x: x[1])

    # Filter to growing season months
    df_gs = df[df["month"].isin(gs_months)].copy()

    # Compute monthly GDD approximation using monthly mean temperature:
    # GDD_month ≈ days_in_month * max(0, tmean_mean - base)
    df_gs["days"] = df_gs.apply(lambda r: days_in_month(int(r["year"]), int(r["month"])), axis=1)
    df_gs["gdd_month_est"] = (df_gs["tmean_mean"] - gdd_base_c).clip(lower=0) * df_gs["days"]

    # Per AVA + year totals
    yearly = (
        df_gs.groupby(["ava_id", "name", "year"], as_index=False)
        .agg(
            gdd_year_est=("gdd_month_est", "sum"),
            precip_gs_year=("ppt_mean", "sum"),
        )
    )

    # Multi-year averages
    summary = (
        yearly.groupby(["ava_id", "name"], as_index=False)
        .agg(
            avg_gdd_estimated=("gdd_year_est", "mean"),
            avg_precip_growing_season=("precip_gs_year", "mean"),
            year_min=("year", "min"),
            year_max=("year", "max"),
        )
    )

    # Build output dict keyed by ava_id
    out = {}
    for _, r in summary.iterrows():
        ava_id = r["ava_id"]
        out[ava_id] = {
            "name": r["name"],
            "avg_gdd_estimated": float(r["avg_gdd_estimated"]),
            "frost_free_days": None,   # needs PRISM daily tmin
            "avg_precip_growing_season": float(r["avg_precip_growing_season"]),
            "heat_risk_days": None,    # needs PRISM daily tmax
            "meta": {
                "gdd_base_c": gdd_base_c,
                "growing_season_months": gs_months,
                "years_used": [int(r["year_min"]), int(r["year_max"])],
                "units": {
                    "avg_gdd_estimated": "degree-days (°C·day), monthly-estimated",
                    "avg_precip_growing_season": "mm",
                },
                "notes": {
                    "gdd": "Estimated from PRISM monthly tmean_mean; daily PRISM enables exact GDD.",
                    "precip": "Sum of PRISM monthly ppt_mean across growing season months.",
                },
            },
        }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote: {out_path}  (AVAs: {len(out)})")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--in_csv", default="ava_prism_monthly_stats.csv")
    p.add_argument("--out_json", default="data/ava_climate_suitability.json")
    p.add_argument("--gdd_base_c", type=float, default=DEFAULT_GDD_BASE_C)
    p.add_argument(
        "--gs_months",
        default=",".join(map(str, DEFAULT_GS_MONTHS)),
        help="Comma-separated growing season months, e.g., 4,5,6,7,8,9,10",
    )
    args = p.parse_args()

    gs_months = [int(x.strip()) for x in args.gs_months.split(",") if x.strip()]
    compute_stats(
        csv_path=Path(args.in_csv),
        out_path=Path(args.out_json),
        gs_months=gs_months,
        gdd_base_c=args.gdd_base_c,
    )


if __name__ == "__main__":
    main()
