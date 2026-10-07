import React, { useEffect, useState } from "react";
import PlannerAddModal from "./PlannerAddModal";

const TMDB_IMG = "https://image.tmdb.org/t/p";
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";

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

function formatRuntime(minutes) {
  if (!minutes) return "";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;

  return `${hours}h ${mins}m`;
}

function formatReleaseDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function ProviderBadges({ providers }) {
  const rows = uniqueProviders(providers);

  if (!rows.length) return null;

  return (
    <div className="cit-shared-provider-row">
      {rows.map((provider) => (
        <span
          key={`${provider.provider_id || provider.provider_name}__${
            provider.provider_type || ""
          }`}
          className="cit-shared-provider"
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

export default function FilmDetailsModal({
  film,
  supabase,
  session,
  onClose,
  onWatched,
  onWatchlistAdded,
  onFavouriteAdded,
}) {
  const [richDetails, setRichDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [availability, setAvailability] = useState({
    subscription: [],
    free: [],
    ads: [],
    watchUrl: null,
    checkedAt: null,
    checked: false,
  });

  const [commercialAvailability, setCommercialAvailability] = useState({
    rent: [],
    buy: [],
    loaded: false,
  });
  const [loadingCommercialAvailability, setLoadingCommercialAvailability] =
    useState(false);

  const [refreshingAvailability, setRefreshingAvailability] =
    useState(false);

  const [inWatchlist, setInWatchlist] = useState(false);
  const [isFavourite, setIsFavourite] = useState(false);
  const [watchedAt, setWatchedAt] = useState(null);

  const [alertActive, setAlertActive] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [savingFavourite, setSavingFavourite] = useState(false);
  const [savingWatched, setSavingWatched] = useState(false);
  const [showPlannerAdd, setShowPlannerAdd] = useState(false);

  useEffect(() => {
    if (!film) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [film, onClose]);

  useEffect(() => {
    if (!film?.tmdb_id || !TMDB_KEY) return;

    let cancelled = false;

    async function loadRichDetails() {
      setDetailLoading(true);
      setDetailError("");

      try {
        const url = new URL(
          `https://api.themoviedb.org/3/movie/${film.tmdb_id}`
        );

        url.searchParams.set("api_key", TMDB_KEY);
        url.searchParams.set("language", "en-GB");
        url.searchParams.set(
          "append_to_response",
          "credits,release_dates"
        );

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`TMDB details failed (${response.status})`);
        }

        const data = await response.json();

        const ukReleaseData = (data?.release_dates?.results || []).find(
          (row) => row.iso_3166_1 === "GB"
        );

        const certification =
          (ukReleaseData?.release_dates || [])
            .map((row) => (row.certification || "").trim())
            .find(Boolean) || "";

        const director =
          (data?.credits?.crew || []).find(
            (person) => person.job === "Director"
          )?.name || "";

        const cast = (data?.credits?.cast || [])
          .slice(0, 5)
          .map((person) => person.name)
          .filter(Boolean);

        if (!cancelled) {
          setRichDetails({
            runtime: data?.runtime || null,
            genres: (data?.genres || [])
              .map((genre) => genre.name)
              .filter(Boolean),
            certification,
            director,
            cast,
            imdbId: data?.imdb_id || null,
            releaseDate: data?.release_date || null,
            tagline: data?.tagline || "",
            backdropPath: data?.backdrop_path || film.backdrop_path || null,
          });
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setDetailError("Extra film details couldn't be loaded right now.");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    loadRichDetails();

    return () => {
      cancelled = true;
    };
  }, [film]);

  useEffect(() => {
    if (!supabase || !film?.id) return;

    let cancelled = false;

    async function loadAvailability() {
      const { data, error } = await supabase
        .from("v2_streaming_availability")
        .select(`
          provider_id,
          provider_name,
          provider_type,
          logo_path,
          watch_url,
          checked_at
        `)
        .eq("region", "GB")
        .eq("film_id", film.id);

      if (cancelled) return;

      if (error) {
        console.error("Couldn't load availability:", error);
        return;
      }

      const rows = data || [];

      const next = {
        subscription: [],
        free: [],
        ads: [],
        watchUrl: null,
        checkedAt: null,
        checked: rows.length > 0,
      };

      for (const row of rows) {
        if (
          !next.checkedAt ||
          new Date(row.checked_at) > new Date(next.checkedAt)
        ) {
          next.checkedAt = row.checked_at;
        }

        if (!next.watchUrl && row.watch_url) {
          next.watchUrl = row.watch_url;
        }

        if (row.provider_type === "none") continue;

        const provider = {
          provider_id: row.provider_id,
          provider_name: normaliseProviderName(row.provider_name),
          provider_type: row.provider_type,
          logo_path: row.logo_path,
        };

        if (row.provider_type === "subscription") {
          next.subscription.push(provider);
        } else if (row.provider_type === "free") {
          next.free.push(provider);
        } else if (row.provider_type === "ads") {
          next.ads.push(provider);
        }
      }

      setAvailability(next);
    }

    loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [supabase, film]);

  useEffect(() => {
    if (!film?.tmdb_id || !TMDB_KEY) {
      setCommercialAvailability({
        rent: [],
        buy: [],
        loaded: true,
      });
      return;
    }

    let cancelled = false;

    async function loadCommercialAvailability() {
      setLoadingCommercialAvailability(true);

      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${film.tmdb_id}/watch/providers?api_key=${TMDB_KEY}`
        );

        if (!response.ok) {
          throw new Error(
            `TMDB watch provider request failed (${response.status})`
          );
        }

        const data = await response.json();
        const gb = data?.results?.GB || {};

        const rent = uniqueProviders(
          (gb.rent || []).map((provider) => ({
            provider_id: provider.provider_id ?? null,
            provider_name: normaliseProviderName(provider.provider_name),
            provider_type: "rent",
            logo_path: provider.logo_path || null,
          }))
        );

        const buy = uniqueProviders(
          (gb.buy || []).map((provider) => ({
            provider_id: provider.provider_id ?? null,
            provider_name: normaliseProviderName(provider.provider_name),
            provider_type: "buy",
            logo_path: provider.logo_path || null,
          }))
        );

        if (!cancelled) {
          setCommercialAvailability({
            rent,
            buy,
            loaded: true,
          });
        }
      } catch (error) {
        console.warn("Couldn't load UK rent/buy availability:", error);

        if (!cancelled) {
          setCommercialAvailability({
            rent: [],
            buy: [],
            loaded: true,
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingCommercialAvailability(false);
        }
      }
    }

    loadCommercialAvailability();

    return () => {
      cancelled = true;
    };
  }, [film]);

  useEffect(() => {
    if (!supabase || !session?.user || !film?.id) return;

    let cancelled = false;

    async function loadPersonalState() {
      const [
        { data: listItems, error: listError },
        { data: viewingEvents, error: viewedError },
        { data: alerts, error: alertError },
      ] = await Promise.all([
        supabase
          .from("v2_list_items")
          .select(`
            film_id,
            v2_lists!inner (
              user_id,
              list_type
            )
          `)
          .eq("film_id", film.id)
          .eq("v2_lists.user_id", session.user.id),

        supabase
          .from("v2_viewing_events")
          .select("watched_at")
          .eq("user_id", session.user.id)
          .eq("film_id", film.id)
          .order("watched_at", { ascending: false })
          .limit(1),

        supabase
          .from("v2_availability_alerts")
          .select("active")
          .eq("user_id", session.user.id)
          .eq("film_id", film.id)
          .eq("active", true)
          .limit(1),
      ]);

      if (cancelled) return;

      if (listError) console.error(listError);
      if (viewedError) console.error(viewedError);
      if (alertError) console.error(alertError);

      const listTypes = new Set(
        (listItems || [])
          .map((row) => row.v2_lists?.list_type)
          .filter(Boolean)
      );

      setInWatchlist(listTypes.has("watchlist"));
      setIsFavourite(listTypes.has("favourites"));
      setWatchedAt(viewingEvents?.[0]?.watched_at || null);
      setAlertActive((alerts || []).length > 0);
    }

    loadPersonalState();

    return () => {
      cancelled = true;
    };
  }, [supabase, session, film]);

  async function addToSpecialList(listType) {
    if (!session?.user) {
      alert("Sign in to save films.");
      return;
    }

    const setter =
      listType === "watchlist" ? setSavingWatchlist : setSavingFavourite;

    setter(true);

    try {
      const { error } = await supabase.rpc(
        "v2_save_film_to_special_list",
        {
          p_list_type: listType,
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

      if (error) throw error;

      if (listType === "watchlist") {
        setInWatchlist(true);
        onWatchlistAdded?.(film.tmdb_id);
      } else {
        setIsFavourite(true);
        onFavouriteAdded?.(film.tmdb_id);
      }
    } catch (error) {
      console.error(error);
      alert("Couldn't save the film: " + error.message);
    } finally {
      setter(false);
    }
  }

  async function markAsWatched() {
    if (!film?.id || !session?.user || watchedAt) return;

    setSavingWatched(true);

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

      const value = data?.watched_at || new Date().toISOString();

      setWatchedAt(value);
      onWatched?.(value);
    } catch (error) {
      console.error(error);
      alert("Couldn't mark the film as watched: " + error.message);
    } finally {
      setSavingWatched(false);
    }
  }

  async function toggleAvailabilityAlert() {
    if (!film?.id || !session?.user) return;

    setSavingAlert(true);

    try {
      if (alertActive) {
        const { error } = await supabase
          .from("v2_availability_alerts")
          .delete()
          .eq("user_id", session.user.id)
          .eq("film_id", film.id);

        if (error) throw error;

        setAlertActive(false);
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
            { onConflict: "user_id,film_id" }
          );

        if (error) throw error;

        setAlertActive(true);
      }
    } catch (error) {
      console.error(error);
      alert("Couldn't update the availability alert: " + error.message);
    } finally {
      setSavingAlert(false);
    }
  }

  async function refreshAvailability() {
    if (!film?.tmdb_id || !TMDB_KEY) return;

    setRefreshingAvailability(true);

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${film.tmdb_id}/watch/providers?api_key=${TMDB_KEY}`
      );

      if (!response.ok) {
        throw new Error(`TMDB request failed (${response.status})`);
      }

      const data = await response.json();

      const gb = data?.results?.GB || {
        flatrate: [],
        free: [],
        ads: [],
        link: null,
      };

      const subscription = uniqueProviders(
        (gb.flatrate || []).map((provider) => ({
          provider_id: provider.provider_id ?? null,
          provider_name: normaliseProviderName(provider.provider_name),
          provider_type: "subscription",
          logo_path: provider.logo_path || null,
        }))
      );

      const free = uniqueProviders(
        (gb.free || []).map((provider) => ({
          provider_id: provider.provider_id ?? null,
          provider_name: normaliseProviderName(provider.provider_name),
          provider_type: "free",
          logo_path: provider.logo_path || null,
        }))
      );

      const ads = uniqueProviders(
        (gb.ads || []).map((provider) => ({
          provider_id: provider.provider_id ?? null,
          provider_name: normaliseProviderName(provider.provider_name),
          provider_type: "ads",
          logo_path: provider.logo_path || null,
        }))
      );

      const providerRows = [
        ...subscription.map((provider) => ({
          ...provider,
          watch_url: gb.link || null,
        })),
        ...free.map((provider) => ({
          ...provider,
          watch_url: gb.link || null,
        })),
        ...ads.map((provider) => ({
          ...provider,
          watch_url: gb.link || null,
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
        console.warn("Couldn't cache refreshed availability:", cacheError);
      }

      setAvailability({
        subscription,
        free,
        ads,
        watchUrl: gb.link || null,
        checkedAt: new Date().toISOString(),
        checked: true,
      });
    } catch (error) {
      console.error(error);
      alert("Couldn't refresh UK availability right now.");
    } finally {
      setRefreshingAvailability(false);
    }
  }

  if (!film) return null;

  const backdropPath = richDetails?.backdropPath || film.backdrop_path || null;
  const hasStreaming =
    availability.subscription.length > 0 ||
    availability.free.length > 0 ||
    availability.ads.length > 0;

  return (
    <div
      className="cit-shared-detail-overlay"
      onClick={() => onClose?.()}
    >
      <style>{`
        .cit-shared-detail-overlay {
          position: fixed;
          inset: 0;
          z-index: 2500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 10px;
          background: rgba(22,30,26,.54);
          backdrop-filter: blur(6px);
        }

        .cit-shared-detail-modal {
          position: relative;
          width: min(980px, 100%);
          max-height: calc(100vh - 20px);
          overflow: auto;
          border: 1px solid #ddd8cf;
          border-radius: 18px;
          background: #fbfaf7;
          box-shadow: 0 24px 70px rgba(14,23,19,.28);
        }

        .cit-shared-detail-hero {
          position: relative;
          min-height: 150px;
          overflow: hidden;
          border-radius: 18px 18px 0 0;
          background: #e8e4dd;
        }

        .cit-shared-detail-backdrop {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cit-shared-detail-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            rgba(20,31,26,.78) 0%,
            rgba(20,31,26,.48) 48%,
            rgba(20,31,26,.22) 100%
          );
        }

        .cit-shared-detail-heading {
          position: relative;
          z-index: 1;
          max-width: 620px;
          padding: 34px 58px 26px 30px;
          color: #fff;
        }

        .cit-shared-detail-heading h2 {
          margin: 0;
          font-size: clamp(28px, 4vw, 42px);
          line-height: 1.04;
          letter-spacing: -.04em;
        }

        .cit-shared-detail-heading-meta {
          margin-top: 8px;
          color: rgba(255,255,255,.82);
          font-size: 13px;
        }

        .cit-shared-detail-close {
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
          transition:
            transform .16s ease,
            box-shadow .16s ease,
            background .16s ease;
        }

        .cit-shared-detail-close:hover {
          transform: scale(1.05);
          background: #fff;
          box-shadow: 0 6px 18px rgba(0,0,0,.16);
        }

        .cit-shared-detail-close:focus-visible {
          outline: 3px solid rgba(255,255,255,.75);
          outline-offset: 2px;
        }

        .cit-shared-detail-content {
          display: grid;
          grid-template-columns: 195px minmax(0, 1fr);
          gap: 20px;
          padding: 20px;
        }

        .cit-shared-detail-poster {
          width: 100%;
          aspect-ratio: 2 / 3;
          object-fit: cover;
          border-radius: 12px;
          background: #eae6df;
          box-shadow: 0 8px 20px rgba(31,39,35,.11);
        }

        .cit-shared-detail-copy {
          min-width: 0;
        }

        .cit-shared-detail-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: 7px 12px;
          margin: 0 0 14px;
          color: #77827d;
          font-size: 11px;
        }

        .cit-shared-detail-metadata span + span::before {
          content: "·";
          margin-right: 12px;
          color: #b0b5b2;
        }

        .cit-shared-detail-tagline {
          margin: 0 0 8px;
          color: #52635c;
          font-size: 13px;
          font-style: italic;
        }

        .cit-shared-detail-overview {
          margin: 0;
          color: #44554e;
          font-size: 14px;
          line-height: 1.65;
        }

        .cit-shared-detail-credits {
          display: grid;
          gap: 7px;
          margin-top: 14px;
          padding: 12px 13px;
          border: 1px solid #e5e0d8;
          border-radius: 10px;
          background: rgba(255,255,255,.58);
        }

        .cit-shared-detail-credit-row {
          display: grid;
          grid-template-columns: 68px 1fr;
          gap: 10px;
          color: #465850;
          font-size: 11px;
          line-height: 1.45;
        }

        .cit-shared-detail-credit-label {
          color: #8a918d;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: .04em;
          font-size: 9px;
        }

        .cit-shared-detail-imdb {
          display: inline-block;
          margin-top: 10px;
          color: #244f40;
          font-size: 11px;
          font-weight: 750;
          text-decoration: none;
        }

        .cit-shared-detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 18px;
        }

        .cit-shared-detail-primary,
        .cit-shared-detail-secondary,
        .cit-shared-detail-planner,
        .cit-shared-detail-watched {
          border-radius: 9px;
          padding: 9px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
          transition:
            transform .16s ease,
            background .16s ease,
            border-color .16s ease,
            box-shadow .16s ease;
        }

        .cit-shared-detail-primary:hover:not([disabled]),
        .cit-shared-detail-secondary:hover:not([disabled]),
        .cit-shared-detail-planner:hover:not([disabled]),
        .cit-shared-detail-watched:hover:not([disabled]) {
          transform: translateY(-1px);
        }

        .cit-shared-detail-primary:hover:not([disabled]) {
          background: #0d3024;
          box-shadow: 0 5px 12px rgba(18, 59, 45, .12);
        }

        .cit-shared-detail-primary {
          border: 1px solid #123b2d;
          background: #123b2d;
          color: #fff;
        }

        .cit-shared-detail-primary[disabled] {
          border-color: #c9d8d0;
          background: #edf5f1;
          color: #295342;
          cursor: default;
        }

        .cit-shared-detail-secondary {
          border: 1px solid #d8d3ca;
          background: #fff;
          color: #40574f;
        }

        .cit-shared-detail-secondary[disabled] {
          background: #fff4f5;
          color: #8f2730;
          cursor: default;
        }

        .cit-shared-detail-planner {
          border: 1px solid #d8c7a8;
          background: #fffaf0;
          color: #654a20;
        }

        .cit-shared-detail-planner:hover:not([disabled]) {
          background: #fff3da;
        }

        .cit-shared-detail-watched {
          border: 1px solid #b8d1c4;
          background: #eef7f2;
          color: #28513f;
        }

        .cit-shared-detail-watched[disabled] {
          cursor: default;
        }

        .cit-shared-detail-watched-date {
          margin-top: 6px;
          color: #7c8681;
          font-size: 10px;
          box-shadow: 0 1px 3px rgba(28, 42, 35, .035);
        }

        .cit-shared-detail-watch {
          margin-top: 18px;
          padding-top: 15px;
          border-top: 1px solid #e5e0d8;
        }

        .cit-shared-detail-watch h3 {
          margin: 0 0 10px;
          color: #18382f;
          font-size: 15px;
        }

        .cit-shared-detail-provider-group {
          display: grid;
          grid-template-columns: 78px minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          padding: 8px 10px;
          border: 1px solid #e1ddd5;
          border-radius: 10px;
          background: rgba(255,255,255,.7);
        }

        .cit-shared-detail-provider-group + .cit-shared-detail-provider-group {
          margin-top: 7px;
        }

        .cit-shared-detail-provider-label {
          margin-bottom: 0;
          color: #7b847f;
          font-size: 10px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: .05em;
        }

        .cit-shared-provider-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .cit-shared-provider {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #e0ddd6;
          background: #fff;
          color: #405149;
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 10px;
        }

        .cit-shared-provider img {
          width: 17px;
          height: 17px;
          border-radius: 4px;
          object-fit: cover;
        }

        .cit-shared-detail-muted {
          color: #6f7974;
          font-size: 13px;
          line-height: 1.45;
        }

        .cit-shared-detail-alert {
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

        .cit-shared-detail-link {
          display: inline-block;
          margin-top: 10px;
          color: #244f40;
          font-size: 11px;
          font-weight: 700;
        }

        .cit-shared-detail-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
          color: #969c98;
          font-size: 10px;
        }

        .cit-shared-detail-refresh {
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

        .cit-shared-detail-loading {
          color: #89918d;
          font-size: 11px;
          margin-bottom: 10px;
        }


        .cit-shared-skeleton {
          display: grid;
          gap: 7px;
          margin-bottom: 14px;
        }

        .cit-shared-skeleton-line {
          height: 9px;
          border-radius: 999px;
          background:
            linear-gradient(
              90deg,
              #ece8e1 25%,
              #f7f4ef 40%,
              #ece8e1 55%
            );
          background-size: 260% 100%;
          animation: citSharedShimmer 1.2s ease-in-out infinite;
        }

        .cit-shared-skeleton-line:nth-child(1) {
          width: 72%;
        }

        .cit-shared-skeleton-line:nth-child(2) {
          width: 94%;
        }

        .cit-shared-skeleton-line:nth-child(3) {
          width: 60%;
        }

        @keyframes citSharedShimmer {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }

        .cit-shared-commercial-heading {
          margin: 13px 0 6px;
          color: #66736d;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .07em;
        }

        @media (max-width: 720px) {
          .cit-shared-detail-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .cit-shared-detail-modal {
            width: 100%;
            max-height: 94dvh;
            border-radius: 18px 18px 0 0;
            border-bottom: 0;
          }

          .cit-shared-detail-hero {
            min-height: 132px;
            border-radius: 18px 18px 0 0;
          }

          .cit-shared-detail-heading {
            padding: 42px 54px 20px 18px;
          }

          .cit-shared-detail-heading h2 {
            font-size: clamp(25px, 8vw, 32px);
          }

          .cit-shared-detail-content {
            grid-template-columns: 92px minmax(0, 1fr);
            gap: 14px;
            padding: 16px;
          }

          .cit-shared-detail-overview {
            font-size: 12px;
            line-height: 1.55;
          }

          .cit-shared-detail-provider-group {
            display: block;
          }

          .cit-shared-detail-provider-label {
            margin-bottom: 7px;
          }

          .cit-shared-detail-copy {
            display: contents;
          }

          .cit-shared-detail-content {
            grid-template-columns: 78px minmax(0, 1fr);
            gap: 10px 12px;
            padding: 14px;
          }

          .cit-shared-detail-content > div:first-child {
            grid-column: 1;
            grid-row: 1 / span 2;
          }

          .cit-shared-detail-poster {
            border-radius: 9px;
          }

          .cit-shared-detail-metadata,
          .cit-shared-skeleton {
            grid-column: 2;
            margin-bottom: 0;
          }

          .cit-shared-detail-metadata {
            gap: 5px 10px;
          }

          .cit-shared-detail-metadata span + span::before {
            content: none;
            margin-right: 0;
          }

          .cit-shared-detail-metadata span:last-child {
            flex-basis: 100%;
          }

          .cit-shared-detail-tagline {
            grid-column: 2;
            margin: 0;
            font-size: 12px;
            line-height: 1.4;
          }

          .cit-shared-detail-overview,
          .cit-shared-detail-credits,
          .cit-shared-detail-imdb,
          .cit-shared-detail-loading,
          .cit-shared-detail-actions,
          .cit-shared-detail-watch {
            grid-column: 1 / -1;
          }

          .cit-shared-detail-overview {
            margin-top: 2px;
          }

          .cit-shared-detail-credits {
            margin-top: 4px;
            padding: 10px 11px;
          }

          .cit-shared-detail-imdb {
            margin-top: 0;
          }

          .cit-shared-detail-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 4px;
          }

          .cit-shared-detail-actions > .cit-shared-detail-primary {
            grid-column: 1 / -1;
          }

          .cit-shared-detail-actions > .cit-shared-detail-secondary,
          .cit-shared-detail-actions > .cit-shared-detail-planner,
          .cit-shared-detail-actions > div,
          .cit-shared-detail-watched {
            width: 100%;
            box-sizing: border-box;
          }

          .cit-shared-detail-primary,
          .cit-shared-detail-secondary,
          .cit-shared-detail-planner,
          .cit-shared-detail-watched {
            min-height: 40px;
            padding: 9px 8px;
          }

          .cit-shared-detail-watch {
            margin-top: 4px;
            padding-top: 14px;
          }

          .cit-shared-detail-watch h3 {
            margin-bottom: 8px;
            font-size: 14px;
          }

          .cit-shared-detail-provider-group {
            display: grid;
            grid-template-columns: 70px minmax(0, 1fr);
            gap: 8px;
            align-items: center;
            padding: 8px 9px;
          }

          .cit-shared-detail-provider-label {
            margin-bottom: 0;
          }
        }
      `}</style>

      <div
        className="cit-shared-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cit-shared-film-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cit-shared-detail-hero">
          {backdropPath ? (
            <img
              className="cit-shared-detail-backdrop"
              src={`${TMDB_IMG}/w1280${backdropPath}`}
              alt=""
              aria-hidden="true"
            />
          ) : null}

          <div className="cit-shared-detail-shade" />

          <button
            type="button"
            className="cit-shared-detail-close"
            onClick={onClose}
            aria-label="Close film details"
          >
            ×
          </button>

          <div className="cit-shared-detail-heading">
            <h2 id="cit-shared-film-title">{film.title}</h2>
            <div className="cit-shared-detail-heading-meta">
              {film.release_year || "Year unknown"}
            </div>
          </div>
        </div>

        <div className="cit-shared-detail-content">
          <div>
            {film.poster_path ? (
              <img
                className="cit-shared-detail-poster"
                src={`${TMDB_IMG}/w342${film.poster_path}`}
                alt={film.title}
              />
            ) : (
              <div className="cit-shared-detail-poster" />
            )}
          </div>

          <div className="cit-shared-detail-copy">
            {detailLoading && (
              <div
                className="cit-shared-skeleton"
                aria-label="Loading film details"
              >
                <div className="cit-shared-skeleton-line" />
                <div className="cit-shared-skeleton-line" />
                <div className="cit-shared-skeleton-line" />
              </div>
            )}

            {richDetails && (
              <div className="cit-shared-detail-metadata">
                {richDetails.runtime && (
                  <span>{formatRuntime(richDetails.runtime)}</span>
                )}
                {richDetails.certification && (
                  <span>{richDetails.certification}</span>
                )}
                {richDetails.genres?.length > 0 && (
                  <span>{richDetails.genres.join(" / ")}</span>
                )}
                {richDetails.releaseDate && (
                  <span>
                    Released {formatReleaseDate(richDetails.releaseDate)}
                  </span>
                )}
              </div>
            )}

            {richDetails?.tagline && (
              <div className="cit-shared-detail-tagline">
                “{richDetails.tagline}”
              </div>
            )}

            <p className="cit-shared-detail-overview">
              {film.overview || "No synopsis is available for this film yet."}
            </p>

            {(richDetails?.director || richDetails?.cast?.length > 0) && (
              <div className="cit-shared-detail-credits">
                {richDetails.director && (
                  <div className="cit-shared-detail-credit-row">
                    <span className="cit-shared-detail-credit-label">
                      Director
                    </span>
                    <span>{richDetails.director}</span>
                  </div>
                )}

                {richDetails.cast?.length > 0 && (
                  <div className="cit-shared-detail-credit-row">
                    <span className="cit-shared-detail-credit-label">
                      Cast
                    </span>
                    <span>{richDetails.cast.join(", ")}</span>
                  </div>
                )}
              </div>
            )}

            {richDetails?.imdbId && (
              <a
                className="cit-shared-detail-imdb"
                href={`https://www.imdb.com/title/${richDetails.imdbId}/`}
                target="_blank"
                rel="noreferrer"
              >
                IMDb ↗
              </a>
            )}

            {detailError && (
              <div className="cit-shared-detail-loading">
                {detailError}
              </div>
            )}

            <div className="cit-shared-detail-actions">
              <button
                type="button"
                className="cit-shared-detail-primary"
                onClick={() => addToSpecialList("watchlist")}
                disabled={inWatchlist || savingWatchlist}
              >
                {savingWatchlist
                  ? "Saving…"
                  : inWatchlist
                  ? "✓ In My Christmas List"
                  : "+ My Christmas List"}
              </button>

              <button
                type="button"
                className="cit-shared-detail-secondary"
                onClick={() => addToSpecialList("favourites")}
                disabled={isFavourite || savingFavourite}
              >
                {savingFavourite
                  ? "Saving…"
                  : isFavourite
                  ? "♥ Favourite"
                  : "♡ Add to Favourites"}
              </button>

              {session?.user && (
                <button
                  type="button"
                  className="cit-shared-detail-planner"
                  onClick={() => setShowPlannerAdd(true)}
                >
                  📅 Add to Planner
                </button>
              )}

              <div>
                <button
                  type="button"
                  className="cit-shared-detail-watched"
                  onClick={markAsWatched}
                  disabled={!!watchedAt || savingWatched}
                >
                  {savingWatched
                    ? "Saving…"
                    : watchedAt
                    ? "✓ Watched"
                    : "✓ Mark as watched"}
                </button>

                {watchedAt && (
                  <div className="cit-shared-detail-watched-date">
                    Watched {formatWatchedDate(watchedAt)}
                  </div>
                )}
              </div>
            </div>

            <div className="cit-shared-detail-watch">
              <h3>Where to watch in the UK</h3>

              {!availability.checked ? (
                <div className="cit-shared-detail-muted">
                  UK streaming availability hasn't been checked yet.
                </div>
              ) : !hasStreaming ? (
                <div>
                  <div className="cit-shared-detail-muted">
                    Not currently included with a UK subscription, free or
                    ad-supported streaming service.
                  </div>

                  {session?.user && (
                    <button
                      type="button"
                      className="cit-shared-detail-alert"
                      onClick={toggleAvailabilityAlert}
                      disabled={savingAlert}
                    >
                      {savingAlert
                        ? "Saving…"
                        : alertActive
                        ? "🔔 Watching for availability"
                        : "🔔 Tell me when available"}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {availability.subscription.length > 0 && (
                    <div className="cit-shared-detail-provider-group">
                      <div className="cit-shared-detail-provider-label">
                        Subscription
                      </div>
                      <ProviderBadges
                        providers={availability.subscription}
                      />
                    </div>
                  )}

                  {availability.free.length > 0 && (
                    <div className="cit-shared-detail-provider-group">
                      <div className="cit-shared-detail-provider-label">
                        Free
                      </div>
                      <ProviderBadges providers={availability.free} />
                    </div>
                  )}

                  {availability.ads.length > 0 && (
                    <div className="cit-shared-detail-provider-group">
                      <div className="cit-shared-detail-provider-label">
                        Free with ads
                      </div>
                      <ProviderBadges providers={availability.ads} />
                    </div>
                  )}
                </>
              )}

              {(commercialAvailability.rent.length > 0 ||
                commercialAvailability.buy.length > 0) && (
                <>
                  <div className="cit-shared-commercial-heading">
                    Rent or buy
                  </div>

                  {commercialAvailability.rent.length > 0 && (
                    <div className="cit-shared-detail-provider-group">
                      <div className="cit-shared-detail-provider-label">
                        Rent
                      </div>
                      <ProviderBadges
                        providers={commercialAvailability.rent}
                      />
                    </div>
                  )}

                  {commercialAvailability.buy.length > 0 && (
                    <div className="cit-shared-detail-provider-group">
                      <div className="cit-shared-detail-provider-label">
                        Buy
                      </div>
                      <ProviderBadges
                        providers={commercialAvailability.buy}
                      />
                    </div>
                  )}
                </>
              )}

              {loadingCommercialAvailability && (
                <div className="cit-shared-detail-loading">
                  Checking rent and buy options…
                </div>
              )}

              {availability.watchUrl && (
                <a
                  className="cit-shared-detail-link"
                  href={availability.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View watch options
                </a>
              )}

              <div className="cit-shared-detail-footer">
                {availability.checkedAt && (
                  <span>{formatCheckedAt(availability.checkedAt)} · JustWatch</span>
                )}

                {availability.checkedAt && <span>·</span>}

                <button
                  type="button"
                  className="cit-shared-detail-refresh"
                  onClick={refreshAvailability}
                  disabled={refreshingAvailability}
                >
                  {refreshingAvailability ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPlannerAdd && (
        <PlannerAddModal
          film={film}
          supabase={supabase}
          session={session}
          onClose={() => setShowPlannerAdd(false)}
        />
      )}
    </div>
  );
}
