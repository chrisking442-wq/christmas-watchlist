import React, { useEffect, useState } from "react";

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";
const AVAILABILITY_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_DELAY_MS = 120;

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);

  url.searchParams.set("api_key", TMDB_KEY);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB request failed (${response.status})`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(items, size) {
  const result = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

function normaliseProviderName(name = "") {
  const direct = {
    "Amazon Prime Video": "Prime Video",
    "Amazon Prime Video with Ads": "Prime Video",
    "Netflix basic with Ads": "Netflix",
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
    // TMDB can return different provider IDs that normalise to the same
    // user-facing provider name (for example Prime Video variants).
    // Our database uniqueness is film + region + provider name + type,
    // so de-duplicate on that same logical key before saving.
    const key = `${normaliseProviderName(
      provider.provider_name || ""
    )}__${provider.provider_type || ""}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function CatalogueAdmin({
  supabase,
  session,
  onCatalogueUpdated,
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const [refreshingCatalogue, setRefreshingCatalogue] = useState(false);
  const [refreshingAvailability, setRefreshingAvailability] =
    useState(false);

  const [catalogueStatus, setCatalogueStatus] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }

    async function checkAdmin() {
      setCheckingAdmin(true);

      const { data, error } = await supabase
        .from("v2_profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      if (error) {
        console.error(error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data?.is_admin);
      }

      setCheckingAdmin(false);
    }

    checkAdmin();
  }, [supabase, session]);

  async function findChristmasKeyword() {
    const result = await tmdb("/search/keyword", {
      query: "christmas",
      page: 1,
    });

    const exact = (result.results || []).find(
      (item) => item.name?.toLowerCase() === "christmas"
    );

    return exact?.id || null;
  }

  async function refreshCatalogue() {
    if (!isAdmin || refreshingCatalogue) return;

    setRefreshingCatalogue(true);
    setCatalogueStatus("Finding Christmas films…");

    try {
      const keywordId = await findChristmasKeyword();

      if (!keywordId) {
        throw new Error("TMDB Christmas keyword could not be found.");
      }

      const discovered = new Map();

      const firstPage = await tmdb("/discover/movie", {
        with_keywords: keywordId,
        include_adult: "false",
        language: "en-GB",
        sort_by: "popularity.desc",
        page: 1,
      });

      for (const film of firstPage.results || []) {
        discovered.set(film.id, film);
      }

      // TMDB tells us how many result pages exist.
      // For now, cap the catalogue import at 25 pages = up to 500 films.
      const pagesToFetch = Math.min(firstPage.total_pages || 1, 25);

      setCatalogueStatus(
        `Finding Christmas films… page 1 of ${pagesToFetch}`
      );

      for (let page = 2; page <= pagesToFetch; page++) {
        setCatalogueStatus(
          `Finding Christmas films… page ${page} of ${pagesToFetch}`
        );

        const result = await tmdb("/discover/movie", {
          with_keywords: keywordId,
          include_adult: "false",
          language: "en-GB",
          sort_by: "popularity.desc",
          page,
        });

        for (const film of result.results || []) {
          discovered.set(film.id, film);
        }
      }

      const films = [...discovered.values()];

      let saved = 0;
      let failed = 0;

      for (let i = 0; i < films.length; i++) {
        const film = films[i];

        setCatalogueStatus(
          `Saving Christmas catalogue… ${i + 1} of ${films.length}`
        );

        const { error } = await supabase.rpc(
          "v2_save_catalogue_film",
          {
            p_tmdb_id: film.id,
            p_title: film.title,
            p_original_title: film.original_title || null,
            p_release_date: film.release_date || null,
            p_overview: film.overview || null,
            p_poster_path: film.poster_path || null,
            p_backdrop_path: film.backdrop_path || null,
            p_classification: "christmas",
            p_discovery_source: "tmdb-keyword",
          }
        );

        if (error) {
          console.error("Failed:", film.title, error);
          failed += 1;
        } else {
          saved += 1;
        }
      }

      setCatalogueStatus(
        `Catalogue refreshed: ${saved} saved${
          failed ? `, ${failed} failed` : ""
        }.`
      );

      if (onCatalogueUpdated) {
        onCatalogueUpdated();
      }
    } catch (error) {
      console.error(error);
      setCatalogueStatus(`Refresh failed: ${error.message}`);
    } finally {
      setRefreshingCatalogue(false);
    }
  }

  async function getCatalogueFilms() {
    const { data, error } = await supabase
      .from("v2_catalogue_entries")
      .select(`
        status,
        v2_films (
          id,
          tmdb_id,
          title
        )
      `)
      .eq("status", "included");

    if (error) {
      throw error;
    }

    return (data || [])
      .map((row) => row.v2_films)
      .filter((film) => film?.id && film?.tmdb_id);
  }

  async function getLatestAvailabilityChecks(filmIds) {
    const latestByFilm = new Map();

    for (const ids of chunk(filmIds, 150)) {
      const { data, error } = await supabase
        .from("v2_streaming_availability")
        .select("film_id, checked_at")
        .eq("region", "GB")
        .in("film_id", ids);

      if (error) {
        throw error;
      }

      for (const row of data || []) {
        const key = String(row.film_id);
        const current = latestByFilm.get(key);

        if (
          !current ||
          new Date(row.checked_at) > new Date(current)
        ) {
          latestByFilm.set(key, row.checked_at);
        }
      }
    }

    return latestByFilm;
  }

  function isFresh(checkedAt) {
    if (!checkedAt) return false;

    const checkedMs = Date.parse(checkedAt);

    if (!Number.isFinite(checkedMs)) return false;

    return Date.now() - checkedMs < AVAILABILITY_CACHE_MS;
  }

  async function refreshAvailability() {
    if (!isAdmin || refreshingAvailability || !TMDB_KEY) return;

    setRefreshingAvailability(true);
    setAvailabilityStatus("Loading catalogue films…");

    try {
      const films = await getCatalogueFilms();

      if (!films.length) {
        setAvailabilityStatus(
          "No films are currently included in the catalogue."
        );
        return;
      }

      const latestChecks = await getLatestAvailabilityChecks(
        films.map((film) => film.id)
      );

      const filmsToRefresh = films.filter(
        (film) => !isFresh(latestChecks.get(String(film.id)))
      );

      const skippedFresh = films.length - filmsToRefresh.length;

      if (!filmsToRefresh.length) {
        setAvailabilityStatus(
          `UK availability is already fresh for all ${films.length} catalogue films.`
        );

        if (onCatalogueUpdated) {
          onCatalogueUpdated();
        }

        return;
      }

      let saved = 0;
      let failed = 0;

      for (let i = 0; i < filmsToRefresh.length; i++) {
        const film = filmsToRefresh[i];

        setAvailabilityStatus(
          `Refreshing UK availability… ${i + 1} of ${
            filmsToRefresh.length
          } (${film.title})`
        );

        try {
          const data = await tmdb(
            `/movie/${film.tmdb_id}/watch/providers`
          );

          const gb = data?.results?.GB || {};

          const rows = uniqueProviders([
            ...(gb.flatrate || []).map((provider) => ({
              provider_id: provider.provider_id ?? null,
              provider_name: normaliseProviderName(
                provider.provider_name
              ),
              provider_type: "subscription",
              logo_path: provider.logo_path || null,
              watch_url: gb.link || null,
            })),

            ...(gb.free || []).map((provider) => ({
              provider_id: provider.provider_id ?? null,
              provider_name: normaliseProviderName(
                provider.provider_name
              ),
              provider_type: "free",
              logo_path: provider.logo_path || null,
              watch_url: gb.link || null,
            })),

            ...(gb.ads || []).map((provider) => ({
              provider_id: provider.provider_id ?? null,
              provider_name: normaliseProviderName(
                provider.provider_name
              ),
              provider_type: "ads",
              logo_path: provider.logo_path || null,
              watch_url: gb.link || null,
            })),
          ]);

          const { error: saveError } = await supabase.rpc(
            "v2_replace_streaming_availability",
            {
              p_film_id: film.id,
              p_providers: rows,
            }
          );

          if (saveError) {
            throw saveError;
          }

          saved += 1;
        } catch (filmError) {
          console.error(
            "Availability refresh failed:",
            film.title,
            filmError
          );
          failed += 1;
        }

        // Keep requests paced rather than firing hundreds at once.
        if (i < filmsToRefresh.length - 1) {
          await sleep(REQUEST_DELAY_MS);
        }
      }

      setAvailabilityStatus(
        `UK availability refreshed: ${saved} updated${
          skippedFresh ? `, ${skippedFresh} already fresh` : ""
        }${failed ? `, ${failed} failed` : ""}.`
      );

      if (onCatalogueUpdated) {
        onCatalogueUpdated();
      }
    } catch (error) {
      console.error(error);
      setAvailabilityStatus(
        `Availability refresh failed: ${error.message}`
      );
    } finally {
      setRefreshingAvailability(false);
    }
  }

  if (!session?.user || checkingAdmin || !isAdmin) {
    return null;
  }

  const busy = refreshingCatalogue || refreshingAvailability;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        border: "1px solid #d1fae5",
        background: "#f0fdf4",
        borderRadius: 10,
      }}
    >
      <strong>Catalogue admin</strong>

      <div
        style={{
          marginTop: 8,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={refreshCatalogue}
          disabled={busy || !TMDB_KEY}
          style={{
            border: "1px solid #86efac",
            background: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {refreshingCatalogue
            ? "Refreshing catalogue…"
            : "🎄 Refresh Christmas Catalogue"}
        </button>

        <button
          onClick={refreshAvailability}
          disabled={busy || !TMDB_KEY}
          style={{
            border: "1px solid #93c5fd",
            background: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {refreshingAvailability
            ? "Refreshing UK availability…"
            : "📺 Refresh UK Availability"}
        </button>
      </div>

      {catalogueStatus && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "#444",
          }}
        >
          {catalogueStatus}
        </div>
      )}

      {availabilityStatus && (
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            color: "#444",
          }}
        >
          {availabilityStatus}
        </div>
      )}
    </div>
  );
}
