#!/usr/bin/env python3
"""
Compute AVA-scale climate suitability stats from ava_prism_monthly_stats.csv
WITHOUT pandas/numpy (works even in broken NumPy environments).

Outputs JSON keyed by ava_id:
{
  "ava_id": {
    "name": "...",
    "avg_gdd_estimated": ...,
    "avg_precip_growing_season": ...,
    "frost_free_days": null,
    "heat_risk_days": null,
    "meta": {...}
  }
}
"""

import argparse
import calendar
import csv
import json
from pathlib import Path

DEFAULT_GS_MONTHS = [4, 5, 6, 7, 8, 9, 10]  # Apr–Oct
DEFAULT_GDD_BASE_C = 10.0


def parse_ym(ym: str) -> tuple[int, int]:
    s = str(ym).strip()
    if len(s) != 6 or not s.isdigit():
        raise ValueError(f"ym must be YYYYMM (e.g., 198101). Got: {ym!r}")
    return int(s[:4]), int(s[4:6])


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else float("nan")


def compute(in_csv: Path, out_json: Path, gs_months: list[int], gdd_base_c: float) -> None:
    # Data structure:
    # yearly[(ava_id, name, year)] = {"gdd": float, "ppt": float}
    yearly = {}

    year_min = {}
    year_max = {}

    with in_csv.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"ava_id", "name", "ym", "tmean_mean", "ppt_mean"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV missing required columns: {sorted(missing)}")

        for row in reader:
            ava_id = row["ava_id"].strip()
            name = row["name"].strip()
            year, month = parse_ym(row["ym"])

            # Track min/max years per AVA
            year_min[ava_id] = min(year_min.get(ava_id, year), year)
            year_max[ava_id] = max(year_max.get(ava_id, year), year)

            if month not in gs_months:
                continue

            try:
                tmean = float(row["tmean_mean"])
                ppt = float(row["ppt_mean"])
            except ValueError:
                # skip bad rows
                continue

            d = days_in_month(year, month)
            gdd_month = max(0.0, (tmean - gdd_base_c)) * d

            key = (ava_id, name, year)
            if key not in yearly:
                yearly[key] = {"gdd": 0.0, "ppt": 0.0}
            yearly[key]["gdd"] += gdd_month
            yearly[key]["ppt"] += ppt

    # Summarize to AVA averages across years
    # by_ava[ava_id] = {"name": str, "gdd_years": [], "ppt_years": []}
    by_ava = {}
    for (ava_id, name, _year), vals in yearly.items():
        if ava_id not in by_ava:
            by_ava[ava_id] = {"name": name, "gdd_years": [], "ppt_years": []}
        by_ava[ava_id]["gdd_years"].append(vals["gdd"])
        by_ava[ava_id]["ppt_years"].append(vals["ppt"])

    out = {}
    for ava_id, obj in by_ava.items():
        gdd_avg = mean(obj["gdd_years"])
        ppt_avg = mean(obj["ppt_years"])

        out[ava_id] = {
            "name": obj["name"],
            "avg_gdd_estimated": gdd_avg,
            "frost_free_days": None,  # needs PRISM daily tmin
            "avg_precip_growing_season": ppt_avg,
            "heat_risk_days": None,   # needs PRISM daily tmax
            "meta": {
                "gdd_base_c": gdd_base_c,
                "growing_season_months": gs_months,
                "years_used": [year_min.get(ava_id), year_max.get(ava_id)],
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

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Wrote {out_json} (AVAs: {len(out)})")


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
    compute(Path(args.in_csv), Path(args.out_json), gs_months, args.gdd_base_c)


if __name__ == "__main__":
    main()
