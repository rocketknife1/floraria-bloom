/* Maintenance mode: if maintenance.json says "active": true, a full-screen
 * message covers the site. The file is switched on/off from the Organizator
 * app (tab "Site-uri"), so no code change is needed to take the site down.
 * Colours and font come from data-* attributes on the <script> tag, so each
 * site keeps its own look. */
(async () => {
  const me = document.currentScript;
  const opt = (k, d) => me?.dataset[k] || d;
  let m;
  try {
    const res = await fetch("maintenance.json", { cache: "no-store" });
    if (!res.ok) return;
    m = await res.json();
  } catch {
    return;
  }
  if (!m || m.active !== true) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const style = document.createElement("style");
  style.textContent = `
    #maintenance{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;
      background:${opt("bg", "#111")};color:${opt("fg", "#fff")};font-family:${opt("font", "system-ui, sans-serif")};text-align:center;overflow:auto}
    #maintenance .mnt-card{max-width:620px}
    #maintenance .mnt-brand{margin:0 0 28px;font-size:.95rem;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
    #maintenance .mnt-icon{width:84px;height:84px;margin:0 auto 26px;border-radius:50%;display:grid;place-items:center;
      background:${opt("accent", "#e08a3e")};color:${opt("bg", "#111")}}
    #maintenance h1{margin:0 0 16px;font-family:${opt("display", opt("font", "system-ui, sans-serif"))};font-size:clamp(2.1rem,7vw,3.8rem);line-height:1.08;font-weight:600}
    #maintenance p.mnt-text{margin:0;font-size:clamp(1.05rem,2.6vw,1.3rem);line-height:1.6;opacity:.9;white-space:pre-line}
    html.mnt-on,html.mnt-on body{overflow:hidden}`;
  document.head.append(style);

  const box = document.createElement("div");
  box.id = "maintenance";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "mnt-title");
  box.innerHTML = `<div class="mnt-card">
      <p class="mnt-brand">${esc(opt("brand", document.title))}</p>
      <div class="mnt-icon" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
      <h1 id="mnt-title">${esc(m.title || "Revenim în curând")}</h1>
      <p class="mnt-text">${esc(m.message || "Facem câteva îmbunătățiri. Site-ul revine în scurt timp.")}</p>
    </div>`;
  const show = () => {
    for (const el of document.body.children) if (el !== box) el.inert = true;
    document.documentElement.classList.add("mnt-on");
    document.body.append(box);
  };
  if (document.body) show();
  else document.addEventListener("DOMContentLoaded", show, { once: true });
})();
