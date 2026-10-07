import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import AuthPanel from "./AuthPanel";
import MyLibrary from "./MyLibrary";
import Catalogue from "./Catalogue";
import CatalogueAdmin from "./CatalogueAdmin";
import WatchedHistory from "./WatchedHistory";
import SharedList from "./SharedList";
import Planner from "./Planner";

/* ========= ENV / CLIENTS ========= */
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (SUPA_URL && SUPA_KEY) ? createClient(SUPA_URL, SUPA_KEY) : null;

/* ========= UTILS ========= */
const match = (a, b) => (a ?? "").toString().toLowerCase().includes((b ?? "").toString().toLowerCase());
const imdbSearchFor = (title = "", year = "") => {
  const q = [String(title).trim(), String(year || "").trim()].filter(Boolean).join(" ");
  return `https://www.imdb.com/find/?q=${encodeURIComponent(q)}`;
};
const saveAsXlsx = (filename, sheetsObj) => {
  const wb = XLSX.utils.book_new();
  Object.entries(sheetsObj).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows || []);
    XLSX.utils.book_append_sheet(wb, ws, (name || "Sheet").slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
};
const CACHE_POSTER = "cw_poster_cache_all_v4";
const CACHE_IMDB = "cw_imdb_cache_all_v4";
const loadJson = (k, def = {}) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); } catch { return def; } };
const saveJson = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/* ========= TMDB HELPERS ========= */
async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  return r.json();
}
const tmdbFindMovie = async (title, year) => {
  if (!TMDB_KEY || !title) return null;
  const j = await tmdb("/search/movie", { query: title, year: year || "", include_adult: "false", language: "en-GB" });
  return j?.results?.[0] || null;
};
const tmdbFindTV = async (title) => {
  if (!TMDB_KEY || !title) return null;
  const j = await tmdb("/search/tv", { query: title, language: "en-GB" });
  return j?.results?.[0] || null;
};
const tmdbImdbUrlFor = async (kind, id) => {
  if (!TMDB_KEY || !id) return "";
  const j = await tmdb(`/${kind}/${id}/external_ids`);
  const imdb = j?.imdb_id;
  return imdb ? `https://www.imdb.com/title/${imdb}/` : "";
};
const tmdbCredits = (kind, id) => tmdb(`/${kind}/${id}/credits`);
const tmdbDetails = (kind, id) => tmdb(`/${kind}/${id}`, { language: "en-GB" });

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
  const buckets = ["flatrate", "ads", "free"]; // omit rent/buy; add if you want
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

const movieProvidersGB = async (id) => mapProvidersGB(await tmdb(`/movie/${id}/watch/providers`));
const tvProvidersGB   = async (id) => mapProvidersGB(await tmdb(`/tv/${id}/watch/providers`));

/* Clickable provider links (web URLs; most devices will hand off to the app if installed) */
const PROVIDER_URL = {
  "Netflix": "https://www.netflix.com/gb/",
  "Disney+": "https://www.disneyplus.com/en-gb/home",
  "Prime Video": "https://www.primevideo.com/",
  "Apple TV+": "https://tv.apple.com/gb",
  "Paramount+": "https://www.paramountplus.com/gb/",
  "NOW": "https://www.nowtv.com/",
  "Sky (Sky Go)": "https://www.sky.com/watch/sky-go",
  "BBC iPlayer": "https://www.bbc.co.uk/iplayer",
  "ITVX": "https://www.itv.com/watch",
  "Channel 4": "https://www.channel4.com/",
  "My5": "https://www.channel5.com/my5",
  "UKTV Play": "https://uktvplay.co.uk/",
  "Virgin TV Go": "https://virgintvgo.virginmedia.com/",
  "Hayu": "https://www.hayu.com/",
  "YouTube": "https://www.youtube.com/",
  "Google Play": "https://play.google.com/store/movies",
  "Amazon Video": "https://www.amazon.co.uk/gp/video/storefront",
  "Apple (Store)": "https://tv.apple.com/",
  "Sky Store": "https://www.skystore.com/",
};

/* Optional: prefer opening the native app (mobile) and fall back to web */
const PREFER_APP_LINKS = true;

/* Known (best-effort) app URL schemes. These can change by platform/version. */
const PROVIDER_APP_SCHEME = {
  "Netflix":       "nflx://www.netflix.com",
  "Disney+":       "disneyplus://",
  "Prime Video":   "primevideo://",
  "Apple TV+":     "videos://",           // iOS TV app may vary
  "Paramount+":    "paramountplus://",
  "NOW":           "nowtv://",
  "Sky (Sky Go)":  "skygo://",
  "BBC iPlayer":   "bbciplayer://",
  "ITVX":          "itv://",
  "Channel 4":     "all4://",
  "My5":           "my5://",
  "UKTV Play":     "uktvplay://",
  "Virgin TV Go":  "virgintvgo://",
  "Hayu":          "hayu://",
  "YouTube":       "youtube://",
  "Google Play":   "market://details?id=com.google.android.videos",
  "Amazon Video":  "primevideo://",
  "Apple (Store)": "itms-apps://",
  "Sky Store":     "skystore://",
};

/**
 * Try to open a native app (mobile) then fall back to web in a new tab.
 * On desktop, or if blocked, just open the web url in a new tab.
 */
function openProvider(name, webUrl) {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const scheme = PROVIDER_APP_SCHEME[name];

  if (!PREFER_APP_LINKS || !scheme) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (isMobile) {
    let didFallback = false;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const timer = setTimeout(() => {
      didFallback = true;
      window.open(webUrl, "_blank", "noopener,noreferrer");
      try { document.body.removeChild(iframe); } catch {}
    }, 700);

    try {
      iframe.src = scheme;
    } catch {
      clearTimeout(timer);
      if (!didFallback) window.open(webUrl, "_blank", "noopener,noreferrer");
      try { document.body.removeChild(iframe); } catch {}
    }
  } else {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
}

/* Render a comma-separated provider string as clickable links */
function ProviderLinks({ text }) {
  const names = (text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!names.length) return null;

  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {names.map((name, i) => {
        const href = PROVIDER_URL[name] || "";
        const chipStyle = {
          fontSize: 12,
          padding: "2px 8px",
          borderRadius: 16,
          background: "#f3f4f6",
          border: "1px solid #e5e7eb",
          textDecoration: "none",
          color: "inherit",
          display: "inline-block",
        };

        if (!href) {
          return (
            <span key={name + i} style={chipStyle}>
              {name}
            </span>
          );
        }

        return (
          <a
            key={name + i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={chipStyle}
            onClick={(e) => {
              // Let power users open in new tab/window normally
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
              e.preventDefault();
              openProvider(name, href); // try app scheme, fall back to web
            }}
          >
            {name}
          </a>
        );
      })}
    </span>
  );
}


/* IMDb direct URLs with cache */
async function resolveImdbUrl(title, year, preferTV) {
  const key = `${title || ""}__${year || ""}__${preferTV ? "tv" : "movie"}`;
  const cache = loadJson(CACHE_IMDB);
  if (cache[key]) return cache[key];
  let imdbUrl = "";
  try {
    if (!preferTV) {
      const m = await tmdbFindMovie(title, year);
      imdbUrl = m ? await tmdbImdbUrlFor("movie", m.id) : "";
      if (!imdbUrl) { const t = await tmdbFindTV(title); imdbUrl = t ? await tmdbImdbUrlFor("tv", t.id) : ""; }
    } else {
      const t = await tmdbFindTV(title);
      imdbUrl = t ? await tmdbImdbUrlFor("tv", t.id) : "";
      if (!imdbUrl) { const m = await tmdbFindMovie(title, year); imdbUrl = m ? await tmdbImdbUrlFor("movie", m.id) : ""; }
    }
  } catch { imdbUrl = ""; }
  cache[key] = imdbUrl || imdbSearchFor(title, year);
  saveJson(CACHE_IMDB, cache);
  return cache[key];
}

/* Build rows */
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
    Tone: "", "Family Friendliness": "",
    "Poster URL": det?.poster_path ? `${TMDB_IMG}/w342${det.poster_path}` : "",
    "IMDb Link": imdb || imdbSearchFor(movie.title || "", (movie.release_date || "").slice(0,4)),
    Watched: false
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
    Tone: "", "Family Friendliness": "",
    "Poster URL": det?.poster_path ? `${TMDB_IMG}/w342${det.poster_path}` : "",
    "IMDb Link": imdb || imdbSearchFor(tv.name || "", (tv.first_air_date || "").slice(0,4)),
    Watched: false
  };
}

/* ========= POSTER ========= */
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
      if (!path && preferTV) { const t = await tmdbFindTV(title); path = t?.poster_path || ""; }
      if (!path && !preferTV) { const t = await tmdbFindTV(title); path = t?.poster_path || ""; }
      if (cancel) return;
      const full = path ? `${TMDB_IMG}/${size}${path}` : "";
      setUrl(full);
      const cache = loadJson(CACHE_POSTER);
      cache[cacheKey] = full;
      saveJson(CACHE_POSTER, cache);
    })();
    return () => { cancel = true; };
  }, [title, year, preferTV, size, url, explicitUrl, cacheKey]);
  const placeholder = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='228' height='342'>
       <rect width='100%' height='100%' fill='#f1f1f1'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-family='Arial' font-size='14'>
         No Poster
       </text>
     </svg>`
  );
  return <img src={url || placeholder} alt={title} loading="lazy"
              style={{ width: 140, height: 210, objectFit: "cover", borderRadius: 10, background: "#f4f4f4" }}/>;
}

/* ========= CARD ITEM ========= */
function CardItem({ row, isTVSheet, onDelete, onToggleWatched, onRefreshProviders }) {
  const title = row["Title"], year = row["Year"];
  const platformTxt = row["Where to Watch (UK)"] || "";
  const cast = row["Top Cast"] || "", synopsis = row["Synopsis"] || "";
  const posterOverride = row["Poster URL"] || "";
  const watched = !!row["Watched"];

  const [imdbDirect, setImdbDirect] = useState("");
  useEffect(() => {
    let cancel = false;
    (async () => { const url = await resolveImdbUrl(title, year, isTVSheet); if (!cancel) setImdbDirect(url); })();
    return () => { cancel = true; };
  }, [title, year, isTVSheet]);

  const stableKey = `${title || "?"}__${year || ""}__${isTVSheet ? "tv" : "movie"}`;

  return (
    <div key={stableKey}
      style={{
        display:"grid", gridTemplateColumns:"140px 1fr", gap:12, alignItems:"start",
        border:"1px solid #eee", borderRadius:12, padding:12,
        background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,.05)"
      }}>
      <Poster title={title} year={year} preferTV={isTVSheet} explicitUrl={posterOverride} />
      <div>
        <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
          <div style={{fontWeight:700, lineHeight:1.25, fontSize:16}}>
            {title} {year ? <span style={{opacity:.65, fontWeight:500}}>({year})</span> : null}
          </div>
          {platformTxt ? <ProviderLinks text={platformTxt} /> : null}
          <label style={{fontSize:13, display:"inline-flex", alignItems:"center", gap:6, marginLeft:"auto"}}>
            <input type="checkbox" checked={watched} onChange={() => onToggleWatched(title, year)} /> I’ve watched it
          </label>
        </div>
        {cast && <div style={{fontSize:13, marginTop:6}}><b>Cast:</b> {cast}</div>}
        {synopsis && <div style={{fontSize:13, color:"#333", marginTop:6}}>{synopsis}</div>}

        <div style={{marginTop:10, display:"flex", gap:8, flexWrap:"wrap"}}>
          <a href={imdbDirect || imdbSearchFor(title, year)} target="_blank" rel="noreferrer"
             style={{border:"1px solid #ddd", padding:"6px 10px", borderRadius:8, textDecoration:"none"}}>IMDb</a>
          <button onClick={() => onRefreshProviders(title, year, isTVSheet)} title="Refresh Where to Watch"
                  style={{border:"1px solid #dbeafe", background:"#eff6ff", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>🔄 Refresh providers</button>
          <button onClick={() => onDelete(title, year)} title="Remove"
                  style={{border:"1px solid #f3c1c1", background:"#ffe9e9", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>🗑️ Remove</button>
        </div>
      </div>
    </div>
  );
}

/* ========= IMDb Link for table ========= */
function ImdbLinkCell({ title, year, isTVSheet, fallbackUrl }) {
  const [direct, setDirect] = useState("");
  useEffect(() => {
    let cancel = false;
    (async () => { const url = await resolveImdbUrl(title, year, isTVSheet); if (!cancel) setDirect(url); })();
    return () => { cancel = true; };
  }, [title, year, isTVSheet]);
  const href = direct || fallbackUrl || imdbSearchFor(title, year);
  return <a href={href} target="_blank" rel="noreferrer">Open</a>;
}

/* ========= MAIN APP ========= */
function MainApp() {
    const [session, setSession] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [activeView, setActiveView] = useState("discover");
    const [accountOpen, setAccountOpen] = useState(false);
    const [showAdminTools, setShowAdminTools] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setIsAdmin(false);
      return;
    }

    let cancelled = false;

    async function checkAdmin() {
      const { data, error } = await supabase
        .from("v2_profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (error) {
        console.error("Couldn't check admin status:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(!!data?.is_admin);
    }

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [session]);

useEffect(() => {
  if (!supabase || !session?.user) {
    setWatchlistTmdbIds(new Set());
    return;
  }

  async function loadWatchlistIds() {
    const { data, error } = await supabase
      .from("v2_list_items")
      .select(`
        film_id,
        v2_lists!inner(
          user_id,
          list_type
        ),
        v2_films!inner(
          tmdb_id
        )
      `)
      .eq("v2_lists.user_id", session.user.id)
      .eq("v2_lists.list_type", "watchlist");

    if (error) {
      console.error(error);
      return;
    }

    setWatchlistTmdbIds(
      new Set(
        (data || [])
          .map((x) => x.v2_films?.tmdb_id)
          .filter(Boolean)
      )
    );
  }

  loadWatchlistIds();
}, [session]);

// PASTE NEW FAVOURITES EFFECT HERE

useEffect(() => {
  if (!supabase || !session?.user) {
    setFavouriteTmdbIds(new Set());
    return;
  }

  async function loadFavouriteIds() {
    const { data, error } = await supabase
      .from("v2_list_items")
      .select(`
        film_id,
        v2_lists!inner(
          user_id,
          list_type
        ),
        v2_films!inner(
          tmdb_id
        )
      `)
      .eq("v2_lists.user_id", session.user.id)
      .eq("v2_lists.list_type", "favourites");

    if (error) {
      console.error(error);
      return;
    }

    setFavouriteTmdbIds(
      new Set(
        (data || [])
          .map((x) => x.v2_films?.tmdb_id)
          .filter(Boolean)
      )
    );
  }

  loadFavouriteIds();
}, [session]);


  const [sheets, setSheets] = useState({});
  const [sheetName, setSheetName] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [sortBy, setSortBy] = useState("Title"); // default sort by Title
  const [sortDir, setSortDir] = useState("asc");
  const [view, setView] = useState("cards");

  // Discover modal
  const [showDiscover, setShowDiscover] = useState(false);
  const [discover, setDiscover] = useState([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [addingKey, setAddingKey] = useState("");
  const [watchlistTmdbIds, setWatchlistTmdbIds] = useState(new Set());
  const [favouriteTmdbIds, setFavouriteTmdbIds] = useState(new Set());
  const [catalogueRefreshKey, setCatalogueRefreshKey] = useState(0);


  // Progress / toasts
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState(null);

  /* --------- Cloud save/load --------- */
  const [cloudCode, setCloudCode] = useState(localStorage.getItem("cw_code") || "");
  useEffect(() => { if (cloudCode) localStorage.setItem("cw_code", cloudCode); }, [cloudCode]);

  async function loadFromCloud(codeArg) {
    if (!supabase) { alert("Supabase not configured."); return; }
    const codeToUse = (codeArg || cloudCode || "").toUpperCase();
    if (!codeToUse) { alert("Enter a code first."); return; }
    const { data, error } = await supabase
      .from("watchlists")
      .select("*")
      .eq("code", codeToUse)
      .single();
    if (error || !data) { alert("Not found for code: " + codeToUse); return; }
    setSheets(data.data || {});
const names = Object.keys(data.data || {});
const preferFilm = names.find(n => /film|movie/i.test(n)) || names[0] || "";
if (preferFilm) setSheetName(preferFilm);
    setCloudCode(codeToUse);
    setToast({ text:"Loaded from cloud.", type:"ok" }); setTimeout(()=>setToast(null), 2000);
  }

  const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  async function saveToCloud() {
    if (!supabase) { alert("Supabase not configured."); return; }
    const code = cloudCode || randomCode();
    const payload = { code, data: sheets };
    const { error } = await supabase.from("watchlists").upsert(payload, { onConflict: "code" });
    if (error) { alert("Save failed: " + error.message); return; }
    setCloudCode(code);
    setToast({ text:`Saved! Code: ${code}`, type:"ok" }); setTimeout(()=>setToast(null), 3000);
  }

  /* --------- Autosave / restore & auto-load default --------- */
  useEffect(() => {
    const savedSheets = localStorage.getItem("cw_sheets");
    const savedSheetName = localStorage.getItem("cw_sheetName");
    if (savedSheets) setSheets(JSON.parse(savedSheets));
    if (savedSheetName) setSheetName(savedSheetName);
  }, []);
  useEffect(() => { localStorage.setItem("cw_sheets", JSON.stringify(sheets)); }, [sheets]);
  useEffect(() => { if (sheetName) localStorage.setItem("cw_sheetName", sheetName); }, [sheetName]);

  const getUrlCode = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = (sp.get("code") || "").toUpperCase();
      return c || "";
    } catch { return ""; }
  };

  
// ⬇️ Force-load default every time the app mounts (URL ?code=… overrides)
useEffect(() => {
  const getUrlCode = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = (sp.get("code") || "").toUpperCase();
      return c || "";
    } catch { return ""; }
  };

  // If you only want this on your deployment, uncomment:
  // if (!location.hostname.endsWith(".vercel.app")) return;

  const fromUrl = getUrlCode();
  const fromEnv = (import.meta.env.VITE_DEFAULT_LOAD_CODE || "").toUpperCase();
  const fallback = "PMR9EE"; // your chosen default
  const code = fromUrl || fromEnv || fallback;

  // ensure no stale local list flashes in
  localStorage.removeItem("cw_sheets");
  localStorage.removeItem("cw_sheetName");

  if (code) loadFromCloud(code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  /* --------- Upload --------- */
  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const next = {};
      wb.SheetNames.forEach((name) => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        next[name] = rows.map(r => ({ Watched: !!r.Watched, ...r }));
      });
      setSheets(next);
      const nonEmpty = wb.SheetNames.filter(n => (next[n] || []).length > 0);
const preferFilm = nonEmpty.find(n => /film|movie/i.test(n)) || nonEmpty[0] || wb.SheetNames[0];
setSheetName(preferFilm ?? "");

    } catch (err) {
      console.error("Failed to read Excel:", err);
      alert("Couldn't read that Excel file. Is it .xlsx and not password-protected?");
    }
  };

  const sheetNames = Object.keys(sheets);
  const rawRows = (sheets[sheetName] || []).map(r => ({ Watched: !!r.Watched, ...r }));

  const HIDE_COLS = new Set(["IMDb (score/10)", "Rotten Tomatoes (Tomatometer)", "Must-Watch (Dec Day)"]);
  const baseHeaders = rawRows.length ? Object.keys(rawRows[0]).filter(h => !HIDE_COLS.has(h)) : [];
  const headers = useMemo(() => {
    const wants = new Set(baseHeaders);
    if (!wants.has("IMDb Link")) wants.add("IMDb Link");
    if (!wants.has("Poster URL")) wants.add("Poster URL");
    if (!wants.has("Actions")) wants.add("Actions");
    if (!wants.has("Watched")) wants.add("Watched");
    return [...wants];
  }, [rawRows]);

  const rowsWithLinks = useMemo(() => rawRows.map(r => {
    const title = r["Title"], year = r["Year"];
    return { ...r, "IMDb Link": r["IMDb Link"] || imdbSearchFor(title, year) };
  }), [rawRows]);

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
        const av = a[sortBy], bv = b[sortBy];
        const na = Number(av), nb = Number(bv);
        const bothNum = !isNaN(na) && !isNaN(nb);
        if (bothNum) return sortDir === "asc" ? na - nb : nb - na;
        return sortDir === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""));
      });
    }
    return r;
  }, [rowsWithLinks, search, platform, sortBy, sortDir]);

  const onSort = (col) => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("asc"); } };
  const isTVSheet = /tv|special/i.test(sheetName);

  /* ====== helpers: remove / watched / providers ====== */
  const removeRow = (title, year) => {
    setSheets(prev => {
      const next = { ...prev };
      const cur = next[sheetName] || [];
      next[sheetName] = cur.filter(r => !(((r.Title || "").trim() === (title || "").trim()) && (String(r.Year || "") === String(year || ""))));
      return next;
    });
  };

  const toggleWatched = (title, year) => {
    setSheets(prev => {
      const next = { ...prev };
      next[sheetName] = (prev[sheetName] || []).map(r => {
        if (((r.Title || "").trim() === (title || "").trim()) && (String(r.Year || "") === String(year || ""))) {
          return { ...r, Watched: !r.Watched };
        }
        return r;
      });
      return next;
    });
  };

  const refreshProvidersFor = async (title, year, preferTV) => {
    if (!TMDB_KEY) return;
    let providersTxt = "";
    try {
      if (preferTV) {
        const t = await tmdbFindTV(title);
        providersTxt = t ? await tvProvidersGB(t.id) : "";
        if (!providersTxt) { const m = await tmdbFindMovie(title, year); providersTxt = m ? await movieProvidersGB(m.id) : ""; }
      } else {
        const m = await tmdbFindMovie(title, year);
        providersTxt = m ? await movieProvidersGB(m.id) : "";
        if (!providersTxt) { const t = await tmdbFindTV(title); providersTxt = t ? await tvProvidersGB(t.id) : ""; }
      }
    } catch {}
    if (!providersTxt) { setToast({ text:"No provider data found for GB.", type:"" }); setTimeout(()=>setToast(null), 2000); return; }
    setSheets(prev => {
      const next = { ...prev };
      next[sheetName] = (prev[sheetName] || []).map(r => {
        if (((r.Title || "").trim() === (title || "").trim()) && (String(r.Year || "") === String(year || ""))) {
          return { ...r, "Where to Watch (UK)": providersTxt };
        }
        return r;
      });
      return next;
    });
    setToast({ text:"Providers updated.", type:"ok" }); setTimeout(()=>setToast(null), 1500);
  };
 // Insert immediately, then enrich the same row (runtime, cast, poster, IMDb, Where to Watch)
const addRowToCurrentSheet = async (title, year, kind) => {
  return new Promise(async (resolve) => {
    if (!sheetName) return resolve();

    // 1) Insert a basic row immediately (de-dupe by Title+Year)
    setSheets(prev => {
      const next = { ...prev };
      const cur = next[sheetName] || [];
      const exists = cur.some(r =>
        (r.Title || "").trim() === (title || "").trim() &&
        String(r.Year || "") === String(year || "")
      );
      if (exists) return prev;

      const newRow = {
        Title: title || "",
        Year: (year || "").toString().slice(0,4),
        "Where to Watch (UK)": "",
        "Age Rating": "",
        "Runtime (min)": "",
        "Top Cast": "",
        Synopsis: "",
        Director: "",
        Tone: "",
        "Family Friendliness": "",
        "Poster URL": "",
        "IMDb Link": imdbSearchFor(title, year),
        Watched: false
      };
      next[sheetName] = [...cur, newRow];
      return next;
    });

    // 2) Enrich from TMDB (if key present); update the same row in place
    try {
      let enriched = null;
      const preferTV = kind === "tv" || /tv|special/i.test(sheetName);

      if (preferTV) {
        const tv = await tmdbFindTV(title);
        if (tv) enriched = await buildRowFromTmdbTV(tv);
        if (!enriched) {
          const mv = await tmdbFindMovie(title, year);
          if (mv) enriched = await buildRowFromTmdbMovie(mv);
        }
      } else {
        const mv = await tmdbFindMovie(title, year);
        if (mv) enriched = await buildRowFromTmdbMovie(mv);
        if (!enriched) {
          const tv = await tmdbFindTV(title);
          if (tv) enriched = await buildRowFromTmdbTV(tv);
        }
      }

      if (enriched) {
        setSheets(prev => {
          const cur = prev[sheetName] || [];
          const idx = cur.findIndex(r =>
            (r.Title || "").trim() === (title || "").trim() &&
            String(r.Year || "") === String(year || "")
          );
          if (idx === -1) return prev;
          const updated = [...cur];
          updated[idx] = { ...updated[idx], ...enriched, Watched: !!updated[idx].Watched };
          return { ...prev, [sheetName]: updated };
        });
        setToast({ text: "Added ✓ (enriched)", type: "ok" });
      } else {
        setToast({ text: "Added ✓ (basic — TMDB not available)", type: "" });
      }
    } catch {
      setToast({ text: "Added ✓ (basic — couldn’t enrich)", type: "" });
    } finally {
      setTimeout(() => setToast(null), 1500);
      resolve();
    }
  });
};
 

  /* ====== Enrich (progress UI) ====== */
  const enrichVisible = async () => {
    if (!sheetName || !filtered.length || !TMDB_KEY) return;
    setIsEnriching(true); setEnrichProgress({ done: 0, total: filtered.length });
    try {
      const targetKeys = new Set(filtered.map(r => `${r.Title}__${r.Year}`));
      const current = [...(sheets[sheetName] || [])];
      let done = 0;
      for (let i = 0; i < current.length; i++) {
        const row = current[i]; const k = `${row.Title}__${row.Year}`; if (!targetKeys.has(k)) continue;
        const title = row["Title"], year = row["Year"];
        let enriched = row;
        try {
          if (isTVSheet) {
            const tv = await tmdbFindTV(title);
            if (tv) enriched = { ...row, ...(await buildRowFromTmdbTV(tv)), Watched: !!row.Watched };
            else { const mv = await tmdbFindMovie(title, year); if (mv) enriched = { ...row, ...(await buildRowFromTmdbMovie(mv)), Watched: !!row.Watched }; }
          } else {
            const mv = await tmdbFindMovie(title, year);
            if (mv) enriched = { ...row, ...(await buildRowFromTmdbMovie(mv)), Watched: !!row.Watched };
            else { const tv = await tmdbFindTV(title); if (tv) enriched = { ...row, ...(await buildRowFromTmdbTV(tv)), Watched: !!row.Watched }; }
          }
        } catch {}
        current[i] = enriched;
        done += 1; setEnrichProgress(p => ({ ...p, done })); await new Promise(r => setTimeout(r, 0));
      }
      setSheets({ ...sheets, [sheetName]: current });
      setToast({ text:`Enriched ${enrichProgress.total} item(s).`, type:"ok" }); setTimeout(()=>setToast(null), 3000);
    } finally { setIsEnriching(false); }
  };

  const barPct = Math.round((enrichProgress.done / Math.max(enrichProgress.total || 1, 1)) * 100);

  /* ====== Discover (search-only; clear on close; duplicates flagged) ====== */
  const openDiscover = () => { setShowDiscover(true); setDiscover([]); setDiscoverQuery(""); };
  const closeDiscover = () => { setShowDiscover(false); setDiscover([]); setDiscoverQuery(""); };
  const searchDiscover = async (q) => {
    if (!TMDB_KEY) return;
    const query = (q || "").trim();
    if (!query) { setDiscover([]); return; }
    setIsLoadingDiscover(true);
    const j = await tmdb("/search/movie", { query, include_adult: "false", language: "en-GB" });
    const items = (j?.results || []).map(x => ({
  kind: "movie",
  id: x.id,
  title: x.title,
  originalTitle: x.original_title || "",
  year: (x.release_date || "").slice(0, 4),
  releaseDate: x.release_date || null,
  overview: x.overview || "",
  posterPath: x.poster_path || null,
  backdropPath: x.backdrop_path || null,
  poster: x.poster_path ? `${TMDB_IMG}/w342${x.poster_path}` : ""
})).slice(0, 200);
    setDiscover(items); setIsLoadingDiscover(false);
  };
  const saveDiscoveredFilm = async (film) => {
  if (!session?.user) {
    setToast({ text: "Sign in to save films.", type: "" });
    setTimeout(() => setToast(null), 2000);
    return;
  }

  setAddingKey(String(film.id));

  const { error } = await supabase.rpc(
    "v2_save_film_to_special_list",
    {
      p_list_type: "watchlist",
      p_tmdb_id: film.id,
      p_title: film.title,
      p_original_title: film.originalTitle || null,
      p_release_date: film.releaseDate || null,
      p_overview: film.overview || null,
      p_poster_path: film.posterPath || null,
      p_backdrop_path: film.backdropPath || null,
    }
  );

  setAddingKey("");

  if (error) {
    console.error(error);
    setToast({
      text: "Couldn't add film: " + error.message,
      type: "",
    });
  } else {
  setWatchlistTmdbIds(prev => new Set([...prev, film.id]));

  // Force the open search results to refresh immediately
  setDiscover(prev => [...prev]);

  setToast({
    text: "Added to My Christmas List ✓",
    type: "ok",
  });
}

  setTimeout(() => setToast(null), 2500);
};
const saveFavouriteFilm = async (film) => {
  if (!session?.user) {
    setToast({ text: "Sign in to save favourites.", type: "" });
    setTimeout(() => setToast(null), 2000);
    return;
  }

  const { error } = await supabase.rpc(
    "v2_save_film_to_special_list",
    {
      p_list_type: "favourites",
      p_tmdb_id: film.id,
      p_title: film.title,
      p_original_title: film.originalTitle || null,
      p_release_date: film.releaseDate || null,
      p_overview: film.overview || null,
      p_poster_path: film.posterPath || null,
      p_backdrop_path: film.backdropPath || null,
    }
  );

  if (error) {
    console.error(error);

    setToast({
      text: "Couldn't add favourite: " + error.message,
      type: "",
    });
  } else {
    setFavouriteTmdbIds(
      (prev) => new Set([...prev, film.id])
    );

    setDiscover((prev) => [...prev]);

    setToast({
      text: "Added to Favourites ♥",
      type: "ok",
    });
  }

  setTimeout(() => setToast(null), 2500);
};


  const accountName =
    session?.user?.user_metadata?.display_name ||
    session?.user?.email?.split("@")[0] ||
    "Account";

  const accountInitial =
    accountName?.trim()?.charAt(0)?.toUpperCase() || "A";

  async function signOutUser() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setAccountOpen(false);
    setShowAdminTools(false);
    setActiveView("discover");
  }

  /* ====== UI ====== */
  return (
    <div
      className="cit-app"
      style={{
        padding: "16px 16px 88px",
        maxWidth: 1240,
        margin: "0 auto",
      }}
    >
      <style>{`
        :root {
          color-scheme: light;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background: #f7f4ee;
          color: #18382f;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button,
        input,
        select {
          font: inherit;
        }

        .cit-header {
          position: sticky;
          top: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 10px 0 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid rgba(218, 211, 200, .9);
          background: rgba(247, 244, 238, .94);
          backdrop-filter: blur(14px);
        }

        .cit-logo-button {
          border: 0;
          padding: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
          color: inherit;
          transition: opacity .16s ease, transform .16s ease;
        }

        .cit-logo-button:hover {
          opacity: .92;
          transform: translateY(-1px);
        }

        .cit-logo-button:focus-visible {
          outline: 3px solid rgba(18, 59, 45, .14);
          outline-offset: 5px;
          border-radius: 8px;
        }

        .cit-header-logo-image {
          display: block;
          width: min(350px, 42vw);
          height: auto;
        }

        .cit-brand-lockup {
          display: inline-block;
          line-height: 1;
        }

        .cit-brand-title {
          display: inline-block;
          position: relative;
          color: #123b2d;
          font-size: clamp(30px, 4.8vw, 43px);
          font-weight: 850;
          letter-spacing: -0.055em;
          line-height: .92;
        }

        .cit-brand-first-letter {
          position: relative;
          display: inline-block;
          margin-right: .01em;
        }

        .cit-santa-hat {
          position: absolute;
          width: 20px;
          height: 13px;
          top: -9px;
          left: -2px;
          background: #a51f24;
          border-radius: 12px 12px 2px 2px;
          transform: rotate(-18deg) skewX(-11deg);
          transform-origin: center bottom;
          box-shadow: 0 1px 2px rgba(80, 24, 26, .08);
        }

        .cit-santa-hat::before {
          content: "";
          position: absolute;
          left: -1px;
          right: -1px;
          bottom: -1px;
          height: 4px;
          border-radius: 999px;
          background: #fbf7f0;
          transform: skewX(11deg);
        }

        .cit-santa-hat::after {
          content: "";
          position: absolute;
          width: 6px;
          height: 6px;
          left: -5px;
          top: 0;
          border-radius: 50%;
          background: #fbf7f0;
          transform: skewX(11deg);
          box-shadow: 0 1px 2px rgba(80, 24, 26, .08);
        }

        .cit-brand-subtitle {
          margin-top: 7px;
          color: #922b2f;
          font-size: clamp(9px, 1.7vw, 11px);
          font-weight: 760;
          letter-spacing: .17em;
          line-height: 1.2;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .cit-brand-rule {
          position: relative;
          width: 74%;
          height: 2px;
          margin: 7px auto 0;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            transparent 0%,
            #a51f24 10%,
            #a51f24 90%,
            transparent 100%
          );
          opacity: .78;
          transform: rotate(-.7deg);
        }

        .cit-brand-rule::after {
          content: "";
          position: absolute;
          right: 7%;
          top: -1px;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #a51f24;
        }

        .cit-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        .cit-desktop-nav {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          border: 1px solid #e4ded4;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.78);
        }

        .cit-nav-button {
          border: 0;
          background: transparent;
          color: #334e45;
          border-radius: 999px;
          padding: 9px 14px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 650;
          transition:
            background .16s ease,
            color .16s ease,
            box-shadow .16s ease,
            transform .16s ease;
        }

        .cit-nav-button:focus-visible {
          outline: 3px solid rgba(18, 59, 45, .13);
          outline-offset: 2px;
        }

        .cit-nav-button:hover {
          background: #f1eee8;
          color: #123b2d;
        }

        .cit-nav-button--primary {
          background: #123b2d;
          color: white;
          box-shadow: 0 3px 9px rgba(18, 59, 45, .16);
        }

        .cit-nav-button--primary:hover {
          background: #0d3024;
          color: white;
        }

        .cit-auth {
          display: flex;
          justify-content: flex-end;
          margin: 0 0 18px;
        }

        .cit-account-wrap {
          position: relative;
        }

        .cit-account-button {
          width: 38px;
          height: 38px;
          border: 1px solid #d8d3ca;
          border-radius: 999px;
          background: #fff;
          color: #123b2d;
          display: grid;
          place-items: center;
          cursor: pointer;
          font-size: 13px;
          font-weight: 800;
          box-shadow: 0 2px 7px rgba(28, 42, 35, 0.07);
          transition:
            transform .16s ease,
            border-color .16s ease,
            box-shadow .16s ease;
        }

        .cit-account-button:hover {
          transform: translateY(-1px);
          border-color: #aebbb5;
          background: #fbfaf7;
          box-shadow: 0 5px 13px rgba(28, 42, 35, 0.10);
        }

        .cit-account-button:focus-visible {
          outline: 3px solid rgba(18, 59, 45, .13);
          outline-offset: 2px;
        }

        .cit-account-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 1500;
          width: 210px;
          padding: 7px;
          border: 1px solid #ddd8cf;
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 12px 30px rgba(29, 42, 35, 0.14);
        }

        .cit-account-name {
          padding: 8px 9px 10px;
          border-bottom: 1px solid #eee9e1;
          margin-bottom: 5px;
        }

        .cit-account-name strong {
          display: block;
          color: #18382f;
          font-size: 13px;
        }

        .cit-account-name span {
          display: block;
          margin-top: 2px;
          color: #818985;
          font-size: 10px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cit-account-menu button {
          width: 100%;
          border: 0;
          background: transparent;
          color: #40574f;
          text-align: left;
          padding: 8px 9px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 650;
        }

        .cit-account-menu button:hover {
          background: #f5f2ec;
          color: #123b2d;
        }

        .cit-account-menu .cit-signout {
          color: #8d3535;
        }

        .cit-admin-panel {
          margin: 0 0 20px;
          padding: 10px;
          border: 1px solid #ded8cf;
          border-radius: 12px;
          background: rgba(255,255,255,.65);
        }

        .cit-section-anchor {
          scroll-margin-top: 20px;
        }

        .cit-discover-hero {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 22px;
          min-height: 132px;
          margin: 18px 0 16px;
          padding: 23px 24px 22px;
          border: 1px solid #dfe4df;
          border-radius: 18px;
          background:
            radial-gradient(
              circle at 8% 18%,
              rgba(255,255,255,.92) 0 1.2px,
              transparent 1.5px
            ),
            radial-gradient(
              circle at 22% 38%,
              rgba(255,255,255,.74) 0 1px,
              transparent 1.4px
            ),
            radial-gradient(
              circle at 61% 19%,
              rgba(255,255,255,.88) 0 1px,
              transparent 1.4px
            ),
            radial-gradient(
              circle at 84% 31%,
              rgba(255,255,255,.78) 0 1.3px,
              transparent 1.7px
            ),
            linear-gradient(
              135deg,
              #eef3f0 0%,
              #e7eeeb 43%,
              #f3f1eb 100%
            );
          box-shadow: 0 6px 22px rgba(36, 52, 44, .055);
        }

        .cit-discover-hero::before {
          content: "";
          position: absolute;
          z-index: -1;
          right: -4%;
          bottom: -78px;
          width: 58%;
          height: 165px;
          border-radius: 50% 48% 0 0;
          border-top: 1px solid rgba(18,59,45,.08);
          background:
            linear-gradient(
              180deg,
              rgba(255,255,255,.18),
              rgba(255,255,255,.46)
            );
          transform: rotate(-4deg);
        }

        .cit-discover-hero::after {
          content: "";
          position: absolute;
          z-index: -1;
          left: -7%;
          bottom: -112px;
          width: 64%;
          height: 165px;
          border-radius: 50% 52% 0 0;
          border-top: 1px solid rgba(18,59,45,.055);
          background: rgba(255,255,255,.2);
          transform: rotate(4deg);
        }

        .cit-discover-copy {
          position: relative;
          z-index: 1;
          max-width: 710px;
        }

        .cit-discover-eyebrow {
          margin-bottom: 7px;
          color: #8d4b4e;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .cit-discover-hero h1 {
          margin: 0;
          color: #123b2d;
          font-size: clamp(27px, 3.9vw, 39px);
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .cit-discover-hero p {
          max-width: 680px;
          margin: 8px 0 0;
          color: #586861;
          font-size: 14px;
          line-height: 1.5;
        }

        .cit-search-all {
          position: relative;
          z-index: 1;
          flex: 0 0 auto;
          border: 1px solid #123b2d;
          background: #123b2d;
          color: #fff;
          padding: 11px 16px;
          border-radius: 11px;
          cursor: pointer;
          font-weight: 700;
          box-shadow: 0 3px 10px rgba(18, 59, 45, 0.12);
          transition:
            transform .16s ease,
            background .16s ease,
            box-shadow .16s ease;
        }

        .cit-search-all:hover {
          transform: translateY(-1px);
          background: #0d3024;
          box-shadow: 0 6px 16px rgba(18, 59, 45, .16);
        }

        .cit-search-all:focus-visible {
          outline: 3px solid rgba(18, 59, 45, .14);
          outline-offset: 3px;
        }

        .cit-admin {
          margin: 24px 0 18px;
          border: 1px solid #e1ddd5;
          border-radius: 12px;
          background: rgba(255,255,255,.58);
          overflow: hidden;
        }

        .cit-admin summary {
          cursor: pointer;
          list-style: none;
          padding: 10px 13px;
          color: #68746e;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
        }

        .cit-admin summary::-webkit-details-marker {
          display: none;
        }

        .cit-admin-content {
          padding: 0 10px 10px;
        }

        .cit-mobile-nav {
          display: none;
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            transition-duration: .01ms !important;
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
          }
        }

        @media (max-width: 720px) {
          .cit-app {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .cit-header {
            align-items: flex-start;
            padding-top: 6px;
            margin-bottom: 8px;
          }

          .cit-desktop-nav {
            display: none;
          }

          .cit-auth {
            justify-content: flex-start;
            margin-bottom: 14px;
          }

          .cit-header-actions {
            gap: 6px;
          }

          .cit-account-button {
            width: 36px;
            height: 36px;
          }

          .cit-header-logo-image {
            width: min(320px, 76vw);
          }

          .cit-discover-hero {
            align-items: stretch;
            flex-direction: column;
            gap: 16px;
            min-height: 0;
            margin-top: 14px;
            padding: 18px 17px 17px;
            border-radius: 15px;
          }

          .cit-discover-hero::before {
            right: -24%;
            width: 95%;
          }

          .cit-discover-hero::after {
            left: -26%;
            width: 100%;
          }

          .cit-discover-hero p {
            font-size: 13px;
          }

          .cit-search-all {
            width: 100%;
          }

          .cit-mobile-nav {
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: max(10px, env(safe-area-inset-bottom));
            z-index: 1200;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 4px;
            padding: 5px;
            border: 1px solid #ded8cf;
            border-radius: 17px;
            background: rgba(255, 253, 249, 0.97);
            box-shadow: 0 12px 32px rgba(35, 48, 42, 0.18);
            backdrop-filter: blur(16px);
          }

          .cit-mobile-nav button {
            border: 0;
            border-radius: 11px;
            background: transparent;
            color: #365047;
            padding: 10px 4px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 720;
            line-height: 1.15;
            transition:
              background .16s ease,
              color .16s ease,
              transform .16s ease;
          }

          .cit-mobile-nav button:active {
            transform: scale(.98);
          }

          .cit-mobile-nav-button--active {
            background: #123b2d !important;
            color: #fff !important;
            box-shadow: 0 3px 9px rgba(18, 59, 45, .16);
          }
        }
      `}</style>

      <header className="cit-header">
        <button
          type="button"
          className="cit-logo-button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Check It Twice home"
        >
          <img
            className="cit-header-logo-image"
            src="/check-it-twice-logo-final.png"
            alt="Check It Twice — The Ultimate Christmas Watchlist"
          />
        </button>

        <div className="cit-header-actions">
          <nav className="cit-desktop-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={`cit-nav-button ${
                activeView === "discover" ? "cit-nav-button--primary" : ""
              }`}
              onClick={() => {
                setActiveView("discover");
                setAccountOpen(false);
              }}
            >
              Discover
            </button>

            <button
              type="button"
              className={`cit-nav-button ${
                activeView === "watchlist" ? "cit-nav-button--primary" : ""
              }`}
              onClick={() => {
                setActiveView("watchlist");
                setAccountOpen(false);
              }}
            >
              My Christmas List
            </button>

            <button
              type="button"
              className={`cit-nav-button ${
                activeView === "planner" ? "cit-nav-button--primary" : ""
              }`}
              onClick={() => {
                setActiveView("planner");
                setAccountOpen(false);
              }}
            >
              Planner
            </button>

            <button
              type="button"
              className={`cit-nav-button ${
                activeView === "favourites" ? "cit-nav-button--primary" : ""
              }`}
              onClick={() => {
                setActiveView("favourites");
                setAccountOpen(false);
              }}
            >
              Favourites
            </button>

            <button
              type="button"
              className={`cit-nav-button ${
                activeView === "watched" ? "cit-nav-button--primary" : ""
              }`}
              onClick={() => {
                setActiveView("watched");
                setAccountOpen(false);
              }}
            >
              Watched
            </button>
          </nav>

          {session?.user && (
            <div className="cit-account-wrap">
              <button
                type="button"
                className="cit-account-button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-label="Open account menu"
                title={accountName}
              >
                {accountInitial}
              </button>

              {accountOpen && (
                <div className="cit-account-menu">
                  <div className="cit-account-name">
                    <strong>{accountName}</strong>
                    <span>{session.user.email}</span>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminTools((open) => !open);
                        setAccountOpen(false);
                      }}
                    >
                      Admin tools
                    </button>
                  )}

                  <button
                    type="button"
                    className="cit-signout"
                    onClick={signOutUser}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legacy cloud controls retained but intentionally hidden */}
        <div style={{ display: "none" }}>
          <input
            placeholder="Share/Load code"
            value={cloudCode}
            onChange={(e) => setCloudCode(e.target.value.toUpperCase())}
          />
          <button onClick={() => loadFromCloud()}>Load</button>
          <button onClick={saveToCloud}>Save</button>
        </div>
      </header>

      {!session?.user && (
        <div className="cit-auth">
          <AuthPanel supabase={supabase} session={session} />
        </div>
      )}

      {isAdmin && showAdminTools && (
        <div className="cit-admin-panel">
          <CatalogueAdmin
            supabase={supabase}
            session={session}
            onCatalogueUpdated={() =>
              setCatalogueRefreshKey((prev) => prev + 1)
            }
          />
        </div>
      )}

      {activeView === "discover" ? (
        <section
          className="cit-section-anchor"
          aria-labelledby="discover-title"
        >
          <div className="cit-discover-hero">
            <div className="cit-discover-copy">
              <div className="cit-discover-eyebrow">
                Build your Christmas watchlist
              </div>

              <h1 id="discover-title">Discover</h1>

              <p>
                Browse the Christmas catalogue, see where films are streaming
                in the UK, and add the ones you want to watch this Christmas.
              </p>
            </div>

            <button
              type="button"
              className="cit-search-all"
              onClick={openDiscover}
            >
              Search all films
            </button>
          </div>

          <Catalogue
            supabase={supabase}
            refreshKey={catalogueRefreshKey}
            session={session}
            watchlistTmdbIds={watchlistTmdbIds}
            favouriteTmdbIds={favouriteTmdbIds}
            onWatchlistAdded={(tmdbId) => {
              setWatchlistTmdbIds(
                (prev) => new Set([...prev, tmdbId])
              );
            }}
            onFavouriteAdded={(tmdbId) => {
              setFavouriteTmdbIds(
                (prev) => new Set([...prev, tmdbId])
              );
            }}
          />
        </section>
      ) : activeView === "watched" ? (
        <section className="cit-section-anchor">
          <WatchedHistory
            supabase={supabase}
            session={session}
            onBrowseDiscover={() => setActiveView("discover")}
          />
        </section>
      ) : activeView === "planner" ? (
        <section className="cit-section-anchor">
          <Planner
            supabase={supabase}
            session={session}
            onBrowseDiscover={() => setActiveView("discover")}
            onWatchlistAdded={(tmdbId) => {
              setWatchlistTmdbIds(
                (prev) => new Set([...prev, tmdbId])
              );
            }}
            onFavouriteAdded={(tmdbId) => {
              setFavouriteTmdbIds(
                (prev) => new Set([...prev, tmdbId])
              );
            }}
          />
        </section>
      ) : (
        <section className="cit-section-anchor">
          <MyLibrary
            supabase={supabase}
            session={session}
            listType={
              activeView === "favourites"
                ? "favourites"
                : "watchlist"
            }
            onBrowseDiscover={() => setActiveView("discover")}
            onWatchlistRemoved={(tmdbId) => {
              setWatchlistTmdbIds((prev) => {
                const next = new Set(prev);
                next.delete(tmdbId);
                return next;
              });

              setDiscover((prev) => [...prev]);
            }}
            onFavouriteRemoved={(tmdbId) => {
              setFavouriteTmdbIds((prev) => {
                const next = new Set(prev);
                next.delete(tmdbId);
                return next;
              });

              setDiscover((prev) => [...prev]);
            }}
          />
        </section>
      )}

      <nav className="cit-mobile-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={
            activeView === "discover"
              ? "cit-mobile-nav-button--active"
              : ""
          }
          onClick={() => setActiveView("discover")}
        >
          Discover
        </button>

        <button
          type="button"
          className={
            activeView === "watchlist"
              ? "cit-mobile-nav-button--active"
              : ""
          }
          onClick={() => setActiveView("watchlist")}
        >
          My List
        </button>

        <button
          type="button"
          className={
            activeView === "planner"
              ? "cit-mobile-nav-button--active"
              : ""
          }
          onClick={() => setActiveView("planner")}
        >
          Planner
        </button>

        <button
          type="button"
          className={
            activeView === "favourites"
              ? "cit-mobile-nav-button--active"
              : ""
          }
          onClick={() => setActiveView("favourites")}
        >
          Favourites
        </button>

        <button
          type="button"
          className={
            activeView === "watched"
              ? "cit-mobile-nav-button--active"
              : ""
          }
          onClick={() => setActiveView("watched")}
        >
          Watched
        </button>
      </nav>

      {isEnriching && (
        <div style={{position:"sticky", top:8, zIndex:1000, background:"#fff", border:"1px solid #eee", borderRadius:8, padding:"8px 10px", display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
          <div style={{flex:"1 1 auto", height:6, background:"#f1f5f9", borderRadius:4, overflow:"hidden"}}>
            <div style={{width:`${barPct}%`, height:"100%", background:"#2f80ed", transition:"width .2s ease"}}/>
          </div>
          <span style={{fontSize:12, color:"#555"}}>Enriching… {enrichProgress.done}/{enrichProgress.total}</span>
        </div>
      )}

      {!TMDB_KEY && (
        <p style={{background:"#fff7ed", border:"1px solid #fed7aa", padding:8, borderRadius:8}}>
          Add your TMDB key to <code>.env</code> as <code>VITE_TMDB_API_KEY=…</code> then restart.
        </p>
      )}

      {/* Controls */}
      <div style={{display:"none"}}>
        <label style={{display:"none"}}>
          <input type="file" accept=".xlsx,.xls" onChange={onUpload} />
          <span>Upload Excel</span>
        </label>

        {Object.keys(sheets).length > 0 && (
          <>
            <select value={sheetName} onChange={(e) => setSheetName(e.target.value)} title="Switch sheet"
                    style={{border:"1px solid #e5e7eb", padding:"6px 10px", borderRadius:8}}>
              {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
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
                    style={{display:"none"}}>
                      💾 Export XLSX</button>

            <div style={{flex:"1 1 auto"}} />

            <button onClick={() => openDiscover()} disabled={isLoadingDiscover || !TMDB_KEY}
                    title="Discover more"
                    style={{border:"1px solid #c7d2fe", background:"#eef2ff", padding:"6px 10px", borderRadius:8, cursor:"pointer"}}>
              🔎 Search all films
            </button>
            <button onClick={enrichVisible} disabled={!filtered.length || isEnriching || !TMDB_KEY}
                    title="Fetch runtime, cast, synopsis, ratings & Where to Watch (UK)"
                    style={{display:"none"}}>
              {isEnriching ? `Enriching… ${enrichProgress.done}/${enrichProgress.total}` : "✨ Enrich visible (incl. Where to Watch)"}
            </button>

            <div style={{display:"inline-flex", gap:8, marginLeft:8}}>
              <label style={{display:"inline-flex", gap:6}}>
                <input type="radio" name="view" value="cards" checked={view==="cards"} onChange={()=>setView("cards")} /> Cards
              </label>
              <label style={{display:"inline-flex", gap:6}}>
                <input type="radio" name="view" value="table" checked={view==="table"} onChange={()=>setView("table")} /> Table
              </label>
            </div>
          </>
        )}
      </div>

      {/* Cards */}
      {false && view === "cards" && !!filtered.length && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(360px, 1fr))", gap:12}}>
          {filtered.map((row) => (
            <CardItem
              key={(row.Title || "?") + "__" + (row.Year || "") + "__" + (isTVSheet ? "tv" : "movie")}
              row={row}
              isTVSheet={isTVSheet}
              onDelete={removeRow}
              onToggleWatched={toggleWatched}
              onRefreshProviders={refreshProvidersFor}
            />
          ))}
        </div>
      )}

      {/* Table */}
    {false && view === "table" && (
        <>
          {filtered.length ? (
            <div style={{overflow:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} onClick={() => onSort(h)}
                          style={{textAlign:"left", padding:"8px 6px", borderBottom:"1px solid #e5e7eb", cursor:"pointer", whiteSpace:"nowrap"}}>
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
						  if (h === "Where to Watch (UK)") {
							  return (
								<td key={h} style={{padding:"8px 6px"}}>
								  <ProviderLinks text={(row[h] ?? "").toString()} />
								</td>
							  );
							}
                        if (h === "Actions") {
                          return (
                            <td key={h} style={{padding:"8px 6px", whiteSpace:"nowrap"}}>
                              <button onClick={() => refreshProvidersFor(row["Title"], row["Year"], isTVSheet)}
                                      title="Refresh Where to Watch"
                                      style={{border:"1px solid #dbeafe", background:"#eff6ff", padding:"4px 8px", borderRadius:8, cursor:"pointer", marginRight:6}}>🔄</button>
                              <button onClick={() => toggleWatched(row["Title"], row["Year"])}
                                      style={{border:"1px solid #e5e7eb", padding:"4px 8px", borderRadius:8, cursor:"pointer", marginRight:6}}>
                                {row.Watched ? "Unwatch" : "Watched"}
                              </button>
                              <button onClick={() => removeRow(row["Title"], row["Year"])}
                                      style={{border:"1px solid #f3c1c1", background:"#ffe9e9", padding:"4px 8px", borderRadius:8, cursor:"pointer"}}>Remove</button>
                            </td>
                          );
                        }
                        if (h === "Watched") {
                          return (
                            <td key={h} style={{padding:"8px 6px"}}>
                              <input type="checkbox" checked={!!row.Watched} onChange={()=>toggleWatched(row["Title"], row["Year"])} />
                            </td>
                          );
                        }
                        if (h === "IMDb Link") {
                          return (
                            <td key={h} style={{padding:"8px 6px"}}>
                              <ImdbLinkCell title={row["Title"]} year={row["Year"]} isTVSheet={isTVSheet} fallbackUrl={(row[h] ?? "").toString()} />
                            </td>
                          );
                        }
                        const v = row[h]; const s = (v ?? "").toString();
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

      {false && !filtered.length && (
        <div style={{color:"#666"}}>
          Upload your Excel to begin, or use the Load button above to pull a saved list.
        </div>
      )}

{/* Discover modal */}
{showDiscover && (
  <div
    onClick={closeDiscover}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 1000,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(100%,980px)",
        maxHeight: "88vh",
        overflow: "auto",
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid #eee",
        }}
      >
        <b>Search all films</b>
        <button
          onClick={closeDiscover}
          title="Close"
          style={{ cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 8, padding: "4px 8px" }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid #eee",
          flexWrap: "wrap",
        }}
      >
        <input
          placeholder="Search for any film..."
          value={discoverQuery}
          onChange={(e) => setDiscoverQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchDiscover(discoverQuery);
          }}
          style={{ border: "1px solid #e5e7eb", padding: "8px 12px", borderRadius: 10, flex: "1 1 320px" }}
        />
        <button
          onClick={() => searchDiscover(discoverQuery)}
          style={{
            border: "1px solid #c7d2fe",
            background: "#eef2ff",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </div>

      <div style={{ padding: 14 }}>
        {isLoadingDiscover && <div>Loading…</div>}
        {!isLoadingDiscover && !discover.length && (
          <div style={{ color: "#666" }}>Type a search and press Enter.</div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {discover.map((d) => {
            const key = `${d.title}__${d.year}`;
            const isAdding = addingKey === String(d.id);
            const exists = watchlistTmdbIds.has(d.id);
            const isFavourite = favouriteTmdbIds.has(d.id);

            return (
              <div
                key={key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr",
                  gap: 12,
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                }}
              >
                <img
                  src={
                    d.poster ||
                    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
                  }
                  alt={d.title}
                  style={{
                    width: 100,
                    height: 150,
                    objectFit: "cover",
                    borderRadius: 8,
                    background: "#f4f4f4",
                  }}
                  loading="lazy"
                />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>
                      {d.title}{" "}
                      {d.year ? (
                        <span style={{ opacity: 0.65, fontWeight: 500 }}>({d.year})</span>
                      ) : null}
                    </div>
                    {exists && (
                      <span
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 16,
                          background: "#ecfdf5",
                          border: "1px solid #d1fae5",
                          color: "#065f46",
                        }}
                      >
                        Already in list
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>TMDB</div>
                  <div style={{ marginTop: 8 }}>
  {exists ? (
    <button
      disabled
      style={{
        border: "1px solid #e5e7eb",
        padding: "6px 10px",
        borderRadius: 8,
      }}
    >
      Added ✓
    </button>
  ) : (
    <button
      onClick={() => saveDiscoveredFilm(d)}
      disabled={isAdding}
      style={{
        border: "1px solid #e5e7eb",
        padding: "6px 10px",
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      {isAdding ? "Adding…" : "Add"}
    </button>
  )}

  <div style={{ marginTop: 8 }}>
    {isFavourite ? (
      <button
        disabled
        style={{
          border: "1px solid #fecdd3",
          background: "#fff1f2",
          padding: "6px 10px",
          borderRadius: 8,
        }}
      >
        ♥ Favourite
      </button>
    ) : (
      <button
        onClick={() => saveFavouriteFilm(d)}
        style={{
          border: "1px solid #fecdd3",
          background: "#fff",
          padding: "6px 10px",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        ♡ Favourite
      </button>
    )}
  </div>
</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #eee",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          onClick={closeDiscover}
          style={{ border: "1px solid #e5e7eb", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}



      {/* Toast */}
      {toast && (
        <div onClick={() => setToast(null)} style={{
          position:"fixed", right:14, bottom:14, zIndex:1000,
          background:"#0f766e", color:"#fff", padding:"10px 14px", borderRadius:8,
          boxShadow:"0 8px 24px rgba(0,0,0,0.2)", cursor:"pointer"
        }}>
          {toast.text}
        </div>
      )}

      {/* Floating Discover button (handy on mobile) */}
      {Object.keys(sheets).length > 0 && (
        <div style={{position:"fixed", right:16, bottom:16, zIndex:999}}>
          <button onClick={() => openDiscover()} disabled={!TMDB_KEY}
                  title="Discover more"
                  style={{border:"1px solid #c7d2fe", background:"#eef2ff", padding:"10px 12px", borderRadius:999, cursor:"pointer", boxShadow:"0 6px 18px rgba(0,0,0,.12)"}}>
            🔎
          </button>
        </div>
      )}
    </div>
  );
}


export default function App() {
  let shareToken = "";

  try {
    const params = new URLSearchParams(window.location.search);
    shareToken = String(params.get("share") || "").trim();
  } catch {
    shareToken = "";
  }

  if (shareToken) {
    return <SharedList supabase={supabase} token={shareToken} />;
  }

  return <MainApp />;
}
