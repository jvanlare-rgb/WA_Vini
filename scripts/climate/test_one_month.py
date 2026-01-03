import os, zipfile, tempfile
import geopandas as gpd
import rasterio
from rasterio.mask import mask
import numpy as np

PRISM_ROOT = os.environ["PRISM_ROOT"]
AVA_GEOJSON = os.environ["AVA_GEOJSON"]

# pick a single month to test
YM = "198101"
tmean_zip = os.path.join(PRISM_ROOT, "tmean", f"prism_tmean_us_30s_{YM}.zip")
ppt_zip   = os.path.join(PRISM_ROOT, "ppt",   f"prism_ppt_us_30s_{YM}.zip")

def raster_path_from_zip(zip_path, tmpdir):
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(tmpdir)
    # PRISM often provides .bil; sometimes .tif
    for root, _, files in os.walk(tmpdir):
        for fn in files:
            if fn.lower().endswith((".bil", ".tif", ".tiff")):
                return os.path.join(root, fn)
    raise FileNotFoundError(f"No raster found inside {zip_path}")

avas = gpd.read_file(AVA_GEOJSON)
# Ensure we have a polygon geometry column
avas = avas[avas.geometry.notnull()].copy()

# Use the first AVA for test
feat = avas.iloc[0]
geom = [feat.geometry.__geo_interface__]
ava_name = feat.get("name", "AVA_0")
ava_id = feat.get("ava_id", "unknown")

print("Testing AVA:", ava_name, "ava_id:", ava_id)
print("tmean zip:", tmean_zip)
print("ppt zip:", ppt_zip)

with tempfile.TemporaryDirectory() as td:
    tmean_r = raster_path_from_zip(tmean_zip, os.path.join(td, "tmean"))
    ppt_r   = raster_path_from_zip(ppt_zip,   os.path.join(td, "ppt"))

    # --- tmean ---
    with rasterio.open(tmean_r) as src:
        avas_proj = avas.to_crs(src.crs)
        geom_proj = [avas_proj.iloc[0].geometry.__geo_interface__]
        out, _ = mask(src, geom_proj, crop=True)
        data = out[0].astype("float64")
        nodata = src.nodata
        if nodata is not None:
            data[data == nodata] = np.nan
        mean_tmean = np.nanmean(data)
        print("tmean mean (raw):", mean_tmean)

    # --- ppt ---
    with rasterio.open(ppt_r) as src:
        avas_proj = avas.to_crs(src.crs)
        geom_proj = [avas_proj.iloc[0].geometry.__geo_interface__]
        out, _ = mask(src, geom_proj, crop=True)
        data = out[0].astype("float64")
        nodata = src.nodata
        if nodata is not None:
            data[data == nodata] = np.nan
        mean_ppt = np.nanmean(data)
        print("ppt mean (raw):", mean_ppt)

print("✅ Smoke test complete.")
