import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

/* ================== ENV / CLIENTS ================== */
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (SUPA_URL && SUPA_KEY) ? createClient(SUPA_URL, SUPA_KEY) : null;

/* ================== UTILS ================== */
const match = (a, b) =>
  (a ?? "").toString().toLowerCase().includes((b ?? "").toString().toLowerCase());

const imdbSearchFor = (title = "", year = "") => {
  const q = [String(title).trim(), String(year || "").trim()].filter(Boolean).join(" ");
  return `https://www.imdb.com/find/?q=${encodeURIComponent(q)}`;
};

function saveAsXlsx(filename, sheetsObj) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheetsObj).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows || []);
    XLSX.utils.book_append_sheet(wb, ws, (name || "Sheet").slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

/* localStorage helpers */
const CACHE_POSTER = "cw_poster_cache_all";
const CACHE_IMDB = "cw_imdb_cache_all";
const loadJson = (k, def = {}) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); } catch { return def; } };
const saveJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/* ================== TMDB HELPERS ================== */
async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  return r.json();
}
async function tmdbFindMovie(title, year) {
  if (!TMDB_KEY || !title) return null;
  const j = await tmdb("/search/movie", { query: title, year: year || "", include_adult: "false", language: "en-GB" });
  return j?.results?.[0] || null;
}
async function tmdbFindTV(title, year) {
  if (!TMDB_KEY || !title) return null;
  const j = await tmdb("/search/tv", { query: title, language: "en-GB" });
  return j?.results?.[0] || null;
}
async function tmdbImdbUrlFor(kind, id) {
  if (!TMDB_KEY || !id) return "";
  const j = await tmdb(`/${kind}/${id}/external_ids`);
  const imdb = j?.imdb_id;
  return imdb ? `https://www.imdb.com/title/${imdb}/` : "";
}
async function tmdbCredits(kind, id) { return tmdb(`/${kind}/${id}/credits`); }
async function tmdbDetails(kind, id) { return tmdb(`/${kind}/${id}`, { language: "en-GB" }); }

async function movieCertGBorUS(id) {
  const j = await tmdb(`/movie/${id}/release_dates`);
  const pick = (cc) => j?.results?.find(r => r.iso_3166_1 === cc)?.release_dates?.find(x => x.certification)?.certification || "";
  return pick("GB") || pick("US") || "";
}
async function tvRatingGBorUS(id) {
  const j = await tmdb(`/tv/${id}/content_ratings`);
  const pick = (cc) => j?.results?.find(r => r.iso_3166_1 === cc)?.rating || "";
  return pick("GB") || pick("US") || "";
}

/* Providers → Where to Watch (UK) */
const PROVIDER_MAP = {
  "Netflix": "Netflix", "Netflix Kids": "Netflix", "Netflix basic with Ads": "Netflix",
  "Disney Plus": "Disney+",
  "Amazon Prime Video": "Prime Video",
  "Apple TV Plus": "Apple TV+",
  "Paramount Plus": "Paramount+",
  "NOW": "NOW", "Now TV": "NOW",
  "Sky Go": "Sky (Sky Go)",
  "BBC iPlayer": "BBC iPlayer",
  "ITVX": "ITVX",
  "All 4": "Channel 4", "Channel 4": "Channel 4",
  "My5": "My5", "UKTV Play": "UKTV Play",
  "Virgin TV Go": "Virgin TV Go", "Hayu": "Hayu",
  "YouTube": "YouTube", "Google Play Movies": "Google Play",
  "Amazon Video": "Amazon Video", "Apple TV": "Apple (Store)", "Sky Store": "Sky Store",
};
function mapProvidersGB(json) {
  const gb = (json?.results?.GB) || {};
  const buckets = ["flatrate", "ads", "free"]; // exclude rent/buy; add if you want
  const bag = new Set();
  for (const b of buckets) for (const p of (gb[b] || [])) bag.add(PROVIDER_MAP[p.provider_name] || p.provider_name);
  const order = [
    "Netflix","Disney+","Prime Video","Apple TV+","Paramount+",
    "NOW","Sky (Sky Go)","BBC iPlayer","ITVX","Channel 4","My5","UKTV Play",
    "Virgin TV Go","Hayu","YouTube","Google Play","Amazon Video","Apple (Store)","Sky Store"
  ];
  const listed = order.filter(x => bag.has(x));
  const rest = [...bag].filter(x => !listed.includes(x)).sort();
  return [...listed, ...rest].join(", ");
}
async function movieProvidersGB(id) { return mapProvidersGB(await tmdb(`/movie/${id}/watch/providers`)); }
async function tvProvidersGB(id) { return mapProvidersGB(await tmdb(`/tv/${id}/watch/providers`)); }

async function resolveImdbUrl(title, year, preferTV) {
  const key = `${title || ""}__${year || ""}__${preferTV ? "tv" : "movie"}`;
  const cache = loadJson(CACHE_IMDB);
  if (cache[key]) return cache[key];
  let imdbUrl = "";
  try {
    if (!preferTV) {
      const m = await tmdbFindMovie(title, year);
      imdbUrl = m ? await tmdbImdbUrlFor("movie", m.id) : "";
      if (!imdbUrl) { const t = await tmdbFindTV(title, year); imdbUrl = t ? await tmdbImdbUrlFor("tv", t.id) : ""; }
    } else {
      const t = await tmdbFindTV(title, year);
      imdbUrl = t ? await tmdbImdbUrlFor("tv", t.id) : "";
      if (!imdbUrl) { const m = await tmdbFindMovie(title, year); imdbUrl = m ? await tmdbImdbUrlFor("movie", m.id) : ""; }
    }
  } catch { imdbUrl = ""; }
  cache[key] = imdbUrl || imdbSearchFor(title, year);
  saveJson(CACHE_IMDB, cache);
  return cache[key];
}

/* Build row from TMDB details */
async function buildRowFromTmdbMovie(movie) {
  const [det, credits, imdb, cert, providers] = await Promise.all([
    tmdbDetails("movie", movie.id),
    tmdbCredits("movie", movie.id),
    tmdbImdbUrlFor("movie", movie.id),
    movieCertGBorUS(movie.id),
    movieProvidersGB(movie.id),
  ]);
  const directors = (credits?.crew || []).filter(c => c.job === "Director").map(c => c.name);
  const cast = (credits?.cast || []).slice(0, 4).map(c => c.name);
  return {
    Title: det?.title || movie.title || "",
    Year: (det?.release_date || movie.release_date || "").slice(0,4),
    "Where to Watch (UK)": providers,
    "Age Rating": cert,
    "Runtime (min)": det?.runtime || "",
    "Top Cast": cast.join(", "),
    Synopsis: det?.overview || "",
    Director: directors.join(", "),
    Tone: "",
    "Family Friendliness": "",
    "Poster URL": det?.poster_path ? `${TMDB_IMG}/w342${det.poster_path}` : "",
    "IMDb Link": imdb || imdbSearchFor(movie.title || "", (movie.release_date || "").slice(0,4))
  };
}
async function buildRowFromTmdbTV(tv) {
  const [det, credits, imdb, rating, providers] = await Promise.all([
    tmdbDetails("tv", tv.id),
    tmdbCredits("tv", tv.id),
    tmdbImdbUrlFor("tv", tv.id),
    tvRatingGBorUS(tv.id),
    tvProvidersGB(tv.id),
  ]);
  const directors = (credits?.crew || []).filter(c => (c.job === "Director" || c.job === "Series Director")).map(c => c.name);
  const cast = (credits?.cast || []).slice(0, 4).map(c => c.name);
  return {
    Title: det?.name || tv.name || "",
    Year: (det?.first_air_date || tv.first_air_date || "").slice(0,4),
    "Where to Watch (UK)": providers,
    "Age Rating": rating,
    "Runtime (min)": (det?.episode_run_time || [])[0] || "",
    "Top Cast": cast.join(", "),
    Synopsis: det?.overview || "",
    Director: directors.join(", "),
    Tone: "",
    "Family Friendliness": "",
    "Poster URL": det?.poster_path ? `${TMDB_IMG}/w342${det.poster_path}` : "",
    "IMDb Link": imdb || imdbSearchFor(tv.name || "", (tv.first_air_date || "").slice(0,4))
  };
}

/* ================== POSTER ================== */
function Poster({ title, year, preferTV, explicitUrl, size = "w342" }) {
  const cacheKey = `${title || ""}__${year || ""}__${preferTV ? "tv" : "movie"}`;
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (explicitUrl) { setUrl(explicitUrl); return; }
    const cache = loadJson(CACHE_POSTER);
    setUrl(cache[cacheKey] || "");
  }, [title, year, preferTV, explicitUrl, cacheKey]);

  useEffect(() => {
    let cancel = false;
    if (url || explicitUrl || !TMDB_KEY || !title) return;
    (async () => {
      const m = await tmdbFindMovie(title, year);
      let path = m?.poster_path || "";
      if (!path && preferTV) { const t = await tmdbFindTV(title, year); path = t?.poster_path || ""; }
      if (!path && !preferTV) { const t = await tmdbFindTV(title, year); path = t?.poster_path || ""; }
      if (cancel) return;
      const full = path ? `${TMDB_IMG}/${size}${path}` : "";
      setUrl(full);
      const cache = loadJson(CACHE_POSTER);
      cache[cacheKey] = full;
      saveJson(CACHE_POSTER, cache);
    })();
    return () => { cancel = true; };
  }, [title, year, preferTV, size, url, explicitUrl, cacheKey]);

  const placeholder =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='228' height='342'>
         <rect width='100%' height='100%' fill='#f1f1f1'/>
         <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-family='Arial' font-size='14'>
           No Poster
         </text>
       </svg>`
    );

  return (
    <img
      src={url || placeholder}
      alt={title}
      loading="lazy"
      style={{ width: 152, height: 228, objectFit: "cover", borderRadius: 8, background: "#f4f4f4" }}
    />
  );
}

/* ================== CARDS & TABLE CELLS ================== */
function CardItem({ row, isTVSheet, onDelete }) {
  const title = row["Title"];
  const year = row["Year"];
  const platformTxt = row["Where to Watch (UK)"] || "";
  const tone = row["Tone"] || "";
  const fam  = row["Family Friendliness"] || "";
  const cast = row["Top Cast"] || "";
  const synopsis = row["Synopsis"] || "";
  const posterOverride = row["Poster URL"] || "";

  const [imdbDirect, setImdbDirect] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const url = await resolveImdbUrl(title, year, isTVSheet);
      if (!cancel) setImdbDirect(url);
    })();
    return () => { cancel = true; };
  }, [title, year, isTVSheet]);

  const stableKey = `${title || "?"}__${year || ""}__${isTVSheet ? "tv" : "movie"}`;

  return (
    <div style={{
      display:"grid", gridTemplateColumns:"152px 1fr", gap:12, alignItems:"start",
      border:"1px solid #eee", borderRadius:10, padding:10
    }} key={stableKey}>
      <div>
        <Poster title={title} year={year} preferTV={isTVSheet} explicitUrl={posterOverride} />
      </div>

      <div>
        <div style={{fontWeight:600, lineHeight:1.25, marginBottom:4}}>
          {title} {year ? <span style={{opacity:.7}}>({year})</span> : null}
        </div>
        {platformTxt ? <div style={{display:"inline-block", padding:"2px 8px", borderRadius:14, background:"#f3f4f6", fontSize:12, marginBottom:6}}>{platformTxt}</div> : null}
        <div style={{fontSize:12, color:"#666", marginBottom:6}}>
          {tone && <span>{tone}</span>}
          {fam && <span> • {fam}</span>}
        </div>
        {cast && <div style={{fontSize:13, marginBottom:6}}><b>Cast:</b> {cast}</div>}
        {synopsis && <div style={{fontSize:13, color:"#333"}}>{synopsis}</div>}

        <div style={{marginTop:8, display:"flex", gap:8, flexWrap:"wrap"}}>
          <a href={imdbDirect || imdbSearchFor(title, year)} target="_blank" rel="noreferrer"
             style={{border:"1px solid #ddd", padding:"6px 10px", borderRadius:8, textDecoration:"none"}}>IMDb</a>
          <button onClick={() => onDelete(title, year)} title="Remove this title"
                  style={{border:"1px solid #f3c1c1", background:"#ffe9e9", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>🗑️ Remove</button>
        </div>
      </div>
    </div>
  );
}

function ImdbLinkCell({ title, year, isTVSheet, fallbackUrl }) {
  const [direct, setDirect] = useState("");
  useEffect(() => {
    let cancel = false;
    (async () => {
      const url = await resolveImdbUrl(title, year, isTVSheet);
      if (!cancel) setDirect(url);
    })();
    return () => { cancel = true; };
  }, [title, year, isTVSheet]);

  const href = direct || fallbackUrl || imdbSearchFor(title, year);
  return <a href={href} target="_blank" rel="noreferrer">Open</a>;
}

/* ================== MAIN APP ================== */
export default function App() {
  const [sheets, setSheets] = useState({});
  const [sheetName, setSheetName] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [view, setView] = useState("cards");

  const [showDiscover, setShowDiscover] = useState(false);
  const [discover, setDiscover] = useState([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [discoverQuery, setDiscoverQuery] = useState("");

  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState(null);

  /* === Local autosave / restore === */
  useEffect(() => {
    const savedSheets = localStorage.getItem("cw_sheets");
    const savedSheetName = localStorage.getItem("cw_sheetName");
    if (savedSheets) setSheets(JSON.parse(savedSheets));
    if (savedSheetName) setSheetName(savedSheetName);
  }, []);
  useEffect(() => { localStorage.setItem("cw_sheets", JSON.stringify(sheets)); }, [sheets]);
  useEffect(() => { if (sheetName) localStorage.setItem("cw_sheetName", sheetName); }, [sheetName]);

  /* === Cloud (Supabase) code === */
  const [cloudCode, setCloudCode] = useState(localStorage.getItem("cw_code") || "");
  useEffect(() => { if (cloudCode) localStorage.setItem("cw_code", cloudCode); }, [cloudCode]);
  function randomCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

  async function saveToCloud() {
    if (!supabase) { alert("Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"); return; }
    const code = cloudCode || randomCode();
    const payload = { code, data: sheets };
    const { error } = await supabase.from("watchlists").upsert(payload, { onConflict: "code" });
    if (error) { alert("Save failed: " + error.message); return; }
    setCloudCode(code);
    setToast({ text: `Saved to cloud! Code: ${code}`, type: "ok" });
    setTimeout(() => setToast(null), 3500);
  }
  async function loadFromCloud() {
    if (!supabase) { alert("Supabase not configured."); return; }
    if (!cloudCode) { alert("Enter a code first."); return; }
    const { data, error } = await supabase.from("watchlists").select("*").eq("code", cloudCode).single();
    if (error || !data) { alert("Not found for code: " + cloudCode); return; }
    setSheets(data.data || {});
    const first = Object.keys(data.data || {})[0] || "";
    if (first) setSheetName(first);
    setToast({ text: "Loaded from cloud.", type: "ok" });
    setTimeout(() => setToast(null), 2500);
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const next = {};
      wb.SheetNames.forEach((name) => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        next[name] = rows;
      });
      setSheets(next);
      const firstNonEmpty = wb.SheetNames.find(n => (next[n] || []).length > 0) || wb.SheetNames[0];
      setSheetName(firstNonEmpty ?? "");
    } catch (err) {
      console.error("Failed to read Excel:", err);
      alert("Couldn't read that Excel file. Is it .xlsx and not password-protected?");
    }
  };

  const sheetNames = Object.keys(sheets);
  const rawRows = sheets[sheetName] ?? [];

  const HIDE_COLS = new Set([
    "IMDb (score/10)", "Rotten Tomatoes (Tomatometer)", "Must-Watch (Dec Day)"
  ]);

  const baseHeaders = rawRows.length ? Object.keys(rawRows[0]).filter(h => !HIDE_COLS.has(h)) : [];
  const headers = useMemo(() => {
    const wants = new Set(baseHeaders);
    if (!wants.has("IMDb Link")) wants.add("IMDb Link");
    if (!wants.has("Poster URL")) wants.add("Poster URL");
    if (!wants.has("Actions")) wants.add("Actions");
    return [...wants];
  }, [rawRows]);

  const rowsWithLinks = useMemo(() => {
    return rawRows.map(r => {
      const title = r["Title"];
      const year = r["Year"];
      return { ...r, "IMDb Link": r["IMDb Link"] || imdbSearchFor(title, year) };
    });
  }, [rawRows]);

  const filtered = useMemo(() => {
    let r = rowsWithLinks.map(({ ...row }) => { HIDE_COLS.forEach(c => delete row[c]); return row; });
    if (search) r = r.filter((row) => Object.values(row).some((v) => match(v, search)));
    if (platform) {
      const col = "Where to Watch (UK)";
      if (col in (r[0] || {})) r = r.filter((row) => match(row[col], platform));
      else r = r.filter((row) => Object.values(row).some((v) => match(v, platform)));
    }
    if (sortBy) {
      r.sort((a, b) => {
        const av = a[sortBy]; const bv = b[sortBy];
        const na = Number(av); const nb = Number(bv);
        const bothNum = !isNaN(na) && !isNaN(nb);
        if (bothNum) return sortDir === "asc" ? na - nb : nb - na;
        return sortDir === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""));
      });
    }
    return r;
  }, [rowsWithLinks, search, platform, sortBy, sortDir]);

  const onSort = (col) => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("asc"); } };
  const isTVSheet = /tv|special/i.test(sheetName);

  /* ========== Discover modal ========== */
  const fetchDiscoverDefault = async () => {
    if (!TMDB_KEY) return;
    setIsLoadingDiscover(true);
    const items = [];
    for (const q of ["christmas","holiday"]) {
      const j = await tmdb("/search/movie", { query: q, include_adult: "false", language: "en-GB" });
      (j?.results || []).forEach(x => items.push({
        kind: "movie", id: x.id, title: x.title, year: (x.release_date || "").slice(0,4),
        poster: x.poster_path ? `${TMDB_IMG}/w342${x.poster_path}` : ""
      }));
    }
    const seen = new Set();
    const unique = items.filter(it => { const k = `${it.title}__${it.year}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0,150);
    setDiscover(unique); setIsLoadingDiscover(false);
  };
  const openDiscover = async () => { setShowDiscover(true); if (!TMDB_KEY) return; if (!discover.length) await fetchDiscoverDefault(); };
  const searchDiscover = async (q) => {
    if (!TMDB_KEY) return;
    const query = (q || "").trim();
    if (!query) return fetchDiscoverDefault();
    setIsLoadingDiscover(true);
    const j = await tmdb("/search/movie", { query, include_adult: "false", language: "en-GB" });
    const items = (j?.results || []).map(x => ({
      kind: "movie", id: x.id, title: x.title, year: (x.release_date || "").slice(0,4),
      poster: x.poster_path ? `${TMDB_IMG}/w342${x.poster_path}` : ""
    })).slice(0,150);
    setDiscover(items); setIsLoadingDiscover(false);
  };

  const addRowToCurrentSheet = async (title, year, kindHint="movie") => {
    if (!sheetName) return;
    let row = null;
    try {
      if (kindHint === "tv") {
        const tv = await tmdbFindTV(title, year); if (tv) row = await buildRowFromTmdbTV(tv);
      } else {
        const mv = await tmdbFindMovie(title, year); if (mv) row = await buildRowFromTmdbMovie(mv);
      }
    } catch {}
    if (!row) row = { Title: title, Year: year || "", "Where to Watch (UK)": "", "Age Rating": "", "Runtime (min)": "", "Top Cast": "", Synopsis: "", Director: "", Tone: "", "Family Friendliness": "", "Poster URL": "", "IMDb Link": imdbSearchFor(title, year) };
    setSheets(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), row] }));
  };

  const removeRow = (title, year) => {
    setSheets(prev => {
      const current = prev[sheetName] || [];
      const nextRows = current.filter(r => {
        const t = (r.Title ?? "").toString().trim();
        const y = (r.Year ?? "").toString().trim();
        return !(t === (title ?? "").toString().trim() && y === (year ?? "").toString().trim());
      });
      return { ...prev, [sheetName]: nextRows };
    });
  };

  /* ========== Enrich with progress ========== */
  const enrichVisible = async () => {
    if (!sheetName || !filtered.length || !TMDB_KEY) return;
    setIsEnriching(true);
    setEnrichProgress({ done: 0, total: filtered.length });

    try {
      const targetKeys = new Set(filtered.map(r => `${r.Title}__${r.Year}`));
      const current = [...(sheets[sheetName] || [])];
      let done = 0;

      for (let i = 0; i < current.length; i++) {
        const row = current[i];
        const k = `${row.Title}__${row.Year}`;
        if (!targetKeys.has(k)) continue;

        const title = row["Title"];
        const year = row["Year"];

        let enriched = row;
        try {
          if (isTVSheet) {
            const tv = await tmdbFindTV(title, year);
            if (tv) enriched = { ...row, ...(await buildRowFromTmdbTV(tv)) };
            else {
              const mv = await tmdbFindMovie(title, year);
              if (mv) enriched = { ...row, ...(await buildRowFromTmdbMovie(mv)) };
            }
          } else {
            const mv = await tmdbFindMovie(title, year);
            if (mv) enriched = { ...row, ...(await buildRowFromTmdbMovie(mv)) };
            else {
              const tv = await tmdbFindTV(title, year);
              if (tv) enriched = { ...row, ...(await buildRowFromTmdbTV(tv)) };
            }
          }
        } catch { /* keep row if any error */ }

        current[i] = enriched;

        done += 1;
        setEnrichProgress(prev => ({ ...prev, done }));
        await new Promise(r => setTimeout(r, 0)); // allow UI to update
      }

      setSheets({ ...sheets, [sheetName]: current });
      setToast({ text: `Enriched ${done} item(s). Click “Export XLSX” to save.`, type: "ok" });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setIsEnriching(false);
    }
  };

  const barPct = Math.round((enrichProgress.done / Math.max(enrichProgress.total || 1, 1)) * 100);

  /* ================== UI ================== */
  return (
    <div style={{padding:16, maxWidth:1200, margin:"0 auto"}}>
      <h1>🎄 Christmas Watchlist</h1>

      {isEnriching && (
        <div style={{
          position:"sticky", top:0, zIndex:1000, background:"#fff",
          border:"1px solid #eee", borderRadius:8, padding:"8px 10px",
          display:"flex", alignItems:"center", gap:10, marginBottom:10
        }}>
          <div style={{flex:"1 1 auto", height:6, background:"#f1f5f9", borderRadius:4, overflow:"hidden"}}>
            <div style={{width:`${barPct}%`, height:"100%", background:"#2f80ed", transition:"width .2s ease"}}/>
          </div>
          <span style={{fontSize:12, color:"#555"}}>Enriching… {enrichProgress.done}/{enrichProgress.total}</span>
        </div>
      )}

      {!TMDB_KEY && (
        <p style={{background:"#fff7ed", border:"1px solid #fed7aa", padding:8, borderRadius:8}}>
          Add your TMDB key to <code>.env</code> as <code>VITE_TMDB_API_KEY=…</code> then restart <code>npm run dev</code>.
        </p>
      )}

      <p style={{color:"#555", marginTop:8}}>
        Upload Excel, filter/sort, toggle Cards/Table, hit <b>Enrich visible</b> (adds runtime, cast, synopsis, ratings &amp; <b>Where to Watch (UK)</b>), then <b>Export XLSX</b>.
      </p>

      <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12}}>
        <label style={{display:"inline-flex", alignItems:"center", gap:8, border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>
          <input type="file" accept=".xlsx,.xls" onChange={onUpload} />
          <span>Upload Excel</span>
        </label>

        {Object.keys(sheets).length > 0 && (
          <>
            <select value={sheetName} onChange={(e) => setSheetName(e.target.value)} title="Switch sheet"
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8}}>
              {Object.keys(sheets).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <input placeholder="Search title, cast, synopsis…" value={search} onChange={(e) => setSearch(e.target.value)}
                   style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, minWidth:220}} />

            <select value={platform} onChange={(e) => setPlatform(e.target.value)} title="Filter by platform"
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8}}>
              <option value="">Platform (all)</option>
              <option>Netflix</option><option>Disney+</option><option>Prime Video</option>
              <option>Apple TV+</option><option>Paramount+</option><option>NOW</option><option>Sky (Sky Go)</option>
              <option>BBC iPlayer</option><option>ITVX</option><option>Channel 4</option><option>My5</option>
            </select>

            <button onClick={() => { setSearch(""); setPlatform(""); setSortBy(""); setSortDir("asc"); }}
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>Reset</button>
            <button onClick={() => saveAsXlsx("Christmas_Watchlist_Enriched.xlsx", sheets)}
                    disabled={!Object.keys(sheets).length}
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>💾 Export XLSX</button>

            <div style={{flex:"1 1 auto"}} />

            {/* Cloud save/load */}
            <input
              placeholder="Share/Load code"
              value={cloudCode}
              onChange={(e)=>setCloudCode(e.target.value.toUpperCase())}
              style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8}}
            />
            <button onClick={saveToCloud}
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>
              ☁️ Save to Cloud
            </button>
            <button onClick={loadFromCloud}
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>
              ☁️ Load from Cloud
            </button>

            {/* Discover + Enrich */}
            <button onClick={() => openDiscover()} disabled={isLoadingDiscover || !TMDB_KEY}
                    title="Discover more"
                    style={{border:"1px solid #c7d2fe", background:"#eef2ff", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>
              {isLoadingDiscover ? "Discovering…" : "🔎 Discover more"}
            </button>
            <button onClick={enrichVisible} disabled={!filtered.length || isEnriching || !TMDB_KEY}
                    title="Fetch runtime, cast, synopsis, ratings & Where to Watch (UK)"
                    style={{border:"1px solid #d1fae5", background:"#ecfdf5", padding:"6px 10px", borderRadius:8, cursor:(!filtered.length||isEnriching||!TMDB_KEY)?"not-allowed":"pointer"}}>
              {isEnriching
                ? `Enriching… ${enrichProgress.done}/${enrichProgress.total}`
                : "✨ Enrich visible (incl. Where to Watch)"}
            </button>

            <div style={{display:"inline-flex", gap:8, marginLeft:8}}>
              <label style={{display:"inline-flex", gap:6}}>
                <input type="radio" name="view" value="cards" checked={view==="cards"} onChange={()=>setView("cards")} />
                Cards
              </label>
              <label style={{display:"inline-flex", gap:6}}>
                <input type="radio" name="view" value="table" checked={view==="table"} onChange={()=>setView("table")} />
                Table
              </label>
            </div>
          </>
        )}
      </div>

      {/* CARD VIEW */}
      {view === "cards" && !!filtered.length && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(480px, 1fr))", gap:12}} key={`cards_${sheetName}`}>
          {filtered.map((row) => (
            <CardItem
              key={(row.Title || "?") + "__" + (row.Year || "") + "__" + (isTVSheet ? "tv" : "movie")}
              row={row} isTVSheet={isTVSheet} onDelete={removeRow}
            />
          ))}
        </div>
      )}

      {/* TABLE VIEW */}
      {view === "table" && (
        <>
          {filtered.length ? (
            <div style={{overflow:"auto"}} key={`table_${sheetName}`}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} onClick={() => onSort(h)}
                          style={{textAlign:"left", padding:"8px 6px", borderBottom:"1px solid #e5e7eb", cursor:"pointer"}}>
                        <span>{h}</span>
                        {sortBy === h && <span style={{marginLeft:6, opacity:.6}}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                      {headers.map((h) => {
                        if (h === "Actions") {
                          return (
                            <td key={h} style={{padding:"8px 6px"}}>
                              <button onClick={() => removeRow(row["Title"], row["Year"])}
                                      style={{border:"1px solid #f3c1c1", background:"#ffe9e9", padding:"4px 8px", borderRadius:8, cursor:"pointer"}}>
                                Remove
                              </button>
                            </td>
                          );
                        }
                        const v = row[h]; const s = (v ?? "").toString();
                        if (h === "IMDb Link") {
                          return (
                            <td key={h} style={{padding:"8px 6px"}}>
                              <ImdbLinkCell title={row["Title"]} year={row["Year"]} isTVSheet={isTVSheet} fallbackUrl={s} />
                            </td>
                          );
                        }
                        const isLink = /^https?:\/\//i.test(s);
                        return <td key={h} style={{padding:"8px 6px"}}>{isLink ? <a href={s} target="_blank" rel="noreferrer">Open</a> : s}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{color:"#666"}}>Upload your Excel to begin.</div>
          )}
        </>
      )}

      {!filtered.length && <div style={{color:"#666"}}>Upload your Excel to begin.</div>}

      {/* --------- DISCOVER MODAL --------- */}
      {showDiscover && (
        <div onClick={() => setShowDiscover(false)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex",
          alignItems:"center", justifyContent:"center", padding:16, zIndex:1000
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width:"min(100%,980px)", maxHeight:"88vh", overflow:"auto", background:"#fff",
            borderRadius:12, boxShadow:"0 10px 30px rgba(0,0,0,0.2)"
          }}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderBottom:"1px solid #eee"}}>
              <b>Discover more Christmas films</b>
              <button onClick={() => setShowDiscover(false)} title="Close" style={{cursor:"pointer", border:"1px solid #e5e7eb", borderRadius:8, padding:"4px 8px"}}>✕</button>
            </div>

            <div style={{display:"flex", gap:8, alignItems:"center", padding:"10px 14px", borderBottom:"1px solid #eee"}}>
              <input placeholder="Search titles (e.g., hallmark, 'The Christmas', etc.)"
                     value={discoverQuery} onChange={(e)=>setDiscoverQuery(e.target.value)}
                     onKeyDown={(e)=>{ if (e.key === "Enter") searchDiscover(discoverQuery); }}
                     style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, flex:"1 1 auto"}} />
              <button onClick={()=>searchDiscover(discoverQuery)} style={{border:"1px solid #c7d2fe", background:"#eef2ff", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>Search</button>
              <button onClick={() => { setDiscover([]); setDiscoverQuery(""); fetchDiscoverDefault(); }} style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>Suggestions</button>
            </div>

            <div style={{padding:14}}>
              {!TMDB_KEY && <div style={{marginBottom:10, background:"#fff7ed", border:"1px solid #fed7aa", padding:8, borderRadius:8}}>Add your TMDB key to enable this feature.</div>}
              {isLoadingDiscover && <div>Loading…</div>}
              {!isLoadingDiscover && !discover.length && <div>No results. Try another search.</div>}

              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:12}}>
                {discover.map((d) => {
                  const k = `${d.title}__${d.year}`;
                  return (
                    <div key={k} style={{display:"grid", gridTemplateColumns:"100px 1fr", gap:10, border:"1px solid #eee", borderRadius:10, padding:10}}>
                      <img src={d.poster || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt={d.title}
                           style={{ width: 100, height: 150, objectFit: "cover", borderRadius: 8, background: "#f4f4f4" }} loading="lazy" />
                      <div>
                        <div style={{fontWeight:600, lineHeight:1.25, marginBottom:4}}>{d.title} {d.year ? <span style={{opacity:.7}}>({d.year})</span> : null}</div>
                        <div style={{fontSize:12, color:"#666", marginBottom:6}}>TMDB</div>
                        <button onClick={() => addRowToCurrentSheet(d.title, d.year, d.kind)}
                                style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>Add</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{padding:"10px 14px", borderTop:"1px solid #eee", display:"flex", justifyContent:"flex-end", gap:8}}>
              <button onClick={() => setShowDiscover(false)} style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div onClick={() => setToast(null)} style={{
          position:"fixed", right:14, bottom:14, zIndex:1000,
          background:"#0f766e", color:"#fff", padding:"10px 14px", borderRadius:8,
          boxShadow:"0 8px 24px rgba(0,0,0,0.2)", cursor:"pointer"
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
