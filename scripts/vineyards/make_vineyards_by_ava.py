from pathlib import Path
import geopandas as gpd
import pandas as pd

GDB = Path("data/wsda/2024WSDACropDistribution.gdb")
AVAS = Path("data/avas_wa.geojson")

OUT_DIR = Path("assets/data/vineyards_by_ava")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def main():
    # Load AVAs
    avas = gpd.read_file(AVAS)[["ava_id", "name", "geometry"]].dropna(subset=["geometry"]).copy()

    # Geometry layer
    fields = gpd.read_file(GDB, layer="WSDACrop_2024").dropna(subset=["geometry"]).copy()

    # Attribute table with CropType etc (no geometry)
    crop = gpd.read_file(GDB, layer="CropData")  # returns pandas DataFrame in your env

    # Merge CropType onto polygons using shared columns as keys
    # (These are the columns both tables share and are very likely to uniquely identify rows)
    join_keys = [
        "Acres", "Irrigation", "InitialSurveyDate", "LastSurveyDate", "DataSource",
        "TRS", "County", "CoverCrop", "ExactAcres", "DoubleCrop",
        "CropGroup", "Shape_Length", "Shape_Area"
    ]

    # Keep only needed columns from crop table
    crop_keep = join_keys + ["CropType", "CropDescription"]
    crop_small = crop[crop_keep].copy()

    merged = fields.merge(crop_small, on=join_keys, how="left", validate="many_to_one")

    # Filter to vineyards (wine grapes)
    vine = merged[merged["CropType"].astype(str).str.contains("Grape", case=False, na=False)].copy()

    print("Total polygons:", len(fields))
    print("Vineyard polygons:", len(vine))
    print("Top vineyard CropType values:\n", vine["CropType"].value_counts().head(10))

    # Reproject vineyards to match AVAs
    if vine.crs != avas.crs:
        vine = vine.to_crs(avas.crs)

    # Export one file per AVA (intersects is faster than full intersection)
    for _, a in avas.iterrows():
        ava_id = a["ava_id"]
        poly = gpd.GeoDataFrame([a], crs=avas.crs)

        # Fast selection by spatial join (keeps full vineyard polygons)
        sel = gpd.sjoin(vine, poly, predicate="intersects", how="inner").drop(columns=["index_right"])

        # Optional: clip to AVA boundary (smaller + cleaner, but slower)
        # sel = gpd.overlay(sel, poly, how="intersection")

        # Keep a small set of fields for the web
        keep = ["CropType", "Acres", "Irrigation", "County", "LastSurveyDate", "geometry"]
        keep = [c for c in keep if c in sel.columns]
        sel = sel[keep].copy()

        out = OUT_DIR / f"{ava_id}.geojson"
        sel.to_file(out, driver="GeoJSON")
        print(f"{ava_id}: {len(sel)} vineyard polygons -> {out}")

if __name__ == "__main__":
    main()
