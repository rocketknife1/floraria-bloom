/*
 * Harta 3D a livrărilor.
 * MapLibre GL + hartă OpenFreeMap (fără cheie) + relief AWS Terrain Tiles (fără cheie).
 * Traseele sunt precalculate în js/routes.js (OSRM, date © OpenStreetMap contributors).
 */
window.initBloomMap = function initBloomMap({ container, root, zones, routes, reduceMotion, draftTag, onOrder }) {
  const GOLD = "#CFA021";
  const PLUM = "#7A5494";
  const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const $ = (s) => root.querySelector(s);
  const towns = zones.filter((z) => !z.pickup && routes.towns[z.id]);
  const shop = routes.shop;
  const desktop = matchMedia("(min-width: 1001px)");
  const fmtKm = (m) => `${(m / 1000).toFixed(1).replace(".", ",")} km`;
  const lei = (n) => (n === 0 ? "gratuit" : `${n} lei`);

  /* ---------- geometry helpers ---------- */
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  function dist(a, b) {
    const dLat = rad(b[1] - a[1]);
    const dLon = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
    const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
    return (Math.atan2(y, x) * 180) / Math.PI;
  }
  const angleDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

  function prepare(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
    return { coords, cum, total: cum[cum.length - 1] };
  }
  function pointAt(r, d) {
    const { coords, cum } = r;
    if (d <= 0) return coords[0];
    if (d >= r.total) return coords[coords.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t];
  }
  // Ground height under a point, so the camera follows the van on the terrain, not at sea level
  const groundAt = (lngLat) => {
    if (lite) return 0;
    const h = typeof map.queryTerrainElevation === "function" ? map.queryTerrainElevation(lngLat) : null;
    return Number.isFinite(h) ? h : 0;
  };
  const prepared = Object.fromEntries(towns.map((z) => [z.id, prepare(routes.towns[z.id].coords)]));

  function gradient(p) {
    if (p <= 0.0005) return ["interpolate", ["linear"], ["line-progress"], 0, PLUM, 1, PLUM];
    if (p >= 0.999) return ["interpolate", ["linear"], ["line-progress"], 0, GOLD, 1, GOLD];
    return ["interpolate", ["linear"], ["line-progress"], 0, GOLD, p, GOLD, p + 0.0005, PLUM, 1, PLUM];
  }

  /* ---------- map ---------- */
  const map = new maplibregl.Map({
    container,
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [23.262, 45.392],
    zoom: desktop.matches ? 10.55 : 9.7,
    pitch: 58,
    bearing: -22,
    maxPitch: 78,
    cooperativeGestures: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, desktop.matches ? 1.75 : 1.5),
    fadeDuration: 0,
    attributionControl: { compact: true },
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Ține apăsat Ctrl și derulează ca să faci zoom pe hartă",
      "CooperativeGesturesHandler.MacHelpText": "Ține apăsat ⌘ și derulează ca să faci zoom pe hartă",
      "CooperativeGesturesHandler.MobileHelpText": "Folosește două degete ca să miști harta",
      "NavigationControl.ZoomIn": "Mărește",
      "NavigationControl.ZoomOut": "Micșorează",
      "NavigationControl.ResetBearing": "Orientează harta spre nord",
    },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  const panelPadding = () => (desktop.matches ? { left: 400, top: 40, right: 40, bottom: 40 } : { left: 20, top: 20, right: 20, bottom: 20 });

  function tint() {
    const set = (id, prop, v) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); };
    set("background", "background-color", "#F2EEF6");
    set("park", "fill-color", "#DCE6D0");
    set("landcover_wood", "fill-color", "#C6D8B4");
    set("water", "fill-color", "#BCCBE8");
    set("building", "fill-color", "#E3DCEC");
    set("building-3d", "fill-extrusion-color", ["interpolate", ["linear"], ["zoom"], 14, "#E8E1F0", 17, "#D3C6E3"]);
    set("building-3d", "fill-extrusion-height", ["*", ["max", ["coalesce", ["get", "render_height"], 0], 7], 1.15]);
    set("building-3d", "fill-extrusion-base", ["coalesce", ["get", "render_min_height"], 0]);
    set("building-3d", "fill-extrusion-opacity", 0.94);
    map.getStyle().layers.filter((l) => l.id.startsWith("poi")).forEach((l) => map.setLayoutProperty(l.id, "visibility", "none"));
  }

  function addRelief() {
    const dem = {
      type: "raster-dem",
      tiles: [TERRAIN],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
      attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Relief: AWS Terrain Tiles</a>',
    };
    map.addSource("dem", dem);
    map.addSource("dem-shade", { ...dem, attribution: undefined });
    map.addLayer(
      {
        id: "relief",
        type: "hillshade",
        source: "dem-shade",
        paint: {
          "hillshade-shadow-color": "#4B3462",
          "hillshade-highlight-color": "#FFFFFF",
          "hillshade-accent-color": "#7A5494",
          "hillshade-exaggeration": 0.32,
        },
      },
      map.getLayer("tunnel_motorway_link_casing") ? "tunnel_motorway_link_casing" : undefined,
    );
    map.setTerrain({ source: "dem", exaggeration: 1.3 });
    if (typeof map.setSky === "function") {
      map.setSky({
        "sky-color": "#B7A6D2",
        "horizon-color": "#F4EFF8",
        "fog-color": "#EFE9F5",
        "sky-horizon-blend": 0.55,
        "horizon-fog-blend": 0.7,
        "fog-ground-blend": 0.3,
      });
    }
  }

  function addRoute() {
    const before = map.getLayer("road_one_way_arrow") ? "road_one_way_arrow" : undefined;
    map.addSource("route", { type: "geojson", lineMetrics: true, data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } } });
    const layout = { "line-cap": "round", "line-join": "round" };
    map.addLayer(
      { id: "route-casing", type: "line", source: "route", layout, paint: { "line-color": "#FFFFFF", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 15], "line-opacity": 0.95 } },
      before,
    );
    map.addLayer(
      { id: "route-line", type: "line", source: "route", layout, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 7.5], "line-gradient": gradient(0) } },
      before,
    );
  }
  const setRoute = (coords) => map.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
  const setProgress = (p) => map.setPaintProperty("route-line", "line-gradient", gradient(p));

  /* ---------- markers ---------- */
  const townMarkers = {};
  let van;
  let popup;
  function addMarkers() {
    const shopEl = document.createElement("div");
    shopEl.className = "mk mk-shop";
    shopEl.innerHTML = '<img src="img/lotus.svg" alt="" width="26" height="20"><span>Florăria Bloom</span>';
    new maplibregl.Marker({ element: shopEl, anchor: "bottom" }).setLngLat(shop).addTo(map);

    towns.forEach((z) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mk mk-town";
      el.innerHTML = `<strong>${z.name}</strong><span>${lei(z.price)}</span>`;
      el.setAttribute("aria-label", `${z.name}: vezi traseul`);
      el.addEventListener("click", (e) => { e.stopPropagation(); drive(z.id); });
      const c = routes.towns[z.id].coords;
      townMarkers[z.id] = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(c[c.length - 1]).addTo(map);
    });

    const vanEl = document.createElement("div");
    vanEl.className = "mk-van";
    // Rear three-quarter view: the follow camera always sits behind the van
    vanEl.innerHTML = `<svg viewBox="0 0 84 88" width="66" height="69" aria-hidden="true">
      <ellipse cx="42" cy="80" rx="34" ry="7" fill="rgba(20,14,26,.35)"/>
      <rect x="3" y="30" width="7" height="9" rx="2" fill="#2F2140"/><rect x="74" y="30" width="7" height="9" rx="2" fill="#2F2140"/>
      <path d="M17 12 Q18 5 25 5 H59 Q66 5 67 12 L71 30 H13 Z" fill="#7A5E98"/>
      <path d="M21 9 H63 L65 16 H19 Z" fill="#8F74AC"/>
      <rect x="10" y="28" width="64" height="42" rx="7" fill="#4B3462"/>
      <rect x="15" y="33" width="25" height="15" rx="3" fill="#D9D1E6"/><rect x="44" y="33" width="25" height="15" rx="3" fill="#D9D1E6"/>
      <path d="M15 33 h25 v6 h-25z M44 33 h25 v6 h-25z" fill="#fff" opacity=".35"/>
      <line x1="42" y1="31" x2="42" y2="66" stroke="#35244A" stroke-width="1.6"/>
      <g transform="translate(42 56)" fill="#CFA021"><path d="M0 -6 C3 -3 3 1 0 3 C-3 1 -3 -3 0 -6Z"/><path d="M-1 3 C-6 2 -8 -2 -7 -4 C-4 -3 -2 0 -1 3Z"/><path d="M1 3 C6 2 8 -2 7 -4 C4 -3 2 0 1 3Z"/></g>
      <rect x="11" y="49" width="5" height="12" rx="2" fill="#E2485C"/><rect x="68" y="49" width="5" height="12" rx="2" fill="#E2485C"/>
      <rect x="11" y="61" width="5" height="3" rx="1" fill="#F5D6A8"/><rect x="68" y="61" width="5" height="3" rx="1" fill="#F5D6A8"/>
      <rect x="8" y="66" width="68" height="8" rx="3" fill="#2A1D38"/>
      <rect x="35" y="66.5" width="14" height="5" rx="1" fill="#F8F7FA"/>
      <rect x="12" y="68" width="13" height="13" rx="4" fill="#15101C"/><rect x="59" y="68" width="13" height="13" rx="4" fill="#15101C"/>
    </svg>`;
    van = new maplibregl.Marker({ element: vanEl, anchor: "bottom", rotationAlignment: "viewport", pitchAlignment: "viewport" }).setLngLat(shop);
    popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, anchor: "bottom", className: "van-pop", maxWidth: "260px" });
    popup.setOffset(78);
  }

  /* ---------- panel ---------- */
  const picker = $("[data-town-picker]");
  const trip = $("[data-trip]");
  const actions = $("[data-trip-actions]");
  picker.innerHTML = towns
    .map((z) => `<button type="button" class="town-btn" data-town="${z.id}" aria-pressed="false"><span>${z.name}</span><small>${lei(z.price)}</small></button>`)
    .join("");
  picker.addEventListener("click", (e) => {
    const b = e.target.closest("[data-town]");
    if (b) drive(b.dataset.town);
  });
  $("[data-replay]").addEventListener("click", () => current && drive(current));
  $("[data-order-here]").addEventListener("click", () => current && onOrder(towns.find((z) => z.id === current)));

  function showTrip(z, r) {
    picker.querySelectorAll("[data-town]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.town === z.id)));
    Object.entries(townMarkers).forEach(([id, m]) => m.getElement().classList.toggle("active", id === z.id));
    trip.innerHTML = `<p class="trip-town">${z.name}</p>
      <dl class="trip-stats">
        <div><dt>Distanță</dt><dd>${fmtKm(r.total)}</dd></div>
        <div><dt>Pe drum</dt><dd>~${routes.towns[z.id].min} min</dd></div>
        <div><dt>Transport</dt><dd>${lei(z.price)}</dd></div>
      </dl>
      <p class="trip-note">${z.time}${draftTag()}</p>`;
    actions.hidden = false;
  }

  /* ---------- performance helpers ---------- */
  // Adaptive quality: if the device can't keep ~45 fps in the first half second of a drive,
  // drop the 3D terrain and extruded buildings for the rest of the visit (the route stays the same).
  let lite = false;
  function goLite() {
    if (lite) return;
    lite = true;
    map.setTerrain(null);
    if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "none");
    root.classList.add("map3d-lite");
  }
  let symbolLayers = [];
  function setLabels(visible) {
    if (!symbolLayers.length) symbolLayers = map.getStyle().layers.filter((l) => l.type === "symbol" && !l.id.startsWith("poi")).map((l) => l.id);
    symbolLayers.forEach((id) => map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
  }
  // Optional FPS meter: add ?fps to the URL
  const fpsMeter = new URLSearchParams(location.search).has("fps") ? document.createElement("div") : null;
  if (fpsMeter) { fpsMeter.className = "fps-meter"; root.append(fpsMeter); }
  let fpsFrames = 0;
  let fpsStart = 0;
  const fpsTick = (now) => {
    if (!fpsMeter) return;
    fpsFrames++;
    if (now - fpsStart >= 500) {
      fpsMeter.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsStart))} fps`;
      fpsFrames = 0;
      fpsStart = now;
    }
  };

  /* ---------- the drive ---------- */
  let current = null;
  let frame = 0;
  let animating = false;

  function stop() {
    cancelAnimationFrame(frame);
    animating = false;
    setLabels(true);
  }

  function arrive(z, r) {
    const end = r.coords[r.coords.length - 1];
    van.setLngLat(end);
    setProgress(1);
    popup
      .setLngLat(end)
      .setHTML(`<strong>${z.name}</strong><span>Transport ${lei(z.price)}</span>`)
      .addTo(map);
    popup.getElement()?.classList.add("arrived");
    townMarkers[z.id]?.getElement().classList.add("arrived");
    van.setRotation(0);
    setLabels(true);
    if (!reduceMotion) map.easeTo({ zoom: 16.4, pitch: 60, duration: 1400 });
  }

  function drive(id) {
    const z = towns.find((t) => t.id === id);
    const r = prepared[id];
    if (!z || !r || !map.getSource("route")) return;
    stop();
    current = id;
    showTrip(z, r);
    setRoute(r.coords);
    setProgress(0);
    popup.remove();
    Object.values(townMarkers).forEach((m) => m.getElement().classList.remove("arrived"));
    van.addTo(map).setLngLat(r.coords[0]);

    if (reduceMotion) {
      const b = r.coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(r.coords[0], r.coords[0]));
      map.fitBounds(b, { padding: panelPadding(), duration: 0, pitch: 45 });
      arrive(z, r);
      return;
    }

    const startB = bearing(r.coords[0], pointAt(r, 120));
    let camB = startB;
    const long = r.total > 6000;
    // Short enough to feel snappy: ~4.5 s in town, never more than 9 s
    const duration = Math.min(9000, Math.max(4200, 3400 + (r.total / 1000) * 200));
    animating = true;

    const driveZoom = long ? 14.6 : 15.6;
    setLabels(false);
    map.flyTo({ center: r.coords[0], elevation: groundAt(r.coords[0]), zoom: driveZoom, pitch: 62, bearing: startB, padding: panelPadding(), duration: 1200, essential: true });
    map.once("moveend", () => {
      if (!animating || current !== id) return;
      const t0 = performance.now();
      fpsStart = t0;
      fpsFrames = 0;
      let ground = groundAt(r.coords[0]);
      let groundTarget = ground;
      let lastText = 0;
      let lastLine = 0;
      let n = 0;
      let probe = lite ? null : { frames: 0, start: 0 };
      const step = (now) => {
        if (!animating || current !== id) return;
        const u = Math.min(1, (now - t0) / duration);
        const d = ease(u) * r.total;
        const pos = pointAt(r, d);
        const heading = bearing(pos, pointAt(r, Math.min(r.total, d + 25)));
        const look = bearing(pos, pointAt(r, Math.min(r.total, d + 220)));
        camB += angleDiff(camB, look) * 0.09;
        if (n++ % 4 === 0) groundTarget = groundAt(pos);
        ground += (groundTarget - ground) * 0.15;
        map.jumpTo({ center: pos, elevation: lite ? 0 : ground, bearing: camB, zoom: driveZoom, pitch: lite ? 55 : 62 });
        fpsTick(now);
        if (probe) {
          probe.frames++;
          if (!probe.start) probe.start = now;
          else if (now - probe.start >= 600) {
            if (((probe.frames - 1) * 1000) / (now - probe.start) < 45) goLite();
            probe = null;
          }
        }
        // The van leans a little into bends, relative to the camera
        van.setLngLat(pos).setRotation(Math.max(-28, Math.min(28, angleDiff(camB, heading))) * 0.6);
        popup.setLngLat(pos);
        if (now - lastLine > 90) {
          lastLine = now;
          setProgress(d / r.total);
        }
        if (now - lastText > 300) {
          lastText = now;
          popup.setHTML(`<strong>Spre ${z.name}</strong><span>${fmtKm(r.total - d)} rămași</span>`);
          if (!popup.isOpen()) popup.addTo(map);
        }
        if (u < 1) frame = requestAnimationFrame(step);
        else {
          animating = false;
          arrive(z, r);
        }
      };
      frame = requestAnimationFrame(step);
    });
  }

  // If the visitor grabs the map mid-drive, stop and let them explore
  map.on("movestart", (e) => {
    if (animating && e.originalEvent) {
      stop();
      const z = towns.find((t) => t.id === current);
      if (z) arrive(z, prepared[current]);
    }
  });

  /* Frame the whole valley: shop + every town */
  function overview(duration = 1500) {
    const pts = [shop, ...towns.map((z) => routes.towns[z.id].coords.at(-1))];
    const b = pts.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(shop, shop));
    const pad = panelPadding();
    // cameraForBounds ignores pitch, so zoom out a little to keep the far edge in view
    const cam = map.cameraForBounds(b, { padding: { ...pad, top: pad.top + 60, bottom: pad.bottom + 60, left: pad.left + 30, right: pad.right + 30 }, bearing: 0 });
    if (cam) map.easeTo({ center: b.getCenter(), zoom: cam.zoom - 0.1, bearing: 0, pitch: 55, padding: pad, duration });
  }

  /* ---------- boot ---------- */
  let ready = false;
  const fail = setTimeout(() => { if (!ready) root.classList.add("map3d-failed"); }, 20000);
  map.on("load", () => {
    ready = true;
    clearTimeout(fail);
    tint();
    addRelief();
    addRoute();
    addMarkers();
    map.resize();
    overview(0);
    root.classList.add("map3d-ready");
    // Keep the attribution one tap away instead of covering the map on small screens
    container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
  });
  desktop.addEventListener("change", () => overview(300));

  return { map, drive };
};
