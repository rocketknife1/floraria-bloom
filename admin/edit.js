/*
 * Editarea site-ului direct pe pagină: deschizi site-ul cu „?edit” în adresă.
 *
 * Proprietarul își vede site-ul real; lângă tot ce se poate schimba apare un
 * contur și o lupă. Atinge lupa, schimbă textul, poza, prețul sau programul
 * și vede pe loc cum arată. Butoanele mari, pozele micșorate automat și
 * salvarea sunt aceleași pentru orice site cu admin/schema.json.
 *
 * Ce se poate edita și cum se cheamă câmpurile vine din admin/schema.json.
 * Pagina își marchează bucățile cu data-edit="secțiune/…" și textele cu
 * data-text, apoi cheamă start() înainte să deseneze și rendered() după.
 *
 * „Salvează” face un commit în repo-ul de pe GitHub, iar GitHub Pages publică
 * singur în aproximativ un minut. Fără server: editorul vorbește direct cu
 * GitHub, cu cheia celui care administrează (în aplicația Organizator vine
 * singură). Cu „?edit&demo” merge fără cheie și nu salvează nimic.
 */

const API = "https://api.github.com";
const DEMO = new URLSearchParams(location.search).has("demo");
const SITE_ROOT = new URL("./", location.href);
/** Deschis din aplicația Organizator (WebView-ul ei are puntea asta). */
const IN_APP = "OrganizatorBridge" in window;
const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const DAYS_SHORT = ["L", "Ma", "Mi", "J", "V", "S", "D"];

/* ------------------------------------------------------------------ */
/* Mici ajutoare                                                       */
/* ------------------------------------------------------------------ */

/** Rădăcina editorului (Shadow DOM), ca stilurile lui să nu atingă site-ul. */
let UI = null;
const $ = (sel, root = UI) => root?.querySelector(sel) ?? null;

/** Creează un element; textul intră mereu ca text, niciodată ca HTML. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (["value", "checked", "disabled", "hidden", "type", "placeholder", "min", "max", "step", "rows", "multiple", "accept", "src", "href", "title", "open"].includes(k)) node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const icon = (name) => el("span", { class: `ic ic-${name}`, "aria-hidden": "true" });

/** JSON exact în formatul din repo (2 spații, rând nou la final), ca un commit să conțină doar ce s-a schimbat. */
const encodeJson = (v) => `${JSON.stringify(v, null, 2)}\n`;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** „Munții Parâng” → „muntii-parang”, la fel ca în Organizator. */
function slugify(input) {
  const map = { ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t", á: "a", à: "a", ä: "a", é: "e", è: "e", ë: "e", í: "i", ó: "o", ö: "o", ő: "o", ú: "u", ü: "u", ű: "u", ç: "c" };
  return String(input)
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Valoarea de la o cale cu puncte („images.0.src”). */
function valueAtPath(root, path) {
  let cur = root;
  for (const part of String(path).split(".")) {
    if (cur == null) return null;
    cur = cur[part];
  }
  return cur;
}

const isEmpty = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

function showIfMatches(def, obj) {
  const cond = def.showIf;
  if (!cond) return true;
  const v = obj[cond.key];
  if (cond.empty != null) return isEmpty(v) === cond.empty;
  return v === cond.equals;
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getDate()}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

class AdminError extends Error {
  constructor(message, kind = "error") {
    super(message);
    this.kind = kind;
  }
}

/* ------------------------------------------------------------------ */
/* GitHub (sau, în demo, o copie ținută în pagină)                     */
/* ------------------------------------------------------------------ */

class GitHub {
  constructor(token, repo) {
    this.token = token;
    this.repo = repo; // { owner, name, branch }
  }

  async send(method, path, { query, body } = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    } catch {
      throw new AdminError("Nu am putut ajunge la GitHub. Verifică internetul și încearcă din nou.");
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    let detail = "";
    try {
      detail = (await res.json()).message ?? "";
    } catch {}
    switch (res.status) {
      case 401:
        throw new AdminError("Cheia de acces nu mai e bună (a expirat sau a fost ștearsă). Apasă „Ieși” și intră cu o cheie nouă.", "auth");
      case 403:
        if (res.headers.get("x-ratelimit-remaining") === "0") {
          throw new AdminError("GitHub cere o pauză (prea multe cereri). Mai încearcă peste câteva minute.");
        }
        throw new AdminError("Cheia nu are voie să schimbe site-ul. La crearea ei trebuie aleasă permisiunea „Contents: Read and write” pentru repo-ul site-ului.", "auth");
      case 404:
        throw new AdminError(`Nu găsesc site-ul pe GitHub (${detail || "repo sau fișier lipsă"}). Verifică dacă cheia are acces la repo-ul lui.`, "missing");
      case 409:
      case 422:
        throw new AdminError("Site-ul s-a schimbat între timp (poate din Organizator sau de pe alt telefon). Apasă „Reîncarcă”, ca să nu scrii peste modificarea aceea.", "conflict");
      default:
        throw new AdminError(`GitHub a răspuns cu eroarea ${res.status}. ${detail}`);
    }
  }

  path(rest) {
    return `/repos/${this.repo.owner}/${this.repo.name}/${rest}`;
  }

  info() {
    return this.send("GET", `/repos/${this.repo.owner}/${this.repo.name}`);
  }

  /** Un fișier din repo; cele peste 1 MB vin prin „blob”. */
  async getFile(path, ref) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const json = await this.send("GET", this.path(`contents/${encoded}`), { query: { ref: ref ?? this.repo.branch } });
    let content = json.content ?? "";
    if (json.encoding !== "base64" || !content) content = (await this.send("GET", this.path(`git/blobs/${json.sha}`))).content;
    return { sha: json.sha, bytes: base64ToBytes(content) };
  }

  /**
   * Toate fișierele într-un singur commit. [expected] = sha-urile fișierelor
   * cum erau când le-ai deschis: dacă vreunul s-a schimbat între timp, nu
   * scriem peste el. Întoarce commit-ul.
   */
  async commit(files, message, expected = {}) {
    const branch = this.repo.branch;
    const head = await this.send("GET", this.path(`git/ref/heads/${branch}`));
    const headSha = head.object.sha;
    const headCommit = await this.send("GET", this.path(`git/commits/${headSha}`));
    for (const [path, sha] of Object.entries(expected)) {
      if ((await this.getFile(path, headSha)).sha !== sha) {
        throw new AdminError("Site-ul s-a schimbat între timp (poate din Organizator sau de pe alt telefon). Apasă „Reîncarcă”, ca să nu scrii peste modificarea aceea.", "conflict");
      }
    }
    const tree = [];
    for (const [path, b64] of Object.entries(files)) {
      const blob = await this.send("POST", this.path("git/blobs"), { body: { content: b64, encoding: "base64" } });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await this.send("POST", this.path("git/trees"), { body: { base_tree: headCommit.tree.sha, tree } });
    const commit = await this.send("POST", this.path("git/commits"), { body: { message, tree: newTree.sha, parents: [headSha] } });
    // force: false — dacă altcineva a salvat chiar acum, GitHub refuză în loc să-i șteargă modificarea
    await this.send("PATCH", this.path(`git/refs/heads/${branch}`), { body: { sha: commit.sha, force: false } });
    return commit.sha;
  }

  async history(path) {
    const list = await this.send("GET", this.path("commits"), { query: { path, sha: this.repo.branch, per_page: "25" } });
    return list.map((c) => ({ sha: c.sha, message: c.commit.message.split("\n")[0], date: new Date(c.commit.committer.date) }));
  }

  async runsFor(sha) {
    return (await this.send("GET", this.path("actions/runs"), { query: { head_sha: sha, per_page: "10" } })).workflow_runs;
  }

  async latestRun() {
    const runs = (await this.send("GET", this.path("actions/runs"), { query: { branch: this.repo.branch, per_page: "1" } })).workflow_runs;
    return runs[0] ?? null;
  }
}

/**
 * Date de probă pentru demo, din schema.json („demo”: { "content.json": { "comenzi": […] } }):
 * înlocuiesc cheile acelea doar în copia din pagină. Zilele scrise „@+0”, „@+1”, „@-1”
 * devin azi, mâine, ieri, ca demo-ul să arate mereu comenzi de acum.
 */
function withDemoData(path, bytes) {
  const extra = state.schema?.demo?.[path];
  if (!extra || !path.endsWith(".json")) return bytes;
  const days = (v) =>
    typeof v === "string" && /^@[+-]\d+$/.test(v) ? dayFromToday(Number(v.slice(1))) : Array.isArray(v) ? v.map(days) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, days(x)])) : v;
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes));
    Object.assign(json, days(structuredClone(extra)));
    return new TextEncoder().encode(`${JSON.stringify(json, null, 2)}\n`);
  } catch {
    return bytes;
  }
}

/** În demo: fișierele vin de pe site, iar „commit-urile” rămân în pagină. */
class Demo {
  constructor() {
    this.repo = { owner: "demo", name: "site", branch: "main" };
    this.files = new Map();
    this.log = [];
  }

  async info() {
    return { permissions: { push: true }, default_branch: "main" };
  }

  async getFile(path, ref) {
    if (ref) {
      const version = this.log.find((v) => v.sha === ref);
      if (version?.files.has(path)) return { sha: ref, bytes: version.files.get(path) };
    }
    if (!this.files.has(path)) {
      let kept = null;
      try {
        kept = sessionStorage.getItem(`site-edit:demo:${path}`);
      } catch {}
      if (kept) {
        this.files.set(path, base64ToBytes(kept));
        return { sha: "demo-kept", bytes: this.files.get(path) };
      }
      const res = await fetch(new URL(path, SITE_ROOT), { cache: "no-store" });
      if (!res.ok) throw new AdminError(`Nu găsesc „${path}” pe site.`, "missing");
      this.files.set(path, withDemoData(path, new Uint8Array(await res.arrayBuffer())));
      this.log.push({ sha: "original", message: "Cum era site-ul când ai deschis demo-ul", date: new Date(), files: new Map(this.files) });
    }
    return { sha: `demo-${this.log.length}`, bytes: this.files.get(path) };
  }

  async commit(files, message) {
    await new Promise((r) => setTimeout(r, 600));
    for (const [path, b64] of Object.entries(files)) {
      this.files.set(path, base64ToBytes(b64));
      // în demo, „salvările” rămân în sesiune, ca pagina să se poată redesena
      try {
        if (path.endsWith(".json")) sessionStorage.setItem(`site-edit:demo:${path}`, b64);
      } catch {}
    }
    const sha = `demo-${Date.now().toString(36)}`;
    this.log.unshift({ sha, message, date: new Date(), files: new Map(this.files) });
    return sha;
  }

  async history() {
    return this.log.map((v) => ({ sha: v.sha, message: v.message, date: v.date }));
  }

  async runsFor() {
    return [{ status: "completed", conclusion: "success", html_url: "" }];
  }

  async latestRun() {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Starea panoului                                                     */
/* ------------------------------------------------------------------ */

const state = {
  schema: null,
  repo: null, // { owner, name, branch }
  backend: null,
  files: [], // { def, path, sha, original, working }
  pending: new Map(), // calea pozei în repo → { bytes, url }
  previews: new Map(), // valoarea din JSON → link local, pentru pozele urcate acum
  maintenanceOn: false,
  deploy: { state: "idle" },
};

const tokenKey = () => `site-admin:token:${state.repo.owner}/${state.repo.name}`.toLowerCase();

function readToken() {
  try {
    return localStorage.getItem(tokenKey()) ?? sessionStorage.getItem(tokenKey());
  } catch {
    return null;
  }
}

function storeToken(token, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(tokenKey(), token);
  } catch {}
}

function forgetToken() {
  try {
    localStorage.removeItem(tokenKey());
    sessionStorage.removeItem(tokenKey());
  } catch {}
}

/**
 * Repo-ul site-ului: din adresa de pe GitHub Pages (merge și după ce site-ul
 * e mutat în contul altcuiva), altfel din schema.json („repo”), altfel ce a
 * scris omul la intrare.
 */
const repoKey = () => `site-admin:repo:${location.pathname}`;

function detectRepo(schema) {
  try {
    const saved = localStorage.getItem(repoKey());
    if (saved) {
      const [owner, name] = saved.split("/");
      if (owner && name) return { owner, name };
    }
  } catch {}
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const owner = host.slice(0, -".github.io".length);
    const first = location.pathname.split("/").filter(Boolean)[0];
    return { owner, name: first && first !== "admin" ? first : host };
  }
  if (schema.repo?.includes("/")) {
    const [owner, name] = schema.repo.split("/");
    return { owner, name };
  }
  return null;
}

/* Calea pozelor: ce se scrie în JSON și unde stă fișierul în repo (ca în Organizator). */
const trimSlashes = (s) => String(s ?? "").replace(/^\/+|\/+$/g, "");
const imageDir = () => trimSlashes(state.schema.imageDir ?? "images");
const imagePublic = () => state.schema.imagePublicPath ?? imageDir();

function publicPathFor(fileName) {
  const base = imagePublic().endsWith("/") ? imagePublic() : `${imagePublic()}/`;
  return `${base}${fileName}`;
}

function repoPathFor(value) {
  if (!value || /^(https?:|data:|blob:)/.test(value)) return null;
  const pub = trimSlashes(imagePublic());
  const clean = trimSlashes(value);
  if (pub && clean.startsWith(`${pub}/`)) return `${imageDir()}/${clean.slice(pub.length + 1)}`;
  return clean;
}

function imageUrl(value) {
  if (!value) return "";
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  if (state.previews.has(value)) return state.previews.get(value);
  return new URL(trimSlashes(value), SITE_ROOT).href;
}

/** Poza: întâi de pe site; dacă încă nu e publicată acolo, direct din repo. */
function imageTag(value, alt = "") {
  const img = el("img", { src: imageUrl(value), alt, loading: "lazy" });
  img.addEventListener("error", () => {
    const path = repoPathFor(value);
    if (path && state.repo && !DEMO && !img.dataset.raw) {
      img.dataset.raw = "1";
      img.src = `https://raw.githubusercontent.com/${state.repo.owner}/${state.repo.name}/${state.repo.branch}/${path}`;
    } else {
      img.classList.add("broken");
    }
  });
  return img;
}

/* ------------------------------------------------------------------ */
/* Modificări, verificare, salvare                                     */
/* ------------------------------------------------------------------ */

const fileChanged = (f) => encodeJson(f.working) !== encodeJson(f.original);
const sectionChanged = (f, key) => !same(f.working[key], f.original[key]);
const isDirty = () => state.files.some(fileChanged);

function changedSections() {
  const out = [];
  for (const f of state.files) for (const s of f.def.sections) if (sectionChanged(f, s.key)) out.push(s.label);
  return out;
}

let refreshQueued = false;
/** După orice schimbare: bara de jos arată ce n-ai salvat, cu „Salvează” și „Renunță”. */
function changed() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    const names = changedSections().map(shortLabel);
    const dirty = names.length > 0 || state.pending.size > 0;
    $("#save").hidden = !dirty;
    $("#discard").hidden = !dirty;
    $("#bar").classList.toggle("dirty", dirty);
    $("#bar-sub").textContent = dirty
      ? `Nesalvat: ${names.join(", ") || "poze noi"}`
      : state.maintenanceOn
        ? "Site-ul e în mentenanță: vizitatorii văd doar mesajul."
        : "Atinge lupa de lângă ce vrei să schimbi.";
  });
}

/** Câmpurile obligatorii goale și codurile de link greșite sau dublate (doar câmpurile vizibile). */
function validate(fields, obj, where, issues) {
  for (const f of fields) {
    if (!showIfMatches(f, obj)) continue;
    const path = [...where, f.label];
    const v = obj[f.key];
    if (f.type === "group") {
      if (v == null && f.optional) continue;
      if (v && typeof v === "object") validate(f.fields ?? [], v, path, issues);
    } else if (f.type === "list") {
      if (!Array.isArray(v)) continue;
      for (const slugDef of (f.fields ?? []).filter((s) => s.type === "slug")) {
        const seen = new Set();
        for (const item of v) {
          const s = item?.[slugDef.key];
          if (s && seen.has(s)) issues.push({ where: path.join(" › "), message: `„${s}” apare de două ori la „${slugDef.label}”` });
          if (s) seen.add(s);
        }
      }
      v.forEach((item, i) => {
        if (!item || typeof item !== "object") return;
        const title = f.itemTitle ? valueAtPath(item, f.itemTitle) : null;
        validate(f.fields ?? [], item, [...path, typeof title === "string" && title.trim() ? title : `#${i + 1}`], issues);
      });
    } else if (f.required && isEmpty(v)) {
      issues.push({ where: path.join(" › "), message: "trebuie completat" });
    } else if (f.type === "slug" && typeof v === "string" && v && !/^[a-z0-9-]+$/.test(v)) {
      issues.push({ where: path.join(" › "), message: "doar litere mici, cifre și cratimă" });
    }
  }
  return issues;
}

async function save() {
  const issues = state.files.flatMap((f) => validate(f.def.sections, f.working, [], []));
  if (issues.length) {
    await message(
      "Mai e ceva de completat",
      el("ul", { class: "issues" }, issues.slice(0, 12).map((i) => el("li", {}, el("b", { text: i.where }), ` — ${i.message}`))),
    );
    return;
  }
  const names = changedSections().map(shortLabel);
  const what = names.join(", ") || "poze noi";
  const ok = await ask("Pui pe site?", `Se schimbă: ${what}. Vizitatorii văd noua variantă în aproximativ un minut.`, "Salvează");
  if (!ok) return;
  await busy("Se salvează pe site…", async () => {
    const changedFiles = state.files.filter(fileChanged);
    const allJson = state.files.map((f) => encodeJson(f.working)).join("");
    const files = {};
    for (const f of changedFiles) files[f.path] = bytesToBase64(utf8.encode(encodeJson(f.working)));
    // doar pozele încă folosite undeva: una aleasă și apoi scoasă nu se mai urcă
    for (const [path, img] of state.pending) {
      if (allJson.includes(path.split("/").pop())) files[path] = bytesToBase64(img.bytes);
    }
    const expected = Object.fromEntries(changedFiles.map((f) => [f.path, f.sha]));
    const sha = await state.backend.commit(files, `Modificat pe site: ${what}`, expected);
    for (const f of changedFiles) {
      f.sha = (await state.backend.getFile(f.path, sha)).sha;
      f.original = structuredClone(f.working);
    }
    state.pending.clear(); // previzualizările rămân până se publică pozele
    clearDraft();
    changed();
    watchDeploy(sha);
    toast(DEMO ? "Salvat în demo (pe site nu se schimbă nimic)." : "Salvat! Vizitatorii văd schimbarea în aproximativ un minut.");
  });
}

async function discard() {
  if (!(await ask("Renunți la modificări?", "Tot ce ai schimbat de la ultima salvare se pierde, iar pagina revine cum e pe site.", "Renunță", true))) return;
  for (const f of state.files) f.working = structuredClone(f.original);
  state.pending.clear();
  clearDraft();
  reloadPage();
}

/* ------------------------------------------------------------------ */
/* Publicarea pe site (GitHub Pages)                                   */
/* ------------------------------------------------------------------ */

let deployTimer = null;

function setDeploy(next) {
  state.deploy = next;
  const chip = $("#deploy");
  if (!chip) return;
  const labels = {
    idle: "",
    waiting: "Se trimite pe site…",
    building: "Se publică pe site…",
    live: "Pe site",
    failed: "Publicarea nu a mers",
  };
  chip.hidden = next.state === "idle";
  chip.className = `deploy deploy-${next.state}`;
  chip.textContent = labels[next.state];
  if (next.url) chip.href = next.url;
  else chip.removeAttribute("href");
}

function watchDeploy(sha) {
  clearTimeout(deployTimer);
  setDeploy({ state: "waiting" });
  const started = Date.now();
  const tick = async () => {
    if (Date.now() - started > 10 * 60_000) return setDeploy({ state: "failed" });
    try {
      const runs = await state.backend.runsFor(sha);
      const site = DEMO ? "../" : state.schema.liveUrl || "../";
      if (!runs.length) {
        if (Date.now() - started > 2 * 60_000) return setDeploy({ state: "live", url: site });
      } else if (runs.some((r) => r.status === "completed" && r.conclusion !== "success")) {
        const bad = runs.find((r) => r.conclusion !== "success");
        return setDeploy({ state: "failed", url: bad.html_url });
      } else if (runs.every((r) => r.status === "completed")) {
        return setDeploy({ state: "live", url: site });
      } else {
        setDeploy({ state: "building", url: runs[0].html_url });
      }
    } catch {}
    deployTimer = setTimeout(tick, 5000);
  };
  deployTimer = setTimeout(tick, DEMO ? 300 : 4000);
}

async function checkLastDeploy() {
  try {
    const run = await state.backend.latestRun();
    if (run && run.status !== "completed") watchDeploy(run.head_sha);
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Poze: micșorate în browser înainte de urcare                        */
/* ------------------------------------------------------------------ */

/**
 * O poză de telefon are 3–8 MB; pe site trebuie să fie mică. O aducem la cel
 * mult 1600 px pe latura mare, JPEG. PNG-urile mici (logo-uri cu fundal
 * transparent) rămân cum sunt.
 */
async function prepareImage(file) {
  const keepPng = file.type === "image/png" && file.size < 1_500_000;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new AdminError("Fișierul ales nu pare o poză (sau formatul nu e cunoscut de browser).");
  let { width, height } = bitmap;
  if (keepPng) {
    bitmap.close?.();
    return { bytes: new Uint8Array(await file.arrayBuffer()), width, height, ext: "png" };
  }
  const scale = Math.min(1, 1600 / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.84));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height, ext: "jpg" };
}

/** Păstrează poza până la salvare și întoarce ce se scrie în JSON. */
async function addImage(file) {
  const img = await prepareImage(file);
  const dot = file.name.lastIndexOf(".");
  const base = slugify(dot > 0 ? file.name.slice(0, dot) : file.name) || "poza";
  const fileName = `${base.slice(0, 40)}-${Date.now().toString(36)}.${img.ext}`;
  const value = publicPathFor(fileName);
  const url = URL.createObjectURL(new Blob([img.bytes], { type: img.ext === "png" ? "image/png" : "image/jpeg" }));
  const type = img.ext === "png" ? "image/png" : "image/jpeg";
  state.pending.set(`${imageDir()}/${fileName}`, { bytes: img.bytes, url, value, type });
  state.previews.set(value, url);
  return { value, width: img.width, height: img.height };
}

function pickFiles({ multiple = false } = {}) {
  return new Promise((resolve) => {
    // în pagină, nu doar în memorie: așa merge și în WebView-ul aplicației
    const input = el("input", { type: "file", accept: "image/*", multiple, hidden: true });
    input.addEventListener("change", () => {
      resolve([...input.files]);
      input.remove();
    });
    UI.append(input);
    input.click();
  });
}

/* ------------------------------------------------------------------ */
/* Câmpurile formularului                                              */
/* ------------------------------------------------------------------ */

/** Ce câmpuri „slug” se completează singure din alt câmp, pe obiect. */
const autoSlug = new WeakMap();

/** Ce element dintr-o listă e deschis pentru editare. */
const openItems = new WeakSet();

/**
 * Câmpurile unui obiect, cu condițiile de afișare (showIf) și codurile de
 * link completate singure. [onChange] e chemat după orice schimbare.
 */
function fieldsForm(defs, obj, onChange) {
  const box = el("div", { class: "fields" });
  const rows = [];
  const refresh = () => {
    for (const { def, row } of rows) row.hidden = !showIfMatches(def, obj);
    for (const def of defs.filter((d) => d.type === "slug" && d.from)) {
      const auto = autoSlug.get(obj) ?? new Set();
      if (isEmpty(obj[def.key])) auto.add(def.key);
      autoSlug.set(obj, auto);
      if (!auto.has(def.key)) continue;
      const source = obj[def.from];
      const suggestion = source ? `${def.prefix ?? ""}${slugify(source)}` : "";
      if (obj[def.key] !== suggestion) {
        obj[def.key] = suggestion;
        const input = box.querySelector(`[data-slug="${CSS.escape(def.key)}"]`);
        if (input) input.value = suggestion;
      }
    }
  };
  const update = () => {
    refresh();
    onChange?.();
    changed();
  };
  for (const def of defs) {
    const row = field(def, obj, update);
    rows.push({ def, row });
    box.append(row);
  }
  refresh();
  return box;
}

function labelFor(def, input) {
  return el(
    "label",
    { class: "field" },
    el("span", { class: "field-label" }, def.label, def.required ? el("i", { class: "req", text: " *", title: "obligatoriu" }) : null),
    def.description ? el("span", { class: "field-help", text: def.description }) : null,
    input,
  );
}

/** Ca labelFor, dar pentru un grup de butoane (un <label> ar apăsa singur primul buton). */
function groupFor(def, content) {
  return el(
    "div",
    { class: "field", role: "group", "aria-label": def.label },
    el("span", { class: "field-label" }, def.label, def.required ? el("i", { class: "req", text: " *", title: "obligatoriu" }) : null),
    def.description ? el("span", { class: "field-help", text: def.description }) : null,
    content,
  );
}

/** Butoane mari, o atingere și gata (select cu display: "chips", zile rapide la date). */
function choiceChips(options, value, onPick) {
  const box = el("div", { class: "choice-chips" });
  const paint = (current) => {
    for (const b of box.children) {
      const on = b.dataset.value === String(current ?? "");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  };
  for (const o of options) {
    box.append(el("button", { type: "button", class: "choice", "data-value": String(o.value), onclick: () => (onPick(o.value), paint(o.value)) }, o.label));
  }
  paint(value);
  box.paint = paint;
  return box;
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayFromToday = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
/** „azi”, „mâine”, „ieri” sau „joi, 12 nov.”: cum își spun oamenii zilele. */
function friendlyDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return iso ?? "";
  const words = { [dayFromToday(0)]: "azi", [dayFromToday(1)]: "mâine", [dayFromToday(-1)]: "ieri" };
  return words[iso] ?? new Date(`${iso}T12:00:00`).toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "short" });
}

function field(def, obj, update) {
  const set = (v) => {
    obj[def.key] = v;
    update();
  };
  const v = obj[def.key] ?? def.default;
  switch (def.type) {
    case "text":
      return labelFor(def, el("input", { type: "text", value: v ?? "", placeholder: def.placeholder, oninput: (e) => set(e.target.value) }));
    case "longtext": {
      const ta = el("textarea", { rows: 3, oninput: (e) => (grow(e.target), set(e.target.value)) });
      ta.value = v ?? "";
      requestAnimationFrame(() => grow(ta));
      return labelFor(def, ta);
    }
    case "number":
    case "money": {
      const cents = def.unit === "cents";
      const shown = v == null || v === "" ? "" : cents ? (v / 100).toFixed(2) : String(v);
      const input = el("input", {
        type: "text",
        inputmode: "decimal",
        value: shown,
        oninput: (e) => {
          const raw = e.target.value.replace(",", ".").trim();
          if (!raw) return set(null);
          const n = Number(raw);
          if (Number.isNaN(n)) return;
          set(cents ? Math.round(n * 100) : n);
        },
      });
      const unit = def.currency ?? (def.type === "money" ? "lei" : null);
      return labelFor(def, unit ? el("span", { class: "with-unit" }, input, el("span", { class: "unit", text: unit })) : input);
    }
    case "bool":
      return el(
        "label",
        { class: "field field-switch" },
        el("span", {}, el("span", { class: "field-label", text: def.label }), def.description ? el("span", { class: "field-help", text: def.description }) : null),
        el("input", { type: "checkbox", class: "switch", checked: v === true, onchange: (e) => set(e.target.checked) }),
      );
    case "select": {
      const options = def.options ?? [];
      if (def.allowCustom) {
        const id = `dl-${Math.random().toString(36).slice(2)}`;
        return labelFor(
          def,
          el("span", {}, el("input", { type: "text", list: id, value: v ?? "", oninput: (e) => set(e.target.value) }), el("datalist", { id }, options.map((o) => el("option", { value: o.value }, o.label)))),
        );
      }
      if (def.display === "chips") return groupFor(def, choiceChips(options, v, set));
      const select = el("select", { onchange: (e) => set(e.target.value) }, options.map((o) => el("option", { value: String(o.value) }, o.label)));
      if (v != null && !options.some((o) => String(o.value) === String(v))) select.append(el("option", { value: String(v) }, String(v)));
      select.value = v == null ? "" : String(v);
      if (v == null) select.prepend(el("option", { value: "", disabled: true }, "Alege…")), (select.value = "");
      return labelFor(def, select);
    }
    case "date": {
      if (!def.quickDays) return labelFor(def, el("input", { type: "date", value: v ?? "", onchange: (e) => set(e.target.value || null) }));
      // „Azi” / „Mâine” cu o atingere; calendarul rămâne pentru restul zilelor
      const quick = [{ value: dayFromToday(0), label: "Azi" }, { value: dayFromToday(1), label: "Mâine" }, { value: dayFromToday(2), label: "Poimâine" }];
      const input = el("input", { type: "date", value: v ?? "", "aria-label": "Altă zi", onchange: (e) => (set(e.target.value || null), chips.paint(e.target.value)) });
      const chips = choiceChips(quick, v, (day) => ((input.value = day), set(day)));
      return groupFor(def, el("div", { class: "date-quick" }, chips, input));
    }
    case "time":
      return labelFor(def, el("input", { type: "time", value: v ?? "", onchange: (e) => set(e.target.value || null) }));
    case "color": {
      const text = el("input", { type: "text", value: v ?? "", class: "color-text", oninput: (e) => (set(e.target.value), (picker.value = /^#[0-9a-f]{6}$/i.test(e.target.value) ? e.target.value : picker.value)) });
      const picker = el("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(v ?? "") ? v : "#000000", oninput: (e) => ((text.value = e.target.value), set(e.target.value)) });
      return labelFor(def, el("span", { class: "color-row" }, picker, text));
    }
    case "slug":
      return labelFor(
        def,
        el("input", {
          type: "text",
          value: v ?? "",
          "data-slug": def.key,
          oninput: (e) => {
            const auto = autoSlug.get(obj);
            auto?.delete(def.key);
            set(slugify(e.target.value) === e.target.value ? e.target.value : e.target.value.toLowerCase());
          },
        }),
      );
    case "image":
      return imageField(def, obj, update);
    case "imageList":
      return imageListField(def, obj, update);
    case "stringList":
      return stringListField(def, obj, update);
    case "hours":
      return hoursField(def, obj, update);
    case "weekdays":
      return weekdaysField(def, obj, update);
    case "list":
      return listField(def, obj, update);
    case "group":
      return groupField(def, obj, update);
    case "readonly":
      return labelFor(def, el("output", { class: "readonly", text: v == null ? "—" : String(v) }));
    default:
      return labelFor(def, el("output", { class: "readonly", text: JSON.stringify(v) }));
  }
}

function grow(ta) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

function imageField(def, obj, update) {
  const box = el("div", { class: "image-field" });
  const render = () => {
    const v = obj[def.key];
    box.replaceChildren(
      el("div", { class: "image-thumb" }, v ? imageTag(v) : el("span", { class: "image-empty", text: "Fără poză" })),
      el(
        "div",
        { class: "image-actions" },
        el("button", { type: "button", class: "btn", onclick: choose }, icon("photo"), v ? "Schimbă poza" : "Alege poza"),
        v && !def.required ? el("button", { type: "button", class: "btn btn-quiet", onclick: () => ((obj[def.key] = ""), render(), update()) }, "Scoate") : null,
      ),
    );
  };
  const choose = async () => {
    const [file] = await pickFiles();
    if (!file) return;
    try {
      const img = await busy("Pregătesc poza…", () => addImage(file));
      obj[def.key] = img.value;
      if (def.sizeKeys) {
        obj[def.sizeKeys.width] = img.width;
        obj[def.sizeKeys.height] = img.height;
      }
      render();
      update();
    } catch {
      // busy() a arătat deja ce nu a mers
    }
  };
  render();
  return el("div", { class: "field" }, el("span", { class: "field-label" }, def.label, def.required ? el("i", { class: "req", text: " *" }) : null), def.description ? el("span", { class: "field-help", text: def.description }) : null, box);
}

function imageListField(def, obj, update) {
  const box = el("div", { class: "image-list" });
  const render = () => {
    const list = Array.isArray(obj[def.key]) ? obj[def.key] : [];
    box.replaceChildren(
      ...list.map((value, i) =>
        el(
          "div",
          { class: "image-list-item" },
          imageTag(value),
          el(
            "div",
            { class: "mini-actions" },
            i > 0 ? el("button", { type: "button", title: "Mai în față", onclick: () => (list.splice(i - 1, 0, list.splice(i, 1)[0]), render(), update()) }, "←") : null,
            el("button", { type: "button", title: "Scoate", onclick: () => (list.splice(i, 1), render(), update()) }, "✕"),
          ),
        ),
      ),
      el(
        "button",
        {
          type: "button",
          class: "image-add",
          onclick: async () => {
            const files = await pickFiles({ multiple: true });
            if (!files.length) return;
            try {
              await busy("Pregătesc pozele…", async () => {
                for (const file of files) list.push((await addImage(file)).value);
              });
              obj[def.key] = list;
              render();
              update();
            } catch {
              // busy() a arătat deja ce nu a mers
            }
          },
        },
        "+ Poze",
      ),
    );
  };
  render();
  return el("div", { class: "field" }, el("span", { class: "field-label", text: def.label }), def.description ? el("span", { class: "field-help", text: def.description }) : null, box);
}

function stringListField(def, obj, update) {
  const box = el("div", { class: "string-list" });
  const render = () => {
    const list = Array.isArray(obj[def.key]) ? obj[def.key] : (obj[def.key] = []);
    box.replaceChildren(
      ...list.map((value, i) => {
        const input = def.multiline ? el("textarea", { rows: 2 }) : el("input", { type: "text" });
        input.value = value ?? "";
        input.addEventListener("input", (e) => {
          list[i] = e.target.value;
          if (def.multiline) grow(e.target);
          update();
        });
        if (def.multiline) requestAnimationFrame(() => grow(input));
        return el(
          "div",
          { class: "string-row" },
          input,
          el(
            "span",
            { class: "mini-actions" },
            i > 0 ? el("button", { type: "button", title: "Mai sus", onclick: () => (list.splice(i - 1, 0, list.splice(i, 1)[0]), render(), update()) }, "↑") : null,
            el("button", { type: "button", title: "Scoate", onclick: () => (list.splice(i, 1), render(), update()) }, "✕"),
          ),
        );
      }),
      el("button", { type: "button", class: "btn btn-quiet", onclick: () => (list.push(""), render(), update(), box.querySelector(".string-row:last-of-type input, .string-row:last-of-type textarea")?.focus()) }, "+ Adaugă"),
    );
  };
  render();
  return el("div", { class: "field" }, el("span", { class: "field-label", text: def.label }), def.description ? el("span", { class: "field-help", text: def.description }) : null, box);
}

/** Numărul zilei după convenția schemei (`sundayIs`: 0 ca în JavaScript, 7 ca în ISO). */
const dayNumber = (mondayBased, sundayIs) => (mondayBased === 6 ? sundayIs : mondayBased + 1);

function hoursField(def, obj, update) {
  const hours = obj[def.key] && typeof obj[def.key] === "object" ? obj[def.key] : (obj[def.key] = {});
  const table = el("div", { class: "hours" });
  DAYS.forEach((day, i) => {
    const key = String(dayNumber(i, def.sundayIs ?? 0));
    const range = Array.isArray(hours[key]) ? hours[key] : null;
    const from = el("input", { type: "time", value: range?.[0] ?? "09:00", disabled: !range });
    const to = el("input", { type: "time", value: range?.[1] ?? "18:00", disabled: !range });
    const open = el("input", { type: "checkbox", class: "switch", checked: !!range, "aria-label": `${day}: deschis` });
    const write = () => {
      hours[key] = open.checked ? [from.value || "09:00", to.value || "18:00"] : null;
      from.disabled = to.disabled = !open.checked;
      row.classList.toggle("closed", !open.checked);
      update();
    };
    open.addEventListener("change", write);
    from.addEventListener("change", write);
    to.addEventListener("change", write);
    const row = el("div", { class: `hours-row${range ? "" : " closed"}` }, el("span", { class: "hours-day", text: day }), open, el("span", { class: "hours-times" }, from, el("span", { text: "–" }), to), el("span", { class: "hours-closed", text: "închis" }));
    table.append(row);
  });
  return el("div", { class: "field" }, el("span", { class: "field-label", text: def.label }), def.description ? el("span", { class: "field-help", text: def.description }) : null, table);
}

function weekdaysField(def, obj, update) {
  const days = Array.isArray(obj[def.key]) ? obj[def.key] : (obj[def.key] = []);
  const box = el("div", { class: "chips" });
  DAYS.forEach((day, i) => {
    const n = dayNumber(i, def.sundayIs ?? 0);
    const chip = el("button", {
      type: "button",
      class: `chip${days.includes(n) ? " on" : ""}`,
      title: day,
      "aria-pressed": String(days.includes(n)),
      onclick: () => {
        const has = days.includes(n);
        const next = has ? days.filter((d) => d !== n) : [...days, n];
        const ordered = [0, 1, 2, 3, 4, 5, 6].map((j) => dayNumber(j, def.sundayIs ?? 0)).filter((d) => next.includes(d));
        days.splice(0, days.length, ...ordered);
        chip.classList.toggle("on", !has);
        chip.setAttribute("aria-pressed", String(!has));
        update();
      },
    }, DAYS_SHORT[i]);
    box.append(chip);
  });
  return el("div", { class: "field" }, el("span", { class: "field-label", text: def.label }), def.description ? el("span", { class: "field-help", text: def.description }) : null, box);
}

function groupField(def, obj, update) {
  const box = el("fieldset", { class: "group" }, el("legend", { text: def.label }));
  if (def.description) box.append(el("p", { class: "field-help", text: def.description }));
  const render = () => {
    box.querySelectorAll(":scope > .fields, :scope > .group-toggle").forEach((n) => n.remove());
    const value = obj[def.key];
    if (value == null && def.optional) {
      box.append(el("button", { type: "button", class: "btn btn-quiet group-toggle", onclick: () => ((obj[def.key] = structuredClone(def.newItem ?? {})), render(), update()) }, `+ Adaugă „${def.label}”`));
      return;
    }
    if (!value || typeof value !== "object") obj[def.key] = {};
    box.append(fieldsForm(def.fields ?? [], obj[def.key], update));
    if (def.optional) box.append(el("button", { type: "button", class: "btn btn-quiet group-toggle", onclick: () => ((obj[def.key] = null), render(), update()) }, `Scoate „${def.label}”`));
  };
  render();
  return box;
}

/**
 * O listă (produse, povești, zone…): carduri cu poza și numele; atingi unul
 * ca să-l modifici. Se pot adăuga, ascunde, muta, copia și șterge.
 */
function listField(def, obj, update) {
  if (!Array.isArray(obj[def.key])) obj[def.key] = [];
  const list = obj[def.key];
  const canHide = (def.fields ?? []).some((f) => f.key === "hidden" && f.type === "bool");
  const fixed = def.fixedLength === true;
  const box = el("div", { class: "list" });
  let filter = "";

  // valoarea unui câmp așa cum o citește omul: eticheta opțiunii, „azi” în loc de 2026-11-05
  const describe = (item, key) => {
    const s = key ? valueAtPath(item, key) : null;
    if (s == null || s === "") return "";
    const f = (def.fields ?? []).find((x) => x.key === key);
    const opt = f?.options?.find((o) => String(o.value) === String(s));
    if (opt) return opt.label;
    return f?.type === "date" ? friendlyDay(String(s)) : String(s);
  };
  const titleOf = (item, i) => {
    const t = describe(item, def.itemTitle);
    return t.trim() ? t : `Element ${i + 1}`;
  };
  // itemDetails: câmpuri în plus pe rândul mic (doar în panoul web; aplicația îl ignoră)
  const subtitleOf = (item) =>
    [def.itemSubtitle, ...(def.itemDetails ?? [])]
      .map((key) => describe(item, key))
      .filter(Boolean)
      .join(" · ");
  // itemQuick: un câmp „select” cu butoanele direct pe rând, fără să deschizi elementul
  const quick = def.itemQuick ? (def.fields ?? []).find((f) => f.key === def.itemQuick && f.type === "select") : null;

  const card = (item, i) => {
    const head = el("button", { type: "button", class: "item-head", "aria-expanded": String(openItems.has(item)) });
    const paintHead = () => {
      const img = def.itemImage ? valueAtPath(item, def.itemImage) : null;
      // (replaceChildren ar scrie „null” pentru golurile din listă)
      head.replaceChildren(
        ...[
          def.itemImage ? el("span", { class: "item-thumb" }, img ? imageTag(img) : null) : null,
          el("span", { class: "item-text" }, el("span", { class: "item-title", text: titleOf(item, i) }), el("span", { class: "item-sub", text: subtitleOf(item) })),
          item.hidden ? el("span", { class: "tag tag-hidden", text: "ascuns" }) : null,
          el("span", { class: "chevron", "aria-hidden": "true" }),
        ].filter(Boolean),
      );
    };
    paintHead();
    const node = el("div", { class: `item${item.hidden ? " is-hidden" : ""}${openItems.has(item) ? " open" : ""}${quick ? ` state-${slugify(String(item[quick.key] ?? ""))}` : ""}` }, head);
    if (quick) {
      node.append(
        el("div", { class: "item-quick", role: "group", "aria-label": quick.label }, choiceChips(quick.options ?? [], item[quick.key], (val) => {
          item[quick.key] = val;
          render();
          update();
        })),
      );
    }
    const toggle = () => {
      if (openItems.has(item)) openItems.delete(item);
      else openItems.add(item);
      render();
    };
    head.addEventListener("click", toggle);
    if (openItems.has(item)) {
      const actions = el(
        "div",
        { class: "item-actions" },
        canHide
          ? el("button", { type: "button", class: "btn", onclick: () => ((item.hidden = !item.hidden), render(), update()) }, icon(item.hidden ? "eye" : "eye-off"), item.hidden ? "Arată pe site" : "Ascunde de pe site")
          : null,
        !fixed && i > 0 ? el("button", { type: "button", class: "btn btn-quiet", title: "Mută mai sus", onclick: () => (list.splice(i - 1, 0, list.splice(i, 1)[0]), render(), update()) }, "↑ Sus") : null,
        !fixed && i < list.length - 1 ? el("button", { type: "button", class: "btn btn-quiet", title: "Mută mai jos", onclick: () => (list.splice(i + 1, 0, list.splice(i, 1)[0]), render(), update()) }, "↓ Jos") : null,
        !fixed
          ? el("button", {
              type: "button",
              class: "btn btn-quiet",
              onclick: () => {
                const copy = structuredClone(item);
                for (const s of (def.fields ?? []).filter((f) => f.type === "slug")) copy[s.key] = "";
                list.splice(i + 1, 0, copy);
                openItems.delete(item);
                openItems.add(copy);
                render();
                update();
              },
            }, "Copie")
          : null,
        !fixed
          ? el("button", {
              type: "button",
              class: "btn btn-danger",
              onclick: async () => {
                if (!(await ask("Ștergi?", `„${titleOf(item, i)}” dispare de pe site după salvare.${canHide ? " Dacă doar nu-l mai ai acum, poți să-l ascunzi în loc să-l ștergi." : ""}`, "Șterge", true))) return;
                list.splice(i, 1);
                render();
                update();
              },
            }, "Șterge")
          : null,
      );
      node.append(el("div", { class: "item-body" }, fieldsForm((def.fields ?? []).filter((f) => !(canHide && f.key === "hidden") && f !== quick), item, paintHead), actions));
    }
    return node;
  };

  // căutarea stă deasupra listei și nu se redesenează odată cu ea (ca să nu pierzi locul cursorului)
  const search = el("input", { type: "search", class: "list-search", placeholder: "Caută în listă…" });
  search.addEventListener("input", (e) => {
    filter = e.target.value;
    render();
  });
  const items = el("div", { class: "list-items" });
  box.append(search, items);

  const render = () => {
    const children = [];
    search.hidden = list.length <= 8;
    const needle = slugify(filter);
    list.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      if (needle && !slugify(titleOf(item, i)).includes(needle)) return;
      children.push(card(item, i));
    });
    if (!list.length) children.push(el("p", { class: "empty", text: "Nimic încă." }));
    if (!fixed) {
      children.push(
        el("button", {
          type: "button",
          class: "btn btn-add",
          onclick: () => {
            const item = structuredClone(def.newItem ?? {});
            // zilele cu butoane rapide pornesc de la „azi”
            for (const f of (def.fields ?? []).filter((x) => x.type === "date" && x.quickDays && isEmpty(item[x.key]))) item[f.key] = dayFromToday(0);
            if (def.newItemFirst) list.unshift(item);
            else list.push(item);
            openItems.add(item);
            filter = search.value = "";
            render();
            update();
            requestAnimationFrame(() => items.querySelector(def.newItemFirst ? ".item.open" : ".item.open:last-of-type, .item:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          },
        }, def.addLabel ?? `+ Adaugă în „${def.label}”`),
      );
      // comenzile noi stau sus: butonul de adăugat vine primul
      if (def.newItemFirst) children.unshift(children.pop());
    }
    items.replaceChildren(...children);
  };
  render();
  return el("div", { class: "field" }, def.description ? el("span", { class: "field-help", text: def.description }) : null, box);
}

/* ------------------------------------------------------------------ */
/* Istoric și mentenanță                                               */
/* ------------------------------------------------------------------ */

/* ---- Istoric ---- */

async function showHistory() {
  const list = el("div", { class: "history" }, el("p", { class: "field-help", text: "Fiecare salvare rămâne aici. Poți readuce oricând o versiune veche: se salvează ca o modificare nouă, deci nimic nu se pierde." }));
  const dialog = openDialog("Istoric", list);
  try {
    for (const f of state.files) {
      const versions = await state.backend.history(f.path);
      if (state.files.length > 1) list.append(el("h3", { text: f.path }));
      if (!versions.length) list.append(el("p", { class: "empty", text: "Nicio salvare încă." }));
      versions.forEach((v, i) =>
        list.append(
          el(
            "div",
            { class: "history-row" },
            el("span", {}, el("b", { text: formatDate(v.date) }), el("span", { class: "history-msg", text: v.message })),
            i === 0
              ? el("span", { class: "tag", text: "acum pe site" })
              : el("button", {
                  type: "button",
                  class: "btn btn-small",
                  onclick: async () => {
                    if (isDirty()) return toast("Salvează sau renunță întâi la modificările de acum.", true);
                    if (!(await ask("Readuc versiunea asta?", `Conținutul din ${formatDate(v.date)} revine pe site. Versiunea de acum rămâne și ea în istoric.`, "Readu"))) return;
                    dialog.close();
                    try {
                      await busy("Readuc versiunea…", async () => {
                        const old = await state.backend.getFile(f.path, v.sha);
                        await state.backend.commit({ [f.path]: bytesToBase64(old.bytes) }, `Revenit pe site la versiunea din ${formatDate(v.date)}`, { [f.path]: f.sha });
                      });
                    } catch {
                      return; // busy() a arătat deja ce nu a mers
                    }
                    clearDraft();
                    reloadPage();
                  },
                }, "Readu"),
          ),
        ),
      );
    }
  } catch (e) {
    list.append(el("p", { class: "error", text: e.message }));
  }
}

/* ---- Mentenanță ---- */

async function showMaintenance() {
  const path = state.schema.maintenance ?? "maintenance.json";
  const body = el("div", {}, el("p", { class: "field-help", text: "Cât e pornită, vizitatorii văd doar mesajul de mai jos, pe tot ecranul (de exemplu cât schimbi multe lucruri sau ai închis o perioadă)." }));
  const dialog = openDialog("Mentenanță", body);
  let current;
  try {
    const file = await state.backend.getFile(path);
    current = { sha: file.sha, data: JSON.parse(fromUtf8.decode(file.bytes)) };
  } catch (e) {
    body.append(el("p", { class: "error", text: e.kind === "missing" ? "Site-ul ăsta nu are mod de mentenanță." : e.message }));
    return;
  }
  const data = structuredClone(current.data);
  const active = el("input", { type: "checkbox", class: "switch", checked: data.active === true });
  const title = el("input", { type: "text", value: data.title ?? "" });
  const text = el("textarea", { rows: 3 });
  text.value = data.message ?? "";
  body.append(
    el("label", { class: "field field-switch" }, el("span", { class: "field-label", text: "Site în mentenanță" }), active),
    el("label", { class: "field" }, el("span", { class: "field-label", text: "Titlu" }), title),
    el("label", { class: "field" }, el("span", { class: "field-label", text: "Mesaj" }), text),
    el("div", { class: "dialog-actions" }, el("button", {
      type: "button",
      class: "btn btn-primary",
      onclick: async () => {
        data.active = active.checked;
        if (title.value.trim()) data.title = title.value.trim();
        if (text.value.trim()) data.message = text.value.trim();
        dialog.close();
        try {
          await busy("Se salvează…", async () => {
            const sha = await state.backend.commit({ [path]: bytesToBase64(utf8.encode(encodeJson(data))) }, data.active ? "Mentenanță pornită de pe site" : "Mentenanță oprită de pe site", { [path]: current.sha });
            watchDeploy(sha);
            state.maintenanceOn = data.active === true;
            changed();
          });
        } catch {
          return; // busy() a arătat deja ce nu a mers
        }
        toast(data.active ? "Mentenanța pornește pe site în aproximativ un minut." : "Site-ul revine în aproximativ un minut.");
      },
    }, "Salvează")),
  );
}

/* ------------------------------------------------------------------ */
/* Dialoguri, mesaje, așteptare                                        */
/* ------------------------------------------------------------------ */

function openDialog(title, content) {
  const dialog = el(
    "dialog",
    { class: "dialog" },
    el("div", { class: "dialog-head" }, el("h2", { text: title }), el("button", { type: "button", class: "icon-btn", "aria-label": "Închide", onclick: () => dialog.close() }, "✕")),
    el("div", { class: "dialog-body" }, content),
  );
  dialog.addEventListener("close", () => {
    dialog.remove();
    relayout();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  UI.append(dialog);
  dialog.showModal();
  relayout();
  return dialog;
}

function ask(title, text, okLabel, danger = false) {
  return new Promise((resolve) => {
    let answer = false;
    const dialog = openDialog(
      title,
      el(
        "div",
        {},
        el("p", { text }),
        el(
          "div",
          { class: "dialog-actions" },
          el("button", { type: "button", class: "btn btn-quiet", onclick: () => dialog.close() }, "Nu"),
          el("button", { type: "button", class: `btn ${danger ? "btn-danger" : "btn-primary"}`, onclick: () => ((answer = true), dialog.close()) }, okLabel),
        ),
      ),
    );
    dialog.addEventListener("close", () => resolve(answer));
  });
}

function message(title, content) {
  return new Promise((resolve) => {
    const dialog = openDialog(title, el("div", {}, content, el("div", { class: "dialog-actions" }, el("button", { type: "button", class: "btn btn-primary", onclick: () => dialog.close() }, "Am înțeles"))));
    dialog.addEventListener("close", () => resolve());
  });
}

let toastTimer;
function toast(text, bad = false) {
  const t = $("#toast");
  t.textContent = text;
  t.className = `toast show${bad ? " bad" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), bad ? 7000 : 4000);
}

async function busy(text, work) {
  const overlay = $("#busy");
  $("#busy-text").textContent = text;
  overlay.hidden = false;
  try {
    return await work();
  } catch (e) {
    if (e.kind === "auth" && state.backend) {
      toast(e.message, true);
    } else if (e.kind === "conflict") {
      await message("Nu am salvat", el("p", { text: e.message }));
    } else if (state.backend) {
      toast(e.message ?? String(e), true);
    }
    throw e;
  } finally {
    overlay.hidden = true;
  }
}

/* ------------------------------------------------------------------ */
/* Editorul de pe pagină: contururi, lupe, fereastra de editare        */
/* ------------------------------------------------------------------ */

let host = null; // ține tot editorul, într-un Shadow DOM: stilurile site-ului și ale editorului nu se amestecă
let layer = null; // stratul cu contururi și lupe, deasupra site-ului
const spots = [];
let spotsOn = true;
let sheet = null; // fereastra de editare deschisă
let reloading = false;
let layoutQueued = false;
let tracking = false;

const OPEN_KEY = "site-edit:open";
const SCROLL_KEY = "site-edit:scroll";
const HINT_KEY = "site-edit:hint";

/** Ce vede doar proprietarul, pus peste site: stratul cu lupe, bara de jos, mesajele. */
function mountUI() {
  host = document.createElement("div");
  host.id = "site-editor";
  UI = host.attachShadow({ mode: "open" });
  layer = el("div", { class: "layer" });
  UI.append(
    el("link", { rel: "stylesheet", href: new URL("admin/edit.css?v=3", SITE_ROOT).href }),
    layer,
    el(
      "div",
      { class: "bar", id: "bar" },
      el("button", { type: "button", class: "bar-menu", "aria-label": "Meniu", onclick: showMenu }, el("span", { class: "burger", "aria-hidden": "true" })),
      el("div", { class: "bar-text" }, el("b", { text: DEMO ? "Editezi (demo)" : "Editezi site-ul" }), el("span", { id: "bar-sub", text: "Atinge lupa de lângă ce vrei să schimbi." })),
      el("a", { id: "deploy", class: "deploy", target: "_blank", rel: "noopener", hidden: true }),
      el("button", { type: "button", id: "discard", class: "btn btn-quiet bar-btn", hidden: true, onclick: () => discard() }, "Renunță"),
      el("button", { type: "button", id: "save", class: "btn btn-primary bar-btn", hidden: true, onclick: () => save().catch(() => {}) }, "Salvează"),
    ),
    el("div", { id: "busy", class: "busy", hidden: true }, el("div", { class: "busy-box" }, el("span", { class: "spinner", "aria-hidden": "true" }), el("span", { id: "busy-text" }))),
    el("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" }),
  );
  // pe pagină: loc pentru bara de jos, ce e ascuns se vede estompat, barele fixe ale site-ului nu încurcă
  const pageStyle = document.createElement("style");
  pageStyle.textContent = `
    body { padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important; }
    [data-edit-hide] { display: none !important; }
    .is-hidden-edit { opacity: .42 !important; filter: grayscale(.85); }
    .se-add-card { list-style: none; display: flex; }
    .se-add-card > button, button.se-add-card {
      all: unset; box-sizing: border-box; flex: 1; display: flex; align-items: center; justify-content: center;
      min-width: 128px; min-height: 64px; padding: 14px 18px; border: 2px dashed var(--se-accent, #6b4a8a);
      border-radius: 16px; background: color-mix(in srgb, var(--se-accent, #6b4a8a) 7%, transparent);
      color: var(--se-accent, #6b4a8a); font: 700 15px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: center; cursor: pointer;
    }
    html.se-clean .se-add-card { display: none !important; }
  `;
  document.head.append(pageStyle);
  document.body.append(host);
}

const editable = () => document.querySelectorAll("[data-edit], [data-edit-add]");
const findTarget = (path) => document.querySelector(`[data-edit="${CSS.escape(path)}"]`);

/** Cutia în care se poate vedea o bucată (un rând cu derulare laterală o taie la margini). */
const clipCache = new WeakMap();
function clipOf(node) {
  if (clipCache.has(node)) return clipCache.get(node);
  let p = node.parentElement;
  let found = null;
  while (p && p !== document.body) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) {
      found = p;
      break;
    }
    p = p.parentElement;
  }
  clipCache.set(node, found);
  return found;
}

function makeSpot() {
  const spot = { box: el("div", { class: "spot-box", hidden: true }), btn: el("button", { type: "button", class: "spot-btn", hidden: true }), target: null };
  spot.btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (spot.target) openTarget(spot.target);
  });
  layer.append(spot.box, spot.btn);
  return spot;
}

function rectOf(t) {
  const r = t.getBoundingClientRect();
  let { left, top, right, bottom } = r;
  const clip = clipOf(t);
  if (clip) {
    const c = clip.getBoundingClientRect();
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  return { left, top, right, bottom };
}

/** Pune conturul și lupa peste fiecare bucată editabilă de pe ecran. */
function layout() {
  layoutQueued = false;
  if (!layer) return;
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const siteDialog = document.querySelector("dialog[open]");
  let n = 0;
  const use = () => spots[n] ?? (spots[n] = makeSpot());
  if (sheet?.target?.isConnected && !siteDialog) {
    // cât editezi: un singur contur, în jurul bucății la care lucrezi
    const { left, top, right, bottom } = rectOf(sheet.target);
    const s = use();
    n++;
    s.target = null;
    s.btn.hidden = true;
    s.box.hidden = false;
    s.box.className = "spot-box focus";
    Object.assign(s.box.style, { left: `${left - 4}px`, top: `${top - 4}px`, width: `${right - left + 8}px`, height: `${bottom - top + 8}px` });
  } else if (spotsOn && !sheet && !siteDialog && !UI.querySelector("dialog[open]")) {
    // bara fixă de sus a site-ului acoperă ce trece pe sub ea: acolo nu punem lupe
    const roof = topBarBottom();
    for (const t of document.querySelectorAll("[data-edit]")) {
      let { left, top, right, bottom } = rectOf(t);
      top = Math.max(top, roof);
      if (right - left < 6 || bottom - top < 6) continue;
      if (bottom < roof + 20 || top > vh - 80 || right < 0 || left > vw) continue;
      const s = use();
      n++;
      s.target = t;
      s.box.hidden = false;
      s.box.className = `spot-box${t.classList.contains("is-hidden-edit") ? " is-hidden" : ""}`;
      Object.assign(s.box.style, { left: `${left - 3}px`, top: `${top - 3}px`, width: `${right - left + 6}px`, height: `${bottom - top + 6}px` });
      s.btn.hidden = false;
      const bx = Math.min(Math.max(right - 24, 6), vw - 46);
      const by = Math.min(Math.max(top - 16, roof + 4), vh - 130);
      s.btn.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
    }
  }
  for (let i = n; i < spots.length; i++) {
    spots[i].box.hidden = true;
    spots[i].btn.hidden = true;
    spots[i].target = null;
  }
}

const relayout = () => {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(layout);
};

/** Unde se termină bara fixă de sus a site-ului (antetul cu meniul), dacă are una. */
let topBar;
function topBarBottom() {
  if (topBar === undefined) {
    topBar = [...document.querySelectorAll("header, [data-edit-top]")].find((h) => /fixed|sticky/.test(getComputedStyle(h).position)) ?? null;
  }
  if (!topBar) return 0;
  const r = topBar.getBoundingClientRect();
  return r.bottom > 0 && r.top <= 1 ? r.bottom : 0;
}

/**
 * „+ Adaugă” stă în rând cu celelalte: un card punctat la capătul fiecărei
 * liste (rândul de buchete, poveștile, accesoriile…), care se derulează cu ea.
 */
function addCards() {
  for (const list of document.querySelectorAll("[data-edit-add]")) {
    if (list.querySelector(":scope > .se-add-card")) continue;
    const label = `+ ${list.dataset.editAddLabel ?? "Adaugă"}`;
    const inList = /^(UL|OL)$/.test(list.tagName);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addItem(list);
    });
    let card = btn;
    if (inList) {
      card = document.createElement("li");
      card.append(btn);
    }
    card.classList.add("se-add-card");
    // comenzile noi apar primele, deci și butonul lor stă primul
    const def = resolvePath(list.dataset.editAdd)?.def;
    if (def?.newItemFirst) list.prepend(card);
    else list.append(card);
  }
}

function startTracking() {
  if (tracking) return;
  tracking = true;
  addEventListener("scroll", relayout, { passive: true, capture: true }); // și derularea laterală a rândurilor
  addEventListener("resize", relayout);
  setInterval(relayout, 700); // pozele care se încarcă mută lucrurile
  new MutationObserver(relayout).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden"] });
}

/* ---- unde stă o bucată în conținut ---- */

/**
 * „gallery/3” → al patrulea element din galerie, „texts/hero.lead” → un text,
 * „config/delivery/zones/2” → o zonă de livrare. Întoarce câmpurile de arătat
 * și obiectul pe care îl modifică.
 */
function resolvePath(path) {
  const file = state.files[0];
  if (!file) return null;
  const segs = String(path).split("/");
  let defs = file.def.sections;
  let obj = file.working;
  for (let i = 0; i < segs.length; i++) {
    const def = (defs ?? []).find((d) => d.key === segs[i]);
    if (!def) return null;
    const base = segs.slice(0, i).join("/");
    const here = segs.slice(0, i + 1).join("/");
    if (def.type === "list") {
      if (!Array.isArray(obj[def.key])) obj[def.key] = [];
      const list = obj[def.key];
      if (i === segs.length - 1) return { title: def.label, fields: [def], obj, base, def, list };
      const index = Number(segs[++i]);
      const item = list[index];
      if (!item || typeof item !== "object") return null;
      if (i === segs.length - 1) return { title: itemTitle(def, item, index), fields: def.fields ?? [], obj: item, base: `${here}/${index}`, list, index, listDef: def };
      defs = def.fields;
      obj = item;
      continue;
    }
    if (def.type === "group") {
      if (!obj[def.key] || typeof obj[def.key] !== "object") obj[def.key] = {};
      if (i === segs.length - 1) return { title: def.label, fields: def.fields ?? [], obj: obj[def.key], base: here };
      defs = def.fields;
      obj = obj[def.key];
      continue;
    }
    return { title: def.label, fields: [def], obj, base };
  }
  return null;
}

const shortLabel = (s) => String(s ?? "").replace(/\s*\(.*\)$/, "");

function itemTitle(def, item, index) {
  const key = def.itemTitle;
  let t = key ? valueAtPath(item, key) : null;
  const f = (def.fields ?? []).find((x) => x.key === key);
  const opt = f?.options?.find((o) => String(o.value) === String(t));
  if (opt) t = opt.label;
  const name = typeof t === "string" && t.trim() ? t : `nr. ${index + 1}`;
  return `${shortLabel(def.label)}: ${name}`;
}

/** Arată pe loc o valoare nouă în pagină, dacă pagina o are legată (data-edit / data-edit-live). */
function liveUpdate(path, value) {
  const sel = `[data-edit="${CSS.escape(path)}"], [data-edit-live="${CSS.escape(path)}"]`;
  const nodes = document.querySelectorAll(sel);
  if (!nodes.length || (value != null && typeof value === "object")) return false;
  for (const node of nodes) {
    if (node.tagName === "IMG") node.src = imageUrl(value);
    else node.textContent = value ?? "";
  }
  showAboveSheet(nodes[0]);
  relayout();
  return true;
}

/** Ce se schimbă trebuie să se vadă: dacă e sub fereastra de editare, pagina urcă până la el. */
function showAboveSheet(node) {
  const r = node.getBoundingClientRect();
  const box = sheet?.box;
  const bottomFree = box && !box.classList.contains("side") ? box.getBoundingClientRect().top : innerHeight - 90;
  const topFree = 70;
  if (r.top >= topFree && r.bottom <= bottomFree - 12) return;
  const delta = r.bottom > bottomFree - 12 ? r.bottom - (bottomFree - 24) : r.top - topFree - 12;
  scrollTo({ top: scrollY + delta, behavior: "smooth" });
}

const snap = (obj) => Object.fromEntries(Object.keys(obj ?? {}).map((k) => [k, JSON.stringify(obj[k])]));

/* ---- fereastra de editare ---- */

function openTarget(t) {
  if (t.hasAttribute("data-edit-add")) return addItem(t);
  openSheet(t.dataset.edit, t);
}

function openSheet(path, target = findTarget(path)) {
  const r = resolvePath(path);
  if (!r) return toast("Asta nu se poate schimba de aici.", true);
  closeSheetNow();
  const wide = innerWidth >= 900;
  // pe telefon fereastra stă jos: bucata editată urcă sus, ca schimbarea să se vadă deasupra ei
  if (target) {
    const box = target.getBoundingClientRect();
    if (!wide && (box.top < 64 || box.top > innerHeight * 0.32)) scrollTo({ top: scrollY + box.top - 72, behavior: "instant" });
    else if (wide && (box.top < 64 || box.bottom > innerHeight - 100)) scrollTo({ top: scrollY + box.top - 120, behavior: "instant" });
  }

  let prev = snap(r.obj);
  let structural = false;
  const onChange = () => {
    const now = snap(r.obj);
    for (const k of new Set([...Object.keys(prev), ...Object.keys(now)])) {
      if (prev[k] === now[k]) continue;
      if (!liveUpdate(r.base ? `${r.base}/${k}` : k, r.obj[k])) structural = true;
    }
    prev = now;
    saveDraft();
  };

  const finish = (force = false) => {
    closeSheetNow();
    changed();
    saveDraft();
    if (structural || force) reloadPage();
  };

  const actions = [];
  if (r.list) {
    const { list, listDef } = r;
    const item = r.obj;
    const canHide = (listDef.fields ?? []).some((f) => f.key === "hidden" && f.type === "bool");
    const fixed = listDef.fixedLength === true;
    const listPath = path.slice(0, path.lastIndexOf("/"));
    const siblings = target?.parentElement
      ? [...target.parentElement.children].filter((c) => c.dataset?.edit?.startsWith(`${listPath}/`) && /^\d+$/.test(c.dataset.edit.slice(listPath.length + 1)))
      : [];
    const pos = siblings.indexOf(target);
    const at = (node) => list[Number(node.dataset.edit.split("/").pop())];
    const before = pos > 0 ? at(siblings[pos - 1]) : null;
    const after = pos >= 0 && pos < siblings.length - 1 ? at(siblings[pos + 1]) : null;
    const move = (other, toAfter) => {
      list.splice(list.indexOf(item), 1);
      const i = list.indexOf(other);
      list.splice(toAfter ? i + 1 : i, 0, item);
      finish(true);
    };
    if (canHide) actions.push(el("button", { type: "button", class: "btn", onclick: () => ((item.hidden = !item.hidden), finish(true)) }, icon(item.hidden ? "eye" : "eye-off"), item.hidden ? "Arată pe site" : "Ascunde"));
    if (!fixed && before) actions.push(el("button", { type: "button", class: "btn btn-quiet", title: "Mută mai în față", onclick: () => move(before, false) }, "← Mută"));
    if (!fixed && after) actions.push(el("button", { type: "button", class: "btn btn-quiet", title: "Mută mai în spate", onclick: () => move(after, true) }, "Mută →"));
    if (!fixed) {
      actions.push(
        el("button", {
          type: "button",
          class: "btn btn-quiet",
          onclick: () => {
            const copy = structuredClone(item);
            for (const s of (listDef.fields ?? []).filter((f) => f.type === "slug")) copy[s.key] = "";
            const i = list.indexOf(item) + 1;
            list.splice(i, 0, copy);
            closeSheetNow();
            changed();
            reloadPage(`${listPath}/${i}`);
          },
        }, "Copie"),
        el("button", {
          type: "button",
          class: "btn btn-danger",
          onclick: async () => {
            const hint = canHide ? " Dacă doar nu-l mai ai acum, „Ascunde” îl păstrează pentru mai târziu." : "";
            if (!(await ask("Ștergi?", `Dispare de pe site după ce salvezi.${hint}`, "Șterge", true))) return;
            list.splice(list.indexOf(item), 1);
            finish(true);
          },
        }, "Șterge"),
      );
    }
  }

  const fields = r.fields.filter((f) => !(r.list && f.key === "hidden" && f.type === "bool"));
  const scrim = el("div", { class: "scrim", onclick: () => finish() });
  const box = el(
    "section",
    { class: `sheet${wide ? " side" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": r.title },
    el("div", { class: "sheet-head" }, el("div", { class: "sheet-title" }, el("small", { text: "Schimbi" }), el("h2", { text: r.title })), el("button", { type: "button", class: "icon-btn", "aria-label": "Gata", onclick: () => finish() }, "✕")),
    el(
      "div",
      { class: "sheet-body" },
      r.list && r.obj.hidden ? el("p", { class: "note", text: "Ascuns: vizitatorii nu-l văd. Tu îl vezi estompat, ca să-l poți arăta iar." }) : null,
      fieldsForm(fields, r.obj, onChange),
    ),
    el("div", { class: "sheet-actions" }, el("div", { class: "sheet-more" }, ...actions), el("button", { type: "button", class: "btn btn-primary sheet-done", onclick: () => finish() }, "Gata")),
  );
  sheet = { target, scrim, box, finish };
  UI.append(scrim, box);
  layout();
  requestAnimationFrame(() => box.classList.add("in"));
}

function closeSheetNow() {
  if (!sheet) return;
  sheet.scrim.remove();
  sheet.box.remove();
  sheet = null;
  relayout();
}

/** „+ Adaugă” de lângă o listă: elementul nou apare unde ai apăsat și se deschide pe loc. */
function addItem(t) {
  const key = t.dataset.editAdd;
  const r = resolvePath(key);
  if (!r?.def || r.def.type !== "list") return toast("Aici nu se poate adăuga.", true);
  const def = r.def;
  const list = r.list;
  const item = structuredClone(def.newItem ?? {});
  try {
    Object.assign(item, JSON.parse(t.dataset.editPreset || "{}"));
  } catch {}
  for (const f of (def.fields ?? []).filter((x) => x.type === "date" && x.quickDays && isEmpty(item[x.key]))) item[f.key] = dayFromToday(0);
  let at = list.length;
  if (def.newItemFirst) at = 0;
  else {
    const last = [...t.querySelectorAll(":scope > [data-edit]")].pop();
    if (last) at = Number(last.dataset.edit.split("/").pop()) + 1;
  }
  list.splice(at, 0, item);
  changed();
  reloadPage(`${key}/${at}`);
}

/* ---- păstrarea modificărilor între reîncărcări ---- */

const draftKey = () => `site-edit:draft:${state.repo.owner}/${state.repo.name}`.toLowerCase();

/** Ce n-ai salvat încă stă în sesiunea browserului, ca pagina să se poată redesena cu el. */
function saveDraft() {
  try {
    if (!isDirty() && !state.pending.size) {
      sessionStorage.removeItem(draftKey());
      return true;
    }
    sessionStorage.setItem(
      draftKey(),
      JSON.stringify({
        files: state.files.map((f) => ({ path: f.path, sha: f.sha, original: f.original, working: f.working })),
        pending: [...state.pending].map(([path, img]) => [path, img.value, bytesToBase64(img.bytes), img.type]),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey()) ?? "null");
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(draftKey());
  } catch {}
}

/** Pagina se redesenează cu ce ai schimbat, în același loc (după adăugat, mutat, ascuns, poze). */
function reloadPage(openPath) {
  if (!saveDraft()) {
    toast("Pozele sunt prea mari ca să le păstrez până la salvare. Apasă „Salvează” acum.", true);
    return;
  }
  try {
    sessionStorage.setItem(SCROLL_KEY, String(scrollY));
    if (openPath) sessionStorage.setItem(OPEN_KEY, openPath);
  } catch {}
  reloading = true;
  location.reload();
}

/* ---- meniul, ieșirea, ajutorul ---- */

function showMenu() {
  const item = (label, help, fn) =>
    el("button", { type: "button", class: "menu-item", onclick: () => (dialog.close(), fn()) }, el("b", { text: label }), help ? el("span", { text: help }) : null);
  const dialog = openDialog(
    state.schema?.name ?? "Site",
    el(
      "div",
      { class: "menu" },
      item(spotsOn ? "Ascunde lupele" : "Arată lupele", spotsOn ? "Vezi site-ul curat, ca un vizitator." : "Înapoi la editare.", () => {
        spotsOn = !spotsOn;
        document.documentElement.classList.toggle("se-clean", !spotsOn);
        layout();
        toast(spotsOn ? "Lupele sunt înapoi." : "Lupele sunt ascunse. Le arăți din meniu (☰).");
      }),
      item("Istoric", "Toate salvările. Readuci orice versiune.", showHistory),
      item("Mentenanță", state.maintenanceOn ? "Pornită: vizitatorii văd doar mesajul." : "Oprită: site-ul merge normal.", () => showMaintenance().catch(() => {})),
      item("Cum se folosește", null, showHelp),
      item(IN_APP ? "Închide editarea" : "Ieși din editare", null, exitEdit),
    ),
  );
}

async function exitEdit() {
  if (isDirty() && !(await ask("Ieși din editare?", "Ai modificări nesalvate; se pierd.", "Ieși", true))) return;
  clearDraft();
  reloading = true;
  if (window.OrganizatorBridge) return window.OrganizatorBridge.postMessage("exit");
  location.href = location.pathname + (DEMO ? "?demo" : "");
}

function showHelp() {
  openDialog(
    "Cum se folosește",
    el(
      "div",
      { class: "help" },
      el("h3", { text: "Schimbi ceva" }),
      el("p", { text: "Lângă tot ce se poate schimba e o lupă. Atinge-o, scrie sau alege, iar pagina arată pe loc cum iese. „Gata” închide fereastra și poți căuta mai departe." }),
      el("h3", { text: "Pui pe site" }),
      el("p", { text: "Când ți-a plăcut tot, apasă „Salvează” jos. Vizitatorii văd schimbarea în aproximativ un minut. Până atunci nu se schimbă nimic pentru ei." }),
      el("h3", { text: "Adaugi un produs" }),
      el("p", { text: "Lângă fiecare rând e „+ Adaugă”. Apare unul nou chiar acolo: îi pui numele și poza din telefon (o micșorez eu)." }),
      el("h3", { text: "Nu mai ai ceva" }),
      el("p", { text: "Atinge lupa și apasă „Ascunde”. Tu îl vezi estompat, vizitatorii deloc, și îl arăți iar când îl ai. „Șterge” îl scoate de tot." }),
      el("h3", { text: "Ai greșit?" }),
      el("p", { text: "„Renunță” anulează tot ce n-ai salvat. Din meniu (☰) → Istoric readuci orice versiune salvată înainte." }),
    ),
  );
}

/** Mesajul de mentenanță nu acoperă editarea, dar bara de jos amintește că e pornit. */
async function loadMaintenanceState() {
  try {
    const f = await state.backend.getFile(state.schema.maintenance ?? "maintenance.json");
    state.maintenanceOn = JSON.parse(fromUtf8.decode(f.bytes)).active === true;
    changed();
  } catch {}
}

/* ---- intrarea ---- */

/** Cheia de acces pusă de aplicația Organizator în „#t=…”: nu pleacă pe internet și o scot imediat din adresă. */
function tokenFromApp() {
  const m = /(?:^#|&)t=([^&]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return decodeURIComponent(m[1]);
}

function askLogin(error) {
  return new Promise((resolve) => {
    const schema = state.schema;
    const repo = state.repo;
    const repoText = repo ? `${repo.owner}/${repo.name}` : "";
    const name = encodeURIComponent(`Editare ${schema.name}`.slice(0, 40));
    const fineGrained = `https://github.com/settings/personal-access-tokens/new?name=${name}&description=${encodeURIComponent("Cheia pentru editarea site-ului")}${repo ? `&target_name=${encodeURIComponent(repo.owner)}` : ""}&expires_in=none&contents=write`;
    const classic = `https://github.com/settings/tokens/new?scopes=public_repo&description=${name}`;
    const tokenInput = el("input", { type: "password", autocomplete: "off", placeholder: "github_pat_… sau ghp_…", "aria-label": "Cheia de acces" });
    const repoInput = el("input", { type: "text", value: repoText, placeholder: "cont/nume-repo" });
    const remember = el("input", { type: "checkbox", class: "switch", checked: true });
    let answered = false;
    const form = el(
      "form",
      {
        class: "login",
        onsubmit: (e) => {
          e.preventDefault();
          const token = tokenInput.value.trim();
          const [owner, repoName] = repoInput.value.trim().split("/");
          if (!owner || !repoName || !token) return;
          if (`${owner}/${repoName}` !== repoText) {
            try {
              localStorage.setItem(repoKey(), `${owner}/${repoName}`);
            } catch {}
          }
          state.repo = { owner, name: repoName };
          answered = true;
          dialog.close();
          resolve({ token, remember: remember.checked });
        },
      },
      el("p", { class: "lead", text: "Ca să schimbi site-ul direct pe pagină, intri o singură dată pe telefonul sau calculatorul ăsta." }),
      error ? el("p", { class: "error", role: "alert", text: error }) : null,
      el(
        "ol",
        { class: "steps" },
        el("li", {}, el("b", { text: "Creează o cheie de acces" }), " în contul GitHub în care e site-ul. ", el("a", { href: fineGrained, target: "_blank", rel: "noopener", class: "btn btn-small" }, "Creează cheia ↗")),
        el("li", {}, "La ", el("b", { text: "Repository access" }), " alege ", el("i", { text: "Only select repositories" }), ` și bifează ${repo?.name ?? "repo-ul site-ului"}; la `, el("b", { text: "Permissions → Contents" }), " alege ", el("i", { text: "Read and write" }), ". Apoi ", el("b", { text: "Generate token" }), "."),
        el("li", {}, "Copiază cheia (începe cu ", el("code", { text: "github_pat_" }), ") și lipește-o aici."),
      ),
      el("label", { class: "field" }, el("span", { class: "field-label", text: "Cheia de acces" }), tokenInput),
      el("label", { class: "field field-switch" }, el("span", { class: "field-label", text: "Ține-mă minte pe acest dispozitiv" }), remember),
      el(
        "details",
        { class: "advanced" },
        el("summary", { text: "Altă situație" }),
        el("label", { class: "field" }, el("span", { class: "field-label", text: "Repo-ul site-ului" }), el("span", { class: "field-help", text: "Se completează singur; schimbă doar dacă site-ul e în alt cont." }), repoInput),
        el("p", { class: "field-help" }, "Ești doar colaborator la repo? Folosește o ", el("a", { href: classic, target: "_blank", rel: "noopener", text: "cheie clasică cu „public_repo”" }), "."),
      ),
      el("button", { type: "submit", class: "btn btn-primary btn-wide" }, "Intră"),
      el("p", { class: "fine" }, "Cheia rămâne doar în browserul tău și merge doar la GitHub. ", el("a", { href: "?edit&demo", text: "Vreau doar să încerc (demo)" })),
    );
    const dialog = openDialog(`Editezi ${schema.name}`, form);
    // închis fără cheie: site-ul rămâne, doar fără editare
    dialog.addEventListener("close", () => {
      if (answered) return;
      location.href = location.pathname;
    });
    tokenInput.focus();
  });
}

/** Verifică cheia și citește conținutul (sau ce n-ai salvat încă, din sesiune). */
async function connect(token) {
  const backend = DEMO ? new Demo() : new GitHub(token, { ...state.repo, branch: "main" });
  await busy("Deschid editarea…", async () => {
    const info = await backend.info();
    if (!info.permissions?.push) throw new AdminError("Cheia merge, dar nu are voie să schimbe site-ul. Alege „Contents: Read and write” când creezi cheia.", "auth");
    if (!DEMO) backend.repo.branch = info.default_branch ?? "main";
    state.backend = backend;
    state.repo = backend.repo;
    await loadContent();
  });
  checkLastDeploy();
  loadMaintenanceState();
}

async function loadContent() {
  const draft = readDraft();
  const files = [];
  for (const def of state.schema.files) {
    const saved = draft?.files?.find((f) => f.path === def.path);
    if (saved) {
      files.push({ def, path: def.path, sha: saved.sha, original: saved.original, working: saved.working });
      continue;
    }
    const file = await state.backend.getFile(def.path);
    const json = JSON.parse(fromUtf8.decode(file.bytes));
    files.push({ def, path: def.path, sha: file.sha, original: json, working: structuredClone(json) });
  }
  state.files = files;
  state.pending.clear();
  for (const [path, value, b64, type] of draft?.pending ?? []) {
    const bytes = base64ToBytes(b64);
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    state.pending.set(path, { bytes, url, value, type });
    state.previews.set(value, url);
  }
}

/* ------------------------------------------------------------------ */
/* Pornire (o cheamă pagina, cu ?edit în adresă)                       */
/* ------------------------------------------------------------------ */

/**
 * Pune editorul peste site și întoarce conținutul de desenat: cel de pe
 * GitHub, cu modificările nesalvate deasupra. Null dacă nu se poate edita.
 */
export async function start() {
  mountUI();
  try {
    state.schema = await (await fetch(new URL("admin/schema.json", SITE_ROOT), { cache: "no-store" })).json();
  } catch {
    toast("Nu găsesc admin/schema.json: nu știu ce se poate schimba pe site.", true);
    return null;
  }
  if (state.schema.accent) {
    host.style.setProperty("--accent", state.schema.accent);
    document.documentElement.style.setProperty("--se-accent", state.schema.accent);
  }
  state.repo = DEMO ? { owner: "demo", name: "site" } : detectRepo(state.schema);

  const fromApp = DEMO ? null : tokenFromApp();
  let token = DEMO ? null : fromApp ?? (state.repo ? readToken() : null);
  if (fromApp) storeToken(fromApp, false);
  let error = null;
  for (;;) {
    if (!DEMO && !token) {
      const login = await askLogin(error);
      token = login.token;
      try {
        await connect(token);
        storeToken(token, login.remember);
        break;
      } catch (e) {
        error = e.message;
        token = null;
        continue;
      }
    }
    try {
      await connect(token);
      break;
    } catch (e) {
      if (DEMO) {
        toast(e.message, true);
        return null;
      }
      if (e.kind === "auth") forgetToken();
      error = e.message;
      token = null;
    }
  }

  // pozele alese acum, dar încă nepublicate pe site: le iau din repo până apar
  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.raw || DEMO) return;
      const path = repoPathFor(img.getAttribute("src"));
      if (!path) return;
      img.dataset.raw = "1";
      img.src = `https://raw.githubusercontent.com/${state.repo.owner}/${state.repo.name}/${state.repo.branch}/${path}`;
    },
    true,
  );
  addEventListener("beforeunload", (e) => {
    if (!reloading && isDirty()) e.preventDefault();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet) sheet.finish();
  });
  // aplicația Organizator întreabă asta înainte să închidă editarea
  window.siteEditor = { dirty: () => isDirty() || state.pending.size > 0 };
  changed();
  const main = state.files.find((f) => f.path === "content.json") ?? state.files[0];
  return main?.working ?? null;
}

/** Pagina a desenat conținutul: pun lupele, pozele noi, locul de unde erai. */
export function rendered() {
  for (const img of document.querySelectorAll("img[src]")) {
    const v = img.getAttribute("src");
    if (state.previews.has(v)) img.src = state.previews.get(v);
  }
  const texts = state.files[0]?.def.sections.find((s) => s.key === "texts");
  const keys = new Set((texts?.fields ?? []).map((f) => f.key));
  for (const t of document.querySelectorAll("[data-text]")) {
    if (keys.has(t.dataset.text) && !t.dataset.edit) t.dataset.edit = `texts/${t.dataset.text}`;
  }
  let open = null;
  try {
    const y = sessionStorage.getItem(SCROLL_KEY);
    sessionStorage.removeItem(SCROLL_KEY);
    if (y != null) scrollTo({ top: Number(y), behavior: "instant" });
    open = sessionStorage.getItem(OPEN_KEY);
    sessionStorage.removeItem(OPEN_KEY);
  } catch {}
  addCards();
  startTracking();
  layout();
  if (open) {
    setTimeout(() => openSheet(open), 150);
    return;
  }
  let seen = false;
  try {
    seen = sessionStorage.getItem(HINT_KEY) === "1";
    sessionStorage.setItem(HINT_KEY, "1");
  } catch {}
  if (!seen) toast("Atinge lupa de lângă orice vrei să schimbi.");
}
