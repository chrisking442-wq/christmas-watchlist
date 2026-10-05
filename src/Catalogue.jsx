import React, { useEffect, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";

const AVAILABILITY_CACHE_MS = 24 * 60 * 60 * 1000;

const PLATFORM_FILTERS = [
  "",
  "Netflix",
  "Disney+",
  "Prime Video",
  "ITVX",
  "BBC iPlayer",
  "NOW",
  "Channel 4",
];

function normaliseProviderName(name = "") {
  const direct = {
    "Amazon Prime Video": "Prime Video",
    "Amazon Prime Video with Ads": "Prime Video",
    "Netflix basic with Ads": "Netflix",
    "Netflix Standard with Ads": "Netflix",
    "Netflix Kids": "Netflix",
    "Disney Plus": "Disney+",
    "Paramount Plus": "Paramount+",
    "Apple TV Plus": "Apple TV+",
    "Sky Go": "Sky Go",
    "Apple TV Amazon Channel": "Apple TV (Prime Video Channel)",
  };

  if (direct[name]) return direct[name];

  if (name.endsWith(" Amazon Channel")) {
    return `${name.replace(/ Amazon Channel$/, "")} (Prime Video Channel)`;
  }

  return name;
}

function uniqueProviders(providers = []) {
  const seen = new Set();

  return providers.filter((provider) => {
    const key = normaliseProviderName(provider.provider_name || "");

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function chunk(items, size) {
  const result = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

function formatCheckedAt(value) {
  if (!value) return "";

  const checked = new Date(value);

  if (Number.isNaN(checked.getTime())) return "";

  const today = new Date();

  const sameDay =
    checked.getFullYear() === today.getFullYear() &&
    checked.getMonth() === today.getMonth() &&
    checked.getDate() === today.getDate();

  if (sameDay) return "Checked today";

  return `Checked ${checked.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })}`;
}

function ProviderBadges({ providers, max = 2, compact = false }) {
  const visible = uniqueProviders(providers).slice(0, max);

  if (!visible.length) return null;

  return (
    <div className="cit-provider-row">
      {visible.map((provider) => (
        <span
          key={provider.provider_id || provider.provider_name}
          className={`cit-provider-badge ${
            compact ? "cit-provider-badge--compact" : ""
          }`}
        >
          {provider.logo_path ? (
            <img
              src={`${TMDB_IMG}/w45${provider.logo_path}`}
              alt=""
              aria-hidden="true"
            />
          ) : null}

          <span>{normaliseProviderName(provider.provider_name)}</span>
        </span>
      ))}
    </div>
  );
}

export default function Catalogue({
  supabase,
  refreshKey,
  session,
  watchlistTmdbIds,
  favouriteTmdbIds,
  onWatchlistAdded,
  onFavouriteAdded,
}) {
  const [films, setFilms] = useState([]);
  const [search, setSearch] = useState("");
  const [decade, setDecade] = useState("");
  const [platform, setPlatform] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [alertFilmIds, setAlertFilmIds] = useState(new Set());
  const [alertSavingFilmIds, setAlertSavingFilmIds] = useState(new Set());
  const [watchedByFilmId, setWatchedByFilmId] = useState({});
  const [savingWatchedFilmIds, setSavingWatchedFilmIds] = useState(new Set());

  const [watchProviders, setWatchProviders] = useState({});
  const [availabilityCheckedAt, setAvailabilityCheckedAt] = useState({});
  const [loadingProviders, setLoadingProviders] = useState(new Set());
  const [expandedProviders, setExpandedProviders] = useState(new Set());
  const [providerErrors, setProviderErrors] = useState({});

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    async function loadCatalogue() {
      setLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("v2_catalogue_entries")
        .select(`
          classification,
          v2_films (
            id,
            tmdb_id,
            title,
            original_title,
            release_date,
            release_year,
            overview,
            poster_path,
            backdrop_path
          )
        `)
        .eq("status", "included");

      if (cancelled) return;

      if (loadError) {
        console.error(loadError);
        setError(loadError.message);
        setFilms([]);
        setLoading(false);
        return;
      }

      const rows = (data || [])
        .map((row) => ({
          classification: row.classification,
          ...row.v2_films,
        }))
        .filter((row) => row.id)
        .sort((a, b) =>
          (a.title || "").localeCompare(b.title || "")
        );

      setFilms(rows);

      const filmIds = rows.map((film) => film.id).filter(Boolean);
      const filmById = new Map(
        rows.map((film) => [String(film.id), film])
      );

      const cachedRows = [];

      for (const ids of chunk(filmIds, 150)) {
        const { data: availabilityData, error: availabilityError } =
          await supabase
            .from("v2_streaming_availability")
            .select(`
              film_id,
              provider_id,
              provider_name,
              provider_type,
              logo_path,
              watch_url,
              checked_at
            `)
            .eq("region", "GB")
            .in("film_id", ids);

        if (availabilityError) {
          console.warn(
            "Couldn't load cached streaming availability:",
            availabilityError
          );
          break;
        }

        cachedRows.push(...(availabilityData || []));
      }

      if (!cancelled && cachedRows.length) {
        const providerMap = {};
        const checkedMap = {};

        for (const row of cachedRows) {
          const film = filmById.get(String(row.film_id));

          if (!film?.tmdb_id) continue;

          const key = film.tmdb_id;

          if (!providerMap[key]) {
            providerMap[key] = {
              flatrate: [],
              free: [],
              ads: [],
              link: row.watch_url || null,
            };
          }

          if (
            !checkedMap[key] ||
            new Date(row.checked_at) > new Date(checkedMap[key])
          ) {
            checkedMap[key] = row.checked_at;
          }

          if (row.provider_type === "none") {
            continue;
          }

          const provider = {
            provider_id: row.provider_id,
            provider_name: normaliseProviderName(row.provider_name),
            logo_path: row.logo_path,
          };

          if (row.provider_type === "subscription") {
            providerMap[key].flatrate.push(provider);
          } else if (row.provider_type === "free") {
            providerMap[key].free.push(provider);
          } else if (row.provider_type === "ads") {
            providerMap[key].ads.push(provider);
          }

          if (!providerMap[key].link && row.watch_url) {
            providerMap[key].link = row.watch_url;
          }
        }

        setWatchProviders(providerMap);
        setAvailabilityCheckedAt(checkedMap);
      }

      setLoading(false);
    }

    loadCatalogue();

    return () => {
      cancelled = true;
    };
  }, [supabase, refreshKey]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setAlertFilmIds(new Set());
      return;
    }

    let cancelled = false;

    async function loadAvailabilityAlerts() {
      const { data, error } = await supabase
        .from("v2_availability_alerts")
        .select("film_id")
        .eq("user_id", session.user.id)
        .eq("active", true);

      if (cancelled) return;

      if (error) {
        console.error("Couldn't load availability alerts:", error);
        return;
      }

      setAlertFilmIds(
        new Set((data || []).map((row) => String(row.film_id)))
      );
    }

    loadAvailabilityAlerts();

    return () => {
      cancelled = true;
    };
  }, [supabase, session]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setWatchedByFilmId({});
      return;
    }

    let cancelled = false;

    async function loadViewingHistory() {
      const { data, error } = await supabase
        .from("v2_viewing_events")
        .select("film_id, watched_at")
        .eq("user_id", session.user.id)
        .order("watched_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Couldn't load viewing history:", error);
        return;
      }

      const latestByFilm = {};

      for (const row of data || []) {
        const key = String(row.film_id);

        if (!latestByFilm[key]) {
          latestByFilm[key] = row.watched_at;
        }
      }

      setWatchedByFilmId(latestByFilm);
    }

    loadViewingHistory();

    return () => {
      cancelled = true;
    };
  }, [supabase, session]);

  useEffect(() => {
    if (!selectedFilm) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSelectedFilm(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedFilm]);

  function isAvailabilityFresh(tmdbId) {
    const checkedAt = availabilityCheckedAt[tmdbId];

    if (!checkedAt) return false;

    const checkedMs = Date.parse(checkedAt);

    if (!Number.isFinite(checkedMs)) return false;

    return Date.now() - checkedMs < AVAILABILITY_CACHE_MS;
  }

  function toggleExpanded(tmdbId, open) {
    setExpandedProviders((prev) => {
      const next = new Set(prev);

      if (open) next.add(tmdbId);
      else next.delete(tmdbId);

      return next;
    });
  }

  async function refreshWatchProviders(film) {
    if (!film?.tmdb_id || !TMDB_KEY) return;

    if (loadingProviders.has(film.tmdb_id)) return;

    setLoadingProviders((prev) => {
      const next = new Set(prev);
      next.add(film.tmdb_id);
      return next;
    });

    setProviderErrors((prev) => ({
      ...prev,
      [film.tmdb_id]: "",
    }));

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${film.tmdb_id}/watch/providers?api_key=${TMDB_KEY}`
      );

      if (!response.ok) {
        throw new Error(`TMDB request failed (${response.status})`);
      }

      const data = await response.json();

      const ukProviders = data?.results?.GB || {
        flatrate: [],
        free: [],
        ads: [],
        link: null,
      };

      const normalised = {
        flatrate: uniqueProviders(
          (ukProviders.flatrate || []).map((provider) => ({
            ...provider,
            provider_name: normaliseProviderName(provider.provider_name),
          }))
        ),
        free: uniqueProviders(
          (ukProviders.free || []).map((provider) => ({
            ...provider,
            provider_name: normaliseProviderName(provider.provider_name),
          }))
        ),
        ads: uniqueProviders(
          (ukProviders.ads || []).map((provider) => ({
            ...provider,
            provider_name: normaliseProviderName(provider.provider_name),
          }))
        ),
        link: ukProviders.link || null,
      };

      const nowIso = new Date().toISOString();

      setWatchProviders((prev) => ({
        ...prev,
        [film.tmdb_id]: normalised,
      }));

      setAvailabilityCheckedAt((prev) => ({
        ...prev,
        [film.tmdb_id]: nowIso,
      }));

      toggleExpanded(film.tmdb_id, true);

      const providerRows = [
        ...normalised.flatrate.map((provider) => ({
          provider_id: provider.provider_id ?? null,
          provider_name: provider.provider_name,
          provider_type: "subscription",
          logo_path: provider.logo_path || null,
          watch_url: normalised.link || null,
        })),
        ...normalised.free.map((provider) => ({
          provider_id: provider.provider_id ?? null,
          provider_name: provider.provider_name,
          provider_type: "free",
          logo_path: provider.logo_path || null,
          watch_url: normalised.link || null,
        })),
        ...normalised.ads.map((provider) => ({
          provider_id: provider.provider_id ?? null,
          provider_name: provider.provider_name,
          provider_type: "ads",
          logo_path: provider.logo_path || null,
          watch_url: normalised.link || null,
        })),
      ];

      const { error: cacheError } = await supabase.rpc(
        "v2_replace_streaming_availability",
        {
          p_film_id: film.id,
          p_providers: providerRows,
        }
      );

      if (cacheError) {
        console.warn(
          "Availability loaded, but couldn't cache it:",
          cacheError
        );
      }
    } catch (providerError) {
      console.error("Failed to load UK providers:", providerError);

      setProviderErrors((prev) => ({
        ...prev,
        [film.tmdb_id]:
          "Couldn't refresh UK availability right now.",
      }));

      toggleExpanded(film.tmdb_id, true);
    } finally {
      setLoadingProviders((prev) => {
        const next = new Set(prev);
        next.delete(film.tmdb_id);
        return next;
      });
    }
  }

  async function handleWhereToWatch(film) {
    const tmdbId = film.tmdb_id;

    if (expandedProviders.has(tmdbId)) {
      toggleExpanded(tmdbId, false);
      return;
    }

    if (isAvailabilityFresh(tmdbId)) {
      toggleExpanded(tmdbId, true);
      return;
    }

    await refreshWatchProviders(film);
  }

  async function toggleAvailabilityAlert(film) {
    if (!film?.id || !session?.user) {
      alert("Sign in to create availability alerts.");
      return;
    }

    const key = String(film.id);
    const active = alertFilmIds.has(key);

    setAlertSavingFilmIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      if (active) {
        const { error } = await supabase
          .from("v2_availability_alerts")
          .delete()
          .eq("user_id", session.user.id)
          .eq("film_id", film.id);

        if (error) throw error;

        setAlertFilmIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("v2_availability_alerts")
          .upsert(
            {
              user_id: session.user.id,
              film_id: film.id,
              active: true,
              last_notified_at: null,
            },
            {
              onConflict: "user_id,film_id",
            }
          );

        if (error) throw error;

        setAlertFilmIds((prev) => {
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      }
    } catch (alertError) {
      console.error(alertError);
      alert(
        "Couldn't update the availability alert: " +
          alertError.message
      );
    } finally {
      setAlertSavingFilmIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function formatWatchedDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  async function markAsWatched(film) {
    if (!film?.id || !session?.user) {
      alert("Sign in to mark films as watched.");
      return;
    }

    const key = String(film.id);

    if (watchedByFilmId[key] || savingWatchedFilmIds.has(key)) {
      return;
    }

    setSavingWatchedFilmIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      const { data, error } = await supabase
        .from("v2_viewing_events")
        .insert({
          user_id: session.user.id,
          film_id: film.id,
        })
        .select("watched_at")
        .single();

      if (error) throw error;

      setWatchedByFilmId((prev) => ({
        ...prev,
        [key]: data?.watched_at || new Date().toISOString(),
      }));
    } catch (watchedError) {
      console.error(watchedError);
      alert("Couldn't mark the film as watched: " + watchedError.message);
    } finally {
      setSavingWatchedFilmIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function addToWatchlist(film) {
    if (!session?.user) {
      alert("Sign in to save films.");
      return;
    }

    const { error: saveError } = await supabase.rpc(
      "v2_save_film_to_special_list",
      {
        p_list_type: "watchlist",
        p_tmdb_id: film.tmdb_id,
        p_title: film.title,
        p_original_title: film.original_title || null,
        p_release_date:
          film.release_date ||
          (film.release_year ? `${film.release_year}-01-01` : null),
        p_overview: film.overview || null,
        p_poster_path: film.poster_path || null,
        p_backdrop_path: film.backdrop_path || null,
      }
    );

    if (saveError) {
      console.error(saveError);
      alert("Couldn't add film: " + saveError.message);
      return;
    }

    onWatchlistAdded?.(film.tmdb_id);
  }

  async function addToFavourites(film) {
    if (!session?.user) {
      alert("Sign in to save favourites.");
      return;
    }

    const { error: saveError } = await supabase.rpc(
      "v2_save_film_to_special_list",
      {
        p_list_type: "favourites",
        p_tmdb_id: film.tmdb_id,
        p_title: film.title,
        p_original_title: film.original_title || null,
        p_release_date:
          film.release_date ||
          (film.release_year ? `${film.release_year}-01-01` : null),
        p_overview: film.overview || null,
        p_poster_path: film.poster_path || null,
        p_backdrop_path: film.backdrop_path || null,
      }
    );

    if (saveError) {
      console.error(saveError);
      alert("Couldn't add favourite: " + saveError.message);
      return;
    }

    onFavouriteAdded?.(film.tmdb_id);
  }

  function getAllProviders(film) {
    const providerData = watchProviders[film.tmdb_id];

    if (!providerData) return [];

    return uniqueProviders([
      ...(providerData.flatrate || []),
      ...(providerData.free || []),
      ...(providerData.ads || []),
    ]);
  }

  function filmMatchesPlatform(film, selectedPlatform) {
    if (!selectedPlatform) return true;

    return getAllProviders(film).some(
      (provider) =>
        normaliseProviderName(provider.provider_name) === selectedPlatform
    );
  }

  const filteredFilms = films.filter((film) => {
    const q = search.trim().toLowerCase();

    const matchesSearch =
      !q || (film.title || "").toLowerCase().includes(q);

    const year = Number(film.release_year) || 0;

    const matchesDecade =
      !decade ||
      (year >= Number(decade) && year < Number(decade) + 10);

    const matchesPlatform = filmMatchesPlatform(film, platform);

    return matchesSearch && matchesDecade && matchesPlatform;
  });

  return (
    <div className="cit-catalogue">
      <style>{`
        .cit-catalogue {
          margin-bottom: 28px;
        }

        .cit-catalogue-toolbar {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
        }

        .cit-catalogue-search {
          width: 100%;
          min-width: 0;
          border: 1px solid #d8d3ca;
          background: rgba(255, 255, 255, 0.9);
          color: #18382f;
          padding: 12px 14px;
          border-radius: 11px;
          outline: none;
          box-sizing: border-box;
          box-shadow: 0 1px 2px rgba(28, 42, 35, 0.03);
        }

        .cit-catalogue-search:focus {
          border-color: #6e8e82;
          box-shadow: 0 0 0 3px rgba(18, 59, 45, 0.08);
        }

        .cit-decade-select {
          border: 1px solid #d8d3ca;
          background: #fff;
          color: #28483e;
          padding: 11px 12px;
          border-radius: 10px;
          cursor: pointer;
        }

        .cit-platform-filters {
          display: flex;
          gap: 7px;
          overflow-x: auto;
          padding: 1px 1px 8px;
          margin-bottom: 5px;
          scrollbar-width: none;
        }

        .cit-platform-filters::-webkit-scrollbar {
          display: none;
        }

        .cit-filter-chip {
          flex: 0 0 auto;
          border: 1px solid #d8d3ca;
          background: rgba(255,255,255,.72);
          color: #40574f;
          border-radius: 999px;
          padding: 7px 11px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 650;
        }

        .cit-filter-chip:hover {
          border-color: #9badA5;
          color: #123b2d;
        }

        .cit-filter-chip--active {
          border-color: #123b2d;
          background: #123b2d;
          color: #fff;
        }

        .cit-filter-chip--active:hover {
          color: #fff;
        }

        .cit-catalogue-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          min-height: 24px;
          margin-bottom: 12px;
          color: #68756f;
          font-size: 12px;
        }

        .cit-clear-link {
          border: 0;
          background: transparent;
          color: #8d2525;
          padding: 0;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }

        .cit-film-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .cit-film-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid #e2ddd4;
          border-radius: 14px;
          background: rgba(255,255,255,.9);
          box-shadow: 0 3px 12px rgba(32, 43, 37, 0.045);
          transition:
            transform .16s ease,
            box-shadow .16s ease,
            border-color .16s ease;
        }

        .cit-film-card:hover {
          transform: translateY(-2px);
          border-color: #d1cbbf;
          box-shadow: 0 9px 22px rgba(32, 43, 37, 0.08);
        }

        .cit-poster-wrap {
          position: relative;
          aspect-ratio: 2 / 3;
          overflow: hidden;
          background: #eae6df;
        }

        .cit-poster {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cit-poster-placeholder {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #7b837f;
          font-size: 12px;
        }

        .cit-watched-badge {
          position: absolute;
          left: 9px;
          bottom: 9px;
          z-index: 2;
          border: 1px solid rgba(255,255,255,.78);
          border-radius: 999px;
          background: rgba(18,59,45,.93);
          color: #fff;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 800;
          box-shadow: 0 3px 10px rgba(0,0,0,.12);
          backdrop-filter: blur(8px);
        }

        .cit-heart {
          position: absolute;
          top: 9px;
          right: 9px;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.78);
          background: rgba(255,255,255,.92);
          color: #8f2730;
          display: grid;
          place-items: center;
          cursor: pointer;
          font-size: 18px;
          box-shadow: 0 3px 10px rgba(0,0,0,.12);
          backdrop-filter: blur(8px);
        }

        .cit-heart[disabled] {
          cursor: default;
          background: rgba(255,244,245,.94);
        }

        .cit-card-body {
          padding: 11px 11px 12px;
        }

        .cit-card-title {
          color: #18382f;
          font-size: 15px;
          font-weight: 780;
          line-height: 1.25;
          min-height: 38px;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }

        .cit-card-meta {
          margin-top: 4px;
          color: #7b837f;
          font-size: 11px;
          min-height: 16px;
        }

        .cit-provider-summary {
          min-height: 34px;
          margin-top: 9px;
        }

        .cit-provider-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .cit-provider-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          border: 1px solid #e0ddd6;
          background: #fff;
          color: #405149;
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 10px;
          line-height: 1;
        }

        .cit-provider-badge img {
          width: 17px;
          height: 17px;
          border-radius: 4px;
          object-fit: cover;
          flex: 0 0 auto;
        }

        .cit-provider-badge span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cit-not-streaming {
          color: #868d89;
          font-size: 11px;
          line-height: 1.35;
        }

        .cit-card-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 7px;
          margin-top: 11px;
        }

        .cit-my-list {
          width: 100%;
          border: 1px solid #123b2d;
          background: #123b2d;
          color: white;
          border-radius: 9px;
          padding: 8px 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
        }

        .cit-my-list:hover {
          background: #0d3024;
        }

        .cit-my-list--added {
          border-color: #c9d8d0;
          background: #edf5f1;
          color: #295342;
          cursor: default;
        }

        .cit-watch-button {
          border: 0;
          background: transparent;
          color: #53665e;
          padding: 3px 0 0;
          cursor: pointer;
          font-size: 11px;
          text-align: left;
          font-weight: 650;
        }

        .cit-watch-button:hover {
          color: #123b2d;
          text-decoration: underline;
        }

        .cit-availability {
          margin-top: 10px;
          padding: 9px;
          border: 1px solid #e2ded6;
          border-radius: 10px;
          background: #f8f6f2;
        }

        .cit-availability-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 7px;
          font-size: 11px;
          font-weight: 800;
          color: #28483e;
        }

        .cit-refresh-link {
          border: 0;
          background: transparent;
          padding: 0;
          color: #65766f;
          cursor: pointer;
          font-size: 10px;
        }

        .cit-provider-section + .cit-provider-section {
          margin-top: 8px;
        }

        .cit-provider-label {
          margin-bottom: 5px;
          color: #7d8581;
          font-size: 10px;
        }

        .cit-provider-badge--compact {
          max-width: 100%;
        }

        .cit-watch-link {
          display: inline-block;
          margin-top: 8px;
          color: #244f40;
          font-size: 11px;
          font-weight: 700;
        }

        .cit-checked {
          margin-top: 6px;
          color: #929793;
          font-size: 9px;
        }

        .cit-status-message {
          padding: 20px 0;
          color: #6f7974;
          font-size: 13px;
        }

        .cit-film-card {
          cursor: pointer;
        }

        .cit-film-card:focus-visible {
          outline: 3px solid rgba(18, 59, 45, 0.18);
          outline-offset: 3px;
        }

        .cit-detail-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 22px;
          background: rgba(22, 30, 26, 0.54);
          backdrop-filter: blur(6px);
        }

        .cit-detail-modal {
          position: relative;
          width: min(920px, 100%);
          max-height: min(88vh, 860px);
          overflow: auto;
          border: 1px solid #ddd8cf;
          border-radius: 18px;
          background: #fbfaf7;
          box-shadow: 0 24px 70px rgba(14, 23, 19, 0.28);
        }

        .cit-detail-hero {
          position: relative;
          min-height: 170px;
          overflow: hidden;
          border-radius: 18px 18px 0 0;
          background: #e8e4dd;
        }

        .cit-detail-backdrop {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cit-detail-shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              90deg,
              rgba(20, 31, 26, 0.78) 0%,
              rgba(20, 31, 26, 0.48) 48%,
              rgba(20, 31, 26, 0.22) 100%
            );
        }

        .cit-detail-heading {
          position: relative;
          z-index: 1;
          max-width: 600px;
          padding: 42px 58px 34px 34px;
          color: #fff;
        }

        .cit-detail-heading h2 {
          margin: 0;
          font-size: clamp(28px, 4vw, 42px);
          line-height: 1.04;
          letter-spacing: -0.04em;
        }

        .cit-detail-heading-meta {
          margin-top: 8px;
          color: rgba(255,255,255,.82);
          font-size: 13px;
        }

        .cit-detail-close {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 3;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 999px;
          background: rgba(255,255,255,.92);
          color: #173a2e;
          cursor: pointer;
          font-size: 18px;
          box-shadow: 0 4px 14px rgba(0,0,0,.12);
        }

        .cit-detail-content {
          display: grid;
          grid-template-columns: 210px minmax(0, 1fr);
          gap: 24px;
          padding: 24px;
        }

        .cit-detail-poster {
          width: 100%;
          aspect-ratio: 2 / 3;
          object-fit: cover;
          border-radius: 12px;
          background: #eae6df;
          box-shadow: 0 8px 20px rgba(31, 39, 35, 0.11);
        }

        .cit-detail-copy {
          min-width: 0;
        }

        .cit-detail-overview {
          margin: 0;
          color: #44554e;
          font-size: 14px;
          line-height: 1.65;
        }

        .cit-detail-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 12px;
          margin: 0 0 14px;
          color: #77827d;
          font-size: 11px;
        }

        .cit-detail-metadata span + span::before {
          content: "·";
          margin-right: 12px;
          color: #b0b5b2;
        }

        .cit-detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 18px;
        }

        .cit-detail-primary,
        .cit-detail-secondary {
          border-radius: 9px;
          padding: 9px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
        }

        .cit-detail-primary {
          border: 1px solid #123b2d;
          background: #123b2d;
          color: #fff;
        }

        .cit-detail-primary[disabled] {
          border-color: #c9d8d0;
          background: #edf5f1;
          color: #295342;
          cursor: default;
        }

        .cit-detail-secondary {
          border: 1px solid #d8d3ca;
          background: #fff;
          color: #40574f;
        }

        .cit-detail-watched {
          border: 1px solid #b8d1c4;
          background: #eef7f2;
          color: #28513f;
          border-radius: 9px;
          padding: 9px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
        }

        .cit-detail-watched[disabled] {
          cursor: default;
          background: #edf5f1;
        }

        .cit-detail-watched-date {
          margin-top: 6px;
          color: #7c8681;
          font-size: 10px;
        }

        .cit-detail-secondary[disabled] {
          background: #fff4f5;
          color: #8f2730;
          cursor: default;
        }

        .cit-detail-watch {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #e5e0d8;
        }

        .cit-detail-watch h3 {
          margin: 0 0 10px;
          color: #18382f;
          font-size: 15px;
        }

        .cit-detail-watch-grid {
          display: grid;
          gap: 12px;
        }

        .cit-detail-provider-group {
          padding: 10px 11px;
          border: 1px solid #e1ddd5;
          border-radius: 10px;
          background: rgba(255,255,255,.7);
        }

        .cit-detail-provider-label {
          margin-bottom: 7px;
          color: #7b847f;
          font-size: 10px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: .05em;
        }

        .cit-detail-no-streaming {
          color: #6f7974;
          font-size: 13px;
          line-height: 1.45;
        }

        .cit-detail-alert-button {
          margin-top: 10px;
          border: 1px solid #a9cdb7;
          background: #f4fbf6;
          color: #23513b;
          padding: 8px 10px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 750;
        }

        .cit-detail-alert-button--active {
          border-color: #83bd98;
          background: #eaf7ee;
        }

        .cit-detail-alert-button[disabled] {
          cursor: wait;
          opacity: .7;
        }

        .cit-detail-footer-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 12px;
          flex-wrap: wrap;
          color: #969c98;
          font-size: 10px;
        }

        .cit-detail-refresh {
          border: 0;
          background: transparent;
          color: #6f7e77;
          padding: 0;
          cursor: pointer;
          font-size: 10px;
          font-weight: 650;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .cit-detail-checked {
          color: #969c98;
          font-size: 10px;
        }

        @media (max-width: 1050px) {
          .cit-film-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .cit-catalogue-toolbar {
            grid-template-columns: 1fr;
          }

          .cit-decade-select {
            width: 100%;
          }

          .cit-film-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .cit-film-card {
            border-radius: 12px;
          }

          .cit-card-body {
            padding: 9px 9px 10px;
          }

          .cit-card-title {
            min-height: 36px;
            font-size: 13px;
          }

          .cit-provider-summary {
            min-height: 28px;
          }

          .cit-provider-badge {
            max-width: 100%;
            font-size: 9px;
            padding: 3px 6px;
          }

          .cit-provider-badge img {
            width: 15px;
            height: 15px;
          }

          .cit-my-list {
            font-size: 11px;
            padding: 7px;
          }

          .cit-heart {
            width: 32px;
            height: 32px;
          }

          .cit-detail-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .cit-detail-modal {
            width: 100%;
            max-height: 92vh;
            border-radius: 18px 18px 0 0;
            border-bottom: 0;
          }

          .cit-detail-hero {
            min-height: 145px;
            border-radius: 18px 18px 0 0;
          }

          .cit-detail-heading {
            padding: 46px 54px 24px 18px;
          }

          .cit-detail-content {
            grid-template-columns: 92px minmax(0, 1fr);
            gap: 14px;
            padding: 16px;
          }

          .cit-detail-overview {
            font-size: 12px;
            line-height: 1.55;
          }

          .cit-detail-actions {
            grid-column: 1 / -1;
          }

          .cit-detail-watch {
            grid-column: 1 / -1;
            margin-top: 8px;
          }
        }

        @media (max-width: 360px) {
          .cit-film-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="cit-catalogue-toolbar">
        <input
          className="cit-catalogue-search"
          type="search"
          placeholder="Search Christmas films…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="cit-decade-select"
          value={decade}
          onChange={(e) => setDecade(e.target.value)}
          aria-label="Filter by decade"
        >
          <option value="">All decades</option>
          <option value="2020">2020s</option>
          <option value="2010">2010s</option>
          <option value="2000">2000s</option>
          <option value="1990">1990s</option>
          <option value="1980">1980s</option>
          <option value="1970">1970s</option>
          <option value="1960">1960s</option>
          <option value="1950">1950s</option>
          <option value="1940">1940s</option>
          <option value="1930">1930s</option>
          <option value="1920">1920s</option>
        </select>
      </div>

      <div className="cit-platform-filters">
        {PLATFORM_FILTERS.map((provider) => {
          const label = provider || "All";

          return (
            <button
              key={label}
              type="button"
              className={`cit-filter-chip ${
                platform === provider ? "cit-filter-chip--active" : ""
              }`}
              onClick={() => setPlatform(provider)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="cit-catalogue-meta">
        <span>
          {loading
            ? "Loading catalogue…"
            : error
            ? "Couldn't load catalogue"
            : `${filteredFilms.length} of ${films.length} films`}
        </span>

        {(search || decade || platform) && (
          <button
            type="button"
            className="cit-clear-link"
            onClick={() => {
              setSearch("");
              setDecade("");
              setPlatform("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="cit-status-message">
          Couldn't load catalogue: {error}
        </div>
      )}

      {!loading && !error && films.length === 0 && (
        <div className="cit-status-message">
          The Christmas catalogue is empty at the moment.
        </div>
      )}

      {!loading &&
        !error &&
        films.length > 0 &&
        filteredFilms.length === 0 && (
          <div className="cit-status-message">
            No films match those filters.
          </div>
        )}

      {!loading && !error && filteredFilms.length > 0 && (
        <div className="cit-film-grid">
          {filteredFilms.map((film) => {
            const providerData = watchProviders[film.tmdb_id];
            const isLoadingProviders = loadingProviders.has(film.tmdb_id);
            const isExpanded = expandedProviders.has(film.tmdb_id);
            const providerError = providerErrors[film.tmdb_id];

            const subscriptionProviders = uniqueProviders(
              providerData?.flatrate || []
            );
            const freeProviders = uniqueProviders(
              providerData?.free || []
            );
            const adProviders = uniqueProviders(
              providerData?.ads || []
            );

            const allProviders = uniqueProviders([
              ...subscriptionProviders,
              ...freeProviders,
              ...adProviders,
            ]);

            const hasStreaming = allProviders.length > 0;
            const alreadyAdded = watchlistTmdbIds?.has(film.tmdb_id);
            const isFavourite = favouriteTmdbIds?.has(film.tmdb_id);
            const watchedAt = watchedByFilmId[String(film.id)] || null;

            return (
              <article
                key={film.id}
                className="cit-film-card"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (event.target.closest("button, a")) return;
                  setSelectedFilm(film);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedFilm(film);
                  }
                }}
                aria-label={`View details for ${film.title}`}
              >
                <div className="cit-poster-wrap">
                  {film.poster_path ? (
                    <img
                      className="cit-poster"
                      src={`${TMDB_IMG}/w342${film.poster_path}`}
                      alt={film.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="cit-poster-placeholder">
                      No poster
                    </div>
                  )}

                  {watchedAt && (
                    <span
                      className="cit-watched-badge"
                      title={`Watched ${formatWatchedDate(watchedAt)}`}
                    >
                      ✓ Watched
                    </span>
                  )}

                  <button
                    type="button"
                    className="cit-heart"
                    onClick={() => {
                      if (!isFavourite) addToFavourites(film);
                    }}
                    disabled={isFavourite}
                    aria-label={
                      isFavourite
                        ? `${film.title} is in favourites`
                        : `Add ${film.title} to favourites`
                    }
                    title={
                      isFavourite
                        ? "Favourite"
                        : "Add to favourites"
                    }
                  >
                    {isFavourite ? "♥" : "♡"}
                  </button>
                </div>

                <div className="cit-card-body">
                  <div className="cit-card-title">{film.title}</div>

                  <div className="cit-card-meta">
                    {film.release_year || "Year unknown"}
                    {film.classification === "christmas-adjacent"
                      ? " · Christmas adjacent"
                      : ""}
                  </div>

                  <div className="cit-provider-summary">
                    {hasStreaming ? (
                      <ProviderBadges
                        providers={allProviders}
                        max={2}
                        compact
                      />
                    ) : (
                      <div className="cit-not-streaming">
                        Not currently included with a UK streaming service
                      </div>
                    )}
                  </div>

                  <div className="cit-card-actions">
                    {alreadyAdded ? (
                      <button
                        type="button"
                        className="cit-my-list cit-my-list--added"
                        disabled
                      >
                        ✓ In My List
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cit-my-list"
                        onClick={() => addToWatchlist(film)}
                      >
                        + My List
                      </button>
                    )}

                    <button
                      type="button"
                      className="cit-watch-button"
                      onClick={() => handleWhereToWatch(film)}
                      disabled={isLoadingProviders || !TMDB_KEY}
                    >
                      {isLoadingProviders
                        ? "Checking UK availability…"
                        : isExpanded
                        ? "Hide availability"
                        : "Where to watch"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="cit-availability">
                      <div className="cit-availability-heading">
                        <span>UK availability</span>

                        <button
                          type="button"
                          className="cit-refresh-link"
                          onClick={() => refreshWatchProviders(film)}
                          disabled={isLoadingProviders}
                        >
                          Refresh
                        </button>
                      </div>

                      {providerError ? (
                        <div className="cit-not-streaming">
                          {providerError}
                        </div>
                      ) : !hasStreaming ? (
                        <div className="cit-not-streaming">
                          No subscription, free or ad-supported UK streaming
                          option was found.
                        </div>
                      ) : (
                        <>
                          {subscriptionProviders.length > 0 && (
                            <div className="cit-provider-section">
                              <div className="cit-provider-label">
                                Subscription
                              </div>
                              <ProviderBadges
                                providers={subscriptionProviders}
                                max={10}
                                compact
                              />
                            </div>
                          )}

                          {freeProviders.length > 0 && (
                            <div className="cit-provider-section">
                              <div className="cit-provider-label">
                                Free
                              </div>
                              <ProviderBadges
                                providers={freeProviders}
                                max={10}
                                compact
                              />
                            </div>
                          )}

                          {adProviders.length > 0 && (
                            <div className="cit-provider-section">
                              <div className="cit-provider-label">
                                Free with ads
                              </div>
                              <ProviderBadges
                                providers={adProviders}
                                max={10}
                                compact
                              />
                            </div>
                          )}
                        </>
                      )}

                      {!providerError && providerData?.link && (
                        <a
                          className="cit-watch-link"
                          href={providerData.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View watch options
                        </a>
                      )}

                      {availabilityCheckedAt[film.tmdb_id] && (
                        <div className="cit-checked">
                          {formatCheckedAt(
                            availabilityCheckedAt[film.tmdb_id]
                          )}{" "}
                          · Availability data powered by JustWatch
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedFilm && (() => {
        const providerData = watchProviders[selectedFilm.tmdb_id];

        const subscriptionProviders = uniqueProviders(
          providerData?.flatrate || []
        );
        const freeProviders = uniqueProviders(providerData?.free || []);
        const adProviders = uniqueProviders(providerData?.ads || []);

        const allProviders = uniqueProviders([
          ...subscriptionProviders,
          ...freeProviders,
          ...adProviders,
        ]);

        const hasStreaming = allProviders.length > 0;
        const alreadyAdded = watchlistTmdbIds?.has(selectedFilm.tmdb_id);
        const isFavourite = favouriteTmdbIds?.has(selectedFilm.tmdb_id);
        const isRefreshing = loadingProviders.has(selectedFilm.tmdb_id);
        const alertKey = String(selectedFilm.id || "");
        const alertActive = alertFilmIds.has(alertKey);
        const alertSaving = alertSavingFilmIds.has(alertKey);
        const watchedKey = String(selectedFilm.id || "");
        const watchedAt = watchedByFilmId[watchedKey] || null;
        const savingWatched = savingWatchedFilmIds.has(watchedKey);

        return (
          <div
            className="cit-detail-overlay"
            onClick={() => setSelectedFilm(null)}
          >
            <div
              className="cit-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cit-film-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="cit-detail-hero">
                {selectedFilm.backdrop_path ? (
                  <img
                    className="cit-detail-backdrop"
                    src={`${TMDB_IMG}/w1280${selectedFilm.backdrop_path}`}
                    alt=""
                    aria-hidden="true"
                  />
                ) : null}

                <div className="cit-detail-shade" />

                <button
                  type="button"
                  className="cit-detail-close"
                  onClick={() => setSelectedFilm(null)}
                  aria-label="Close film details"
                >
                  ×
                </button>

                <div className="cit-detail-heading">
                  <h2 id="cit-film-detail-title">
                    {selectedFilm.title}
                  </h2>

                  <div className="cit-detail-heading-meta">
                    {selectedFilm.release_year || "Year unknown"}
                    {selectedFilm.classification === "christmas-adjacent"
                      ? " · Christmas adjacent"
                      : ""}
                  </div>
                </div>
              </div>

              <div className="cit-detail-content">
                <div>
                  {selectedFilm.poster_path ? (
                    <img
                      className="cit-detail-poster"
                      src={`${TMDB_IMG}/w342${selectedFilm.poster_path}`}
                      alt={selectedFilm.title}
                    />
                  ) : (
                    <div className="cit-detail-poster" />
                  )}
                </div>

                <div className="cit-detail-copy">
                  <p className="cit-detail-overview">
                    {selectedFilm.overview ||
                      "No synopsis is available for this film yet."}
                  </p>

                  <div className="cit-detail-actions">
                    <button
                      type="button"
                      className="cit-detail-primary"
                      onClick={() => addToWatchlist(selectedFilm)}
                      disabled={alreadyAdded}
                    >
                      {alreadyAdded
                        ? "✓ In My Christmas List"
                        : "+ My Christmas List"}
                    </button>

                    <button
                      type="button"
                      className="cit-detail-secondary"
                      onClick={() => {
                        if (!isFavourite) {
                          addToFavourites(selectedFilm);
                        }
                      }}
                      disabled={isFavourite}
                    >
                      {isFavourite
                        ? "♥ Favourite"
                        : "♡ Add to Favourites"}
                    </button>

                    <div>
                      <button
                        type="button"
                        className="cit-detail-watched"
                        onClick={() => markAsWatched(selectedFilm)}
                        disabled={!!watchedAt || savingWatched}
                      >
                        {savingWatched
                          ? "Saving…"
                          : watchedAt
                          ? "✓ Watched"
                          : "✓ Mark as watched"}
                      </button>

                      {watchedAt && (
                        <div className="cit-detail-watched-date">
                          Watched {formatWatchedDate(watchedAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="cit-detail-watch">
                    <h3>Where to watch in the UK</h3>

                    {providerErrors[selectedFilm.tmdb_id] ? (
                      <div className="cit-detail-no-streaming">
                        {providerErrors[selectedFilm.tmdb_id]}
                      </div>
                    ) : !hasStreaming ? (
                      <div>
                        <div className="cit-detail-no-streaming">
                          Not currently included with a UK subscription, free or
                          ad-supported streaming service.
                        </div>

                        {session?.user && (
                          <button
                            type="button"
                            className={`cit-detail-alert-button ${
                              alertActive
                                ? "cit-detail-alert-button--active"
                                : ""
                            }`}
                            onClick={() =>
                              toggleAvailabilityAlert(selectedFilm)
                            }
                            disabled={alertSaving}
                          >
                            {alertSaving
                              ? "Saving…"
                              : alertActive
                              ? "🔔 Watching for availability"
                              : "🔔 Tell me when available"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="cit-detail-watch-grid">
                        {subscriptionProviders.length > 0 && (
                          <div className="cit-detail-provider-group">
                            <div className="cit-detail-provider-label">
                              Subscription
                            </div>
                            <ProviderBadges
                              providers={subscriptionProviders}
                              max={12}
                            />
                          </div>
                        )}

                        {freeProviders.length > 0 && (
                          <div className="cit-detail-provider-group">
                            <div className="cit-detail-provider-label">
                              Free
                            </div>
                            <ProviderBadges
                              providers={freeProviders}
                              max={12}
                            />
                          </div>
                        )}

                        {adProviders.length > 0 && (
                          <div className="cit-detail-provider-group">
                            <div className="cit-detail-provider-label">
                              Free with ads
                            </div>
                            <ProviderBadges
                              providers={adProviders}
                              max={12}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {providerData?.link && (
                      <a
                        className="cit-watch-link"
                        href={providerData.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View watch options
                      </a>
                    )}

                    <div className="cit-detail-footer-row">
                      {availabilityCheckedAt[selectedFilm.tmdb_id] && (
                        <span className="cit-detail-checked">
                          {formatCheckedAt(
                            availabilityCheckedAt[selectedFilm.tmdb_id]
                          )}{" "}
                          · JustWatch
                        </span>
                      )}

                      <span>·</span>

                      <button
                        type="button"
                        className="cit-detail-refresh"
                        onClick={() => refreshWatchProviders(selectedFilm)}
                        disabled={isRefreshing || !TMDB_KEY}
                      >
                        {isRefreshing ? "Refreshing…" : "Refresh"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
