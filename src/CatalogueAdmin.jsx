import React, { useEffect, useMemo, useState } from "react";

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const AVAILABILITY_CACHE_MS = 24 * 60 * 60 * 1000;
const REQUEST_DELAY_MS = 120;

const ESSENTIAL_FILMS = [
  { title: "Home Alone", year: 1990 },
  { title: "Home Alone 2: Lost in New York", year: 1992 },
  { title: "Elf", year: 2003 },
  { title: "Love Actually", year: 2003 },
  { title: "The Holiday", year: 2006 },
  { title: "The Santa Clause", year: 1994 },
  { title: "The Santa Clause 2", year: 2002 },
  { title: "The Muppet Christmas Carol", year: 1992 },
  { title: "National Lampoon's Christmas Vacation", year: 1989 },
  { title: "The Polar Express", year: 2004 },
  { title: "Arthur Christmas", year: 2011 },
  { title: "Klaus", year: 2019 },
  { title: "Miracle on 34th Street", year: 1947 },
  { title: "Miracle on 34th Street", year: 1994 },
  { title: "It's a Wonderful Life", year: 1946 },
  { title: "Scrooged", year: 1988 },
  { title: "Jingle All the Way", year: 1996 },
  { title: "Deck the Halls", year: 2006 },
  { title: "Last Christmas", year: 2019 },
  { title: "Nativity!", year: 2009 },
  { title: "A Christmas Story", year: 1983 },
  { title: "The Christmas Chronicles", year: 2018 },
  { title: "How the Grinch Stole Christmas", year: 2000 },
  { title: "The Grinch", year: 2018 },
];

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
    const key =
      provider.provider_id ||
      `${provider.provider_name || ""}__${provider.provider_type || ""}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filmYear(film) {
  const value = film?.release_date || "";
  return value ? Number(value.slice(0, 4)) || null : null;
}

function normaliseTitle(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  const [addingEssentials, setAddingEssentials] = useState(false);

  const [catalogueStatus, setCatalogueStatus] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("");
  const [curationStatus, setCurationStatus] = useState("");

  const [catalogueRows, setCatalogueRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("included");
  const [savingFilmIds, setSavingFilmIds] = useState(new Set());

  const [tmdbSearch, setTmdbSearch] = useState("");
  const [tmdbResults, setTmdbResults] = useState([]);
  const [searchingTmdb, setSearchingTmdb] = useState(false);
  const [addingTmdbIds, setAddingTmdbIds] = useState(new Set());

  useEffect(() => {
    if (!supabase || !session?.user) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }

    let cancelled = false;

    async function checkAdmin() {
      setCheckingAdmin(true);

      const { data, error } = await supabase
        .from("v2_profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (error) {
        console.error(error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data?.is_admin);
      }

      setCheckingAdmin(false);
    }

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [supabase, session]);

  useEffect(() => {
    if (!isAdmin) return;
    loadCatalogueRows();
  }, [isAdmin]);

  async function loadCatalogueRows() {
    if (!supabase) return;

    setLoadingRows(true);

    try {
      const { data, error } = await supabase
        .from("v2_catalogue_entries")
        .select(`
          film_id,
          classification,
          status,
          discovery_source,
          admin_override,
          admin_note,
          updated_at,
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
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = (data || [])
        .filter((row) => row.v2_films?.id)
        .sort((a, b) =>
          (a.v2_films?.title || "").localeCompare(
            b.v2_films?.title || ""
          )
        );

      setCatalogueRows(rows);
    } catch (error) {
      console.error(error);
      setCurationStatus(
        `Couldn't load catalogue entries: ${error.message}`
      );
    } finally {
      setLoadingRows(false);
    }
  }

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

  async function saveTmdbFilmToCatalogue(
    film,
    {
      source = "admin-manual",
      note = "Manually included by admin",
      forceInclude = true,
    } = {}
  ) {
    const { data: savedFilmId, error: saveError } = await supabase.rpc(
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
        p_discovery_source: source,
      }
    );

    if (saveError) throw saveError;

    if (!forceInclude) return savedFilmId;

    let filmId = savedFilmId;

    if (!filmId) {
      const { data: row, error: lookupError } = await supabase
        .from("v2_films")
        .select("id")
        .eq("tmdb_id", film.id)
        .single();

      if (lookupError) throw lookupError;
      filmId = row.id;
    }

    const { error: overrideError } = await supabase.rpc(
      "v2_set_catalogue_entry_status",
      {
        p_film_id: filmId,
        p_status: "included",
        p_admin_note: note,
      }
    );

    if (overrideError) throw overrideError;

    return filmId;
  }

  async function refreshCatalogue() {
    if (!isAdmin || refreshingCatalogue) return;

    setRefreshingCatalogue(true);
    setCatalogueStatus("Finding Christmas-tagged films…");

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

      const pagesToFetch = Math.min(firstPage.total_pages || 1, 25);

      setCatalogueStatus(
        `Finding Christmas-tagged films… page 1 of ${pagesToFetch}`
      );

      for (let page = 2; page <= pagesToFetch; page++) {
        setCatalogueStatus(
          `Finding Christmas-tagged films… page ${page} of ${pagesToFetch}`
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
          `Saving discovery candidates… ${i + 1} of ${films.length}`
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
        `Discovery refresh complete: ${saved} saved${
          failed ? `, ${failed} failed` : ""
        }. Admin include/exclude choices are preserved.`
      );

      await loadCatalogueRows();
      onCatalogueUpdated?.();
    } catch (error) {
      console.error(error);
      setCatalogueStatus(`Refresh failed: ${error.message}`);
    } finally {
      setRefreshingCatalogue(false);
    }
  }

  async function searchTmdbCatalogue(event) {
    event?.preventDefault();

    const query = tmdbSearch.trim();

    if (!query || searchingTmdb) return;

    setSearchingTmdb(true);
    setCurationStatus("");

    try {
      const result = await tmdb("/search/movie", {
        query,
        include_adult: "false",
        language: "en-GB",
        page: 1,
      });

      setTmdbResults((result.results || []).slice(0, 10));
    } catch (error) {
      console.error(error);
      setCurationStatus(`TMDB search failed: ${error.message}`);
      setTmdbResults([]);
    } finally {
      setSearchingTmdb(false);
    }
  }

  async function addSearchResult(film) {
    if (!film?.id || addingTmdbIds.has(film.id)) return;

    setAddingTmdbIds((prev) => new Set(prev).add(film.id));
    setCurationStatus(`Adding ${film.title}…`);

    try {
      await saveTmdbFilmToCatalogue(film, {
        source: "admin-manual",
        note: "Manually included by admin",
        forceInclude: true,
      });

      setCurationStatus(`${film.title} is now included in the catalogue.`);
      await loadCatalogueRows();
      onCatalogueUpdated?.();
    } catch (error) {
      console.error(error);
      setCurationStatus(
        `Couldn't add ${film.title}: ${error.message}`
      );
    } finally {
      setAddingTmdbIds((prev) => {
        const next = new Set(prev);
        next.delete(film.id);
        return next;
      });
    }
  }

  async function resolveEssentialFilm(essential) {
    const result = await tmdb("/search/movie", {
      query: essential.title,
      include_adult: "false",
      language: "en-GB",
      year: essential.year,
      page: 1,
    });

    const candidates = result.results || [];
    if (!candidates.length) return null;

    const wantedTitle = normaliseTitle(essential.title);

    const exact = candidates.find((film) => {
      const year = filmYear(film);

      return (
        normaliseTitle(film.title) === wantedTitle &&
        (!essential.year || year === essential.year)
      );
    });

    if (exact) return exact;

    const yearMatch = candidates.find(
      (film) => filmYear(film) === essential.year
    );

    return yearMatch || candidates[0];
  }

  async function addEssentials() {
    if (addingEssentials || !isAdmin) return;

    setAddingEssentials(true);
    setCurationStatus("Adding Christmas essentials…");

    let added = 0;
    let failed = 0;

    try {
      for (let i = 0; i < ESSENTIAL_FILMS.length; i++) {
        const essential = ESSENTIAL_FILMS[i];

        setCurationStatus(
          `Adding Christmas essentials… ${i + 1} of ${
            ESSENTIAL_FILMS.length
          } (${essential.title})`
        );

        try {
          const film = await resolveEssentialFilm(essential);

          if (!film) {
            failed += 1;
            continue;
          }

          await saveTmdbFilmToCatalogue(film, {
            source: "admin-essential",
            note: "Core Christmas catalogue",
            forceInclude: true,
          });

          added += 1;
        } catch (filmError) {
          console.error(
            "Essential film failed:",
            essential.title,
            filmError
          );
          failed += 1;
        }

        if (i < ESSENTIAL_FILMS.length - 1) {
          await sleep(REQUEST_DELAY_MS);
        }
      }

      setCurationStatus(
        `Christmas essentials checked: ${added} included${
          failed ? `, ${failed} need review` : ""
        }.`
      );

      await loadCatalogueRows();
      onCatalogueUpdated?.();
    } finally {
      setAddingEssentials(false);
    }
  }

  async function setEntryStatus(row, nextStatus) {
    const film = row.v2_films;

    if (!film?.id || savingFilmIds.has(film.id)) return;

    setSavingFilmIds((prev) => new Set(prev).add(film.id));

    try {
      const note =
        nextStatus === "excluded"
          ? "Excluded by admin"
          : "Included by admin";

      const { error } = await supabase.rpc(
        "v2_set_catalogue_entry_status",
        {
          p_film_id: film.id,
          p_status: nextStatus,
          p_admin_note: note,
        }
      );

      if (error) throw error;

      setCurationStatus(
        `${film.title} ${
          nextStatus === "included" ? "included" : "excluded"
        }.`
      );

      await loadCatalogueRows();
      onCatalogueUpdated?.();
    } catch (error) {
      console.error(error);
      setCurationStatus(
        `Couldn't update ${film.title}: ${error.message}`
      );
    } finally {
      setSavingFilmIds((prev) => {
        const next = new Set(prev);
        next.delete(film.id);
        return next;
      });
    }
  }

  async function clearOverride(row) {
    const film = row.v2_films;

    if (!film?.id || savingFilmIds.has(film.id)) return;

    setSavingFilmIds((prev) => new Set(prev).add(film.id));

    try {
      const { error } = await supabase.rpc(
        "v2_clear_catalogue_override",
        {
          p_film_id: film.id,
        }
      );

      if (error) throw error;

      setCurationStatus(
        `${film.title} returned to automatic catalogue rules.`
      );

      await loadCatalogueRows();
    } catch (error) {
      console.error(error);
      setCurationStatus(
        `Couldn't clear override for ${film.title}: ${error.message}`
      );
    } finally {
      setSavingFilmIds((prev) => {
        const next = new Set(prev);
        next.delete(film.id);
        return next;
      });
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

    if (error) throw error;

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

      if (error) throw error;

      for (const row of data || []) {
        const key = String(row.film_id);
        const current = latestByFilm.get(key);

        if (!current || new Date(row.checked_at) > new Date(current)) {
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
    setAvailabilityStatus("Loading included catalogue films…");

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
          `UK availability is already fresh for all ${films.length} included films.`
        );

        onCatalogueUpdated?.();
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

          if (saveError) throw saveError;

          saved += 1;
        } catch (filmError) {
          console.error(
            "Availability refresh failed:",
            film.title,
            filmError
          );
          failed += 1;
        }

        if (i < filmsToRefresh.length - 1) {
          await sleep(REQUEST_DELAY_MS);
        }
      }

      setAvailabilityStatus(
        `UK availability refreshed: ${saved} updated${
          skippedFresh ? `, ${skippedFresh} already fresh` : ""
        }${failed ? `, ${failed} failed` : ""}.`
      );

      onCatalogueUpdated?.();
    } catch (error) {
      console.error(error);
      setAvailabilityStatus(
        `Availability refresh failed: ${error.message}`
      );
    } finally {
      setRefreshingAvailability(false);
    }
  }

  const filteredRows = useMemo(() => {
    const query = catalogueSearch.trim().toLowerCase();

    return catalogueRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      const title = row.v2_films?.title || "";
      const year =
        row.v2_films?.release_year ||
        filmYear(row.v2_films) ||
        "";

      return `${title} ${year}`.toLowerCase().includes(query);
    });
  }, [catalogueRows, catalogueSearch, statusFilter]);

  const includedCount = catalogueRows.filter(
    (row) => row.status === "included"
  ).length;
  const excludedCount = catalogueRows.filter(
    (row) => row.status === "excluded"
  ).length;

  const busy =
    refreshingCatalogue ||
    refreshingAvailability ||
    addingEssentials;

  if (!session?.user || checkingAdmin || !isAdmin) {
    return null;
  }

  return (
    <div className="cit-admin-curation">
      <style>{`
        .cit-admin-curation {
          color: #18382f;
        }

        .cit-admin-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .cit-admin-heading h2 {
          margin: 0;
          font-size: 22px;
          letter-spacing: -.025em;
        }

        .cit-admin-heading p {
          margin: 5px 0 0;
          color: #6d7973;
          font-size: 12px;
          line-height: 1.45;
        }

        .cit-admin-counts {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .cit-admin-count {
          border: 1px solid #ded8cf;
          border-radius: 999px;
          background: #fff;
          color: #4c5f57;
          padding: 5px 9px;
          font-size: 10px;
          font-weight: 750;
        }

        .cit-admin-section {
          padding: 14px;
          border: 1px solid #e1ddd5;
          border-radius: 13px;
          background: rgba(255,255,255,.68);
        }

        .cit-admin-section + .cit-admin-section {
          margin-top: 12px;
        }

        .cit-admin-section-title {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 800;
        }

        .cit-admin-section-copy {
          margin: 0 0 12px;
          color: #748079;
          font-size: 11px;
          line-height: 1.45;
        }

        .cit-admin-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .cit-admin-button {
          border: 1px solid #cfc9bf;
          border-radius: 9px;
          background: #fff;
          color: #315047;
          padding: 8px 10px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 750;
        }

        .cit-admin-button:hover:not([disabled]) {
          border-color: #a8b5af;
          background: #fbfaf7;
        }

        .cit-admin-button--primary {
          border-color: #123b2d;
          background: #123b2d;
          color: #fff;
        }

        .cit-admin-button--danger {
          border-color: #e0c1c1;
          color: #8c3636;
        }

        .cit-admin-button[disabled] {
          cursor: wait;
          opacity: .62;
        }

        .cit-admin-status {
          margin-top: 9px;
          color: #607069;
          font-size: 11px;
          line-height: 1.4;
        }

        .cit-admin-search-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
        }

        .cit-admin-input,
        .cit-admin-select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d8d3ca;
          border-radius: 9px;
          background: #fff;
          color: #18382f;
          padding: 9px 10px;
          outline: none;
          font-size: 12px;
        }

        .cit-admin-input:focus,
        .cit-admin-select:focus {
          border-color: #6e8e82;
          box-shadow: 0 0 0 3px rgba(18,59,45,.08);
        }

        .cit-admin-tmdb-results {
          display: grid;
          gap: 7px;
          margin-top: 10px;
        }

        .cit-admin-tmdb-result,
        .cit-admin-row {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 8px;
          border: 1px solid #e6e1d8;
          border-radius: 10px;
          background: rgba(255,255,255,.84);
        }

        .cit-admin-poster {
          width: 42px;
          height: 63px;
          object-fit: cover;
          border-radius: 5px;
          background: #ebe7df;
        }

        .cit-admin-film-title {
          color: #18382f;
          font-size: 12px;
          font-weight: 800;
        }

        .cit-admin-film-meta {
          margin-top: 3px;
          color: #87908b;
          font-size: 10px;
          line-height: 1.35;
        }

        .cit-admin-toolbar {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) 150px;
          gap: 8px;
          margin-bottom: 10px;
        }

        .cit-admin-list {
          display: grid;
          gap: 6px;
          max-height: 520px;
          overflow: auto;
          padding-right: 3px;
        }

        .cit-admin-row {
          grid-template-columns: 38px minmax(0, 1fr) auto;
        }

        .cit-admin-row .cit-admin-poster {
          width: 38px;
          height: 57px;
        }

        .cit-admin-row-actions {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .cit-admin-mini {
          border: 1px solid #d8d3ca;
          border-radius: 7px;
          background: #fff;
          color: #41564e;
          padding: 5px 7px;
          cursor: pointer;
          font-size: 9px;
          font-weight: 750;
        }

        .cit-admin-mini--danger {
          border-color: #e3c8c8;
          color: #8e3636;
        }

        .cit-admin-mini--include {
          border-color: #bfd6c8;
          color: #28553f;
          background: #f2f9f4;
        }

        .cit-admin-badge {
          display: inline-block;
          margin-right: 5px;
          margin-top: 4px;
          border: 1px solid #ded8cf;
          border-radius: 999px;
          padding: 2px 6px;
          color: #6a756f;
          font-size: 8px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .cit-admin-badge--override {
          border-color: #d7c49b;
          background: #fff9e9;
          color: #7f6321;
        }

        .cit-admin-empty {
          color: #77817c;
          font-size: 11px;
          padding: 8px 0;
        }

        @media (max-width: 720px) {
          .cit-admin-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .cit-admin-search-form,
          .cit-admin-toolbar {
            grid-template-columns: 1fr;
          }

          .cit-admin-tmdb-result,
          .cit-admin-row {
            grid-template-columns: 38px minmax(0, 1fr);
          }

          .cit-admin-row-actions,
          .cit-admin-tmdb-result > button {
            grid-column: 1 / -1;
            justify-content: flex-start;
          }
        }
      `}</style>

      <div className="cit-admin-heading">
        <div>
          <h2>Catalogue curation</h2>
          <p>
            TMDB discovery finds candidates. Your admin choices decide what
            actually belongs in Check It Twice.
          </p>
        </div>

        <div className="cit-admin-counts">
          <span className="cit-admin-count">
            {includedCount} included
          </span>
          <span className="cit-admin-count">
            {excludedCount} excluded
          </span>
        </div>
      </div>

      <section className="cit-admin-section">
        <h3 className="cit-admin-section-title">
          Core Christmas catalogue
        </h3>
        <p className="cit-admin-section-copy">
          Adds a starter set of obvious Christmas films and permanently marks
          them as included. This includes Home Alone.
        </p>

        <div className="cit-admin-actions">
          <button
            type="button"
            className="cit-admin-button cit-admin-button--primary"
            onClick={addEssentials}
            disabled={busy || !TMDB_KEY}
          >
            {addingEssentials
              ? "Adding essentials…"
              : "Add / check Christmas essentials"}
          </button>
        </div>

        {curationStatus && (
          <div className="cit-admin-status">{curationStatus}</div>
        )}
      </section>

      <section className="cit-admin-section">
        <h3 className="cit-admin-section-title">
          Add a missing film
        </h3>
        <p className="cit-admin-section-copy">
          Search all TMDB films and explicitly add one to the public Christmas
          catalogue.
        </p>

        <form
          className="cit-admin-search-form"
          onSubmit={searchTmdbCatalogue}
        >
          <input
            className="cit-admin-input"
            value={tmdbSearch}
            onChange={(event) => setTmdbSearch(event.target.value)}
            placeholder="e.g. Home Alone"
          />

          <button
            type="submit"
            className="cit-admin-button"
            disabled={searchingTmdb || !tmdbSearch.trim()}
          >
            {searchingTmdb ? "Searching…" : "Search TMDB"}
          </button>
        </form>

        {tmdbResults.length > 0 && (
          <div className="cit-admin-tmdb-results">
            {tmdbResults.map((film) => {
              const year = filmYear(film);
              const adding = addingTmdbIds.has(film.id);

              return (
                <div
                  key={film.id}
                  className="cit-admin-tmdb-result"
                >
                  {film.poster_path ? (
                    <img
                      className="cit-admin-poster"
                      src={`${TMDB_IMG}/w92${film.poster_path}`}
                      alt=""
                    />
                  ) : (
                    <div className="cit-admin-poster" />
                  )}

                  <div>
                    <div className="cit-admin-film-title">
                      {film.title}
                    </div>
                    <div className="cit-admin-film-meta">
                      {year || "Year unknown"}
                      {film.overview
                        ? ` · ${film.overview.slice(0, 110)}${
                            film.overview.length > 110 ? "…" : ""
                          }`
                        : ""}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="cit-admin-button"
                    onClick={() => addSearchResult(film)}
                    disabled={adding}
                  >
                    {adding ? "Adding…" : "Include"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="cit-admin-section">
        <h3 className="cit-admin-section-title">
          Review catalogue
        </h3>
        <p className="cit-admin-section-copy">
          Excluding a title is permanent until you change it here. A future
          TMDB refresh will not silently add it back.
        </p>

        <div className="cit-admin-toolbar">
          <input
            className="cit-admin-input"
            value={catalogueSearch}
            onChange={(event) =>
              setCatalogueSearch(event.target.value)
            }
            placeholder="Search current catalogue…"
          />

          <select
            className="cit-admin-select"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="included">Included</option>
            <option value="excluded">Excluded</option>
            <option value="all">All</option>
          </select>
        </div>

        {loadingRows ? (
          <div className="cit-admin-empty">
            Loading catalogue…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="cit-admin-empty">
            No matching catalogue entries.
          </div>
        ) : (
          <div className="cit-admin-list">
            {filteredRows.map((row) => {
              const film = row.v2_films;
              const saving = savingFilmIds.has(film.id);

              return (
                <div key={row.film_id} className="cit-admin-row">
                  {film.poster_path ? (
                    <img
                      className="cit-admin-poster"
                      src={`${TMDB_IMG}/w92${film.poster_path}`}
                      alt=""
                    />
                  ) : (
                    <div className="cit-admin-poster" />
                  )}

                  <div>
                    <div className="cit-admin-film-title">
                      {film.title}
                    </div>

                    <div className="cit-admin-film-meta">
                      {film.release_year ||
                        filmYear(film) ||
                        "Year unknown"}
                      {row.discovery_source
                        ? ` · ${row.discovery_source}`
                        : ""}
                    </div>

                    <div>
                      <span className="cit-admin-badge">
                        {row.status}
                      </span>

                      {row.admin_override && (
                        <span className="cit-admin-badge cit-admin-badge--override">
                          Admin override
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="cit-admin-row-actions">
                    {row.status === "included" ? (
                      <button
                        type="button"
                        className="cit-admin-mini cit-admin-mini--danger"
                        onClick={() =>
                          setEntryStatus(row, "excluded")
                        }
                        disabled={saving}
                      >
                        Exclude
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cit-admin-mini cit-admin-mini--include"
                        onClick={() =>
                          setEntryStatus(row, "included")
                        }
                        disabled={saving}
                      >
                        Include
                      </button>
                    )}

                    {row.admin_override && (
                      <button
                        type="button"
                        className="cit-admin-mini"
                        onClick={() => clearOverride(row)}
                        disabled={saving}
                        title="Stop forcing this film and return it to automatic rules"
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="cit-admin-section">
        <h3 className="cit-admin-section-title">
          Automated maintenance
        </h3>
        <p className="cit-admin-section-copy">
          Use TMDB to discover more Christmas-tagged candidates and refresh UK
          streaming availability. Admin overrides are kept.
        </p>

        <div className="cit-admin-actions">
          <button
            type="button"
            className="cit-admin-button"
            onClick={refreshCatalogue}
            disabled={busy || !TMDB_KEY}
          >
            {refreshingCatalogue
              ? "Refreshing discovery…"
              : "Refresh TMDB discovery"}
          </button>

          <button
            type="button"
            className="cit-admin-button"
            onClick={refreshAvailability}
            disabled={busy || !TMDB_KEY}
          >
            {refreshingAvailability
              ? "Refreshing UK availability…"
              : "Refresh UK availability"}
          </button>
        </div>

        {catalogueStatus && (
          <div className="cit-admin-status">
            {catalogueStatus}
          </div>
        )}

        {availabilityStatus && (
          <div className="cit-admin-status">
            {availabilityStatus}
          </div>
        )}
      </section>
    </div>
  );
}
