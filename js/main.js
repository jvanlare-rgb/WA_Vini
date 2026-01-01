mapboxgl.accessToken = "pk.eyJ1IjoianZhbmxhcmUiLCJhIjoiY21oY2Zrd29nMTN2dDJtcHh5YzlxYWVtNSJ9.bP5BGQT-tdmmsC1SStqvNw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/jvanlare/cmjuj1tdb000z01s48ibtg7t1",
  center: [-119.0, 46.8],
  zoom: 6
});


// Helpful: surface errors in console
map.on("error", (e) => console.log("MAP ERROR:", e?.error || e));
map.on("load", () => console.log("✅ style loaded"));
