import os
import zipfile
import geopandas as gpd
import numpy as np
import rioxarray as rxr

# -----------------------------
# Config (from your env vars)
# -----------------------------
PRISM_ROOT = os.environ["PRISM_ROOT"]     # e.g. /Users/jvanlare/climate_data/prism_monthly
AVA_GEOJSON = os.environ["AVA_GEOJSON"]   # e.g. /Users/jvanlare/Documents/WA_Vini/data/avas_wa.geojson

YM = "198101"  # YYYYMM test month

tmean_zip = os.path.join(PRISM_ROOT, "tmean", f"prism_tmean_us_30s_{YM}.zip")
ppt_zip   = os.path.join(PRISM_ROOT, "ppt",   f"prism_ppt_us_30s_{YM}.zip")


# -----------------------------
# Helpers
# -----------------------------
def vsizip_nc_path(zip_path: str) -> str:
    """
    Return a GDAL /vsizip/ path to the .nc inside a PRISM zip.
    Example: /vsizip//path/to/file.zip/inside.nc
    """
    with zipfile.ZipFile(zip_path, "r") as z:
        names = [n for n in z.namelist() if not n.endswith("/")]
    nc_files = [n for n in names if n.lower().endswith(".nc")]
    if not nc_files:
        raise FileNotFoundError(f"No .nc found inside {zip_path}. Found: {names[:15]}...")
    inner = sorted(nc_files)[0]
    return f"/vsizip/{zip_path}/{inner}"


def load_prism_dataarray(zip_path: str):
    """
    Open PRISM NetCDF inside a zip as a 2D DataArray.
    """
    path = vsizip_nc_path(zip_path)
    da = rxr.open_rasterio(path, masked=True)

    # Many PRISM rasters come out as (band, y, x) with band=1
    if "band" in da.dims:
        da = da.squeeze("band", drop=True)

    return da


def clip_and_stats(da, polygon_gdf):
    """
    Clip raster DataArray to polygon, return mean, min, max as floats.
    """
    # Reproject polygon to raster CRS
    poly_proj = polygon_gdf.to_crs(da.rio.crs)

    clipped = da.rio.clip(poly_proj.geometry, poly_proj.crs, drop=True)

    arr = clipped.values.astype("float64")
    mean_v = float(np.nanmean(arr))
    min_v  = float(np.nanmin(arr))
    max_v  = float(np.nanmax(arr))
    return mean_v, min_v, max_v


# -----------------------------
# Main
# -----------------------------
def main():
    print("AVA_GEOJSON:", AVA_GEOJSON)
    print("PRISM_ROOT:", PRISM_ROOT)
    print("Testing month:", YM)
    print("tmean zip:", tmean_zip)
    print("ppt zip:", ppt_zip)

    # Load AVAs
    avas = gpd.read_file(AVA_GEOJSON)
    avas = avas[avas.geometry.notnull()].copy()

    # Pick first AVA as smoke test
    feat = avas.iloc[0]
    ava_name = feat.get("name", "AVA_0")
    ava_id = feat.get("ava_id", "unknown")

    print("\nTesting AVA:", ava_name, "ava_id:", ava_id)

    poly = gpd.GeoDataFrame([feat], geometry="geometry", crs=avas.crs)

    # Load rasters
    tmean_da = load_prism_dataarray(tmean_zip)
    ppt_da   = load_prism_dataarray(ppt_zip)

    # Stats
    tmean_mean, tmean_min, tmean_max = clip_and_stats(tmean_da, poly)
    ppt_mean, ppt_min, ppt_max       = clip_and_stats(ppt_da, poly)

    print("\n--- Results (raw units) ---")
    print(f"tmean mean/min/max: {tmean_mean:.2f}, {tmean_min:.2f}, {tmean_max:.2f}")
    print(f"ppt   mean/min/max: {ppt_mean:.2f}, {ppt_min:.2f}, {ppt_max:.2f}")

    print("\n✅ Smoke test complete.")


if __name__ == "__main__":
    main()
