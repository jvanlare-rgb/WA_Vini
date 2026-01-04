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
    const id = String(f.properties?.ava_id ?? f.id ?? "");
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

async function loadVineyardsForAva(avaId) {
  const url = `./assets/data/vineyards_by_ava/${avaId}.geojson`;
  const res = await fetch(url);

  if (!res.ok) {
    // If an AVA has no file or isn't covered, clear layer gracefully
    return { type: "FeatureCollection", features: [] };
  }

  return await res.json();
}

function setVineyards(map, gj) {
  const src = map.getSource("vineyards");
  if (src) src.setData(gj);
}


function cToF(c) { return (c * 9) / 5 + 32; }
function mmToIn(mm) { return mm / 25.4; } // 25.4 mm per inch

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

export async function attachClick(map, turf, ids, areaById) {
  const { FILL_ID } = ids;

  let unitMode = "metric"; // "metric" or "imperial"
  let currentAva = null;

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

  function renderPanel(d) {
    if (!d || !panel) return;
  
    const metric = unitMode === "metric";
  
    const tAll = metric ? d.tmean_all_c : cToF(d.tmean_all_c);
    const tSummer = metric ? d.tmean_summer_c : cToF(d.tmean_summer_c);
  
    const pptAnnual = metric ? d.ppt_annual_mm : mmToIn(d.ppt_annual_mm);
  
    const tTrend = metric ? d.tmean_trend_c_decade : cToF(d.tmean_trend_c_decade) - cToF(0); 
    // simpler: multiply by 9/5
    const tTrendFixed = metric ? d.tmean_trend_c_decade : d.tmean_trend_c_decade * 9/5;
  
    const pTrend = metric ? d.ppt_trend_mm_decade : mmToIn(d.ppt_trend_mm_decade);
  
    document.getElementById("panelTitle").textContent = d.name ?? "AVA";
    document.getElementById("panelPeriod").textContent = d.period ?? "";
  
    document.getElementById("tAll").textContent =
      `${fmt(tAll, 1)} ${metric ? "°C" : "°F"}`;
    document.getElementById("tSummer").textContent =
      `${fmt(tSummer, 1)} ${metric ? "°C" : "°F"}`;
  
    document.getElementById("pAnnual").textContent =
      `${fmt(pptAnnual, metric ? 0 : 1)} ${metric ? "mm/yr" : "in/yr"}`;
  
    document.getElementById("tTrend").textContent =
      `${fmt(tTrendFixed, 2)} ${metric ? "°C" : "°F"}/decade`;
  
    document.getElementById("pTrend").textContent =
      `${fmt(pTrend, metric ? 0 : 2)} ${metric ? "mm" : "in"}/decade`;
    
    document.getElementById("detailsBtn").onclick = () => {
      const url =
        `./climate.html?ava_id=${encodeURIComponent(d.ava_id)}` +
        `&name=${encodeURIComponent(d.name ?? "")}` +
        `&period=${encodeURIComponent(d.period ?? "")}`;
      
        window.location.href = url;
      };

    };
  
    panel.classList.remove("hidden");
  }


  const metricBtn = document.getElementById("unitMetric");
  const imperialBtn = document.getElementById("unitImperial");

  function setUnit(mode) {
    unitMode = mode;
  
    metricBtn?.classList.toggle("active", mode === "metric");
    imperialBtn?.classList.toggle("active", mode === "imperial");
  
    if (currentAva) renderPanel(currentAva);
  }

  metricBtn?.addEventListener("click", () => setUnit("metric"));
  imperialBtn?.addEventListener("click", () => setUnit("imperial"));

  
  function openPanelForAva(ava_id) {
    const d = panelDataById[String(ava_id)];
    if (!d) return;
    currentAva = d;
    renderPanel(d);
  }


  map.on("click", async (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    if (!hits.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      if (panel) panel.classList.add("hidden");
      setVineyards(map, { type: "FeatureCollection", features: [] });
      return;
    }

    const chosen = pickSmallestFeature(hits, areaById, turf);

    const id = String(chosen.properties?.ava_id ?? chosen.id ?? "");
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

    // 2) Load + show vineyards
    try {
      const vineyards = await loadVineyardsForAva(avaId);
      setVineyards(map, vineyards);
    } catch (err) {
      console.warn("Failed to load vineyards for", avaId, err);
      setVineyards(map, { type: "FeatureCollection", features: [] });
    }    
  });
}
