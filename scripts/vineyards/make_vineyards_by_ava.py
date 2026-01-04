from pathlib import Path
import geopandas as gpd

GDB = Path("data/wsda/2024WSDACropDistribution.gdb")
LAYER = "CropData"
AVAS = Path("data/avas_wa.geojson")

OUT_DIR = Path("assets/data/vineyards_by_ava")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Load AVAs
avas = gpd.read_file(AVAS)[["ava_id", "name", "geometry"]].copy()
avas = avas[avas.geometry.notnull()].copy()

# Load WSDA crop polygons (with CropType!)
fields = gpd.read_file(GDB, layer=LAYER)
fields = fields[fields.geometry.notnull()].copy()

# Filter to vineyards (wine grapes)
vine = fields[fields["CropType"].astype(str).str.contains("Grape", case=False, na=False)].copy()

# Reproject vineyards to match AVAs
if vine.crs != avas.crs:
  vine = vine.to_crs(avas.crs)

# Export one file per AVA
for _, a in avas.iterrows():
  ava_id = a["ava_id"]
  poly = gpd.GeoDataFrame([a], crs=avas.crs)

  clipped = gpd.overlay(vine, poly, how="intersection")

  # OPTIONAL: keep only a few useful fields for web
  keep = [c for c in ["CropType", "CropGroup", "Acres", "Irrigation", "County", "LastSurveyDate"] if c in clipped.columns]
  clipped = clipped[keep + ["geometry"]]

  # OPTIONAL: simplify for performance (tweak tolerance as needed)
  # clipped["geometry"] = clipped["geometry"].simplify(0.0002, preserve_topology=True)

  out = OUT_DIR / f"{ava_id}.geojson"
  clipped.to_file(out, driver="GeoJSON")
  print(f"{ava_id}: {len(clipped)} vineyard polygons -> {out}")
