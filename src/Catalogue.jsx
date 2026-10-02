import React, { useEffect, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";

const AVAILABILITY_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    const key =
      provider.provider_id ||
      normaliseProviderName(provider.provider_name || "");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ProviderChips({ providers }) {
  if (!providers?.length) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 6,
      }}
    >
      {providers.map((provider) => (
        <span
          key={provider.provider_id || provider.provider_name}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 999,
            background: "#fff",
            fontSize: 12,
          }}
        >
          {provider.logo_path ? (
            <img
              src={`${TMDB_IMG}/w45${provider.logo_path}`}
              alt=""
              aria-hidden="true"
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                objectFit: "cover",
              }}
            />
          ) : null}

          {normaliseProviderName(provider.provider_name)}
        </span>
      ))}
    </div>
  );
}

function chunk(items, size) {
  const result = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
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

      // Load any UK availability we already cached in Supabase.
      const filmIds = rows.map((film) => film.id).filter(Boolean);
      const filmById = new Map(rows.map((film) => [String(film.id), film]));

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

          if (row.provider_type === "none") {
            // Sentinel row: this film was checked and no streaming offers existed.
            checkedMap[key] = row.checked_at;
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

          if (
            !checkedMap[key] ||
            new Date(row.checked_at) > new Date(checkedMap[key])
          ) {
            checkedMap[key] = row.checked_at;
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

    // If the cached result is still fresh, show it immediately.
    if (isAvailabilityFresh(tmdbId)) {
      toggleExpanded(tmdbId, true);
      return;
    }

    await refreshWatchProviders(film);
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

    if (onWatchlistAdded) {
      onWatchlistAdded(film.tmdb_id);
    }
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

    if (onFavouriteAdded) {
      onFavouriteAdded(film.tmdb_id);
    }
  }

  function filmMatchesPlatform(film, selectedPlatform) {
    if (!selectedPlatform) return true;

    const providerData = watchProviders[film.tmdb_id];
    if (!providerData) return false;

    const providers = [
      ...(providerData.flatrate || []),
      ...(providerData.free || []),
      ...(providerData.ads || []),
    ];

    return providers.some(
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
    <div
      style={{
        marginBottom: 22,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 6px" }}>Discover</h2>

      <div
        style={{
          fontSize: 13,
          color: "#666",
          marginBottom: 14,
        }}
      >
        {loading
          ? "Loading Christmas catalogue…"
          : error
          ? "Couldn't load Christmas catalogue"
          : `${filteredFilms.length} of ${films.length} Christmas films`}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <input
          type="text"
          placeholder="Search Christmas films..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            padding: "8px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
          }}
        />

        <select
          value={decade}
          onChange={(e) => setDecade(e.target.value)}
          style={{
            padding: "8px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#fff",
          }}
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

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{
            padding: "8px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#fff",
          }}
        >
          <option value="">All platforms</option>
          <option value="Netflix">Netflix</option>
          <option value="Disney+">Disney+</option>
          <option value="Prime Video">Prime Video</option>
          <option value="Apple TV+">Apple TV+</option>
          <option value="Paramount+">Paramount+</option>
          <option value="NOW">NOW</option>
          <option value="Sky Go">Sky Go</option>
          <option value="BBC iPlayer">BBC iPlayer</option>
          <option value="ITVX">ITVX</option>
          <option value="Channel 4">Channel 4</option>
        </select>

        {(search || decade || platform) && (
          <button
            onClick={() => {
              setSearch("");
              setDecade("");
              setPlatform("");
            }}
            style={{
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {platform && (
        <div
          style={{
            marginTop: -4,
            marginBottom: 12,
            fontSize: 11,
            color: "#777",
          }}
        >
          Platform results use UK availability already checked and cached so far.
        </div>
      )}

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>
          Couldn't load catalogue: {error}
        </div>
      )}

      {!loading && !error && films.length === 0 && (
        <div style={{ color: "#666" }}>
          The Christmas catalogue is empty at the moment.
        </div>
      )}

      {!loading &&
        !error &&
        films.length > 0 &&
        filteredFilms.length === 0 && (
          <div style={{ color: "#666" }}>
            No Christmas films match those filters.
          </div>
        )}

      {!loading && !error && filteredFilms.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
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

            const hasStreaming =
              subscriptionProviders.length > 0 ||
              freeProviders.length > 0 ||
              adProviders.length > 0;

            return (
              <div
                key={film.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr",
                  gap: 12,
                  alignItems: "start",
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                {film.poster_path ? (
                  <img
                    src={`${TMDB_IMG}/w185${film.poster_path}`}
                    alt={film.title}
                    loading="lazy"
                    style={{
                      width: 90,
                      height: 135,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 90,
                      height: 135,
                      background: "#f3f4f6",
                      borderRadius: 8,
                    }}
                  />
                )}

                <div style={{ minWidth: 0 }}>
                  <strong>
                    {film.title}
                    {film.release_year
                      ? ` (${film.release_year})`
                      : ""}
                  </strong>

                  {film.overview && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: "#444",
                        lineHeight: 1.35,
                      }}
                    >
                      {film.overview.length > 180
                        ? film.overview.slice(0, 180) + "…"
                        : film.overview}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {watchlistTmdbIds?.has(film.tmdb_id) ? (
                      <button
                        disabled
                        style={{
                          border: "1px solid #bbf7d0",
                          background: "#f0fdf4",
                          padding: "6px 9px",
                          borderRadius: 8,
                        }}
                      >
                        Added ✓
                      </button>
                    ) : (
                      <button
                        onClick={() => addToWatchlist(film)}
                        style={{
                          border: "1px solid #d1d5db",
                          background: "#fff",
                          padding: "6px 9px",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        Add to My Christmas List
                      </button>
                    )}

                    {favouriteTmdbIds?.has(film.tmdb_id) ? (
                      <button
                        disabled
                        style={{
                          border: "1px solid #fecdd3",
                          background: "#fff1f2",
                          padding: "6px 9px",
                          borderRadius: 8,
                        }}
                      >
                        ♥ Favourite
                      </button>
                    ) : (
                      <button
                        onClick={() => addToFavourites(film)}
                        style={{
                          border: "1px solid #fecdd3",
                          background: "#fff",
                          padding: "6px 9px",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        ♡ Favourite
                      </button>
                    )}

                    <button
                      onClick={() => handleWhereToWatch(film)}
                      disabled={isLoadingProviders || !TMDB_KEY}
                      style={{
                        border: "1px solid #bfdbfe",
                        background: "#eff6ff",
                        padding: "6px 9px",
                        borderRadius: 8,
                        cursor:
                          isLoadingProviders || !TMDB_KEY
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {isLoadingProviders
                        ? "Checking UK availability…"
                        : isExpanded
                        ? "Hide where to watch"
                        : "📺 Where to watch"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 9,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Where to watch in the UK
                        </div>

                        <button
                          onClick={() => refreshWatchProviders(film)}
                          disabled={isLoadingProviders}
                          style={{
                            border: 0,
                            background: "transparent",
                            padding: 0,
                            color: "#1d4ed8",
                            fontSize: 11,
                            cursor: isLoadingProviders
                              ? "not-allowed"
                              : "pointer",
                          }}
                        >
                          Refresh
                        </button>
                      </div>

                      {providerError && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: "#b91c1c",
                          }}
                        >
                          {providerError}
                        </div>
                      )}

                      {!providerError && !hasStreaming ? (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: "#666",
                          }}
                        >
                          No UK subscription, free or ad-supported streaming
                          option was found.
                        </div>
                      ) : (
                        <>
                          {subscriptionProviders.length > 0 && (
                            <div style={{ marginTop: 7 }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#666",
                                }}
                              >
                                Subscription
                              </div>
                              <ProviderChips
                                providers={subscriptionProviders}
                              />
                            </div>
                          )}

                          {freeProviders.length > 0 && (
                            <div style={{ marginTop: 7 }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#666",
                                }}
                              >
                                Free
                              </div>
                              <ProviderChips
                                providers={freeProviders}
                              />
                            </div>
                          )}

                          {adProviders.length > 0 && (
                            <div style={{ marginTop: 7 }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#666",
                                }}
                              >
                                Free with ads
                              </div>
                              <ProviderChips
                                providers={adProviders}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {!providerError && providerData?.link && (
                        <div style={{ marginTop: 8 }}>
                          <a
                            href={providerData.link}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 12,
                              color: "#1d4ed8",
                            }}
                          >
                            View watch options
                          </a>
                        </div>
                      )}

                      {!providerError && (
                        <div
                          style={{
                            marginTop: 7,
                            fontSize: 10,
                            color: "#888",
                          }}
                        >
                          Availability data powered by JustWatch.
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: "#777",
                    }}
                  >
                    {film.classification === "christmas-adjacent"
                      ? "Christmas adjacent"
                      : "Christmas"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
