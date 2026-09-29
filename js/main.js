(async () => {
  /* ------------------------------------------------------------------
   * CONTENT lives in content.json, so it can be edited without touching
   * code (e.g. from the Organizator app, which commits that file):
   *  - config: program, livrare, telefon WhatsApp. Valorile sunt ORIENTATIVE
   *    până le confirmă florăria (draft: true afișează „de confirmat”).
   *    km / min vin din traseele reale din js/routes.js, nu se editează.
   *  - stories, gallery, accessories, climate: listele de pe pagină.
   *  - texts: titlurile și paragrafele marcate cu data-text în index.html.
   * ------------------------------------------------------------------ */
  let CONTENT;
  try {
    const res = await fetch("content.json", { cache: "no-store" });
    CONTENT = await res.json();
  } catch (err) {
    console.error("content.json nu s-a putut încărca", err);
    return;
  }
  const { config: CONFIG, stories: STORIES, climate: CLIMATE } = CONTENT;


  const TYPE_LABEL = { buchet: "Buchet", cutie: "Cutie cu flori", cos: "Coș cu flori" };
  const DAYS = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const at = (base, hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const draftTag = () => (CONFIG.draft ? ' <span class="draft">de confirmat</span>' : "");
  const lei = (n) => (n === 0 ? "gratuit" : `${n} lei`);
  const km = (n) => `${String(n).replace(".", ",")} km`;

  /* Content from content.json: texts, story rings, gallery rails, accessories */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dims = (o) => (o.width && o.height ? ` width="${o.width}" height="${o.height}"` : "");
  $$("[data-text]").forEach((el) => {
    const t = CONTENT.texts?.[el.dataset.text];
    if (t != null) el.textContent = t;
  });
  $("[data-story-rings]").innerHTML = STORIES.map(
    (s, i) => `<li><button type="button" class="story-ring" data-story="${i}"><img src="${esc(s.src)}" alt=""${dims(s)} loading="lazy"><span>${esc(s.label)}</span></button></li>`,
  ).join("");
  const ASK_LABEL = { cutie: "Vreau una asemănătoare" };
  $$("[data-gallery]").forEach((ul) => {
    const type = ul.dataset.gallery;
    ul.innerHTML = CONTENT.gallery
      .filter((g) => g.type === type)
      .map(
        (g) => `<li data-type="${type}"><figure><button type="button" class="zoom" aria-label="Mărește: ${esc(g.name)}"><img src="${esc(g.img)}" alt="${esc(g.alt)}" loading="lazy"${dims(g)}></button><figcaption><span class="item-name">${esc(g.name)}</span><span class="item-desc">${esc(g.desc)}</span><a class="ask" data-item="${esc(g.ask || g.name)}" href="#comanda">${ASK_LABEL[type] ?? "Vreau unul asemănător"}</a></figcaption></figure></li>`,
      )
      .join("");
    ul.closest("[data-rail]").hidden = !ul.children.length;
  });
  $("[data-accessories]").insertAdjacentHTML(
    "afterbegin",
    CONTENT.accessories
      .map((a) => {
        const cls = a.layout === "wide" ? ' class="b-wide"' : a.layout === "tall" ? ' class="b-tall"' : "";
        const style = a.imagePosition ? ` style="object-position: ${esc(a.imagePosition)}"` : "";
        return `<li${cls}><img${style} src="${esc(a.img)}" alt="${esc(a.alt)}" loading="lazy"${dims(a)}><div class="b-text"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></li>`;
      })
      .join(""),
  );

  /* Header + menu */
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = $(".nav-toggle");
  const nav = $("#meniu");
  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  };
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  if (CONFIG.phoneWa) $$('a[href="https://wa.me/"]').forEach((a) => { a.href = `https://wa.me/${CONFIG.phoneWa}`; });

  /* Open / closed status, from CONFIG.hours */
  function shopStatus(now = new Date()) {
    const today = CONFIG.hours[now.getDay()];
    if (today && now >= at(now, today[0]) && now < at(now, today[1])) {
      return { open: true, text: `Deschis acum · până la ${today[1]}` };
    }
    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const h = CONFIG.hours[d.getDay()];
      if (!h || (i === 0 && now >= at(now, h[0]))) continue;
      const when = i === 0 ? "azi" : i === 1 ? "mâine" : DAYS[d.getDay()];
      return { open: false, text: `Închis acum · deschidem ${when} la ${h[0]}` };
    }
    return { open: false, text: "Închis acum" };
  }
  function renderStatus() {
    const s = shopStatus();
    $$("[data-status]").forEach((el) => {
      el.hidden = false;
      el.classList.toggle("is-open", s.open);
      el.innerHTML = `<span class="dot" aria-hidden="true"></span>${s.text}${draftTag()}`;
    });
  }

  /* Opening hours table */
  const hoursTable = $("[data-hours]");
  if (hoursTable) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const todayIdx = new Date().getDay();
    hoursTable.innerHTML =
      (CONFIG.draft ? '<caption class="draft-caption">Program orientativ, de confirmat.</caption>' : "") +
      order
        .map((d) => {
          const h = CONFIG.hours[d];
          return `<tr${d === todayIdx ? ' class="today"' : ""}><th scope="row">${cap(DAYS[d])}${d === todayIdx ? " <small>azi</small>" : ""}</th><td>${h ? `${h[0]} – ${h[1]}` : "închis"}</td></tr>`;
        })
        .join("");
  }

  /* Google map with the shop address */
  const mapCard = $("[data-map]");
  if (mapCard && CONFIG.mapsQuery) {
    const q = encodeURIComponent(CONFIG.mapsQuery);
    mapCard.innerHTML = `<iframe title="Harta: Florăria Bloom Petroșani" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>
      <a class="btn btn-primary map-open" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Deschide în Google Maps</a>`;
  }

  /* Delivery zones: cards, road stops, form select */
  const zones = CONFIG.delivery.zones;
  $("[data-zones]").innerHTML = zones
    .map(
      (z, i) => `<li data-zone="${i}">
        <span class="zone-name">${z.name}</span>
        <span class="zone-price">${lei(z.price)}</span>
        <span class="zone-time">${z.km ? `${km(z.km)} · ~${z.min} min · ` : ""}${z.time}</span>
      </li>`,
    )
    .join("");
  $("[data-zones-note]").innerHTML =
    `Livrare gratuită în Petroșani pentru comenzile de peste ${CONFIG.delivery.freeOverLei} lei. Livrăm de ${DAYS[CONFIG.delivery.days[0]]} până ${DAYS[CONFIG.delivery.days.at(-1)]}. Distanțele sunt pe drum, din fața florăriei.` +
    draftTag();

  const zoneSelect = $("[data-zone-select]");
  zoneSelect.innerHTML = zones
    .filter((z) => !z.pickup)
    .map((z) => `<option value="${z.name}">${z.name} (${lei(z.price)})</option>`)
    .join("");

  /* Same-day delivery countdown, from CONFIG.delivery */
  function deliveryInfo(now = new Date()) {
    const d = CONFIG.delivery;
    const cutoff = at(now, d.sameDayCutoff);
    if (d.days.includes(now.getDay()) && now < cutoff) {
      const mins = Math.ceil((cutoff - now) / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return {
        sameDay: true,
        value: h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`,
        note: `rămase ca să livrăm azi. Comenzile primite până la ${d.sameDayCutoff} pleacă azi.`,
      };
    }
    for (let i = 1; i <= 7; i++) {
      const n = new Date(now);
      n.setDate(n.getDate() + i);
      if (!d.days.includes(n.getDay())) continue;
      const when = i === 1 ? "mâine" : DAYS[n.getDay()];
      return { sameDay: false, value: `Livrăm ${when}`, note: `Pentru azi am încheiat livrările. Comenzile de acum pleacă ${when}.` };
    }
    return { sameDay: false, value: "–", note: "" };
  }
  const countdown = $("[data-countdown]");
  function renderCountdown() {
    const info = deliveryInfo();
    countdown.classList.toggle("is-late", !info.sameDay);
    $(".countdown-label", countdown).textContent = info.sameDay ? "Livrare în aceeași zi" : "Următoarea livrare";
    $("[data-countdown-value]").textContent = info.value;
    $("[data-countdown-note]").innerHTML = info.note + draftTag();
  }

  renderStatus();
  renderCountdown();
  setInterval(() => { renderStatus(); renderCountdown(); }, 30000);

  /* Rails (Netflix-style rows) */
  $$("[data-rail]").forEach((rail) => {
    const track = $(".rail-track", rail);
    const [prev, next] = $$(".rail-btn", rail);
    const update = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      rail.classList.toggle("rail-static", max <= 0);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    };
    [prev, next].forEach((b) =>
      b.addEventListener("click", () => {
        track.scrollBy({ left: Number(b.dataset.dir) * track.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
      }),
    );
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  /* Lightbox across all rails */
  const items = $$(".rail-track > li");
  const lb = $("#lightbox");
  const lbImg = $("#lb-img");
  const lbCap = $("#lb-cap");
  let current = 0;
  const show = (i) => {
    current = (i + items.length) % items.length;
    const li = items[current];
    const img = $("img", li);
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = $(".item-name", li).textContent;
  };
  items.forEach((li, i) => $(".zoom", li).addEventListener("click", () => { show(i); lb.showModal(); }));
  $("#lb-prev").addEventListener("click", () => show(current - 1));
  $("#lb-next").addEventListener("click", () => show(current + 1));
  $("#lb-close").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  /* Plant room climate tabs */
  const climate = $("[data-climate]");
  if (climate) {
    const tabs = $("[data-climate-tabs]");
    tabs.innerHTML = CLIMATE.map(
      (c, i) => `<button type="button" role="tab" id="tab-${c.id}" aria-controls="climate-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-climate-id="${c.id}">${c.tab}</button>`,
    ).join("");
    const panel = $("[data-climate-panel]");
    const band = $("[data-thermo-band]");
    const selectClimate = (id, focus = false) => {
      const c = CLIMATE.find((x) => x.id === id);
      $$("[role=tab]", tabs).forEach((t) => {
        const on = t.dataset.climateId === id;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      panel.setAttribute("aria-labelledby", `tab-${id}`);
      const img = $("[data-climate-img]");
      img.src = c.img;
      img.alt = c.alt;
      $("[data-climate-title]").textContent = c.title;
      $("[data-climate-text]").textContent = c.text;
      $("[data-climate-temp]").textContent = `${c.min}–${c.max} °C`;
      $("[data-climate-hum]").textContent = c.hum;
      $("[data-climate-light]").textContent = c.light;
      band.style.left = `${(c.min / 30) * 100}%`;
      band.style.width = `${((c.max - c.min) / 30) * 100}%`;
      panel.classList.remove("swap");
      void panel.offsetWidth;
      panel.classList.add("swap");
    };
    tabs.addEventListener("click", (e) => {
      const t = e.target.closest("[data-climate-id]");
      if (t) selectClimate(t.dataset.climateId);
    });
    tabs.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const idx = CLIMATE.findIndex((c) => c.id === $("[aria-selected=true]", tabs).dataset.climateId);
      const n = (idx + (e.key === "ArrowRight" ? 1 : -1) + CLIMATE.length) % CLIMATE.length;
      selectClimate(CLIMATE[n].id, true);
    });
    selectClimate(CLIMATE[0].id);
  }

  /* Order form */
  const form = $("#order-form");
  const tip = $("#f-tip");
  const mesaj = $("#f-mesaj");
  const data = $("#f-data");
  const adresa = $("#f-adresa");
  const deliveryFields = $("#delivery-fields");
  const dataHint = $("#f-data-hint");
  data.min = new Date().toISOString().slice(0, 10);

  const isDelivery = () => form.elements.predare.value === "livrare";
  function updateDateHint() {
    dataHint.hidden = true;
    if (!isDelivery() || !data.value) return;
    const chosen = new Date(`${data.value}T12:00:00`);
    const now = new Date();
    if (!CONFIG.delivery.days.includes(chosen.getDay())) {
      dataHint.textContent = `${cap(DAYS[chosen.getDay()])} nu livrăm. Alege altă zi sau ridică florile din florărie.`;
      dataHint.hidden = false;
    } else if (chosen.toDateString() === now.toDateString() && !deliveryInfo(now).sameDay) {
      dataHint.textContent = "Pentru azi nu mai putem livra. Alege mâine sau ridică florile din florărie.";
      dataHint.hidden = false;
    }
  }
  const syncDelivery = () => {
    deliveryFields.hidden = !isDelivery();
    updateDateHint();
  };
  $$('input[name="predare"]').forEach((r) => r.addEventListener("change", syncDelivery));
  data.addEventListener("change", updateDateHint);

  function prefill(item, type) {
    tip.value = TYPE_LABEL[type] ?? tip.value;
    const line = `Aș vrea ceva asemănător cu „${item}”.`;
    if (!mesaj.value.includes(line)) mesaj.value = line + (mesaj.value ? `\n${mesaj.value}` : "");
    setTimeout(() => $("#f-nume").focus({ preventScroll: true }), 500);
  }
  $$(".ask").forEach((a) => a.addEventListener("click", () => prefill(a.dataset.item, a.closest("li").dataset.type)));

  // "Comandă cu livrare aici" from the 3D map
  function orderTo(zone) {
    form.elements.predare.value = "livrare";
    $('input[name="predare"][value="livrare"]').checked = true;
    syncDelivery();
    zoneSelect.value = zone.name;
    setTimeout(() => adresa.focus({ preventScroll: true }), 600);
  }

  const checks = [
    { el: $("#f-nume"), ok: (v) => v.trim().length >= 2 },
    { el: $("#f-tel"), ok: (v) => v.replace(/[^\d]/g, "").length >= 10 },
    { el: data, ok: (v) => Boolean(v) },
    { el: adresa, ok: (v) => !isDelivery() || v.trim().length >= 5 },
  ];
  const validate = ({ el, ok }) => {
    const valid = ok(el.value);
    el.setAttribute("aria-invalid", String(!valid));
    const err = $(`#${el.id}-err`);
    err.hidden = valid;
    if (valid) el.removeAttribute("aria-describedby");
    else el.setAttribute("aria-describedby", err.id);
    return valid;
  };
  checks.forEach((c) => c.el.addEventListener("blur", () => { if (c.el.value) validate(c); }));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const bad = checks.filter((c) => !validate(c));
    if (bad.length) { bad[0].el.focus(); return; }

    const v = Object.fromEntries(new FormData(form));
    const date = new Date(`${v.data}T12:00:00`).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
    const lines = [
      "Bună ziua! Aș dori să comand flori.",
      "",
      `Ce doresc: ${v.tip}`,
      v.ocazie.trim() ? `Ocazia: ${v.ocazie.trim()}` : null,
      `Pentru data: ${date}`,
      `Buget: ${v.buget}`,
      v.predare === "livrare"
        ? `Livrare la domiciliu: ${v.zona}, ${v.adresa.trim()}, ${v.interval.toLowerCase()}`
        : "Le ridic din florărie",
      v.mesaj.trim() ? `Detalii: ${v.mesaj.trim()}` : null,
      "",
      `Nume: ${v.nume.trim()}`,
      `Telefon: ${v.telefon.trim()}`,
    ];
    const text = lines.filter((l) => l !== null).join("\n");
    const url = `https://wa.me/${CONFIG.phoneWa}?text=${encodeURIComponent(text)}`;
    if (matchMedia("(pointer: coarse)").matches) location.href = url;
    else window.open(url, "_blank", "noopener");
  });

  $("#an").textContent = new Date().getFullYear();

  /* Stories viewer (Instagram-style) */
  const story = $("#story");
  const storyFrame = $("#story-frame");
  const storyImg = $("#story-img");
  const storyBlur = $("#story-blur");
  const pauseBtn = $("#story-pause");
  const bars = $("#story-bars");
  const DURATION = 6000;
  let sIndex = 0;
  let sStart = 0;
  let sElapsed = 0;
  let sPaused = false;
  let sFrame = 0;

  bars.innerHTML = STORIES.map(() => '<span class="story-bar"><i></i></span>').join("");
  const barFills = $$(".story-bar i", bars);

  function setPaused(p) {
    sPaused = p;
    storyFrame.classList.toggle("is-paused", p);
    pauseBtn.setAttribute("aria-pressed", String(p));
    pauseBtn.setAttribute("aria-label", p ? "Continuă" : "Pune pauză");
  }
  function loadStory() {
    const s = STORIES[sIndex];
    storyImg.src = s.src;
    storyImg.alt = s.title;
    storyBlur.src = s.src;
    story.style.setProperty("--story-bg", s.bg);
    $("#story-label").textContent = s.label;
    $("#story-title").textContent = s.title;
    $("#story-text").textContent = s.text;
    $("#story-cta").textContent = s.type === "cutie" ? "Vreau una asemănătoare" : "Vreau unul asemănător";
    barFills.forEach((f, i) => { f.style.transform = `scaleX(${i < sIndex ? 1 : 0})`; });
    sStart = performance.now();
    sElapsed = 0;
    $(`.story-ring[data-story="${sIndex}"]`)?.classList.add("seen");
  }
  function openStory(i) {
    sIndex = i;
    setPaused(reduceMotion);
    story.showModal();
    loadStory();
    cancelAnimationFrame(sFrame);
    sFrame = requestAnimationFrame(tickStory);
  }
  function stepStory(d) {
    const n = sIndex + d;
    if (n < 0) { sStart = performance.now(); sElapsed = 0; return; }
    if (n >= STORIES.length) { story.close(); return; }
    sIndex = n;
    loadStory();
  }
  function tickStory(now) {
    if (!story.open) return;
    if (sPaused) {
      sStart = now - sElapsed;
    } else {
      sElapsed = now - sStart;
      const p = clamp(sElapsed / DURATION, 0, 1);
      barFills[sIndex].style.transform = `scaleX(${p})`;
      if (p >= 1) stepStory(1);
    }
    sFrame = requestAnimationFrame(tickStory);
  }
  $$(".story-ring").forEach((r) => r.addEventListener("click", () => openStory(Number(r.dataset.story))));
  $("#story-prev").addEventListener("click", () => stepStory(-1));
  $("#story-next").addEventListener("click", () => stepStory(1));
  $("#story-close").addEventListener("click", () => story.close());
  pauseBtn.addEventListener("click", () => setPaused(!sPaused));
  story.addEventListener("click", (e) => { if (e.target === story) story.close(); });
  story.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") stepStory(-1);
    if (e.key === "ArrowRight") stepStory(1);
    if (e.key === " " || e.key === "k") { e.preventDefault(); setPaused(!sPaused); }
  });
  // One tap on the story pauses / resumes; a horizontal swipe changes the story
  let down = null;
  storyFrame.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a")) { down = null; return; }
    down = { x: e.clientX, y: e.clientY };
  });
  storyFrame.addEventListener("pointerup", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) stepStory(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) setPaused(!sPaused);
  });
  $("#story-cta").addEventListener("click", () => {
    const s = STORIES[sIndex];
    story.close();
    prefill(s.title, s.type);
  });
  story.addEventListener("close", () => cancelAnimationFrame(sFrame));

  /* Delivery road: town names along the path, van placed by progress */
  const road = $("#road");
  const roadDone = $("#road-done");
  const van = $("#van");
  const wheels = $$(".wheel", van);
  const wheelBase = wheels.map((w) => w.getAttribute("transform"));
  const total = road.getTotalLength();
  const stopsAt = zones.map((_, i) => 0.03 + (i / (zones.length - 1)) * 0.94);
  $("[data-stops]").innerHTML = stopsAt
    .map((f, i) => {
      const pt = road.getPointAtLength(f * total);
      const below = i % 2 === 1;
      const name = zones[i].short ?? zones[i].name;
      return `<g class="stop" transform="translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})">
        <circle r="11"/>
        <text class="stop-label" y="${below ? 40 : -24}" text-anchor="middle">${name}</text></g>`;
    })
    .join("");
  const stopEls = $$(".stop");
  const zoneEls = $$("[data-zone]");
  roadDone.style.strokeDasharray = `${total}`;

  function placeVan(p) {
    const f = stopsAt[0] + clamp(p, 0, 1) * (stopsAt.at(-1) - stopsAt[0]);
    const len = f * total;
    const a = road.getPointAtLength(len);
    const b = road.getPointAtLength(Math.min(total, len + 2));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    van.setAttribute("transform", `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    wheels.forEach((w, i) => w.setAttribute("transform", `${wheelBase[i]} rotate(${(len * 2.2).toFixed(0)})`));
    roadDone.style.strokeDashoffset = `${total - len}`;
    let active = 0;
    stopsAt.forEach((s, i) => { if (f >= s - 0.005) active = i; });
    stopEls.forEach((el, i) => el.classList.toggle("reached", i <= active));
    zoneEls.forEach((el, i) => {
      el.classList.toggle("reached", i <= active);
      el.classList.toggle("current", i === active);
    });
  }

  /* Real 3D map: loaded only when the visitor gets close to it */
  const mapRoot = $("[data-map3d]");
  const MAPLIBRE = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl";
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  async function startMap() {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${MAPLIBRE}.css`;
    document.head.append(css);
    try {
      await Promise.all([loadScript(`${MAPLIBRE}.js`), loadScript("js/routes.js?v=13")]);
      await loadScript("js/map3d.js?v=13");
      window.initBloomMap({
        container: $("#map3d"),
        root: mapRoot,
        zones,
        routes: window.BLOOM_ROUTES,
        reduceMotion,
        draftTag,
        onOrder: (zone) => {
          orderTo(zone);
          $("#comanda").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
        },
      });
    } catch (err) {
      console.error("Harta 3D nu s-a putut încărca", err);
      mapRoot.classList.add("map3d-failed");
    }
  }
  if (mapRoot) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          startMap();
        }
      },
      { rootMargin: "700px 0px" },
    );
    io.observe(mapRoot);
  }

  /* Scroll motion ------------------------------------------------------ */
  if (reduceMotion) {
    placeVan(1);
    return;
  }

  const hero = $(".hero");
  const card = $(".hero-card");
  const delivery = $(".delivery");
  const roadEl = $(".road");
  const greenroom = $(".greenroom");
  const greenImg = $(".greenroom-media img");
  const petals = $$(".petal").map((el, i) => ({
    el,
    side: el.matches(".p4, .p5, .p6") ? 1 : -1,
    speed: [0.9, 0.6, 0.35, 1, 0.7, 0.4][i],
  }));
  [card, ...petals.map((p) => p.el)].forEach((el) =>
    el.addEventListener("animationend", () => { el.style.animation = "none"; }, { once: true }),
  );

  document.documentElement.classList.add("js-focus");
  const focusEls = $$(
    ".section-head, .stories-head, .stories, .rail-head, .rail-track .zoom, .world, .worlds-text, .bento > li, .greenroom-intro, .climate, .steps li, .drive-head, .map3d-head, .order-intro, .order-form, .contact-info, .map",
  );
  focusEls.forEach((el) => el.classList.add("focus"));
  const pinnedQuery = matchMedia("(min-width: 1001px) and (min-height: 700px)");

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    const mid = vh / 2;

    const p = clamp(window.scrollY / hero.offsetHeight, 0, 1);
    card.style.setProperty("--hs", (1 - p * 0.1).toFixed(4));
    card.style.setProperty("--ho", (1 - p * 0.35).toFixed(4));
    petals.forEach(({ el, side, speed }) => {
      el.style.setProperty("--px", `${(side * p * 90 * speed).toFixed(1)}px`);
      el.style.setProperty("--py", `${(-p * 160 * speed).toFixed(1)}px`);
    });

    for (const el of focusEls) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const centre = r.top + r.height / 2;
      const dist = Math.max(0, Math.abs(centre - mid) - r.height * 0.25);
      const t = clamp(dist / (vh * 0.55), 0, 1);
      const e = t * t * (3 - 2 * t);
      el.style.setProperty("--s", (1.03 - e * 0.11).toFixed(4));
      el.style.setProperty("--o", (1 - e * 0.45).toFixed(3));
    }

    // Plant room photo slowly settles from a close-up as the section scrolls by
    const g = greenroom.getBoundingClientRect();
    if (g.bottom > 0 && g.top < vh) {
      const gp = clamp((vh - g.top) / (vh + g.height), 0, 1);
      greenImg.style.transform = `scale(${(1.22 - gp * 0.22).toFixed(4)}) translateY(${((gp - 0.5) * -40).toFixed(1)}px)`;
    }

    // Desktop: the van drives while the delivery scene is pinned.
    // Mobile: it waits at the shop until the road itself is on screen, then drives
    // as the road travels from the bottom of the screen to its upper third.
    const r = delivery.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) {
      if (pinnedQuery.matches) {
        placeVan(-r.top / Math.max(1, r.height - vh));
      } else {
        const rr = roadEl.getBoundingClientRect();
        placeVan((vh * 0.82 - rr.top) / (vh * 0.5));
      }
    }
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  placeVan(0);
  update();
})();
