// js/interactions/hover.js

function getCreatedRaw(props) {
  return (
    props?.created ??
    props?.established ??
    props?.established_date ??
    props?.date ??
    props?.created_date ??
    null
  );
}

export function attachHover(map, state, ids) {
  const { SOURCE_ID, FILL_ID } = ids;

  map.on("mousemove", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    if (!hits.length) {
      map.getCanvas().style.cursor = "";
      if (state.hoveredId !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: state.hoveredId }, { hover: false });
        state.hoveredId = null;
      }
      document.getElementById("info").textContent = "Move your mouse over an AVA";
      return;
    }

    map.getCanvas().style.cursor = "pointer";

    // pick smallest polygon under cursor
    let chosen = hits[0];
    let bestArea = Infinity;

    for (const f of hits) {
      const id = String(f.id);
      const a = state.areaById.get(id) ?? turf.area(f);
      if (a < bestArea) {
        bestArea = a;
        chosen = f;
      }
    }

    if (state.hoveredId !== null && state.hoveredId !== chosen.id) {
      map.setFeatureState({ source: SOURCE_ID, id: state.hoveredId }, { hover: false });
    }

    state.hoveredId = chosen.id;
    map.setFeatureState({ source: SOURCE_ID, id: state.hoveredId }, { hover: true });

    const info = document.getElementById("info");
    const name = chosen.properties?.name ?? chosen.properties?.title ?? "AVA";
    const createdRaw = getCreatedRaw(chosen.properties);

    const createdPretty = createdRaw
      ? new Date(createdRaw).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric"
        })
      : null;

    info.innerHTML = `
      <div>AVA: ${name}</div>
      <div style="opacity:0.85; font-size:0.9em;">
        Date created: ${createdPretty ?? createdRaw ?? "Unknown"}
      </div>
    `;
  });

  map.on("mouseleave", FILL_ID, () => {
    map.getCanvas().style.cursor = "";
    if (state.hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: state.hoveredId }, { hover: false });
      state.hoveredId = null;
    }
    document.getElementById("info").textContent = "Move your mouse over an AVA";
  });
}

