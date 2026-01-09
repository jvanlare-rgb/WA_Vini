// js/analysis/suitability.js
// Renders AVA climate suitability stats into the climate detail page.

const SUITABILITY_URL = "../../ava_climate_suitability.json";

// unit helpers
function cToF(c) { return (c * 9) / 5 + 32; }
function mmToIn(mm) { return mm / 25.4; }

function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

export async function loadSuitability() {
  const res = await fetch(SUITABILITY_URL);
  if (!res.ok) throw new Error(`Suitability JSON fetch failed: ${res.status}`);
  return await res.json();
}

export function renderSuitability({ mountEl, noteEl, avaId, unitMode, data }) {
  if (!mountEl) return;

  const s = data?.[avaId];
  if (!s) {
    if (noteEl) noteEl.textContent = "No suitability stats found for this AVA.";
    mountEl.innerHTML = "";
    return;
  }

  if (noteEl) {
    const yrs = s.meta?.years_used?.[0] && s.meta?.years_used?.[1]
      ? `${s.meta.years_used[0]}–${s.meta.years_used[1]}`
      : "—";
    noteEl.textContent = `AVA-scale summary (${yrs}).`;
  }

  const metric = unitMode === "metric";

  // GDD is unitless-ish degree-days; keep numeric
  const gdd = s.avg_gdd_estimated;

  // precip convert if imperial
  const precip = metric ? s.avg_precip_growing_season : mmToIn(s.avg_precip_growing_season);

  mountEl.innerHTML = `
    <div class="suit-grid">
      <div class="suit-stat">
        <div class="label">Avg GDD (est.)</div>
        <div class="value">${fmt(gdd, 0)}</div>
        <div class="small">Base ${s.meta?.gdd_base_c ?? 10}°C · growing season</div>
      </div>

      <div class="suit-stat">
        <div class="label">Avg precip (growing season)</div>
        <div class="value">${fmt(precip, metric ? 0 : 2)} <span class="unit">${metric ? "mm" : "in"}</span></div>
        <div class="small">Sum of monthly precip</div>
      </div>

      <div class="suit-stat disabled">
        <div class="label">Frost-free days</div>
        <div class="value">—</div>
        <div class="small">Requires PRISM daily Tmin</div>
      </div>

      <div class="suit-stat disabled">
        <div class="label">Heat-risk days (&gt;35°C)</div>
        <div class="value">—</div>
        <div class="small">Requires PRISM daily Tmax</div>
      </div>
    </div>
  `;
}
