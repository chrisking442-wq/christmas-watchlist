import React, { useEffect, useState } from "react";
import FilmDetailsModal from "./FilmDetailsModal";

const TMDB_IMG = "https://image.tmdb.org/t/p";

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
    const key = `${normaliseProviderName(
      provider.provider_name || ""
    )}__${provider.provider_type || ""}`;

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
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

function ProviderBadges({ providers, max = 3 }) {
  const visible = uniqueProviders(providers).slice(0, max);

  if (!visible.length) return null;

  return (
    <div className="cit-library-provider-row">
      {visible.map((provider) => (
        <span
          key={`${provider.provider_id || provider.provider_name}__${
            provider.provider_type
          }`}
          className="cit-library-provider"
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

export default function MyLibrary({
  supabase,
  session,
  listType = "watchlist",
  onWatchlistRemoved,
  onFavouriteRemoved,
  onBrowseDiscover,
}) {
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [availabilityByFilmId, setAvailabilityByFilmId] = useState({});
  const [alertFilmIds, setAlertFilmIds] = useState(new Set());
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [alertSavingFilmIds, setAlertSavingFilmIds] = useState(new Set());
  const [watchedByFilmId, setWatchedByFilmId] = useState({});
  const [savingWatchedFilmIds, setSavingWatchedFilmIds] = useState(new Set());
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");
  const [selectedFilm, setSelectedFilm] = useState(null);

  const pageTitle =
    listType === "favourites" ? "Favourites" : "My Christmas List";

  useEffect(() => {
    if (!supabase || !session?.user) {
      setSelectedList(null);
      setItems([]);
      setAvailabilityByFilmId({});
      return;
    }

    let cancelled = false;

    async function loadSelectedList() {
      setLoadingItems(true);
      setError("");
      setItems([]);
      setAvailabilityByFilmId({});

      const { data: list, error: listError } = await supabase
        .from("v2_lists")
        .select("id, name, list_type")
        .eq("user_id", session.user.id)
        .eq("list_type", listType)
        .maybeSingle();

      if (cancelled) return;

      if (listError) {
        console.error(listError);
        setError(listError.message);
        setSelectedList(null);
        setLoadingItems(false);
        return;
      }

      if (!list) {
        setSelectedList(null);
        setItems([]);
        setLoadingItems(false);
        return;
      }

      setSelectedList(list);

      const { data: itemData, error: itemError } = await supabase
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

      if (cancelled) return;

      if (itemError) {
        console.error(itemError);
        setError(itemError.message);
        setItems([]);
        setLoadingItems(false);
        return;
      }

      const loadedItems = itemData || [];
      setItems(loadedItems);

      const filmIds = loadedItems
        .map((item) => item.v2_films?.id)
        .filter(Boolean);

      if (!filmIds.length) {
        setAvailabilityByFilmId({});
        setLoadingItems(false);
        return;
      }

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
          .in("film_id", filmIds);

      if (cancelled) return;

      if (availabilityError) {
        console.error(
          "Couldn't load cached UK availability:",
          availabilityError
        );
        setLoadingItems(false);
        return;
      }

      const grouped = {};

      for (const row of availabilityData || []) {
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
      setLoadingItems(false);
    }

    loadSelectedList();

    return () => {
      cancelled = true;
    };
  }, [supabase, session, listType]);

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
    if (!supabase || !session?.user) {
      setAlertFilmIds(new Set());
      setTriggeredAlerts([]);
      return;
    }

    let cancelled = false;

    async function loadAvailabilityAlerts() {
      const { data, error } = await supabase
        .from("v2_availability_alerts")
        .select("id, film_id, active, last_notified_at")
        .eq("user_id", session.user.id);

      if (cancelled) return;

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

      if (cancelled) return;

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

    loadAvailabilityAlerts();

    return () => {
      cancelled = true;
    };
  }, [supabase, session]);

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

  async function markAsWatched(filmId) {
    if (!filmId || !session?.user) return;

    const key = String(filmId);

    if (watchedByFilmId[key] || savingWatchedFilmIds.has(key)) {
      return;
    }

    setSavingWatchedFilmIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    setError("");

    try {
      const { data, error } = await supabase
        .from("v2_viewing_events")
        .insert({
          user_id: session.user.id,
          film_id: filmId,
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
      setError(
        "Couldn't mark the film as watched: " + watchedError.message
      );
    } finally {
      setSavingWatchedFilmIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
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
    if (!selectedList) return;

    const confirmed = window.confirm(
      `Remove this film from ${selectedList.name}?`
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
      listType === "watchlist" &&
      onWatchlistRemoved &&
      tmdbId
    ) {
      onWatchlistRemoved(tmdbId);
    }

    if (
      listType === "favourites" &&
      onFavouriteRemoved &&
      tmdbId
    ) {
      onFavouriteRemoved(tmdbId);
    }
  }

  if (!session?.user) {
    return (
      <div className="cit-library-empty">
        Sign in to view your saved films.
      </div>
    );
  }

  return (
    <div className="cit-library-view">
      <style>{`
        .cit-library-view {
          margin: 24px 0 30px;
        }

        .cit-library-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .cit-library-header h1 {
          margin: 0;
          color: #123b2d;
          font-size: clamp(25px, 3.8vw, 36px);
          line-height: 1.05;
          letter-spacing: -0.035em;
        }

        .cit-library-count {
          margin-top: 7px;
          color: #68756f;
          font-size: 13px;
        }

        .cit-library-alerts {
          margin-bottom: 16px;
          padding: 11px;
          border: 1px solid #a8d5b8;
          border-radius: 12px;
          background: #edf7f0;
        }

        .cit-library-alerts-title {
          margin-bottom: 8px;
          color: #214c39;
          font-size: 13px;
          font-weight: 800;
        }

        .cit-library-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border: 1px solid #cce6d4;
          border-radius: 9px;
          background: rgba(255,255,255,.84);
        }

        .cit-library-alert + .cit-library-alert {
          margin-top: 7px;
        }

        .cit-library-alert img {
          width: 38px;
          height: 57px;
          object-fit: cover;
          border-radius: 5px;
        }

        .cit-library-alert-copy {
          flex: 1 1 160px;
          min-width: 0;
        }

        .cit-library-alert-title {
          color: #18382f;
          font-size: 12px;
          font-weight: 800;
        }

        .cit-library-alert-text {
          margin-top: 2px;
          color: #4c6259;
          font-size: 11px;
        }

        .cit-library-alert a {
          display: inline-block;
          margin-top: 3px;
          color: #244f40;
          font-size: 11px;
          font-weight: 700;
        }

        .cit-library-alert-dismiss {
          border: 1px solid #d5ddd8;
          background: #fff;
          color: #52645c;
          padding: 5px 7px;
          border-radius: 7px;
          cursor: pointer;
          font-size: 10px;
        }

        .cit-library-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .cit-library-card {
          min-width: 0;
          cursor: pointer;
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

        .cit-library-card:hover {
          transform: translateY(-4px);
          border-color: #d1cbbf;
          box-shadow: 0 14px 28px rgba(32, 43, 37, .10);
        }

        .cit-library-card:hover .cit-library-poster {
          transform: scale(1.025);
        }

        .cit-library-card:focus-visible {
          outline: 3px solid rgba(18, 59, 45, .16);
          outline-offset: 3px;
        }

        .cit-library-poster-wrap {
          position: relative;
          aspect-ratio: 2 / 3;
          overflow: hidden;
          background: #eae6df;
        }

        .cit-library-watched-badge {
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

        .cit-library-poster {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          transition: transform .22s ease;
        }

        .cit-library-no-poster {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #7b837f;
          font-size: 12px;
        }

        .cit-library-body {
          padding: 11px 11px 12px;
        }

        .cit-library-title {
          min-height: 38px;
          color: #18382f;
          font-size: 15px;
          font-weight: 780;
          line-height: 1.25;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }

        .cit-library-year {
          margin-top: 4px;
          color: #7b837f;
          font-size: 11px;
        }

        .cit-library-availability {
          min-height: 55px;
          margin-top: 10px;
        }

        .cit-library-provider-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .cit-library-provider {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          max-width: 100%;
          border: 1px solid #e0ddd6;
          background: #fff;
          color: #405149;
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 10px;
          line-height: 1;
          box-shadow: 0 1px 3px rgba(28, 42, 35, .035);
        }

        .cit-library-provider img {
          width: 17px;
          height: 17px;
          border-radius: 4px;
          object-fit: cover;
        }

        .cit-library-provider span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cit-library-muted {
          color: #7e8782;
          font-size: 11px;
          line-height: 1.4;
        }

        .cit-library-watch-link {
          display: inline-block;
          margin-top: 7px;
          color: #244f40;
          font-size: 11px;
          font-weight: 700;
        }

        .cit-library-alert-button {
          margin-top: 7px;
          border: 1px solid #b8c9c0;
          background: #fff;
          color: #315447;
          padding: 6px 8px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 700;
          transition:
            background .16s ease,
            border-color .16s ease,
            transform .16s ease;
        }

        .cit-library-alert-button:hover {
          transform: translateY(-1px);
          border-color: #95b5a5;
        }

        .cit-library-alert-button--active {
          border-color: #9bcbaa;
          background: #edf7f0;
        }

        .cit-library-checked {
          margin-top: 6px;
          color: #989c99;
          font-size: 9px;
        }

        .cit-library-watched-button {
          margin-top: 9px;
          border: 1px solid #b8d1c4;
          background: #eef7f2;
          color: #28513f;
          padding: 6px 8px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 750;
          transition:
            transform .16s ease,
            background .16s ease;
        }

        .cit-library-watched-button:hover:not([disabled]) {
          transform: translateY(-1px);
          background: #e4f2ea;
        }

        .cit-library-watched-button[disabled] {
          cursor: default;
        }

        .cit-library-watched-date {
          margin-top: 5px;
          color: #8a918d;
          font-size: 9px;
        }

        .cit-library-remove {
          margin-top: 10px;
          border: 0;
          background: transparent;
          color: #8c3f3f;
          padding: 0;
          cursor: pointer;
          font-size: 10px;
          font-weight: 650;
        }

        .cit-library-empty {
          margin: 28px 0;
          color: #6f7974;
          font-size: 13px;
        }

        .cit-library-empty-card {
          max-width: 520px;
          padding: 24px;
          border: 1px solid #e0dbd2;
          border-radius: 14px;
          background: rgba(255,255,255,.64);
        }

        .cit-library-empty-card h2 {
          margin: 0;
          color: #18382f;
          font-size: 18px;
        }

        .cit-library-empty-card p {
          margin: 8px 0 0;
          color: #6f7974;
          font-size: 13px;
          line-height: 1.5;
        }

        .cit-library-empty-card button {
          margin-top: 14px;
          border: 1px solid #123b2d;
          background: #123b2d;
          color: #fff;
          padding: 8px 12px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
        }

        @media (hover: none) {
          .cit-library-card:hover {
            transform: none;
            box-shadow: 0 3px 12px rgba(32, 43, 37, 0.045);
          }

          .cit-library-card:hover .cit-library-poster {
            transform: none;
          }
        }

        @media (max-width: 1050px) {
          .cit-library-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .cit-library-view {
            margin-top: 20px;
          }

          .cit-library-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .cit-library-card {
            border-radius: 12px;
          }

          .cit-library-body {
            padding: 9px 9px 10px;
          }

          .cit-library-title {
            min-height: 36px;
            font-size: 13px;
          }

          .cit-library-provider {
            font-size: 9px;
            padding: 3px 6px;
          }

          .cit-library-provider img {
            width: 15px;
            height: 15px;
          }
        }

        @media (max-width: 360px) {
          .cit-library-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="cit-library-header">
        <div>
          <h1>{pageTitle}</h1>
          <div className="cit-library-count">
            {loadingItems
              ? "Loading…"
              : `${items.length} ${
                  items.length === 1 ? "film" : "films"
                }`}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            color: "#a22626",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {triggeredAlerts.length > 0 && (
        <div className="cit-library-alerts">
          <div className="cit-library-alerts-title">
            🎉 Now available
          </div>

          {triggeredAlerts.map((alert) => (
            <div key={alert.id} className="cit-library-alert">
              {alert.posterPath ? (
                <img
                  src={`${TMDB_IMG}/w92${alert.posterPath}`}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}

              <div className="cit-library-alert-copy">
                <div className="cit-library-alert-title">
                  {alert.title}
                  {alert.releaseYear
                    ? ` (${alert.releaseYear})`
                    : ""}
                </div>

                <div className="cit-library-alert-text">
                  {alert.providers.length
                    ? `Now available on ${alert.providers.join(", ")}.`
                    : "Now available to stream in the UK."}
                </div>

                {alert.watchUrl && (
                  <a
                    href={alert.watchUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View watch options
                  </a>
                )}
              </div>

              <button
                type="button"
                className="cit-library-alert-dismiss"
                onClick={() => dismissTriggeredAlert(alert.id)}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {!loadingItems && !selectedList && (
        <div className="cit-library-empty-card">
          <h2>This list isn't available yet</h2>
          <p>Head back to Discover and start building your Christmas watchlist.</p>
          <button type="button" onClick={onBrowseDiscover}>
            Browse films
          </button>
        </div>
      )}

      {!loadingItems && selectedList && items.length === 0 && (
        <div className="cit-library-empty-card">
          <h2>
            {listType === "favourites"
              ? "No favourites yet"
              : "Your Christmas list is empty"}
          </h2>
          <p>
            {listType === "favourites"
              ? "Save the films you really love using the heart on Discover."
              : "Browse the catalogue and add the films you want to watch this Christmas."}
          </p>
          <button type="button" onClick={onBrowseDiscover}>
            Browse films
          </button>
        </div>
      )}

      {!loadingItems && items.length > 0 && (
        <div className="cit-library-grid">
          {items.map((item) => {
            const film = item.v2_films;
            const filmId = film?.id;
            const filmKey = String(filmId || "");
            const availability =
              availabilityByFilmId[filmKey] || null;

            const providers = uniqueProviders(
              availability?.providers || []
            );

            const hasStreaming = providers.length > 0;
            const alertActive = alertFilmIds.has(filmKey);
            const alertSaving = alertSavingFilmIds.has(filmKey);
            const watchedAt = watchedByFilmId[filmKey] || null;
            const savingWatched = savingWatchedFilmIds.has(filmKey);

            return (
              <article
                key={item.id}
                className="cit-library-card"
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
                aria-label={`View details for ${film?.title || "film"}`}
              >
                <div className="cit-library-poster-wrap">
                  {watchedAt && (
                    <span
                      className="cit-library-watched-badge"
                      title={`Watched ${formatWatchedDate(watchedAt)}`}
                    >
                      ✓ Watched
                    </span>
                  )}
                  {film?.poster_path ? (
                    <img
                      className="cit-library-poster"
                      src={`${TMDB_IMG}/w342${film.poster_path}`}
                      alt={film.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="cit-library-no-poster">
                      No poster
                    </div>
                  )}
                </div>

                <div className="cit-library-body">
                  <div className="cit-library-title">
                    {film?.title || "Untitled film"}
                  </div>

                  <div className="cit-library-year">
                    {film?.release_year || "Year unknown"}
                  </div>

                  <div className="cit-library-availability">
                    {!availability ? (
                      <div className="cit-library-muted">
                        UK availability hasn't been checked yet.
                      </div>
                    ) : hasStreaming ? (
                      <>
                        <ProviderBadges providers={providers} max={3} />

                        {availability.watchUrl && (
                          <a
                            className="cit-library-watch-link"
                            href={availability.watchUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View watch options
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="cit-library-muted">
                          Not currently included with a UK streaming service.
                        </div>

                        <button
                          type="button"
                          className={`cit-library-alert-button ${
                            alertActive
                              ? "cit-library-alert-button--active"
                              : ""
                          }`}
                          onClick={() =>
                            toggleAvailabilityAlert(filmId)
                          }
                          disabled={alertSaving}
                        >
                          {alertSaving
                            ? "Saving…"
                            : alertActive
                            ? "🔔 Watching for availability"
                            : "🔔 Tell me when available"}
                        </button>
                      </>
                    )}

                    {availability?.checkedAt && (
                      <div className="cit-library-checked">
                        {formatCheckedAt(availability.checkedAt)} ·
                        JustWatch
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="cit-library-watched-button"
                    onClick={() => markAsWatched(filmId)}
                    disabled={!!watchedAt || savingWatched}
                  >
                    {savingWatched
                      ? "Saving…"
                      : watchedAt
                      ? "✓ Watched"
                      : "✓ Mark as watched"}
                  </button>

                  {watchedAt && (
                    <div className="cit-library-watched-date">
                      Watched {formatWatchedDate(watchedAt)}
                    </div>
                  )}

                  <button
                    type="button"
                    className="cit-library-remove"
                    onClick={() =>
                      removeItem(item.id, film?.tmdb_id)
                    }
                  >
                    Remove from {pageTitle}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedFilm && (
        <FilmDetailsModal
          film={selectedFilm}
          supabase={supabase}
          session={session}
          onClose={() => setSelectedFilm(null)}
          onWatched={(watchedAt) => {
            const key = String(selectedFilm.id);
            setWatchedByFilmId((prev) => ({
              ...prev,
              [key]: watchedAt,
            }));
          }}
        />
      )}
    </div>
  );
}
