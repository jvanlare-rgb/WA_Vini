import json
import glob
import os

INPUT_GLOB = "data/*.geojson"          # adjust if needed
OUTPUT_FILE = "data/avas_wa.geojson"

features = []
used_ids = set()

for path in sorted(glob.glob(INPUT_GLOB)):
    with open(path, "r", encoding="utf-8") as f:
        gj = json.load(f)

    # supports both FeatureCollection + single Feature
    file_features = gj["features"] if gj.get("type") == "FeatureCollection" else [gj]

    for feat in file_features:
        props = feat.get("properties", {}) or {}

        # ---- ensure a stable, unique id (needed for hover feature-state) ----
        # prefer existing ava_id; otherwise make one from filename + name
        ava_id = props.get("ava_id")
        if not ava_id:
            base = os.path.splitext(os.path.basename(path))[0]
            ava_id = base

        # guarantee uniqueness
        original = ava_id
        i = 2
        while ava_id in used_ids:
            ava_id = f"{original}_{i}"
            i += 1
        used_ids.add(ava_id)

        # write back
        props["ava_id"] = ava_id
        feat["properties"] = props

        features.append(feat)

out = {"type": "FeatureCollection", "features": features}

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(out, f)

print(f"✅ Wrote {OUTPUT_FILE} with {len(features)} features")
