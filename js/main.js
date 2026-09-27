(() => {
  const PHONE_WA = "";

  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("meniu");
  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  };
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // Filters
  const chips = document.querySelectorAll(".chip");
  const items = [...document.querySelectorAll("#galerie > li")];
  chips.forEach((chip) => chip.addEventListener("click", () => {
    const f = chip.dataset.filter;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    items.forEach((li) => { li.hidden = f !== "toate" && li.dataset.type !== f; });
  }));

  // Lightbox
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbCap = document.getElementById("lb-cap");
  let current = 0;
  const visible = () => items.filter((li) => !li.hidden);
  const show = (li) => {
    const img = li.querySelector("img");
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = li.querySelector(".item-name").textContent;
    current = visible().indexOf(li);
  };
  const step = (d) => {
    const list = visible();
    show(list[(current + d + list.length) % list.length]);
  };
  items.forEach((li) => li.querySelector(".zoom").addEventListener("click", () => {
    show(li);
    lb.showModal();
  }));
  document.getElementById("lb-prev").addEventListener("click", () => step(-1));
  document.getElementById("lb-next").addEventListener("click", () => step(1));
  document.getElementById("lb-close").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });

  // Order form
  const form = document.getElementById("order-form");
  const tip = document.getElementById("f-tip");
  const mesaj = document.getElementById("f-mesaj");
  const data = document.getElementById("f-data");
  data.min = new Date().toISOString().slice(0, 10);

  document.querySelectorAll(".ask").forEach((a) => a.addEventListener("click", () => {
    const item = a.dataset.item;
    const type = a.closest("li").dataset.type;
    tip.value = { buchet: "Buchet", cutie: "Cutie cu flori", cos: "Coș cu flori" }[type];
    mesaj.value = `Aș vrea ceva asemănător cu „${item}”.` + (mesaj.value ? `\n${mesaj.value}` : "");
    setTimeout(() => document.getElementById("f-nume").focus({ preventScroll: true }), 400);
  }));

  const checks = [
    { el: document.getElementById("f-nume"), ok: (v) => v.trim().length >= 2 },
    { el: document.getElementById("f-tel"), ok: (v) => v.replace(/[^\d]/g, "").length >= 10 },
    { el: data, ok: (v) => Boolean(v) },
  ];
  const validate = ({ el, ok }) => {
    const valid = ok(el.value);
    el.setAttribute("aria-invalid", String(!valid));
    const err = document.getElementById(`${el.id}-err`);
    err.hidden = valid;
    if (valid) el.removeAttribute("aria-describedby"); else el.setAttribute("aria-describedby", err.id);
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
      v.mesaj.trim() ? `Detalii: ${v.mesaj.trim()}` : null,
      "",
      `Nume: ${v.nume.trim()}`,
      `Telefon: ${v.telefon.trim()}`,
    ];
    const text = lines.filter((l) => l !== null).join("\n");
    const url = `https://wa.me/${PHONE_WA}?text=${encodeURIComponent(text)}`;
    if (matchMedia("(pointer: coarse)").matches) location.href = url;
    else window.open(url, "_blank", "noopener");
  });

  document.getElementById("an").textContent = new Date().getFullYear();

  // Scroll motion: hero opens up, content grows as it reaches the viewport centre
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const hero = document.querySelector(".hero");
  const card = document.querySelector(".hero-card");
  const petals = [...document.querySelectorAll(".petal")].map((el, i) => ({
    el,
    side: el.matches(".p4, .p5, .p6") ? 1 : -1,
    speed: [0.9, 0.6, 0.35, 1, 0.7, 0.4][i],
  }));
  [card, ...petals.map((p) => p.el)].forEach((el) =>
    el.addEventListener("animationend", () => { el.style.animation = "none"; }, { once: true }));

  document.documentElement.classList.add("js-focus");
  const focusEls = [...document.querySelectorAll(
    ".section-head, .gallery figure, .world, .worlds-text, .steps li, .order-intro, .order-form, .contact-info, .map"
  )];
  focusEls.forEach((el) => el.classList.add("focus"));

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  chips.forEach((chip) => chip.addEventListener("click", request));
  update();
})();
