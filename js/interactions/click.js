// js/interactions/click.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function zoomFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  const z = 22.0 - 1.35 * logA;
  return clamp(z, 8.5, 14.2);
}

function pitchFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  return clamp(92 - logA * 6, 45, 75);
}

function paddingFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  return clamp(140 - logA * 8, 60, 140);
}

function pickSmallestFeature(features, areaById, turf) {
  let chosen = features[0];
  let bestArea = Infinity;

  for (const f of features) {
    const id = String(f.id ?? "");
    const a = (id && areaById.get(id)) ?? turf.area(f);
    if (a < bestArea) {
      bestArea = a;
      chosen = f;
    }
  }
  return chosen;
}

function getFeatureCenter(feature, turf) {
  try {
    return turf.centerOfMass(feature).geometry.coordinates;
  } catch {
    return turf.center(feature).geometry.coordinates;
  }
}

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

export async function attachClick(map, turf, ids, areaById) {
  const { FILL_ID } = ids;

  // Load panel data once
  let panelDataById = {};
  try {
    const res = await fetch("./assets/data/ava_panel_stats.json");
    const arr = await res.json();
    panelDataById = Object.fromEntries(arr.map(d => [String(d.ava_id), d]));
  } catch (e) {
    console.warn("Panel JSON failed to load:", e);
  }

  // Cache DOM now that it exists (ensure your script runs after the panel HTML)
  const panel = document.getElementById("infoPanel");
  const closeBtn = document.getElementById("panelClose");
  if (closeBtn && panel) closeBtn.onclick = () => panel.classList.add("hidden");

  function openPanelForAva(ava_id) {
    const d = panelDataById[String(ava_id)];
    if (!d || !panel) return;

    document.getElementById("panelTitle").textContent = d.name ?? "AVA";
    document.getElementById("panelPeriod").textContent = d.period ?? "";

    document.getElementById("tAll").textContent = `${fmt(d.tmean_all_c, 1)} °C`;
    document.getElementById("tSummer").textContent = `${fmt(d.tmean_summer_c, 1)} °C`;
    document.getElementById("pAnnual").textContent = `${fmt(d.ppt_annual_mm, 0)} mm/yr`;

    document.getElementById("tTrend").textContent =
      `${fmt(d.tmean_trend_c_decade, 2)} °C/decade`;
    document.getElementById("pTrend").textContent =
      `${fmt(d.ppt_trend_mm_decade, 0)} mm/decade`;

    document.getElementById("detailsBtn").onclick = () => {
      window.location.href = `details.html?ava_id=${encodeURIComponent(d.ava_id)}`;
    };

    panel.classList.remove("hidden");
  }

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    if (!hits.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      if (panel) panel.classList.add("hidden");
      return;
    }

    const chosen = pickSmallestFeature(hits, areaById, turf);

    const id = String(chosen.id ?? "");
    const area = (id && areaById.get(id)) ?? turf.area(chosen);
    const center = getFeatureCenter(chosen, turf);

    const zoom = zoomFromArea(area);
    const pitch = pitchFromArea(area);
    const pad = paddingFromArea(area);

    map.easeTo({
      center,
      zoom,
      pitch,
      bearing: -25,
      duration: 1200,
      padding: { top: pad, bottom: pad, left: pad, right: pad }
    });

    // Open panel using the feature's ava_id property
    const avaId = chosen.properties?.ava_id;
    if (avaId) openPanelForAva(avaId);
  });
}
