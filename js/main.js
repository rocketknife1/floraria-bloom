(() => {
  /* ------------------------------------------------------------------
   * CONFIG: tot ce ține de program și livrare se schimbă doar aici.
   * Valorile sunt ORIENTATIVE până le confirmă florăria (draft: true
   * afișează pe site mențiunea „de confirmat”).
   * ------------------------------------------------------------------ */
  const CONFIG = {
    draft: true,
    phoneWa: "", // ex. "40723123456"; gol = WhatsApp fără număr precompletat
    mapsQuery: "", // ex. "Florăria Bloom, Str. 1 Decembrie 1918, bl. 65, <oraș>"; completat = hartă Google încorporată
    // 0 = duminică … 6 = sâmbătă; null = închis
    hours: {
      1: ["09:00", "19:00"],
      2: ["09:00", "19:00"],
      3: ["09:00", "19:00"],
      4: ["09:00", "19:00"],
      5: ["09:00", "19:00"],
      6: ["09:00", "15:00"],
      0: null,
    },
    delivery: {
      days: [1, 2, 3, 4, 5, 6],
      sameDayCutoff: "15:00",
      freeOverLei: 250,
      zones: [
        { id: "ridicare", name: "Ridici din florărie", price: 0, time: "gata în 1–2 ore", pickup: true },
        { id: "oras", name: "În oraș", price: 15, time: "în aceeași zi" },
        { id: "cartiere", name: "Cartierele mărginașe", price: 20, time: "în aceeași zi" },
        { id: "15km", name: "Localități vecine, până la 15 km", price: 30, time: "în aceeași zi sau a doua zi" },
        { id: "30km", name: "Până la 30 km", price: 45, time: "a doua zi" },
      ],
    },
  };

  const STORIES = [
    { src: "img/buchet-culori-calde.jpg", bg: "#4e4021", label: "Apus", title: "Buchet în culori calde", text: "Trandafiri portocalii și galbeni, crizanteme și eucalipt, în hârtie aurie.", type: "buchet" },
    { src: "img/trandafiri-rosii.jpg", bg: "#56192b", label: "Clasic", title: "Trandafiri roșii", text: "Clasicul care nu dă greș, legat simplu, ca să vorbească florile.", type: "buchet" },
    { src: "img/cutie-rosie-gerbera.jpg", bg: "#561921", label: "Pasiune", title: "Cutie roșie", text: "Gerbera, garoafe și trandafiri roșii, într-o cutie legată cu fundă.", type: "cutie" },
    { src: "img/buchet-hortensie-albastra.jpg", bg: "#2c2947", label: "Albastru", title: "Buchet cu hortensie albastră", text: "Hortensie, trandafiri și lisianthus mov, în hârtie roșie.", type: "buchet" },
    { src: "img/cos-bujori-piersica.jpg", bg: "#3f3730", label: "Piersică", title: "Coș cu bujori și trandafiri", text: "Roz și piersică, cu hortensie, într-un coș alb.", type: "cos" },
    { src: "img/cutie-galbena-gerbera.jpg", bg: "#4f3d20", label: "Soare", title: "Cutie cu gerbera galbene", text: "Gerbera, lisianthus și spice de grâu, pentru o zi luminoasă.", type: "cutie" },
    { src: "img/buchet-trandafiri-albi.jpg", bg: "#3e3631", label: "Alb pur", title: "Buchet de trandafiri albi", text: "Trandafiri albi cu verdeață, în hârtie verde-salvie.", type: "buchet" },
    { src: "img/cutie-roz-bujori.jpg", bg: "#492630", label: "Bujori", title: "Cutie cu bujori și trandafiri", text: "Bujor, trandafiri vișinii și flori albe, cu panglici.", type: "cutie" },
  ];

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

  /* Map: embedded only once a full address is published */
  const map = $("[data-map]");
  if (map && CONFIG.mapsQuery) {
    const q = encodeURIComponent(CONFIG.mapsQuery);
    map.innerHTML = `<iframe title="Harta: Florăria Bloom" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&output=embed"></iframe>
      <a class="btn btn-primary map-open" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Deschide în Google Maps</a>`;
  }

  /* Delivery zones: list, map pins, form select */
  const zones = CONFIG.delivery.zones;
  $("[data-zones]").innerHTML = zones
    .map(
      (z, i) => `<li data-zone="${i}">
        <span class="zone-num">${i + 1}</span>
        <span class="zone-name">${z.name}</span>
        <span class="zone-price">${lei(z.price)}</span>
        <span class="zone-time">${z.time}</span>
      </li>`,
    )
    .join("");
  $("[data-zones-note]").innerHTML =
    `Livrare gratuită în oraș pentru comenzile de peste ${CONFIG.delivery.freeOverLei} lei. Livrăm de ${DAYS[CONFIG.delivery.days[0]]} până ${DAYS[CONFIG.delivery.days.at(-1)]}.` +
    draftTag();

  $("[data-zone-select]").innerHTML = zones
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
  $$('input[name="predare"]').forEach((r) =>
    r.addEventListener("change", () => {
      deliveryFields.hidden = !isDelivery();
      updateDateHint();
    }),
  );
  data.addEventListener("change", updateDateHint);

  function prefill(item, type) {
    tip.value = TYPE_LABEL[type] ?? tip.value;
    const line = `Aș vrea ceva asemănător cu „${item}”.`;
    if (!mesaj.value.includes(line)) mesaj.value = line + (mesaj.value ? `\n${mesaj.value}` : "");
    setTimeout(() => $("#f-nume").focus({ preventScroll: true }), 500);
  }
  $$(".ask").forEach((a) => a.addEventListener("click", () => prefill(a.dataset.item, a.closest("li").dataset.type)));

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
  const storyImg = $("#story-img");
  const storyBlur = $("#story-blur");
  const bars = $("#story-bars");
  const DURATION = 5000;
  let sIndex = 0;
  let sStart = 0;
  let sElapsed = 0;
  let sPaused = false;
  let sFrame = 0;

  bars.innerHTML = STORIES.map(() => '<span class="story-bar"><i></i></span>').join("");
  const barFills = $$(".story-bar i", bars);

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
    if (sPaused || reduceMotion) {
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
  story.addEventListener("click", (e) => { if (e.target === story) story.close(); });
  story.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") stepStory(-1);
    if (e.key === "ArrowRight") stepStory(1);
  });
  // Press and hold pauses, like on Instagram
  const frame = $(".story-frame");
  frame.addEventListener("pointerdown", () => { sPaused = true; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => frame.addEventListener(ev, () => { sPaused = false; }));
  $("#story-cta").addEventListener("click", () => {
    const s = STORIES[sIndex];
    story.close();
    prefill(s.title, s.type);
  });
  story.addEventListener("close", () => cancelAnimationFrame(sFrame));

  /* Delivery road: pins along the path, van placed by progress */
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
      return `<g class="stop" transform="translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})"><circle r="17"/><text y="5" text-anchor="middle">${i + 1}</text></g>`;
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

  /* Scroll motion ------------------------------------------------------ */
  if (reduceMotion) {
    placeVan(1);
    return;
  }

  const hero = $(".hero");
  const card = $(".hero-card");
  const delivery = $(".delivery");
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
    ".section-head, .stories-head, .stories, .rail-head, .rail-track .zoom, .world, .worlds-text, .steps li, .drive-head, .order-intro, .order-form, .contact-info, .map",
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

    // The van drives while the delivery scene is pinned (desktop) or passes through the viewport (mobile)
    const r = delivery.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) {
      const dp = pinnedQuery.matches
        ? -r.top / Math.max(1, r.height - vh)
        : (vh * 0.75 - r.top) / (r.height * 0.8);
      placeVan(dp);
    }
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  placeVan(0);
  update();
})();
