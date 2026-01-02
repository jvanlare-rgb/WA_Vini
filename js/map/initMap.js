// js/map/initMap.js
export function initMap(mapboxgl, config) {
  mapboxgl.accessToken = config.accessToken;

  const map = new mapboxgl.Map({
    container: config.map.container,
    style: config.map.style,
    center: config.map.center,
    zoom: config.map.zoom
  });

  return map;
}

