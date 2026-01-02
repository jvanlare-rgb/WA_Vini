// js/interactions/click.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Convert polygon area (m^2) into a "target zoom".
 * Smaller polygons => higher zoom.
 * Bigger polygons => lower zoom.
 *
 * Tune these numbers to taste.
 */
function zoomFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1)); // avoid -Infinity
  const z = 22.0 - 1.2 * logA;
  return clamp(z, 8.5, 14.2);
}

/**
 * Optional: vary pitch by size (big AVA = less dramatic tilt).
 * If you want constant pitch, just return 70.
 */
function pitchFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  return clamp(92 - logA * 6, 45, 75);
}

/**
 * Optional: padding adjusts so tiny AVAs don't fill the whole screen.
 */
function paddingFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  return clamp(140 - logA * 8, 60, 140);
}

/**
 * Pick the smallest polygon from a list of hit features.
 */
function pickSmallestFeature(features, areaById, turf) {
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
  return chosen;
}

/**
 * Get a good "center" for weird shapes.
 * centerOfMass is usually better than bbox center.
 */
function getFeatureCenter(feature, turf) {
  try {
    return turf.centerOfMass(feature).geometry.coordinates; // [lng, lat]
  } catch {
    return turf.center(feature).geometry.coordinates;
  }
}

/**
 * Attach click handler.
 * @param {mapboxgl.Map} map
 * @param {object} turf  (global turf.js object)
 * @param {object} CONFIG your config object with ids
 * @param {Map<string, number>} areaById cache of areas by feature id
 */
export function attachClick(map, turf, CONFIG, areaById) {
  const { FILL_ID, SOURCE_ID } = CONFIG.ids;

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    // Clicked empty space -> reset view
    if (!hits.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      return;
    }

    // Pick smallest overlapped AVA
    const chosen = pickSmallestFeature(hits, areaById, turf);

    // Area + center
    const id = String(chosen.id);
    const area = areaById.get(id) ?? turf.area(chosen);
    const center = getFeatureCenter(chosen, turf); // [lng, lat]

    // Proportional camera parameters
    const zoom = zoomFromArea(area);
    const pitch = pitchFromArea(area);
    const padding = paddingFromArea(area);

    // Clear any hover state "sticking" (optional safety)
    // (Only do this if you use feature-state hover elsewhere)
    // map.setFeatureState({ source: SOURCE_ID, id }, { hover: false });

    // Smooth cinematic move centered on the AVA
    map.easeTo({
      center,
      zoom,
      pitch,
      bearing: -25,
      duration: 1200,
      // padding can be a number or object — object is more reliable
      padding: { top: padding, bottom: padding, left: padding, right: padding }
    });
  });
}
