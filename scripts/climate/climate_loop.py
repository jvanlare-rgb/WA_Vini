import os
import re
import zipfile
import tempfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rioxarray as rxr


PRISM_ROOT = Path(os.environ["PRISM_ROOT"])
AVA_GEOJSON = Path(os.environ["AVA_GEOJSON"])

OUT_CSV = Path("ava_prism_monthly_stats.csv")

# If True, will append and skip rows that already exist in OUT_CSV
RESUME = True

# Optional: set to an integer like 2000 to reduce runtime by sampling (debug)
LIMIT_AVAS = None
LIMIT_MONTHS = None


def list_months(prism_root: Path) -> list[str]:
    """
    Find YYYYMM months available by scanning tmean zip filenames.
    Assumes filenames like prism_tmean_us_30s_YYYYMM.zip
    """
    tmean_dir = prism_root / "tmean"
    months = []
    pat = re.compile(r"prism_tmean_us_30s_(\d{6})\.zip$", re.IGNORECASE)

    for p in sorted(tmean_dir.glob("*.zip")):
        m = pat.search(p.name)
        if m:
            months.append(m.group(1))

    if not months:
        raise FileNotFoundError(f"No tmean zips found in {tmean_dir}")

    return months


def extract_nc(zip_path: Path, out_dir: Path) -> Path:
    """
    Extract the first .nc file from a PRISM zip into out_dir and return its path.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        nc_files = [n for n in z.namelist() if n.lower().endswith(".nc")]
        if not nc_files:
            raise FileNotFoundError(f"No .nc found inside {zip_path}.")
        inner = sorted(nc_files)[0]

        out_path = out_dir / Path(inner).name
        z.extract(inner, out_dir)

        extracted_path = out_dir / inner
        if extracted_path != out_path:
            # If nested in folders, move it up
            out_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(extracted_path, out_path)

        return out_path


def load_da(nc_path: Path):
    """
    Open PRISM NetCDF with rioxarray/rasterio.
    """
    da = rxr.open_rasterio(nc_path, masked=True)
    if "band" in da.dims:
        da = da.squeeze("band", drop=True)
    return da


def clip_stats(da, geom_gdf):
    """
    Clip raster to geom_gdf geometry; return mean/min/max (nan-safe).
    """
    geom_proj = geom_gdf.to_crs(da.rio.crs)
    clipped = da.rio.clip(geom_proj.geometry, geom_proj.crs, drop=True)

    arr = clipped.values.astype("float64")
    return float(np.nanmean(arr)), float(np.nanmin(arr)), float(np.nanmax(arr))


def ensure_output_csv(path: Path):
    if not path.exists():
        df = pd.DataFrame(
            columns=[
                "ava_id", "name", "ym",
                "tmean_mean", "tmean_min", "tmean_max",
                "ppt_mean", "ppt_min", "ppt_max",
            ]
        )
        df.to_csv(path, index=False)


def load_done_keys(path: Path) -> set[tuple[str, str]]:
    """
    For RESUME: return set of (ava_id, ym) already in the CSV.
    """
    if not path.exists():
        return set()
    try:
        df = pd.read_csv(path, usecols=["ava_id", "ym"])
        return set(zip(df["ava_id"].astype(str), df["ym"].astype(str)))
    except Exception:
        return set()


def main():
    print("PRISM_ROOT:", PRISM_ROOT)
    print("AVA_GEOJSON:", AVA_GEOJSON)
    print("OUT_CSV:", OUT_CSV)

    # Load AVAs once
    avas = gpd.read_file(AVA_GEOJSON)
    avas = avas[avas.geometry.notnull()].copy()

    # Make sure we have stable IDs
    if "ava_id" not in avas.columns:
        avas["ava_id"] = avas.index.astype(str)
    if "name" not in avas.columns:
        avas["name"] = ""

    if LIMIT_AVAS is not None:
        avas = avas.iloc[:LIMIT_AVAS].copy()

    months = list_months(PRISM_ROOT)
    if LIMIT_MONTHS is not None:
        months = months[:LIMIT_MONTHS]

    ensure_output_csv(OUT_CSV)

    done = load_done_keys(OUT_CSV) if RESUME else set()
    print(f"Loaded {len(avas)} AVAs, {len(months)} months.")
    print(f"Resume enabled: {RESUME}. Already done rows: {len(done)}")

    # Process month-by-month so each raster is opened once per month
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)

        for i, ym in enumerate(months, 1):
            tmean_zip = PRISM_ROOT / "tmean" / f"prism_tmean_us_30s_{ym}.zip"
            ppt_zip   = PRISM_ROOT / "ppt"   / f"prism_ppt_us_30s_{ym}.zip"

            if not tmean_zip.exists() or not ppt_zip.exists():
                print(f"[{ym}] Missing zip(s). tmean={tmean_zip.exists()} ppt={ppt_zip.exists()} -> skipping")
                continue

            print(f"\n[{i}/{len(months)}] Month {ym}: extracting + opening rasters...")

            month_dir = td / ym
            tmean_nc = extract_nc(tmean_zip, month_dir / "tmean")
            ppt_nc   = extract_nc(ppt_zip,   month_dir / "ppt")

            tmean_da = load_da(tmean_nc)
            ppt_da   = load_da(ppt_nc)

            # Build results for this month, then append once (faster + safer)
            rows = []
            for _, feat in avas.iterrows():
                ava_id = str(feat.get("ava_id", "unknown"))
                name = feat.get("name", "")

                if RESUME and (ava_id, ym) in done:
                    continue

                poly = gpd.GeoDataFrame([feat], geometry="geometry", crs=avas.crs)

                try:
                    tmean_mean, tmean_min, tmean_max = clip_stats(tmean_da, poly)
                    ppt_mean, ppt_min, ppt_max       = clip_stats(ppt_da, poly)
                except Exception as e:
                    # Keep going; record NaNs so you can inspect failures later
                    print(f"  ! clip failed ava_id={ava_id} ym={ym}: {type(e).__name__}: {e}")
                    tmean_mean = tmean_min = tmean_max = np.nan
                    ppt_mean   = ppt_min   = ppt_max   = np.nan

                rows.append({
                    "ava_id": ava_id,
                    "name": name,
                    "ym": ym,
                    "tmean_mean": tmean_mean,
                    "tmean_min": tmean_min,
                    "tmean_max": tmean_max,
                    "ppt_mean": ppt_mean,
                    "ppt_min": ppt_min,
                    "ppt_max": ppt_max,
                })

                done.add((ava_id, ym))

            if rows:
                pd.DataFrame(rows).to_csv(OUT_CSV, mode="a", header=False, index=False)
                print(f"[{ym}] appended {len(rows)} rows")
            else:
                print(f"[{ym}] nothing new to append")

    print("\n✅ All done.")


if __name__ == "__main__":
    main()
