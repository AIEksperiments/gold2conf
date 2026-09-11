import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xblgiysrtdxpsnfasjxz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gXrwENfN_fh8BSh5FVx1pA_Gav1Frzy";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const SECTION_NAMES = {
  version: "Versjon",
  economy: "Økonomi",
  assets: "Assets",
  gold: "Gullgraving",
  hunting: "Jakt",
  bandits: "Banditter",
  shop: "Butikk",
  cabin: "Hytte",
  upgrades: "Oppgraderinger",
  audio: "Lyd",
  haptics: "Haptikk",
  tutorial: "Tutorial"
};

const SECTION_DESCRIPTIONS = {
  economy: "Startøkonomi og grunnverdier for nye spillere.",
  assets: "Navn på bilder, sprites og andre ressurser i Xcode.",
  gold: "Søk, sannsynligheter, renhet, vekt og verdi for gull.",
  hunting: "Sporing, dyr, skyting, skinnkvalitet og jaktøkonomi.",
  bandits: "Bandittmøter, tyveri, bounty og duelldata.",
  shop: "Lagerrotasjon, butikkbesøk og salgsvisning.",
  cabin: "Prisene for de permanente hytteoppgraderingene.",
  upgrades: "Uendelige utstyrsoppgraderinger, priser og effektkurver.",
  audio: "Lydfiler og volum. Krever foreløpig ny scene/appstart for alle endringer.",
  haptics: "Haptisk styrke og respons.",
  tutorial: "Førstegangsopplæring og det første gullfunnet."
};

const state = {
  session: null,
  isAdmin: false,
  rowVersion: null,
  updatedAt: null,
  original: null,
  working: null,
  activeSection: null,
  activeTab: "editor",
  dirty: false
};

const el = id => document.getElementById(id);
const loginView = el("loginView");
const appView = el("appView");
const loginForm = el("loginForm");
const loginError = el("loginError");
const sectionNav = el("sectionNav");
const editorRoot = el("editorRoot");
const sectionHeading = el("sectionHeading");
const searchInput = el("searchInput");
const publishBtn = el("publishBtn");
const discardBtn = el("discardBtn");
const validationBox = el("validationBox");
const jsonEditor = el("jsonEditor");
const historyRoot = el("historyRoot");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prettyLabel(key) {
  if (SECTION_NAMES[key]) return SECTION_NAMES[key];
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function pathString(path) {
  return path.map((part, i) =>
    typeof part === "number" ? `[${part}]` : (i ? `.${part}` : part)
  ).join("");
}

function leafCount(value) {
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + leafCount(item), 0);
  return Object.values(value).reduce((sum, item) => sum + leafCount(item), 0);
}

function applyMode(path) {
  const p = pathString(path);

  if (p === "version") return ["READ ONLY", "restart"];
  if (p.startsWith("assets.") || p.startsWith("audio.")) return ["RESTART", "restart"];
  if (p === "economy.startingGold") return ["NEW SAVE", "newsave"];
  if (p.startsWith("tutorial.")) return ["NEXT TUTORIAL", "round"];
  if (
    p.startsWith("gold.") ||
    p.startsWith("hunting.") ||
    p.startsWith("bandits.") ||
    p.startsWith("shop.") ||
    p.startsWith("cabin.") ||
    p.startsWith("upgrades.")
  ) return ["NEXT ACTION", "round"];

  return ["LIVE", "live"];
}

function getAtPath(root, path) {
  return path.reduce((value, key) => value?.[key], root);
}

function setAtPath(root, path, value) {
  if (!path.length) return;
  let cursor = root;
  for (let i = 0; i < path.length - 1; i++) cursor = cursor[path[i]];
  cursor[path[path.length - 1]] = value;
}

function deleteAtPath(root, path) {
  if (!path.length) return;
  const parent = getAtPath(root, path.slice(0, -1));
  const last = path[path.length - 1];
  if (Array.isArray(parent)) parent.splice(last, 1);
  else delete parent[last];
}

function setDirty(value = true) {
  state.dirty = value;
  el("dirtyStatus").textContent = value ? "Ikke publisert" : "Synkron";
  publishBtn.disabled = !value || !state.isAdmin;
  discardBtn.disabled = !value;
  if (state.activeTab === "json" && state.working) {
    jsonEditor.value = JSON.stringify(state.working, null, 2);
  }
}

function toast(message, kind = "") {
  const node = el("toast");
  node.textContent = message;
  node.className = `toast ${kind}`;
  requestAnimationFrame(() => node.classList.add("show"));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function showConnection(text, kind = "neutral") {
  const node = el("connectionPill");
  node.textContent = text;
  node.className = `pill ${kind}`;
}

async function signIn(email, password) {
  loginError.textContent = "";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.session = data.session;
}

async function signOut() {
  await supabase.auth.signOut();
  location.reload();
}

async function checkAdmin() {
  const uid = state.session?.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    console.warn("Admin membership check:", error);
    return false;
  }

  return Boolean(data?.user_id);
}

async function loadLiveConfig() {
  showConnection("Henter live…", "neutral");

  const { data, error } = await supabase
    .from("game_config")
    .select("id, version, config, updated_at")
    .eq("id", "live")
    .single();

  if (error) {
    showConnection("Feil ved lasting", "bad");
    throw error;
  }

  state.rowVersion = Number(data.version);
  state.updatedAt = data.updated_at;
  state.original = deepClone(data.config);
  state.working = deepClone(data.config);
  state.working.version = state.rowVersion;
  state.original.version = state.rowVersion;

  if (!state.activeSection || !(state.activeSection in state.working)) {
    state.activeSection = Object.keys(state.working).find(k => k !== "version") ?? Object.keys(state.working)[0];
  }

  el("versionPill").textContent = `v${state.rowVersion}`;
  el("updatedLabel").textContent = `Sist publisert: ${new Date(data.updated_at).toLocaleString("no-NO")}`;
  el("fieldCount").textContent = leafCount(state.working);
  showConnection("Live config tilkoblet", "good");
  setDirty(false);
  renderNavigation();
  renderEditor();
  jsonEditor.value = JSON.stringify(state.working, null, 2);
}

function renderNavigation() {
  sectionNav.innerHTML = "";

  for (const key of Object.keys(state.working ?? {})) {
    if (key === "version") continue;
    const btn = document.createElement("button");
    btn.className = `section-btn ${state.activeSection === key ? "active" : ""}`;
    btn.type = "button";
    btn.innerHTML = `<span>${prettyLabel(key)}</span><span class="count">${leafCount(state.working[key])}</span>`;
    btn.addEventListener("click", () => {
      state.activeSection = key;
      searchInput.value = "";
      renderNavigation();
      renderEditor();
    });
    sectionNav.appendChild(btn);
  }
}

function renderEditor() {
  if (!state.working) return;

  const query = searchInput.value.trim().toLowerCase();

  if (query) {
    sectionHeading.innerHTML = `<div><h2>Søkeresultater</h2><p class="muted">Treff på tvers av hele configen.</p></div><code>${escapeHtml(query)}</code>`;
    const leaves = flattenLeaves(state.working).filter(item => {
      const hay = `${item.pathText} ${prettyLabel(item.path.at(-1))} ${String(item.value)}`.toLowerCase();
      return hay.includes(query);
    });

    editorRoot.innerHTML = "";
    if (!leaves.length) {
      editorRoot.innerHTML = `<div class="empty-state">Ingen variabler matcher søket.</div>`;
      return;
    }

    const group = makeGroup(`Treff (${leaves.length})`, "global search");
    for (const item of leaves) {
      group.body.appendChild(makeLeafRow(item.path, item.value));
    }
    editorRoot.appendChild(group.root);
    return;
  }

  const section = state.activeSection;
  const description = SECTION_DESCRIPTIONS[section] ?? "Alle felter i denne delen kommer direkte fra live-konfigurasjonen.";
  sectionHeading.innerHTML = `
    <div>
      <h2>${escapeHtml(prettyLabel(section))}</h2>
      <p class="muted">${escapeHtml(description)}</p>
    </div>
    <code>${escapeHtml(section)}</code>
  `;

  editorRoot.innerHTML = "";
  const value = state.working[section];
  renderValue(editorRoot, value, [section], prettyLabel(section), true);
}

function makeGroup(title, pathText) {
  const root = document.createElement("div");
  root.className = "group";

  const head = document.createElement("div");
  head.className = "group-head";
  head.innerHTML = `<strong>${escapeHtml(title)}</strong><div class="path">${escapeHtml(pathText)}</div>`;

  const body = document.createElement("div");
  body.className = "group-body";

  root.append(head, body);
  return { root, body };
}

function renderValue(container, value, path, label, sectionRoot = false) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const group = makeGroup(label, pathString(path));
    if (sectionRoot) {
      group.root.style.borderColor = "transparent";
      group.root.style.background = "transparent";
      group.root.firstChild.style.display = "none";
      group.root.lastChild.style.padding = "0";
    }

    for (const [key, child] of Object.entries(value)) {
      renderValue(group.body, child, [...path, key], prettyLabel(key));
    }
    container.appendChild(group.root);
    return;
  }

  if (Array.isArray(value)) {
    const group = makeGroup(`${label} (${value.length})`, pathString(path));

    value.forEach((item, index) => {
      if (item !== null && typeof item === "object") {
        const card = document.createElement("div");
        card.className = "array-card";

        const head = document.createElement("div");
        head.className = "array-card-head";
        head.innerHTML = `<strong>#${index + 1}</strong>`;

        const actions = document.createElement("div");
        actions.className = "array-actions";

        const clone = document.createElement("button");
        clone.className = "tiny";
        clone.textContent = "Dupliser";
        clone.type = "button";
        clone.onclick = () => {
          value.splice(index + 1, 0, deepClone(item));
          setDirty(true);
          renderEditor();
        };

        const remove = document.createElement("button");
        remove.className = "tiny";
        remove.textContent = "Fjern";
        remove.type = "button";
        remove.onclick = () => {
          value.splice(index, 1);
          setDirty(true);
          renderEditor();
        };

        actions.append(clone, remove);
        head.appendChild(actions);
        card.appendChild(head);

        const body = document.createElement("div");
        body.className = "group-body";
        for (const [key, child] of Object.entries(item)) {
          renderValue(body, child, [...path, index, key], prettyLabel(key));
        }
        card.appendChild(body);
        group.body.appendChild(card);
      } else {
        const row = makeLeafRow([...path, index], item, `#${index + 1}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "tiny";
        remove.textContent = "Fjern";
        remove.onclick = () => {
          value.splice(index, 1);
          setDirty(true);
          renderEditor();
        };
        row.querySelector(".field-control").appendChild(remove);
        group.body.appendChild(row);
      }
    });

    const add = document.createElement("button");
    add.className = "ghost";
    add.type = "button";
    add.textContent = "+ Legg til";
    add.onclick = () => {
      const sample = value.length ? value[value.length - 1] : "";
      value.push(typeof sample === "object" ? deepClone(sample) : sample);
      setDirty(true);
      renderEditor();
    };
    group.body.appendChild(add);
    container.appendChild(group.root);
    return;
  }

  container.appendChild(makeLeafRow(path, value, label));
}

function makeLeafRow(path, value, overrideLabel = null) {
  const row = document.createElement("div");
  row.className = "field-row";

  const info = document.createElement("div");
  info.className = "field-info";

  const title = document.createElement("div");
  title.className = "field-title";
  title.textContent = overrideLabel ?? prettyLabel(path.at(-1));

  const meta = document.createElement("div");
  meta.className = "field-meta";

  const code = document.createElement("code");
  code.textContent = pathString(path);

  const [modeText, modeClass] = applyMode(path);
  const mode = document.createElement("span");
  mode.className = `mode ${modeClass}`;
  mode.textContent = modeText;

  meta.append(code, mode);
  info.append(title, meta);

  const control = document.createElement("div");
  control.className = "field-control";

  const readonly = pathString(path) === "version";

  if (typeof value === "boolean") {
    control.classList.add("bool-control");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    input.disabled = readonly;
    input.addEventListener("change", () => {
      setAtPath(state.working, path, input.checked);
      setDirty(true);
    });
    control.appendChild(input);
  } else {
    const input = document.createElement("input");
    input.type = typeof value === "number" ? "number" : "text";
    if (typeof value === "number") input.step = "any";
    input.value = value ?? "";
    input.disabled = readonly;

    input.addEventListener("change", () => {
      let newValue = input.value;
      if (typeof value === "number") {
        newValue = Number(input.value);
        if (!Number.isFinite(newValue)) {
          input.value = String(value);
          toast("Ugyldig tallverdi.", "bad");
          return;
        }
      }
      setAtPath(state.working, path, newValue);
      setDirty(true);
    });
    control.appendChild(input);
  }

  row.append(info, control);
  return row;
}

function flattenLeaves(value, path = [], out = []) {
  if (value === null || typeof value !== "object") {
    out.push({ path, pathText: pathString(path), value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenLeaves(item, [...path, index], out));
  } else {
    Object.entries(value).forEach(([key, item]) => flattenLeaves(item, [...path, key], out));
  }
  return out;
}

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  const finiteWalk = (value, path = []) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(`${pathString(path)} må være et gyldig tall.`);
    } else if (value && typeof value === "object") {
      if (Array.isArray(value)) value.forEach((v, i) => finiteWalk(v, [...path, i]));
      else Object.entries(value).forEach(([k, v]) => finiteWalk(v, [...path, k]));
    }
  };
  finiteWalk(config);

  const probabilityPaths = [
    ["bandits", "encounterChance"],
    ["bandits", "theftMinFraction"],
    ["bandits", "theftMaxFraction"],
    ["bandits", "theftFloorFraction"],
    ["hunting", "rabbit", "probability"],
    ["hunting", "deer", "probability"],
    ["hunting", "bear", "probability"]
  ];

  for (const path of probabilityPaths) {
    const value = getAtPath(config, path);
    if (typeof value === "number" && (value < 0 || value > 1)) {
      errors.push(`${pathString(path)} må være mellom 0 og 1.`);
    }
  }

  const species = ["rabbit", "deer", "bear"].map(k => Number(config?.hunting?.[k]?.probability ?? 0));
  const speciesSum = species.reduce((a, b) => a + b, 0);
  if (Math.abs(speciesSum - 1) > 0.001) {
    warnings.push(`Dyresannsynlighetene summerer til ${(speciesSum * 100).toFixed(1)} %, ikke 100 %. Spillet normaliserer dem, men 100 % er lettere å balansere.`);
  }

  const checkCutoffs = (arr, label) => {
    if (!Array.isArray(arr) || !arr.length) {
      errors.push(`${label} kan ikke være tom.`);
      return;
    }
    let previous = -Infinity;
    arr.forEach((tier, i) => {
      const cutoff = Number(tier.cutoff);
      if (!(cutoff > previous && cutoff > 0 && cutoff <= 1)) {
        errors.push(`${label}[${i}].cutoff må være stigende og mellom 0 og 1.`);
      }
      previous = cutoff;
      if ("purityMin" in tier && Number(tier.purityMin) > Number(tier.purityMax)) {
        errors.push(`${label}[${i}]: purityMin er større enn purityMax.`);
      }
      if ("weightMin" in tier && Number(tier.weightMin) > Number(tier.weightMax)) {
        errors.push(`${label}[${i}]: weightMin er større enn weightMax.`);
      }
      if ("minReward" in tier && Number(tier.minReward) > Number(tier.maxReward)) {
        errors.push(`${label}[${i}]: minReward er større enn maxReward.`);
      }
    });
    const last = Number(arr.at(-1)?.cutoff);
    if (last < 0.999) warnings.push(`${label} har siste cutoff ${last}; verdier over dette bruker fallback til siste tier.`);
  };

  checkCutoffs(config?.gold?.tiers, "gold.tiers");
  checkCutoffs(config?.bandits?.bountyTiers, "bandits.bountyTiers");

  for (const [key, value] of Object.entries(config?.audio ?? {})) {
    if (key.toLowerCase().includes("volume") && typeof value === "number" && (value < 0 || value > 1)) {
      errors.push(`audio.${key} må være mellom 0 og 1.`);
    }
  }

  const costs = config?.cabin?.upgradeCosts;
  if (!Array.isArray(costs) || !costs.length || costs.some(v => !Number.isFinite(Number(v)) || Number(v) < 0)) {
    errors.push("cabin.upgradeCosts må inneholde gyldige priser.");
  }

  const stock = Number(config?.shop?.randomStockCount);
  if (stock < 1 || stock > 8) warnings.push("shop.randomStockCount er normalt 1–8 fordi det finnes 8 utstyrslinjer.");

  for (const [name, item] of Object.entries(config?.upgrades?.items ?? {})) {
    if (Number(item.costGrowth) < 1) warnings.push(`upgrades.items.${name}.costGrowth er under 1, så oppgraderinger blir billigere på høyere nivå.`);
    if (Number(item.baseCost) < 0) errors.push(`upgrades.items.${name}.baseCost kan ikke være negativ.`);
  }

  return { errors, warnings };
}

function showValidation(result) {
  validationBox.classList.remove("hidden", "good", "bad");
  validationBox.classList.add(result.errors.length ? "bad" : "good");

  const ok = !result.errors.length && !result.warnings.length;
  if (ok) {
    validationBox.innerHTML = `<strong>✓ Configen ser gyldig ut.</strong>`;
    return;
  }

  const parts = [];
  if (result.errors.length) {
    parts.push(`<strong class="error">${result.errors.length} feil</strong><ul>${result.errors.map(x => `<li class="error">${escapeHtml(x)}</li>`).join("")}</ul>`);
  }
  if (result.warnings.length) {
    parts.push(`<strong class="warn">${result.warnings.length} advarsel(er)</strong><ul>${result.warnings.map(x => `<li class="warn">${escapeHtml(x)}</li>`).join("")}</ul>`);
  }
  validationBox.innerHTML = parts.join("");
}

async function publish() {
  if (!state.isAdmin) {
    toast("Denne brukeren har ikke admin-tilgang.", "bad");
    return;
  }

  const result = validateConfig(state.working);
  showValidation(result);
  if (result.errors.length) {
    toast("Rett valideringsfeilene før publisering.", "bad");
    return;
  }

  publishBtn.disabled = true;
  publishBtn.textContent = "Publiserer…";

  try {
    const payload = deepClone(state.working);
    payload.version = state.rowVersion + 1;

    const { data, error } = await supabase
      .from("game_config")
      .update({ config: payload })
      .eq("id", "live")
      .select("id, version, config, updated_at")
      .single();

    if (error) throw error;

    state.rowVersion = Number(data.version);
    state.updatedAt = data.updated_at;
    state.working = deepClone(data.config);
    state.original = deepClone(data.config);
    state.working.version = state.rowVersion;
    state.original.version = state.rowVersion;

    el("versionPill").textContent = `v${state.rowVersion}`;
    el("updatedLabel").textContent = `Sist publisert: ${new Date(data.updated_at).toLocaleString("no-NO")}`;
    setDirty(false);
    renderEditor();
    jsonEditor.value = JSON.stringify(state.working, null, 2);
    toast(`Publisert som v${state.rowVersion}. Spillet får Realtime-event nå.`, "good");
  } catch (error) {
    console.error(error);
    toast(`Publisering feilet: ${error.message ?? error}`, "bad");
  } finally {
    publishBtn.textContent = "Save & Publish";
    publishBtn.disabled = !state.dirty || !state.isAdmin;
  }
}

async function loadHistory() {
  historyRoot.innerHTML = `<div class="empty-state">Henter historikk…</div>`;

  if (!state.isAdmin) {
    historyRoot.innerHTML = `<div class="empty-state">Historikk er kun tilgjengelig for admin-brukere.</div>`;
    return;
  }

  const { data, error } = await supabase
    .from("game_config_history")
    .select("history_id, config_id, version, archived_at, config")
    .eq("config_id", "live")
    .order("history_id", { ascending: false })
    .limit(30);

  if (error) {
    historyRoot.innerHTML = `<div class="empty-state">Kunne ikke laste historikk: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data?.length) {
    historyRoot.innerHTML = `<div class="empty-state">Ingen tidligere versjoner ennå.</div>`;
    return;
  }

  historyRoot.innerHTML = "";
  for (const row of data) {
    const card = document.createElement("div");
    card.className = "history-item";

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>Versjon ${row.version}</strong>
      <div class="history-meta">Arkivert ${new Date(row.archived_at).toLocaleString("no-NO")} · history_id ${row.history_id}</div>
    `;

    const button = document.createElement("button");
    button.className = "ghost";
    button.textContent = "Rull tilbake hit";
    button.onclick = async () => {
      if (!confirm(`Rulle live-config tilbake til innholdet fra v${row.version}? Den nåværende versjonen blir arkivert automatisk.`)) return;
      try {
        const config = deepClone(row.config);
        config.version = state.rowVersion + 1;

        const { data: updated, error: updateError } = await supabase
          .from("game_config")
          .update({ config })
          .eq("id", "live")
          .select("version, config, updated_at")
          .single();

        if (updateError) throw updateError;
        toast(`Rollback publisert som ny v${updated.version}.`, "good");
        await loadLiveConfig();
        await loadHistory();
      } catch (error) {
        toast(`Rollback feilet: ${error.message ?? error}`, "bad");
      }
    };

    card.append(info, button);
    historyRoot.appendChild(card);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
  el("editorTab").classList.toggle("hidden", tabName !== "editor");
  el("jsonTab").classList.toggle("hidden", tabName !== "json");
  el("historyTab").classList.toggle("hidden", tabName !== "history");

  if (tabName === "json") jsonEditor.value = JSON.stringify(state.working, null, 2);
  if (tabName === "history") loadHistory();
}

async function bootApp(session) {
  state.session = session;
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");

  el("userLabel").textContent = session.user.email ?? session.user.id;
  state.isAdmin = await checkAdmin();
  el("adminWarning").classList.toggle("hidden", state.isAdmin);

  await loadLiveConfig();
  publishBtn.disabled = !state.dirty || !state.isAdmin;
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const email = el("emailInput").value.trim();
  const password = el("passwordInput").value;

  try {
    await signIn(email, password);
    await bootApp(state.session);
  } catch (error) {
    loginError.textContent = error.message ?? String(error);
  }
});

el("logoutBtn").addEventListener("click", signOut);
el("reloadBtn").addEventListener("click", async () => {
  if (state.dirty && !confirm("Du har upubliserte endringer. Forkaste dem og laste live-config på nytt?")) return;
  try {
    await loadLiveConfig();
    toast("Live-config lastet på nytt.", "good");
  } catch (error) {
    toast(error.message ?? String(error), "bad");
  }
});

el("validateBtn").addEventListener("click", () => showValidation(validateConfig(state.working)));

discardBtn.addEventListener("click", () => {
  state.working = deepClone(state.original);
  setDirty(false);
  renderEditor();
  jsonEditor.value = JSON.stringify(state.working, null, 2);
  toast("Lokale endringer forkastet.");
});

publishBtn.addEventListener("click", publish);

searchInput.addEventListener("input", renderEditor);

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

el("applyJsonBtn").addEventListener("click", () => {
  try {
    const parsed = JSON.parse(jsonEditor.value);
    state.working = parsed;
    state.working.version = state.rowVersion;
    setDirty(true);
    renderNavigation();
    renderEditor();
    showValidation(validateConfig(state.working));
    toast("JSON importert til editoren.", "good");
  } catch (error) {
    toast(`Ugyldig JSON: ${error.message}`, "bad");
  }
});

el("refreshHistoryBtn").addEventListener("click", loadHistory);

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  await bootApp(session);
} else {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session && !appView.classList.contains("hidden")) location.reload();
});
