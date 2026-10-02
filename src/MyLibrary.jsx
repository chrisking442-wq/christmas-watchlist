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

function formatCheckedAt(value) {
  if (!value) return "";

  const checked = new Date(value);

  if (Number.isNaN(checked.getTime())) return "";

  const today = new Date();

  const sameDay =
    checked.getFullYear() === today.getFullYear() &&
    checked.getMonth() === today.getMonth() &&
    checked.getDate() === today.getDate();

  if (sameDay) return "Last checked today";

  return `Last checked ${checked.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function WhereToWatch({
  availability,
  filmId,
  alertActive,
  alertSaving,
  onToggleAlert,
}) {
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
        <>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#555",
              lineHeight: 1.4,
            }}
          >
            Not currently included with a UK streaming service.
          </div>

          <button
            onClick={() => onToggleAlert(filmId)}
            disabled={alertSaving}
            style={{
              marginTop: 8,
              border: alertActive
                ? "1px solid #86efac"
                : "1px solid #d1d5db",
              background: alertActive ? "#f0fdf4" : "#fff",
              padding: "6px 9px",
              borderRadius: 8,
              cursor: alertSaving ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {alertSaving
              ? "Saving…"
              : alertActive
              ? "🔔 Watching for availability"
              : "🔔 Tell me when available"}
          </button>
        </>
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

      {availability.checkedAt && (
        <div
          style={{
            marginTop: 7,
            fontSize: 10,
            color: "#777",
          }}
        >
          {formatCheckedAt(availability.checkedAt)}
        </div>
      )}

      <div
        style={{
          marginTop: 4,
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
  const [alertFilmIds, setAlertFilmIds] = useState(new Set());
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [alertSavingFilmIds, setAlertSavingFilmIds] = useState(new Set());
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user) {
      setLists([]);
      setSelectedList(null);
      setItems([]);
      setAvailabilityByFilmId({});
      setAlertFilmIds(new Set());
      setTriggeredAlerts([]);
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

    async function loadAvailabilityAlerts() {
      const { data, error } = await supabase
        .from("v2_availability_alerts")
        .select("id, film_id, active, last_notified_at")
        .eq("user_id", session.user.id);

      if (error) {
        console.error("Couldn't load availability alerts:", error);
        return;
      }

      const alertRows = data || [];

      setAlertFilmIds(
        new Set(
          alertRows
            .filter((row) => row.active)
            .map((row) => String(row.film_id))
        )
      );

      const triggered = alertRows.filter(
        (row) => !row.active && row.last_notified_at
      );

      if (!triggered.length) {
        setTriggeredAlerts([]);
        return;
      }

      const filmIds = triggered.map((row) => row.film_id);

      const [
        { data: filmData, error: filmError },
        { data: availabilityData, error: availabilityError },
      ] = await Promise.all([
        supabase
          .from("v2_films")
          .select("id, title, release_year, poster_path")
          .in("id", filmIds),

        supabase
          .from("v2_streaming_availability")
          .select(
            "film_id, provider_name, provider_type, watch_url"
          )
          .eq("region", "GB")
          .in("film_id", filmIds)
          .in("provider_type", ["subscription", "free", "ads"]),
      ]);

      if (filmError) {
        console.error("Couldn't load alert films:", filmError);
      }

      if (availabilityError) {
        console.error(
          "Couldn't load alert availability:",
          availabilityError
        );
      }

      const filmsById = new Map(
        (filmData || []).map((film) => [String(film.id), film])
      );

      const availabilityById = {};

      for (const row of availabilityData || []) {
        const key = String(row.film_id);

        if (!availabilityById[key]) {
          availabilityById[key] = {
            providers: new Set(),
            watchUrl: row.watch_url || null,
          };
        }

        availabilityById[key].providers.add(
          normaliseProviderName(row.provider_name)
        );

        if (!availabilityById[key].watchUrl && row.watch_url) {
          availabilityById[key].watchUrl = row.watch_url;
        }
      }

      setTriggeredAlerts(
        triggered
          .map((row) => {
            const key = String(row.film_id);
            const film = filmsById.get(key) || {};
            const availability = availabilityById[key];

            return {
              id: row.id,
              filmId: row.film_id,
              title: film.title || "A film you're watching",
              releaseYear: film.release_year || null,
              posterPath: film.poster_path || null,
              lastNotifiedAt: row.last_notified_at,
              providers: availability
                ? [...availability.providers]
                : [],
              watchUrl: availability?.watchUrl || null,
            };
          })
          .sort(
            (a, b) =>
              new Date(b.lastNotifiedAt) - new Date(a.lastNotifiedAt)
          )
      );
    }

    loadLists();
    loadAvailabilityAlerts();
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

  async function toggleAvailabilityAlert(filmId) {
    if (!filmId || !session?.user) return;

    const key = String(filmId);
    const active = alertFilmIds.has(key);

    setAlertSavingFilmIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    setError("");

    try {
      if (active) {
        const { error } = await supabase
          .from("v2_availability_alerts")
          .delete()
          .eq("user_id", session.user.id)
          .eq("film_id", filmId);

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
              film_id: filmId,
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
      setError(
        "Couldn't update the availability alert: " + alertError.message
      );
    } finally {
      setAlertSavingFilmIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function dismissTriggeredAlert(alertId) {
    if (!alertId || !session?.user) return;

    const { error } = await supabase
      .from("v2_availability_alerts")
      .delete()
      .eq("id", alertId)
      .eq("user_id", session.user.id);

    if (error) {
      console.error(error);
      setError("Couldn't dismiss the alert: " + error.message);
      return;
    }

    setTriggeredAlerts((prev) =>
      prev.filter((alert) => alert.id !== alertId)
    );
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

      {triggeredAlerts.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            border: "1px solid #86efac",
            borderRadius: 10,
            background: "#f0fdf4",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            🎉 Now available
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
            }}
          >
            {triggeredAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: 9,
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  background: "#fff",
                }}
              >
                {alert.posterPath ? (
                  <img
                    src={`${TMDB_IMG}/w92${alert.posterPath}`}
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: 42,
                      height: 63,
                      objectFit: "cover",
                      borderRadius: 5,
                    }}
                  />
                ) : null}

                <div
                  style={{
                    flex: "1 1 180px",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {alert.title}
                    {alert.releaseYear
                      ? ` (${alert.releaseYear})`
                      : ""}
                  </div>

                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 12,
                      color: "#444",
                    }}
                  >
                    {alert.providers.length
                      ? `Now available on ${alert.providers.join(", ")}.`
                      : "Now available to stream in the UK."}
                  </div>

                  {alert.watchUrl && (
                    <a
                      href={alert.watchUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        fontSize: 12,
                        color: "#1d4ed8",
                      }}
                    >
                      View watch options
                    </a>
                  )}
                </div>

                <button
                  onClick={() => dismissTriggeredAlert(alert.id)}
                  style={{
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    padding: "6px 9px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
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
                const filmId = film?.id;
                const filmKey = String(filmId || "");
                const availability =
                  availabilityByFilmId[filmKey] || null;

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

                      <WhereToWatch
                        availability={availability}
                        filmId={filmId}
                        alertActive={alertFilmIds.has(filmKey)}
                        alertSaving={alertSavingFilmIds.has(filmKey)}
                        onToggleAlert={toggleAvailabilityAlert}
                      />

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
