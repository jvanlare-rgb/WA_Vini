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

// js/interactions/click.js
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Area -> zoom (tune these numbers to taste)
function zoomFromAreaSqMeters(area) {
  const logA = Math.log10(area);     // log scale feels natural
  const z = 22.0 - 1.2 * logA;       // your existing curve
  return clamp(z, 8.5, 13.8);
}

// Optional: make pitch smaller for huge AVAs, bigger for tiny ones
function pitchFromArea(area) {
  const logA = Math.log10(area);
  // big areas -> lower pitch, small areas -> higher pitch
  return clamp(90 - logA * 6, 45, 75);
}

export function attachClick(map, turf, config, areaById) {
  const { SOURCE_ID, FILL_ID } = config.ids;

  map.on("click", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    // Clicked empty: reset view
    if (!features.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      return;
    }

    // Pick smallest overlapped AVA (your same logic)
    let chosen = features[0];
    let bestArea = Infinity;

    for (const f of features) {
      const id = String(f.id);
      const a = areaById.get(id) ?? turf.area(f);
      if (a < bestArea) {
        bestArea = a;
        chosen = f;
      }
    }

    const id = String(chosen.id);
    const area = areaById.get(id) ?? turf.area(chosen);

    // 1) Compute a good "middle" point
    // centerOfMass is usually better than bbox center for weird shapes
    let center;
    try {
      center = turf.centerOfMass(chosen);
    } catch {
      center = turf.center(chosen);
    }
    const [lng, lat] = center.geometry.coordinates;

    // 2) Compute proportional zoom
    const zoom = zoomFromAreaSqMeters(area);

    // 3) Padding: more for tiny AVAs
    const padding = clamp(120 - Math.log10(area) * 8, 50, 130);

    // 4) Optional dynamic pitch/bearing (or comment these out)
    const pitch = pitchFromArea(area);
    const bearing = -25; // you can also vary this if you want

    // 5) Do a single camera move that sets center + zoom + pitch
    map.easeTo({
      center: [lng, lat],
      zoom,
      pitch,
      bearing,
      padding: { top: padding, bottom: padding, left: padding, right: padding },
      duration: 1200
    });

    // If you still want bounds clamping (so it never cuts off the polygon),
    // you can do a *soft* fit first, then easeTo.
    // But try the pure easeTo version above first — it feels more "centered".
  });
}

