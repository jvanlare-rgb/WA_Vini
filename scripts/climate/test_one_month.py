import os
import zipfile
import tempfile
import geopandas as gpd
import numpy as np
import rioxarray as rxr

# -----------------------------
# Config (from your env vars)
# -----------------------------
PRISM_ROOT = os.environ["PRISM_ROOT"]
AVA_GEOJSON = os.environ["AVA_GEOJSON"]

YM = "198101"  # YYYYMM test month

tmean_zip = os.path.join(PRISM_ROOT, "tmean", f"prism_tmean_us_30s_{YM}.zip")
ppt_zip   = os.path.join(PRISM_ROOT, "ppt",   f"prism_ppt_us_30s_{YM}.zip")


# -----------------------------
# Helpers
# -----------------------------
def extract_nc(zip_path: str, out_dir: str) -> str:
    """
    Extract the .nc file from a PRISM zip to out_dir and return its filepath.
    macOS-friendly (avoids /vsizip + netcdf driver limitation).
    """
    with zipfile.ZipFile(zip_path, "r") as z:
        nc_files = [n for n in z.namelist() if n.lower().endswith(".nc")]
        if not nc_files:
            raise FileNotFoundError(f"No .nc found inside {zip_path}. Contents: {z.namelist()[:15]}...")
        inner = sorted(nc_files)[0]

        out_path = os.path.join(out_dir, os.path.basename(inner))
        z.extract(inner, out_dir)

        # If the zip stored it inside subfolders, move it up
        extracted_path = os.path.join(out_dir, inner)
        if extracted_path != out_path:
            os.replace(extracted_path, out_path)

        return out_path


def load_prism_dataarray_from_nc(nc_path: str):
    """
    Open PRISM NetCDF as a 2D DataArray via rioxarray/rasterio.
    """
    da = rxr.open_rasterio(nc_path, masked=True)

    # Usually comes out as (band, y, x) with band=1
    if "band" in da.dims:
        da = da.squeeze("band", drop=True)

    return da


def clip_and_stats(da, polygon_gdf):
    """
    Clip raster DataArray to polygon, return mean, min, max.
    """
    poly_proj = polygon_gdf.to_crs(da.rio.crs)
    clipped = da.rio.clip(poly_proj.geometry, poly_proj.crs, drop=True)

    arr = clipped.values.astype("float64")
    return float(np.nanmean(arr)), float(np.nanmin(arr)), float(np.nanmax(arr))


# -----------------------------
# Main
# -----------------------------
def main():
    print("AVA_GEOJSON:", AVA_GEOJSON)
    print("PRISM_ROOT:", PRISM_ROOT)
    print("Testing month:", YM)
    print("tmean zip:", tmean_zip)
    print("ppt zip:", ppt_zip)

    avas = gpd.read_file(AVA_GEOJSON)
    avas = avas[avas.geometry.notnull()].copy()

    feat = avas.iloc[0]
    ava_name = feat.get("name", "AVA_0")
    ava_id = feat.get("ava_id", "unknown")

    print("\nTesting AVA:", ava_name, "ava_id:", ava_id)

    poly = gpd.GeoDataFrame([feat], geometry="geometry", crs=avas.crs)

    with tempfile.TemporaryDirectory() as td:
        # Extract nc files locally (macOS fix)
        tmean_nc = extract_nc(tmean_zip, os.path.join(td, "tmean"))
        ppt_nc   = extract_nc(ppt_zip,   os.path.join(td, "ppt"))

        # Load rasters
        tmean_da = load_prism_dataarray_from_nc(tmean_nc)
        ppt_da   = load_prism_dataarray_from_nc(ppt_nc)

        # Stats
        tmean_mean, tmean_min, tmean_max = clip_and_stats(tmean_da, poly)
        ppt_mean, ppt_min, ppt_max       = clip_and_stats(ppt_da, poly)

    print("\n--- Results (raw units) ---")
    print(f"tmean mean/min/max: {tmean_mean:.2f}, {tmean_min:.2f}, {tmean_max:.2f}")
    print(f"ppt   mean/min/max: {ppt_mean:.2f}, {ppt_min:.2f}, {ppt_max:.2f}")

    print("\n✅ Smoke test complete.")


if __name__ == "__main__":
    main()
