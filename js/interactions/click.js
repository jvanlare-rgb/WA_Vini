// js/interactions/click.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Map area -> maxZoom (log scale)
function zoomFromAreaSqMeters(area) {
  const logA = Math.log10(area);
  const z = 22.0 - 1.2 * logA;
  return clamp(z, 8.5, 13.5);
}

export function attachClick(map, state, ids) {
  const { FILL_ID } = ids;

  map.on("click", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    if (!features.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      return;
    }

    // pick smallest overlapped AVA
    let chosen = features[0];
    let bestArea = Infinity;

    for (const f of features) {
      const id = String(f.id);
      const a = state.areaById.get(id) ?? turf.area(f);
      if (a < bestArea) {
        bestArea = a;
        chosen = f;
      }
    }

    const id = String(chosen.id);
    const area = state.areaById.get(id) ?? turf.area(chosen);
    const bounds = turf.bbox(chosen);

    const maxZoom = zoomFromAreaSqMeters(area);
    const padding = clamp(120 - Math.log10(area) * 8, 60, 120);

    map.fitBounds(bounds, {
      padding,
      duration: 1200,
      maxZoom
    });

    map.easeTo({ pitch: 70, bearing: -25, duration: 1200 });
  });
}

