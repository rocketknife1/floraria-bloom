/*
 * Panoul de administrare al site-ului (admin/index.html).
 *
 * Citește admin/schema.json (aceeași schemă pe care o folosește aplicația
 * Organizator) și arată un formular pentru tot conținutul site-ului: liste cu
 * adăugare, ascundere, ștergere și reordonare, poze, program, prețuri, texte.
 * „Salvează pe site” face un commit în repo-ul de pe GitHub, iar GitHub Pages
 * publică singur site-ul în aproximativ un minut.
 *
 * Nu are server: vorbește direct cu GitHub, cu cheia de acces a celui care
 * administrează site-ul, ținută doar în browserul lui. Nu știe nimic anume
 * despre un site, deci se copiază la fel în orice site cu admin/schema.json.
 *
 * Cu „?demo” la sfârșitul adresei merge fără cheie: citește fișierele de pe
 * site, iar „salvările” rămân doar în pagină (pentru încercat sau arătat).
 */

const API = "https://api.github.com";
const DEMO = new URLSearchParams(location.search).has("demo");
const SITE_ROOT = new URL("../", location.href);
const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
const DAYS_SHORT = ["L", "Ma", "Mi", "J", "V", "S", "D"];

/* ------------------------------------------------------------------ */
/* Mici ajutoare                                                       */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);

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
      const res = await fetch(new URL(path, SITE_ROOT), { cache: "no-store" });
      if (!res.ok) throw new AdminError(`Nu găsesc „${path}” pe site.`, "missing");
      this.files.set(path, new Uint8Array(await res.arrayBuffer()));
      this.log.push({ sha: "original", message: "Cum era site-ul când ai deschis demo-ul", date: new Date(), files: new Map(this.files) });
    }
    return { sha: `demo-${this.log.length}`, bytes: this.files.get(path) };
  }

  async commit(files, message) {
    await new Promise((r) => setTimeout(r, 600));
    for (const [path, b64] of Object.entries(files)) this.files.set(path, base64ToBytes(b64));
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
  maintenance: null, // { path, sha, data }
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
/** După orice schimbare: bara „Salvează”, semnele „modificat” de pe secțiuni. */
function changed() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    const names = changedSections();
    const bar = $("#savebar");
    bar.hidden = !names.length;
    $("#savebar-text").textContent = names.length === 1 ? "1 secțiune modificată" : `${names.length} secțiuni modificate`;
    for (const f of state.files) {
      for (const s of f.def.sections) {
        const badge = document.querySelector(`[data-badge="${CSS.escape(f.path + "|" + s.key)}"]`);
        if (badge) badge.hidden = !sectionChanged(f, s.key);
      }
    }
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
  const names = changedSections();
  const ok = await ask("Salvez pe site?", `Se publică: ${names.join(", ")}. Apare pe site în aproximativ un minut.`, "Salvează");
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
    const sha = await state.backend.commit(files, `Modificat din panoul de administrare: ${names.join(", ")}`, expected);
    for (const f of changedFiles) {
      f.sha = (await state.backend.getFile(f.path, sha)).sha;
      f.original = structuredClone(f.working);
    }
    state.pending.clear();
    changed();
    watchDeploy(sha);
    toast(DEMO ? "Salvat în demo (pe site nu se schimbă nimic)." : "Salvat! Apare pe site în aproximativ un minut.");
  });
}

async function discard() {
  if (!(await ask("Renunți la modificări?", "Tot ce ai schimbat de la ultima salvare se pierde.", "Renunță", true))) return;
  for (const f of state.files) f.working = structuredClone(f.original);
  state.pending.clear();
  renderEditor();
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
  state.pending.set(`${imageDir()}/${fileName}`, { bytes: img.bytes, url });
  state.previews.set(value, url);
  return { value, width: img.width, height: img.height };
}

function pickFiles({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = el("input", { type: "file", accept: "image/*", multiple });
    input.addEventListener("change", () => resolve([...input.files]));
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

function field(def, obj, update) {
  const set = (v) => {
    obj[def.key] = v;
    update();
  };
  const v = obj[def.key] ?? def.default;
  switch (def.type) {
    case "text":
      return labelFor(def, el("input", { type: "text", value: v ?? "", oninput: (e) => set(e.target.value) }));
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
      const select = el("select", { onchange: (e) => set(e.target.value) }, options.map((o) => el("option", { value: String(o.value) }, o.label)));
      if (v != null && !options.some((o) => String(o.value) === String(v))) select.append(el("option", { value: String(v) }, String(v)));
      select.value = v == null ? "" : String(v);
      if (v == null) select.prepend(el("option", { value: "", disabled: true }, "Alege…")), (select.value = "");
      return labelFor(def, select);
    }
    case "date":
      return labelFor(def, el("input", { type: "date", value: v ?? "", onchange: (e) => set(e.target.value || null) }));
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

  const titleOf = (item, i) => {
    const t = def.itemTitle ? valueAtPath(item, def.itemTitle) : null;
    return typeof t === "string" && t.trim() ? t : `Element ${i + 1}`;
  };
  const subtitleOf = (item) => {
    const s = def.itemSubtitle ? valueAtPath(item, def.itemSubtitle) : null;
    if (s == null || s === "") return "";
    const sub = (def.fields ?? []).find((f) => f.key === def.itemSubtitle);
    const opt = sub?.options?.find((o) => String(o.value) === String(s));
    return opt ? opt.label : String(s);
  };

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
    const node = el("div", { class: `item${item.hidden ? " is-hidden" : ""}${openItems.has(item) ? " open" : ""}` }, head);
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
      node.append(el("div", { class: "item-body" }, fieldsForm((def.fields ?? []).filter((f) => !(canHide && f.key === "hidden")), item, paintHead), actions));
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
            list.push(item);
            openItems.add(item);
            filter = search.value = "";
            render();
            update();
            requestAnimationFrame(() => items.querySelector(".item.open:last-of-type, .item:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          },
        }, `+ Adaugă în „${def.label}”`),
      );
    }
    items.replaceChildren(...children);
  };
  render();
  return el("div", { class: "field" }, def.description ? el("span", { class: "field-help", text: def.description }) : null, box);
}

/* ------------------------------------------------------------------ */
/* Ecranele                                                            */
/* ------------------------------------------------------------------ */

function renderEditor() {
  const main = $("#main");
  const nav = el("nav", { class: "section-nav", "aria-label": "Secțiuni" });
  const sections = el("div", { class: "sections" });
  for (const f of state.files) {
    for (const s of f.def.sections) {
      const id = `s-${slugify(f.path)}-${slugify(s.key)}`;
      nav.append(el("a", { href: `#${id}`, class: "nav-chip", text: s.label.replace(/\s*\(.*\)$/, "") }));
      // titlul și descrierea secțiunii sunt deja sus, în bara ei
      const body = s.type === "list" || s.type === "group" ? field({ ...s, label: s.type === "group" ? "" : s.label, description: null }, f.working, changed) : fieldsForm([s], f.working, null);
      sections.append(
        el(
          "details",
          { class: "section", id, open: state.files.length === 1 && f.def.sections.length <= 2 },
          el("summary", {}, el("span", { class: "section-title", text: s.label }), el("span", { class: "tag tag-changed", "data-badge": `${f.path}|${s.key}`, text: "modificat", hidden: true }), el("span", { class: "chevron", "aria-hidden": "true" })),
          s.description ? el("p", { class: "section-help", text: s.description }) : null,
          el("div", { class: "section-body" }, body),
        ),
      );
    }
  }
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    const target = document.getElementById(a.getAttribute("href").slice(1));
    target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  main.replaceChildren(nav, sections);
  changed();
}

function renderLogin(error) {
  const schema = state.schema;
  const repo = state.repo;
  const repoText = repo ? `${repo.owner}/${repo.name}` : "";
  const name = encodeURIComponent(`Panou ${schema.name}`.slice(0, 40));
  const fineGrained = `https://github.com/settings/personal-access-tokens/new?name=${name}&description=${encodeURIComponent("Cheia panoului de administrare al site-ului")}${repo ? `&target_name=${encodeURIComponent(repo.owner)}` : ""}&expires_in=none&contents=write`;
  const classic = `https://github.com/settings/tokens/new?scopes=public_repo&description=${name}`;
  const tokenInput = el("input", { type: "password", autocomplete: "off", placeholder: "github_pat_… sau ghp_…", "aria-label": "Cheia de acces" });
  const repoInput = el("input", { type: "text", value: repoText, placeholder: "cont/nume-repo" });
  const remember = el("input", { type: "checkbox", class: "switch", checked: true });
  const form = el(
    "form",
    {
      class: "login card",
      onsubmit: async (e) => {
        e.preventDefault();
        const token = tokenInput.value.trim();
        const [owner, repoName] = repoInput.value.trim().split("/");
        if (!owner || !repoName) return renderLogin("Scrie repo-ul ca „cont/nume-repo”.");
        if (!token) return renderLogin("Lipește cheia de acces.");
        state.repo = { owner, name: repoName };
        if (`${owner}/${repoName}` !== repoText) {
          try {
            localStorage.setItem(repoKey(), `${owner}/${repoName}`);
          } catch {}
        }
        try {
          await connect(token);
          storeToken(token, remember.checked);
        } catch (err) {
          renderLogin(err.message);
        }
      },
    },
    el("h1", { text: schema.name }),
    el("p", { class: "lead", text: "Panoul de administrare al site-ului: produse, poze, program, prețuri și texte, fără să atingi codul." }),
    error ? el("p", { class: "error", role: "alert", text: error }) : null,
    el(
      "ol",
      { class: "steps" },
      el("li", {}, el("b", { text: "Creează o cheie de acces" }), " în contul GitHub în care e site-ul (o singură dată pe telefonul sau calculatorul ăsta). ", el("a", { href: fineGrained, target: "_blank", rel: "noopener", class: "btn btn-small" }, "Creează cheia ↗")),
      el("li", {}, "Pe pagina GitHub: la ", el("b", { text: "Repository access" }), " alege ", el("i", { text: "Only select repositories" }), ` și bifează ${repo?.name ?? "repo-ul site-ului"}; la `, el("b", { text: "Permissions → Contents" }), " alege ", el("i", { text: "Read and write" }), ". Apoi ", el("b", { text: "Generate token" }), "."),
      el("li", {}, "Copiază cheia (începe cu ", el("code", { text: "github_pat_" }), ") și lipește-o mai jos."),
    ),
    el("label", { class: "field" }, el("span", { class: "field-label", text: "Cheia de acces" }), tokenInput),
    el("label", { class: "field field-switch" }, el("span", { class: "field-label", text: "Ține-mă minte pe acest dispozitiv" }), remember),
    el(
      "details",
      { class: "advanced" },
      el("summary", { text: "Altă situație" }),
      el("label", { class: "field" }, el("span", { class: "field-label", text: "Repo-ul site-ului" }), el("span", { class: "field-help", text: "Se completează singur; schimbă doar dacă site-ul e în alt cont." }), repoInput),
      el("p", { class: "field-help" }, "Ești doar colaborator la repo (nu e în contul tău)? Atunci folosește o ", el("a", { href: classic, target: "_blank", rel: "noopener", text: "cheie clasică cu „public_repo”" }), "."),
    ),
    el("button", { type: "submit", class: "btn btn-primary btn-wide" }, "Intră"),
    el("p", { class: "fine" }, "Cheia rămâne doar în browserul tău și merge doar la GitHub. ", el("a", { href: "?demo", text: "Vreau doar să încerc (demo)" })),
  );
  $("#main").replaceChildren(form);
  $("#toolbar").hidden = true;
  tokenInput.focus();
}

/** Verifică cheia, citește conținutul și deschide editorul. */
async function connect(token) {
  const backend = DEMO ? new Demo() : new GitHub(token, { ...state.repo, branch: "main" });
  await busy("Mă conectez la site…", async () => {
    const info = await backend.info();
    if (!info.permissions?.push) throw new AdminError("Cheia merge, dar nu are voie să schimbe site-ul. Alege „Contents: Read and write” când creezi cheia.", "auth");
    if (!DEMO) backend.repo.branch = info.default_branch ?? "main";
    state.backend = backend;
    state.repo = backend.repo;
    await loadContent();
  });
  $("#toolbar").hidden = false;
  $("#repo-name").textContent = DEMO ? "demo — nimic nu se salvează pe site" : `${state.repo.owner}/${state.repo.name}`;
  renderEditor();
  checkLastDeploy();
}

async function loadContent() {
  const files = [];
  for (const def of state.schema.files) {
    const file = await state.backend.getFile(def.path);
    const json = JSON.parse(fromUtf8.decode(file.bytes));
    files.push({ def, path: def.path, sha: file.sha, original: json, working: structuredClone(json) });
  }
  state.files = files;
  state.pending.clear();
}

async function reload() {
  if (isDirty() && !(await ask("Reîncarci?", "Ce n-ai salvat se pierde și vezi site-ul cum e acum pe GitHub.", "Reîncarcă", true))) return;
  await busy("Reîncarc…", loadContent);
  renderEditor();
}

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
                        const sha = await state.backend.commit({ [f.path]: bytesToBase64(old.bytes) }, `Revenit din panoul de administrare la versiunea din ${formatDate(v.date)}`, { [f.path]: f.sha });
                        watchDeploy(sha);
                        await loadContent();
                      });
                    } catch {
                      return; // busy() a arătat deja ce nu a mers
                    }
                    renderEditor();
                    toast("Gata, versiunea veche e din nou pe site (în aproximativ un minut).");
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
            const sha = await state.backend.commit({ [path]: bytesToBase64(utf8.encode(encodeJson(data))) }, data.active ? "Mentenanță pornită din panoul de administrare" : "Mentenanță oprită din panoul de administrare", { [path]: current.sha });
            watchDeploy(sha);
          });
        } catch {
          return; // busy() a arătat deja ce nu a mers
        }
        toast(data.active ? "Mentenanța pornește pe site în aproximativ un minut." : "Site-ul revine în aproximativ un minut.");
      },
    }, "Salvează")),
  );
}

/* ---- Ajutor ---- */

function showHelp() {
  openDialog(
    "Cum se folosește",
    el(
      "div",
      { class: "help" },
      el("h3", { text: "Adaugi un produs nou" }),
      el("p", { text: "Deschide lista (ex. Galerie), apasă „+ Adaugă”, completează numele, alege poza din telefon și apasă „Salvează pe site”." }),
      el("h3", { text: "Nu mai ai un produs" }),
      el("p", { text: "Atinge-l în listă și apasă „Ascunde de pe site”. Rămâne aici și îl arăți iar când îl ai. „Șterge” îl scoate de tot." }),
      el("h3", { text: "Schimbi ordinea" }),
      el("p", { text: "Atinge produsul și folosește „↑ Sus” / „↓ Jos”. Pe site apare în aceeași ordine." }),
      el("h3", { text: "Program, telefon, livrare, texte" }),
      el("p", { text: "Sunt în secțiunile lor; schimbi ce vrei și salvezi. Pozele le micșorez eu automat, ca site-ul să rămână rapid." }),
      el("h3", { text: "Când apare pe site?" }),
      el("p", { text: "La aproximativ un minut după „Salvează pe site”. Sus vezi „Se publică…”, apoi „Pe site”. Dacă nu vezi schimbarea, reîncarcă site-ul." }),
      el("h3", { text: "Ai greșit ceva?" }),
      el("p", { text: "Din „Istoric” readuci orice versiune salvată înainte." }),
    ),
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
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  dialog.showModal();
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
/* Pornire                                                             */
/* ------------------------------------------------------------------ */

async function start() {
  try {
    const res = await fetch("schema.json", { cache: "no-store" });
    state.schema = await res.json();
  } catch {
    $("#main").replaceChildren(el("p", { class: "error card", text: "Nu găsesc admin/schema.json: panoul nu știe ce să arate." }));
    return;
  }
  const schema = state.schema;
  document.title = `Administrare — ${schema.name}`;
  $("#site-name").textContent = schema.name;
  if (schema.accent) document.documentElement.style.setProperty("--accent", schema.accent);
  const live = $("#live-link");
  live.href = DEMO ? "../" : schema.liveUrl || "../";

  $("#save").addEventListener("click", () => save().catch(() => {}));
  $("#discard").addEventListener("click", discard);
  $("#reload").addEventListener("click", () => reload().catch(() => {}));
  $("#history").addEventListener("click", showHistory);
  $("#maintenance").addEventListener("click", () => showMaintenance().catch(() => {}));
  $("#help").addEventListener("click", showHelp);
  $("#logout").addEventListener("click", async () => {
    if (isDirty() && !(await ask("Ieși?", "Ai modificări nesalvate; se pierd.", "Ieși", true))) return;
    if (!DEMO) forgetToken();
    location.href = location.pathname;
  });
  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) e.preventDefault();
  });

  state.repo = DEMO ? { owner: "demo", name: "site" } : detectRepo(schema);
  if (DEMO) {
    document.body.classList.add("is-demo");
    try {
      await connect(null);
    } catch (e) {
      $("#main").replaceChildren(el("p", { class: "error card", text: e.message }));
    }
    return;
  }
  const token = state.repo ? readToken() : null;
  if (!token) return renderLogin();
  try {
    await connect(token);
  } catch (e) {
    if (e.kind === "auth") forgetToken();
    renderLogin(e.message);
  }
}

start();
