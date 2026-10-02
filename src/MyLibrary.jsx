import React, { useEffect, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";

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
    const key = `${normaliseProviderName(
      provider.provider_name || ""
    )}__${provider.provider_type || ""}`;

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
          key={`${provider.provider_id || provider.provider_name}__${
            provider.provider_type
          }`}
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

function WhereToWatch({ availability }) {
  if (!availability) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: 9,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fafafa",
          fontSize: 12,
          color: "#666",
        }}
      >
        UK availability hasn’t been checked yet.
      </div>
    );
  }

  const subscription = uniqueProviders(
    availability.providers.filter(
      (provider) => provider.provider_type === "subscription"
    )
  );

  const free = uniqueProviders(
    availability.providers.filter(
      (provider) => provider.provider_type === "free"
    )
  );

  const ads = uniqueProviders(
    availability.providers.filter(
      (provider) => provider.provider_type === "ads"
    )
  );

  const hasStreaming =
    subscription.length > 0 || free.length > 0 || ads.length > 0;

  return (
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
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Where to watch in the UK
      </div>

      {!hasStreaming ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#666",
          }}
        >
          No UK subscription, free or ad-supported streaming option was found.
        </div>
      ) : (
        <>
          {subscription.length > 0 && (
            <div style={{ marginTop: 7 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                }}
              >
                Subscription
              </div>
              <ProviderChips providers={subscription} />
            </div>
          )}

          {free.length > 0 && (
            <div style={{ marginTop: 7 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                }}
              >
                Free
              </div>
              <ProviderChips providers={free} />
            </div>
          )}

          {ads.length > 0 && (
            <div style={{ marginTop: 7 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                }}
              >
                Free with ads
              </div>
              <ProviderChips providers={ads} />
            </div>
          )}
        </>
      )}

      {availability.watchUrl && (
        <div style={{ marginTop: 8 }}>
          <a
            href={availability.watchUrl}
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

      <div
        style={{
          marginTop: 7,
          fontSize: 10,
          color: "#888",
        }}
      >
        Availability data powered by JustWatch.
      </div>
    </div>
  );
}

export default function MyLibrary({
  supabase,
  session,
  onWatchlistRemoved,
  onFavouriteRemoved,
}) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [availabilityByFilmId, setAvailabilityByFilmId] = useState({});
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user) {
      setLists([]);
      setSelectedList(null);
      setItems([]);
      setAvailabilityByFilmId({});
      return;
    }

    async function loadLists() {
      setLoadingLists(true);
      setError("");

      const { data, error } = await supabase
        .from("v2_lists")
        .select("id, name, list_type")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
        setLists([]);
      } else {
        setLists(data || []);
      }

      setLoadingLists(false);
    }

    loadLists();
  }, [supabase, session]);

  async function loadAvailabilityForItems(listItems) {
    const filmIds = listItems
      .map((item) => item.v2_films?.id)
      .filter(Boolean);

    if (!filmIds.length) {
      setAvailabilityByFilmId({});
      return;
    }

    const { data, error } = await supabase
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
      .in("film_id", filmIds);

    if (error) {
      console.error("Couldn't load cached UK availability:", error);
      return;
    }

    const grouped = {};

    for (const row of data || []) {
      const key = String(row.film_id);

      if (!grouped[key]) {
        grouped[key] = {
          providers: [],
          watchUrl: row.watch_url || null,
          checkedAt: row.checked_at || null,
        };
      }

      if (row.provider_type !== "none") {
        grouped[key].providers.push(row);
      }

      if (!grouped[key].watchUrl && row.watch_url) {
        grouped[key].watchUrl = row.watch_url;
      }

      if (
        !grouped[key].checkedAt ||
        new Date(row.checked_at) > new Date(grouped[key].checkedAt)
      ) {
        grouped[key].checkedAt = row.checked_at;
      }
    }

    setAvailabilityByFilmId(grouped);
  }

  async function openList(list) {
    setSelectedList(list);
    setLoadingItems(true);
    setError("");
    setAvailabilityByFilmId({});

    const { data, error } = await supabase
      .from("v2_list_items")
      .select(`
        id,
        added_at,
        v2_films (
          id,
          tmdb_id,
          title,
          release_year,
          overview,
          poster_path
        )
      `)
      .eq("list_id", list.id)
      .order("added_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(error.message);
      setItems([]);
      setLoadingItems(false);
      return;
    }

    const loadedItems = data || [];
    setItems(loadedItems);

    await loadAvailabilityForItems(loadedItems);

    setLoadingItems(false);
  }

  async function removeItem(itemId, tmdbId) {
    const confirmed = window.confirm(
      "Remove this film from " + selectedList.name + "?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("v2_list_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error(error);
      setError("Couldn't remove the film: " + error.message);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));

    if (
      selectedList?.list_type === "watchlist" &&
      onWatchlistRemoved &&
      tmdbId
    ) {
      onWatchlistRemoved(tmdbId);
    }

    if (
      selectedList?.list_type === "favourites" &&
      onFavouriteRemoved &&
      tmdbId
    ) {
      onFavouriteRemoved(tmdbId);
    }
  }

  if (!session?.user) return null;

  return (
    <div
      style={{
        marginBottom: 18,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 10px" }}>My Library</h2>

      {loadingLists && <div>Loading your lists…</div>}

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: selectedList ? 18 : 0,
        }}
      >
        {lists.map((list) => (
          <button
            key={list.id}
            onClick={() => openList(list)}
            style={{
              border:
                selectedList?.id === list.id
                  ? "2px solid #166534"
                  : "1px solid #ddd",
              background:
                selectedList?.id === list.id ? "#f0fdf4" : "#fff",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {list.name}
          </button>
        ))}
      </div>

      {selectedList && (
        <div>
          <h3 style={{ margin: "0 0 12px" }}>
            {selectedList.name}
          </h3>

          {loadingItems && <div>Loading films…</div>}

          {!loadingItems && items.length === 0 && (
            <div style={{ color: "#666" }}>
              No films in this list yet.
            </div>
          )}

          {!loadingItems && items.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {items.map((item) => {
                const film = item.v2_films;
                const availability =
                  availabilityByFilmId[String(film?.id)] || null;

                return (
                  <div
                    key={item.id}
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
                    {film?.poster_path ? (
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
                        {film?.title}
                        {film?.release_year
                          ? ` (${film.release_year})`
                          : ""}
                      </strong>

                      {film?.overview && (
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

                      <WhereToWatch availability={availability} />

                      <button
                        onClick={() =>
                          removeItem(item.id, film?.tmdb_id)
                        }
                        style={{
                          marginTop: 10,
                          border: "1px solid #fecaca",
                          background: "#fff1f2",
                          padding: "6px 9px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
