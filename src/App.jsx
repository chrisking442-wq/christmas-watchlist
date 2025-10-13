import React from "react";

/** =============================
 *  Config & LocalStorage Keys
 *  ============================= */
const LS = {
  sheets: "cw_sheets",
  sheetName: "cw_sheetName",
  tab: "cw_tab",
};
const DEFAULT_SHEET = "Default";
const DEFAULT_TAB = "FILM"; // <-- open on Film first
const FALLBACK_CODE = "PMR9EE"; // your chosen default sheet code

/** =============================
 *  Helpers
 *  ============================= */
const norm = (s) => (s || "").trim().toLowerCase();
const numOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normalizeFilm = (x) => ({
  id: x.id ?? `${norm(x.title)}-${x.year ?? ""}`,
  title: x.title ?? x.name ?? "Untitled",
  year: numOrNull(x.year),
  platform: x.platform ?? x.service ?? null,
  runtime: numOrNull(x.runtime),
  tags: Array.isArray(x.tags) ? x.tags : [],
  type: "film",
});

/** Try your app’s global loader first, fallback to /data/<code>.json */
async function loadFromCloud(code) {
  if (!code) return { name: DEFAULT_SHEET, items: [] };
  if (typeof window !== "undefined" && typeof window.loadFromCloud === "function") {
    const res = await window.loadFromCloud(code);
    // Expecting { name, items } or { [sheetName]: [] }
    if (res?.items && res?.name) return res;
    if (res && typeof res === "object") {
      const name = Object.keys(res)[0] || DEFAULT_SHEET;
      return { name, items: Array.isArray(res[name]) ? res[name] : [] };
    }
    return { name: DEFAULT_SHEET, items: [] };
  }
  // Fallback: /data/<code>.json format: { name, items: [...] } OR { "<sheet>": [...] }
  try {
    const r = await fetch(`/data/${code}.json`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch /data/${code}.json`);
    const json = await r.json();
    if (json?.items && json?.name) return json;
    const name = Object.keys(json)[0] || DEFAULT_SHEET;
    return { name, items: Array.isArray(json[name]) ? json[name] : [] };
  } catch (e) {
    console.warn("Cloud load fallback failed:", e);
    return { name: DEFAULT_SHEET, items: [] };
  }
}

/** OMDb search (optional). Set VITE_OMDB_KEY in .env(.local) */
async function searchOmdb(query) {
  const key = import.meta?.env?.VITE_OMDB_KEY;
  if (!key || !query) return [];
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${key}&type=movie&s=${encodeURIComponent(query)}`);
    const j = await r.json();
    if (!j || j.Response === "False" || !Array.isArray(j.Search)) return [];
    return j.Search.map((m) =>
      normalizeFilm({
        title: m.Title,
        year: m.Year && Number(m.Year),
        platform: null,
        runtime: null,
        tags: [],
      })
    );
  } catch {
    return [];
  }
}

/** =============================
 *  App
 *  ============================= */
export default function App() {
  const [sheets, setSheets] = React.useState({});
  const [sheetName, setSheetName] = React.useState(DEFAULT_SHEET);
  const [tab, setTab] = React.useState(() => localStorage.getItem(LS.tab) || DEFAULT_TAB);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);

  // Restore from localStorage
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

  // Persist sheets & selections
  React.useEffect(() => {
    try {
      localStorage.setItem(LS.sheets, JSON.stringify(sheets));
    } catch {}
  }, [sheets]);
  React.useEffect(() => {
    if (sheetName) {
      try {
        localStorage.setItem(LS.sheetName, sheetName);
      } catch {}
    }
  }, [sheetName]);
  React.useEffect(() => {
    try {
      localStorage.setItem(LS.tab, tab);
    } catch {}
  }, [tab]);

  // Get ?code or env or fallback
  const getUrlCode = React.useCallback(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = (sp.get("code") || "").toUpperCase();
      return c || "";
    } catch {
      return "";
    }
  }, []);

  // Force-load a default sheet on mount (URL ?code=… overrides).
  React.useEffect(() => {
    (async () => {
      // If you only want this on production domain, uncomment:
      // if (!location.hostname.endsWith(".vercel.app")) return;

      const fromUrl = getUrlCode();
      const fromEnv = (import.meta.env?.VITE_DEFAULT_LOAD_CODE || "").toUpperCase();
      const code = fromUrl || fromEnv || FALLBACK_CODE;

      // Avoid flashing stale local data
      try {
        localStorage.removeItem(LS.sheets);
        localStorage.removeItem(LS.sheetName);
      } catch {}

      try {
        const res = await loadFromCloud(code);
        const list = (res?.items || []).map(normalizeFilm);
        const name = res?.name || DEFAULT_SHEET;
        setSheets({ [name]: list });
        setSheetName(name);
        setLoadError(null);
      } catch (e) {
        console.error(e);
        setLoadError(e instanceof Error ? e : new Error("Failed to load default list"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // Current list (by active sheet)
  const currentList = React.useMemo(() => sheets?.[sheetName] || [], [sheets, sheetName]);

  // Add to current list (+persist immediately)
  const addToCurrentList = React.useCallback(
    (item) => {
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
        try {
          localStorage.setItem(LS.sheets, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [sheetName]
  );

  // Remove (just handy while testing)
  const removeFromCurrentList = React.useCallback(
    (id) => {
      setSheets((prev) => {
        const name = sheetName || DEFAULT_SHEET;
        const current = prev?.[name] ?? [];
        const nextList = current.filter((f) => (f.id ?? `${norm(f.title)}-${f.year ?? ""}`) !== id);
        const next = { ...(prev || {}), [name]: nextList };
        try {
          localStorage.setItem(LS.sheets, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [sheetName]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <NavTabs tab={tab} setTab={setTab} />

      {loading ? (
        <Splash />
      ) : (
        <>
          {loadError ? <ErrorBanner error={loadError} /> : null}

          {tab === "FILM" ? (
            <FilmList
              items={currentList}
              onRemove={removeFromCurrentList}
            />
          ) : (
            <TVList items={currentList.filter((x) => x.type === "tv")} />
          )}

          <DiscoverMore onAdd={addToCurrentList} />
        </>
      )}

      <Footer />
    </div>
  );
}

/** =============================
 *  UI Components
 *  ============================= */

function Header() {
  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-slate-950/80 border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          🎄 Christmas Watchlist
        </h1>
        <span className="text-xs opacity-70">Film first • saved locally</span>
      </div>
    </header>
  );
}

function NavTabs({ tab, setTab }) {
  const tabs = ["FILM", "TV"];
  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 flex gap-2">
      {tabs.map((t) => {
        const active = tab === t;
        return (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "rounded-full px-3 py-1 text-sm border",
              active ? "bg-emerald-600/20 border-emerald-500" : "bg-slate-900 border-slate-700",
            ].join(" ")}
            type="button"
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function FilmList({ items, onRemove }) {
  const films = items.filter((x) => (x.type || "film") === "film");
  return (
    <section className="max-w-5xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold mb-3">Your Films ({films.length})</h2>
      {films.length === 0 ? (
        <p className="opacity-70">No films yet — try “Discover More” below.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {films.map((f) => {
            const id = f.id ?? `${norm(f.title)}-${f.year ?? ""}`;
            return (
              <article key={id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium leading-tight">{f.title}</h3>
                    <p className="text-xs opacity-70">
                      {f.year ?? "—"} {f.platform ? `• ${f.platform}` : ""}{" "}
                      {f.runtime ? `• ${f.runtime}m` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    className="text-xs border border-slate-700 rounded px-2 py-1 bg-slate-800"
                  >
                    Remove
                  </button>
                </div>
                {Array.isArray(f.tags) && f.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.tags.slice(0, 6).map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/60 opacity-80">
                        {t}
                      </span>
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
    <section className="max-w-5xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold mb-3">Your TV ({shows.length})</h2>
      {shows.length === 0 ? <p className="opacity-70">Nothing here yet.</p> : null}
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
    // Try OMDb if configured; otherwise return a single manual item of your query
    const found = (await searchOmdb(q)) || [];
    setResults(
      found.length
        ? found
        : q
        ? [normalizeFilm({ title: q, year: null, platform: null, runtime: null, tags: [] })]
        : []
    );
    setBusy(false);
  }, [query]);

  return (
    <section className="max-w-5xl mx-auto px-4 pb-16">
      <div className="border-t border-slate-800 pt-6 mt-2">
        <h2 className="text-lg font-semibold mb-3">Discover More</h2>
        <div className="flex gap-2 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title (uses OMDb if configured)"
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={doSearch}
            disabled={busy || !query.trim()}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm border border-slate-700"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {results.map((r) => {
            const id = r.id ?? `${norm(r.title)}-${r.year ?? ""}`;
            return (
              <article key={id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium leading-tight">{r.title}</h3>
                    <p className="text-xs opacity-70">{r.year ?? "—"}</p>
                  </div>
                  <button
                    type="button" // IMPORTANT: prevents form submit navigation
                    onClick={() => onAdd(r)}
                    className="text-xs border border-emerald-500 rounded px-2 py-1 bg-emerald-600/20"
                    title="Add to current list"
                  >
                    + Add
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Splash() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16 text-center">
      <div className="mx-auto w-16 h-16 rounded-full border-4 border-slate-700 border-t-slate-100 animate-spin" />
      <p className="mt-4 opacity-80">Loading…</p>
      <p className="text-xs opacity-60 mt-1">
        If this takes too long, the app will continue without remote data.
      </p>
    </div>
  );
}

function ErrorBanner({ error }) {
  return (
    <div className="max-w-5xl mx-auto px-4 pb-3">
      <div className="rounded-xl border border-amber-600/50 bg-amber-900/20 px-4 py-3 text-amber-200">
        <div className="text-sm font-medium">Couldn’t load default list</div>
        <div className="text-xs opacity-90 mt-1">{String(error?.message ?? "Unknown error")}</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-6 text-xs opacity-60">
        Your selections are saved to this device and reloaded on next visit.
      </div>
    </footer>
  );
}
