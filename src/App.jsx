import React from "react";
// If your file already imports CSS, keep it. Otherwise, you can leave this commented.
// import "./App.css";

/* ===============================
   Constants / Keys
================================ */
const LS = { sheets: "cw_sheets", sheetName: "cw_sheetName", tab: "cw_tab" };
const DEFAULT_SHEET = "Default";
const DEFAULT_TAB = "FILM";
const FALLBACK_CODE = "PMR9EE"; // change if your default sheet/code is different

/* ===============================
   Helpers
================================ */
const norm = (s) => (s || "").trim().toLowerCase();
const numOrNull = (v) => (Number.isFinite(+v) ? +v : null);
const normalizeFilm = (x) => ({
  id: x.id ?? `${norm(x.title)}-${x.year ?? ""}`,
  title: x.title ?? x.name ?? "Untitled",
  year: numOrNull(x.year),
  platform: x.platform ?? x.service ?? null,
  runtime: numOrNull(x.runtime),
  tags: Array.isArray(x.tags) ? x.tags : [],
  type: x.type || "film",
});

// Optional external search (OMDb) if you set VITE_OMDB_KEY
async function searchOmdb(query) {
  const key = import.meta?.env?.VITE_OMDB_KEY;
  if (!key || !query) return [];
  try {
    const r = await fetch(
      `https://www.omdbapi.com/?apikey=${key}&type=movie&s=${encodeURIComponent(query)}`
    );
    const j = await r.json();
    if (!j || j.Response === "False" || !Array.isArray(j.Search)) return [];
    return j.Search.map((m) => normalizeFilm({ title: m.Title, year: m.Year && Number(m.Year) }));
  } catch {
    return [];
  }
}

/* Try a global loader your site may define:
   window.loadFromCloud(code) -> { name, items } OR { "<sheetName>": [ ... ] }
*/
async function tryGlobalCloudLoad(code) {
  try {
    if (typeof window !== "undefined" && typeof window.loadFromCloud === "function") {
      const res = await window.loadFromCloud(code);
      if (res?.items && res?.name) return res;
      if (res && typeof res === "object") {
        const name = Object.keys(res)[0] || DEFAULT_SHEET;
        return { name, items: Array.isArray(res[name]) ? res[name] : [] };
      }
    }
  } catch (e) {
    console.warn("window.loadFromCloud failed:", e);
  }
  return null;
}

/* ===============================
   App
================================ */
export default function App() {
  const [sheets, setSheets] = React.useState({});
  const [sheetName, setSheetName] = React.useState(DEFAULT_SHEET);

  // Default to FILM, remember last chosen tab
  const [tab, setTab] = React.useState(() => {
    try { return localStorage.getItem(LS.tab) || DEFAULT_TAB; }
    catch { return DEFAULT_TAB; }
  });

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);

  /* Restore locally saved lists + current sheet on mount */
  React.useEffect(() => {
    try {
      const savedSheets = localStorage.getItem(LS.sheets);
      if (savedSheets) setSheets(JSON.parse(savedSheets));
    } catch {}
    try {
      const savedName = localStorage.getItem(LS.sheetName);
      if (savedName) setSheetName(savedName);
    } catch {}
    setLoading(false);
  }, []);

  /* Persist to localStorage */
  React.useEffect(() => {
    try { localStorage.setItem(LS.sheets, JSON.stringify(sheets)); } catch {}
  }, [sheets]);

  React.useEffect(() => {
    if (sheetName) {
      try { localStorage.setItem(LS.sheetName, sheetName); } catch {}
    }
  }, [sheetName]);

  React.useEffect(() => {
    try { localStorage.setItem(LS.tab, tab); } catch {}
  }, [tab]);

  /* Always load default cloud sheet on first visit (uses ?code=… if present) */
  const getUrlCode = React.useCallback(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("code") || "").toUpperCase();
    } catch { return ""; }
  }, []);

  React.useEffect(() => {
    (async () => {
      const fromUrl = getUrlCode();
      const fromEnv = (import.meta.env?.VITE_DEFAULT_LOAD_CODE || "").toUpperCase();
      const code = fromUrl || fromEnv || FALLBACK_CODE;

      // Ensure no stale local list flashes in before cloud
      try {
        localStorage.removeItem(LS.sheets);
        localStorage.removeItem(LS.sheetName);
      } catch {}

      const cloud = await tryGlobalCloudLoad(code);
      if (cloud) {
        const list = (cloud.items || []).map(normalizeFilm);
        const name = cloud.name || DEFAULT_SHEET;
        setSheets({ [name]: list });
        setSheetName(name);
        setLoadError(null);
        return;
      }

      // If no cloud loader available, start empty (user can add via Discover)
      setSheets({ [DEFAULT_SHEET]: [] });
      setSheetName(DEFAULT_SHEET);
      setLoadError(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentList = React.useMemo(() => sheets?.[sheetName] || [], [sheets, sheetName]);

  /* Add item to current sheet (de-dupe + persist immediately) */
  const addToCurrentList = React.useCallback((item) => {
    setSheets((prev) => {
      const name = sheetName || DEFAULT_SHEET;
      const current = prev?.[name] ?? [];
      const film = normalizeFilm(item);

      const exists = current.some(
        (f) =>
          (f.id && film.id && f.id === film.id) ||
          (norm(f.title) === norm(film.title) && f.year === film.year)
      );
      if (exists) return prev;

      const next = { ...(prev || {}), [name]: [...current, film] };
      try { localStorage.setItem(LS.sheets, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [sheetName]);

  const removeFromCurrentList = React.useCallback((id) => {
    setSheets((prev) => {
      const name = sheetName || DEFAULT_SHEET;
      const current = prev?.[name] ?? [];
      const nextList = current.filter((f) => (f.id ?? `${norm(f.title)}-${f.year ?? ""}`) !== id);
      const next = { ...(prev || {}), [name]: nextList };
      try { localStorage.setItem(LS.sheets, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [sheetName]);

  /* ===============================
     UI
  ================================= */
  return (
    <div className="app">
      <header className="app-header">
        <div className="wrap">
          <h1>🎄 Christmas Watchlist</h1>
          <span className="subtle">Film first • saved locally</span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs wrap">
        {["FILM", "TV"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={["tab", tab === t ? "active" : ""].join(" ").trim()}
          >
            {t}
          </button>
        ))}
      </nav>

      {loading ? (
        <Splash />
      ) : (
        <>
          {loadError ? <ErrorBanner error={loadError} /> : null}

          {tab === "FILM" ? (
            <FilmList items={currentList} onRemove={removeFromCurrentList} />
          ) : (
            <TVList items={currentList.filter((x) => x.type === "tv")} />
          )}

          <DiscoverMore onAdd={addToCurrentList} />
        </>
      )}

      <footer className="app-footer">
        <div className="wrap subtle">
          Your selections are saved to this device and reloaded on next visit.
        </div>
      </footer>
    </div>
  );
}

/* ===============================
   Sub-components
================================ */
function FilmList({ items, onRemove }) {
  const films = items.filter((x) => (x.type || "film") === "film");
  return (
    <section className="wrap section">
      <h2>Your Films ({films.length})</h2>
      {films.length === 0 ? (
        <p className="subtle">No films yet — try “Discover More” below.</p>
      ) : (
        <div className="grid">
          {films.map((f) => {
            const id = f.id ?? `${norm(f.title)}-${f.year ?? ""}`;
            return (
              <article key={id} className="card">
                <div className="card-row">
                  <div>
                    <div className="title">{f.title}</div>
                    <div className="meta">
                      {f.year ?? "—"} {f.platform ? `• ${f.platform}` : ""}{" "}
                      {f.runtime ? `• ${f.runtime}m` : ""}
                    </div>
                  </div>
                  <button type="button" className="btn" onClick={() => onRemove(id)}>
                    Remove
                  </button>
                </div>
                {Array.isArray(f.tags) && f.tags.length > 0 ? (
                  <div className="tags">
                    {f.tags.slice(0, 6).map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TVList({ items }) {
  const shows = items.filter((x) => x.type === "tv");
  return (
    <section className="wrap section">
      <h2>Your TV ({shows.length})</h2>
      {shows.length === 0 ? <p className="subtle">Nothing here yet.</p> : null}
    </section>
  );
}

function DiscoverMore({ onAdd }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const doSearch = React.useCallback(async () => {
    setBusy(true);
    const q = query.trim();

    // Try OMDb (if key present). If no results or no key, allow adding a simple manual item.
    const found = (await searchOmdb(q)) || [];
    setResults(
      found.length
        ? found
        : q
        ? [normalizeFilm({ title: q, year: null })]
        : []
    );
    setBusy(false);
  }, [query]);

  return (
    <section className="wrap section">
      <h2>Discover More</h2>
      <div className="row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title (uses OMDb if configured)"
          className="input"
        />
        <button
          type="button"
          onClick={doSearch}
          disabled={busy || !query.trim()}
          className="btn"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <div className="grid">
        {results.map((r) => {
          const id = r.id ?? `${norm(r.title)}-${r.year ?? ""}`;
          return (
            <article key={id} className="card">
              <div className="card-row">
                <div>
                  <div className="title">{r.title}</div>
                  <div className="meta">{r.year ?? "—"}</div>
                </div>
                <button
                  type="button"          // important: no form submit
                  onClick={() => onAdd(r)} // ADD to current list
                  className="btn primary"
                >
                  + Add
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Splash() {
  return (
    <div className="wrap section center">
      <div className="spinner" />
      <p className="subtle">Loading…</p>
    </div>
  );
}

function ErrorBanner({ error }) {
  return (
    <div className="wrap section notice">
      <div className="notice-title">Couldn’t load default list</div>
      <div className="notice-msg">{String(error?.message ?? "Unknown error")}</div>
    </div>
  );
}
