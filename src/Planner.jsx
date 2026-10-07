import React, { useEffect, useMemo, useState } from "react";
import FilmDetailsModal from "./FilmDetailsModal";

const TMDB_IMG = "https://image.tmdb.org/t/p";

const THEMES = [
  "",
  "Family Night",
  "Date Night",
  "Christmas Classics",
  "Christmas Comedy",
  "Festive Favourites",
  "Cosy Night",
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function initialPlannerMonth() {
  const now = new Date();

  // During the Christmas build-up, open straight on December.
  if (now.getMonth() < 11) {
    return new Date(now.getFullYear(), 11, 1);
  }

  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function formatDateLong(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateShort(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value) {
  if (!value) return "";

  const parts = String(value).split(":");
  if (parts.length < 2) return value;

  return `${parts[0]}:${parts[1]}`;
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
    "Apple TV Plus": "Apple TV",
    "Apple TV+": "Apple TV",
    "Now TV": "NOW",
    "NOW TV": "NOW",
    "NOW TV Cinema": "NOW",
    "Now TV Cinema": "NOW",
  };

  return direct[name] || name;
}

function uniqueProviders(rows = []) {
  const seen = new Set();

  return rows.filter((row) => {
    const name = normaliseProviderName(row.provider_name);
    if (!name || name === "none" || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function EventPoster({ film, size = "normal" }) {
  if (!film?.poster_path) {
    return (
      <div
        className={`cit-planner-poster-placeholder ${
          size === "small" ? "cit-planner-poster-placeholder--small" : ""
        }`}
      >
        No poster
      </div>
    );
  }

  return (
    <img
      className={`cit-planner-poster ${
        size === "small" ? "cit-planner-poster--small" : ""
      }`}
      src={`${TMDB_IMG}/${size === "small" ? "w92" : "w185"}${
        film.poster_path
      }`}
      alt=""
      aria-hidden="true"
      loading="lazy"
    />
  );
}

function ProviderChips({ providers }) {
  const rows = uniqueProviders(providers);

  if (!rows.length) return null;

  return (
    <div className="cit-planner-providers">
      {rows.slice(0, 3).map((provider) => (
        <span
          className="cit-planner-provider"
          key={`${provider.provider_id || ""}-${provider.provider_name}`}
        >
          {provider.logo_path ? (
            <img
              src={`${TMDB_IMG}/w45${provider.logo_path}`}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          {normaliseProviderName(provider.provider_name)}
        </span>
      ))}
    </div>
  );
}

function PlannerEditModal({
  event,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
}) {
  const [plannedDate, setPlannedDate] = useState(event.planned_date || "");
  const [plannedTime, setPlannedTime] = useState(
    event.planned_time ? formatTime(event.planned_time) : ""
  );
  const [theme, setTheme] = useState(event.theme || "");
  const [notes, setNotes] = useState(event.notes || "");

  function submit(e) {
    e.preventDefault();

    onSave({
      planned_date: plannedDate,
      planned_time: plannedTime || null,
      theme: theme || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div
      className="cit-planner-edit-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cit-planner-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cit-planner-edit-title"
      >
        <div className="cit-planner-edit-head">
          <div>
            <div className="cit-planner-eyebrow">Movie night</div>
            <h2 id="cit-planner-edit-title">
              {event.film?.title || "Edit plan"}
            </h2>
          </div>

          <button
            type="button"
            className="cit-planner-round-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="cit-planner-edit-form" onSubmit={submit}>
          <div className="cit-planner-edit-row">
            <label>
              <span>Date</span>
              <input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Time</span>
              <input
                type="time"
                value={plannedTime}
                onChange={(e) => setPlannedTime(e.target.value)}
              />
            </label>
          </div>

          <label>
            <span>Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">No theme</option>
              {THEMES.filter(Boolean).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="e.g. Pizza, pyjamas and hot chocolate!"
            />
          </label>

          <div className="cit-planner-edit-actions">
            <button
              type="submit"
              className="cit-planner-save-edit"
              disabled={saving || deleting}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            <button
              type="button"
              className="cit-planner-delete"
              disabled={saving || deleting}
              onClick={onDelete}
            >
              {deleting ? "Removing…" : "Remove from planner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Planner({
  supabase,
  session,
  onBrowseDiscover,
  onWatchlistAdded,
  onFavouriteAdded,
}) {
  const [plannerId, setPlannerId] = useState("");
  const [events, setEvents] = useState([]);
  const [availabilityByFilm, setAvailabilityByFilm] = useState({});
  const [watchedByFilm, setWatchedByFilm] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMode, setViewMode] = useState(() => {
    try {
      return window.matchMedia("(max-width: 720px)").matches
        ? "upcoming"
        : "calendar";
    } catch {
      return "calendar";
    }
  });

  const [displayMonth, setDisplayMonth] = useState(initialPlannerMonth);
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [markingWatchedId, setMarkingWatchedId] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareSaving, setShareSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareRevoking, setShareRevoking] = useState(false);
  const [shareError, setShareError] = useState("");

  async function loadPlanner() {
    if (!supabase || !session?.user) {
      setPlannerId("");
      setEvents([]);
      setAvailabilityByFilm({});
      setWatchedByFilm({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data: defaultPlannerId, error: plannerError } = await supabase.rpc(
      "v2_get_or_create_default_planner"
    );

    if (plannerError || !defaultPlannerId) {
      console.error("Couldn't load planner:", plannerError);
      setError(plannerError?.message || "Couldn't load your planner.");
      setLoading(false);
      return;
    }

    setPlannerId(defaultPlannerId);

    const { data, error: eventError } = await supabase
      .from("v2_planner_events")
      .select(`
        id,
        planner_id,
        film_id,
        planned_date,
        planned_time,
        theme,
        notes,
        created_at,
        film:v2_films (
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
      .eq("planner_id", defaultPlannerId)
      .order("planned_date", { ascending: true })
      .order("planned_time", { ascending: true, nullsFirst: false });

    if (eventError) {
      console.error("Couldn't load planner events:", eventError);
      setError(eventError.message || "Couldn't load your movie nights.");
      setEvents([]);
      setLoading(false);
      return;
    }

    const rows = (data || []).filter((row) => row.film?.id);
    setEvents(rows);

    const filmIds = [...new Set(rows.map((row) => row.film_id).filter(Boolean))];

    if (filmIds.length) {
      const [availabilityResult, watchedResult] = await Promise.all([
        supabase
          .from("v2_streaming_availability")
          .select(
            "film_id, provider_id, provider_name, provider_type, logo_path, watch_url, checked_at"
          )
          .eq("region", "GB")
          .in("provider_type", ["subscription", "free", "ads"])
          .in("film_id", filmIds),
        supabase
          .from("v2_viewing_events")
          .select("film_id, watched_at")
          .eq("user_id", session.user.id)
          .in("film_id", filmIds)
          .order("watched_at", { ascending: false }),
      ]);

      if (!availabilityResult.error) {
        const map = {};

        for (const row of availabilityResult.data || []) {
          if (!map[row.film_id]) map[row.film_id] = [];
          map[row.film_id].push(row);
        }

        setAvailabilityByFilm(map);
      }

      if (!watchedResult.error) {
        const map = {};

        for (const row of watchedResult.data || []) {
          if (!map[row.film_id]) map[row.film_id] = row.watched_at;
        }

        setWatchedByFilm(map);
      }
    } else {
      setAvailabilityByFilm({});
      setWatchedByFilm({});
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPlanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session?.user?.id]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const dateCompare = String(a.planned_date).localeCompare(
          String(b.planned_date)
        );

        if (dateCompare) return dateCompare;

        return String(a.planned_time || "99:99").localeCompare(
          String(b.planned_time || "99:99")
        );
      }),
    [events]
  );

  const eventsByDate = useMemo(() => {
    const map = {};

    for (const event of sortedEvents) {
      if (!map[event.planned_date]) map[event.planned_date] = [];
      map[event.planned_date].push(event);
    }

    return map;
  }, [sortedEvents]);

  const upcomingGroups = useMemo(() => {
    return Object.entries(eventsByDate).sort(([a], [b]) => a.localeCompare(b));
  }, [eventsByDate]);

  const monthEvents = useMemo(() => {
    const key = monthKey(displayMonth);

    return sortedEvents.filter((event) =>
      String(event.planned_date || "").startsWith(key)
    );
  }, [sortedEvents, displayMonth]);

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(displayMonth);

  const calendarCells = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const mondayIndex = (firstDay + 6) % 7;
    const cells = [];

    for (let i = 0; i < mondayIndex; i += 1) {
      cells.push({ type: "blank", key: `blank-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;

      cells.push({
        type: "day",
        key: dateKey,
        day,
        dateKey,
        events: eventsByDate[dateKey] || [],
      });
    }

    return cells;
  }, [displayMonth, eventsByDate]);

  function changeMonth(offset) {
    setDisplayMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  async function saveEdit(values) {
    if (!editingEvent?.id || !supabase) return;

    setSavingEdit(true);

    const { error: updateError } = await supabase
      .from("v2_planner_events")
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingEvent.id);

    setSavingEdit(false);

    if (updateError) {
      console.error("Couldn't update planner event:", updateError);
      alert("Couldn't save the changes: " + updateError.message);
      return;
    }

    setEditingEvent(null);
    await loadPlanner();
  }

  async function deleteEvent() {
    if (!editingEvent?.id || !supabase) return;

    const confirmed = window.confirm(
      `Remove ${editingEvent.film?.title || "this film"} from your planner?`
    );

    if (!confirmed) return;

    setDeletingEvent(true);

    const { error: deleteError } = await supabase
      .from("v2_planner_events")
      .delete()
      .eq("id", editingEvent.id);

    setDeletingEvent(false);

    if (deleteError) {
      console.error("Couldn't remove planner event:", deleteError);
      alert("Couldn't remove the movie night: " + deleteError.message);
      return;
    }

    setEditingEvent(null);
    await loadPlanner();
  }

  async function markWatched(event) {
    if (!event?.film_id || !session?.user || !supabase) return;
    if (watchedByFilm[event.film_id]) return;

    setMarkingWatchedId(event.id);

    const { data, error: watchedError } = await supabase
      .from("v2_viewing_events")
      .insert({
        user_id: session.user.id,
        film_id: event.film_id,
      })
      .select("watched_at")
      .single();

    setMarkingWatchedId("");

    if (watchedError) {
      console.error("Couldn't mark film as watched:", watchedError);
      alert("Couldn't mark this film as watched: " + watchedError.message);
      return;
    }

    setWatchedByFilm((prev) => ({
      ...prev,
      [event.film_id]: data?.watched_at || new Date().toISOString(),
    }));
  }

  async function openSharePlanner() {
    if (!plannerId || !supabase) return;

    setShareOpen(true);
    setShareError("");
    setShareCopied(false);

    if (shareUrl) return;

    setShareSaving(true);

    const { data, error: shareRpcError } = await supabase.rpc(
      "v2_create_or_get_planner_share",
      { p_planner_id: plannerId }
    );

    setShareSaving(false);

    if (shareRpcError) {
      console.error("Couldn't create planner share link:", shareRpcError);
      setShareError(
        shareRpcError.message || "Couldn't create a planner share link."
      );
      return;
    }

    if (!data) {
      setShareError("Couldn't create a planner share link.");
      return;
    }

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("share", data);
    url.searchParams.set("type", "planner");

    setShareUrl(url.toString());
  }

  async function copyPlannerShareLink() {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  }

  async function nativeSharePlanner() {
    if (!shareUrl || typeof navigator.share !== "function") return;

    try {
      await navigator.share({
        title: "My Christmas Planner",
        text: "Here's my Christmas movie nights planner on Check It Twice.",
        url: shareUrl,
      });
    } catch (shareNativeError) {
      if (shareNativeError?.name !== "AbortError") {
        console.warn("Native sharing wasn't available:", shareNativeError);
      }
    }
  }

  async function stopSharingPlanner() {
    if (!plannerId || !supabase || shareRevoking) return;

    const confirmed = window.confirm(
      "Stop sharing this planner? Anyone using the current public link will no longer be able to open it."
    );

    if (!confirmed) return;

    setShareRevoking(true);
    setShareError("");

    const { error: disableError } = await supabase.rpc(
      "v2_disable_planner_share",
      { p_planner_id: plannerId }
    );

    setShareRevoking(false);

    if (disableError) {
      console.error("Couldn't stop planner sharing:", disableError);
      setShareError(
        disableError.message || "Couldn't stop sharing this planner."
      );
      return;
    }

    setShareUrl("");
    setShareCopied(false);
    setShareOpen(false);
  }

  function renderUpcomingCard(event) {
    const watchedAt = watchedByFilm[event.film_id];
    const providers = availabilityByFilm[event.film_id] || [];

    return (
      <article className="cit-planner-upcoming-card" key={event.id}>
        <button
          type="button"
          className="cit-planner-film-button"
          onClick={() => setSelectedFilm(event.film)}
          aria-label={`Open details for ${event.film?.title || "film"}`}
        >
          <EventPoster film={event.film} />
        </button>

        <div className="cit-planner-upcoming-body">
          <button
            type="button"
            className="cit-planner-title-button"
            onClick={() => setSelectedFilm(event.film)}
          >
            {event.film?.title || "Untitled film"}
          </button>

          <div className="cit-planner-event-meta">
            {event.planned_time && (
              <span>{formatTime(event.planned_time)}</span>
            )}
            {event.theme && <span>{event.theme}</span>}
            {event.film?.release_year && (
              <span>{event.film.release_year}</span>
            )}
          </div>

          {event.notes && (
            <div className="cit-planner-notes">{event.notes}</div>
          )}

          <ProviderChips providers={providers} />

          <div className="cit-planner-card-actions">
            <button
              type="button"
              className="cit-planner-edit-button"
              onClick={() => setEditingEvent(event)}
            >
              Edit plan
            </button>

            <button
              type="button"
              className={`cit-planner-watched-button ${
                watchedAt ? "cit-planner-watched-button--done" : ""
              }`}
              onClick={() => markWatched(event)}
              disabled={!!watchedAt || markingWatchedId === event.id}
            >
              {watchedAt
                ? "✓ Watched"
                : markingWatchedId === event.id
                ? "Saving…"
                : "Mark watched"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  if (!session?.user) {
    return (
      <div className="cit-planner-page">
        <style>{plannerStyles}</style>
        <div className="cit-planner-empty">
          <div className="cit-planner-empty-icon">📅</div>
          <h1>Movie Nights Planner</h1>
          <p>Sign in to start planning your Christmas movie nights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cit-planner-page">
      <style>{plannerStyles}</style>

      <div className="cit-planner-hero">
        <div>
          <div className="cit-planner-eyebrow">Your festive schedule</div>
          <h1>Movie Nights Planner</h1>
          <p>
            Turn your Christmas list into actual movie nights — pick a date,
            add a time or theme, and keep the season organised.
          </p>
        </div>

        <div className="cit-planner-hero-actions">
          <button
            type="button"
            className="cit-planner-share-button"
            onClick={openSharePlanner}
            disabled={!plannerId || loading}
          >
            ↗ Share planner
          </button>

          <div className="cit-planner-stats">
            <strong>{events.length}</strong>
            <span>{events.length === 1 ? "movie night" : "movie nights"}</span>
          </div>
        </div>
      </div>

      <div className="cit-planner-toolbar">
        <div className="cit-planner-view-switch">
          <button
            type="button"
            className={viewMode === "calendar" ? "is-active" : ""}
            onClick={() => setViewMode("calendar")}
          >
            Calendar
          </button>
          <button
            type="button"
            className={viewMode === "upcoming" ? "is-active" : ""}
            onClick={() => setViewMode("upcoming")}
          >
            Upcoming
          </button>
        </div>

        {viewMode === "calendar" && (
          <div className="cit-planner-month-nav">
            <button type="button" onClick={() => changeMonth(-1)}>
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => changeMonth(1)}>
              ›
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="cit-planner-loading">Loading your planner…</div>
      ) : error ? (
        <div className="cit-planner-error">{error}</div>
      ) : !events.length ? (
        <div className="cit-planner-empty">
          <div className="cit-planner-empty-icon">🎬</div>
          <h2>Your planner is ready</h2>
          <p>
            Open a film and choose <strong>Add to Planner</strong> to schedule
            your first Christmas movie night.
          </p>
          <button type="button" onClick={onBrowseDiscover}>
            Browse Christmas films
          </button>
        </div>
      ) : viewMode === "calendar" ? (
        <section className="cit-planner-calendar-wrap">
          <div className="cit-planner-weekdays" aria-hidden="true">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="cit-planner-calendar">
            {calendarCells.map((cell) =>
              cell.type === "blank" ? (
                <div
                  className="cit-planner-calendar-cell cit-planner-calendar-cell--blank"
                  key={cell.key}
                />
              ) : (
                <div
                  className={`cit-planner-calendar-cell ${
                    cell.events.length ? "has-events" : ""
                  }`}
                  key={cell.key}
                >
                  <div className="cit-planner-day-number">{cell.day}</div>

                  <div className="cit-planner-day-events">
                    {cell.events.map((event) => (
                      <button
                        type="button"
                        className="cit-planner-calendar-event"
                        key={event.id}
                        onClick={() => setEditingEvent(event)}
                        title={`${event.film?.title || "Film"}${
                          event.planned_time
                            ? ` — ${formatTime(event.planned_time)}`
                            : ""
                        }`}
                      >
                        <EventPoster film={event.film} size="small" />
                        <span>
                          <strong>{event.film?.title || "Film"}</strong>
                          {event.planned_time && (
                            <small>{formatTime(event.planned_time)}</small>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          {!monthEvents.length && (
            <div className="cit-planner-month-empty">
              Nothing planned for {monthLabel}.
            </div>
          )}
        </section>
      ) : (
        <section className="cit-planner-upcoming">
          {upcomingGroups.map(([date, dayEvents]) => (
            <div className="cit-planner-day-group" key={date}>
              <div className="cit-planner-day-heading">
                <span>{formatDateLong(date)}</span>
                <small>
                  {dayEvents.length} {dayEvents.length === 1 ? "film" : "films"}
                </small>
              </div>

              <div className="cit-planner-day-list">
                {dayEvents.map(renderUpcomingCard)}
              </div>
            </div>
          ))}
        </section>
      )}

      {shareOpen && (
        <div
          className="cit-planner-share-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShareOpen(false);
            }
          }}
        >
          <div
            className="cit-planner-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cit-planner-share-title"
          >
            <h2 id="cit-planner-share-title">Share your Planner</h2>
            <p>
              Anyone with this link can view your movie-night schedule. They
              don't need a Check It Twice account, and the shared planner is
              read-only.
            </p>

            {shareSaving ? (
              <p>Creating your share link…</p>
            ) : shareError ? (
              <div className="cit-planner-share-error">{shareError}</div>
            ) : shareUrl ? (
              <>
                <input
                  className="cit-planner-share-link"
                  value={shareUrl}
                  readOnly
                  aria-label="Public planner share link"
                  onFocus={(event) => event.target.select()}
                />

                <div className="cit-planner-share-actions">
                  <button
                    type="button"
                    className="cit-planner-share-primary"
                    onClick={copyPlannerShareLink}
                  >
                    {shareCopied ? "✓ Copied" : "Copy link"}
                  </button>

                  {typeof navigator.share === "function" && (
                    <button
                      type="button"
                      className="cit-planner-share-secondary"
                      onClick={nativeSharePlanner}
                    >
                      Share…
                    </button>
                  )}

                  <a
                    className="cit-planner-share-secondary"
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>

                  <button
                    type="button"
                    className="cit-planner-share-stop"
                    onClick={stopSharingPlanner}
                    disabled={shareRevoking}
                  >
                    {shareRevoking ? "Stopping…" : "Stop sharing"}
                  </button>

                  <button
                    type="button"
                    className="cit-planner-share-close"
                    onClick={() => setShareOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {editingEvent && (
        <PlannerEditModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={saveEdit}
          onDelete={deleteEvent}
          saving={savingEdit}
          deleting={deletingEvent}
        />
      )}

      {selectedFilm && (
        <FilmDetailsModal
          film={selectedFilm}
          supabase={supabase}
          session={session}
          onClose={() => setSelectedFilm(null)}
          onWatched={(watchedAt) => {
            setWatchedByFilm((prev) => ({
              ...prev,
              [selectedFilm.id]: watchedAt,
            }));
          }}
          onWatchlistAdded={onWatchlistAdded}
          onFavouriteAdded={onFavouriteAdded}
        />
      )}
    </div>
  );
}

const plannerStyles = `
  .cit-planner-page {
    width: min(1180px, calc(100% - 32px));
    margin: 24px auto 110px;
    color: #173a30;
  }

  .cit-planner-hero {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 28px;
    border: 1px solid #d9ded8;
    border-radius: 20px;
    background:
      radial-gradient(circle at 88% 10%, rgba(255,255,255,.94), transparent 22%),
      linear-gradient(135deg, #eef3ef 0%, #f6f3eb 58%, #edf3f0 100%);
    padding: 27px 28px;
    box-shadow: 0 8px 30px rgba(38, 58, 49, .055);
  }

  .cit-planner-hero::after {
    content: "";
    position: absolute;
    right: -32px;
    bottom: -54px;
    width: 235px;
    height: 150px;
    border-radius: 50%;
    background: rgba(255,255,255,.5);
    transform: rotate(-12deg);
    pointer-events: none;
  }

  .cit-planner-eyebrow {
    margin-bottom: 7px;
    color: #8e3034;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: .12em;
    text-transform: uppercase;
  }

  .cit-planner-hero h1 {
    margin: 0;
    color: #123b2d;
    font-size: clamp(30px, 5vw, 45px);
    line-height: 1;
    letter-spacing: -.045em;
  }

  .cit-planner-hero p {
    max-width: 650px;
    margin: 11px 0 0;
    color: #617069;
    font-size: 13px;
    line-height: 1.55;
  }

  .cit-planner-stats {
    position: relative;
    z-index: 1;
    min-width: 118px;
    border: 1px solid rgba(18,59,45,.12);
    border-radius: 14px;
    background: rgba(255,255,255,.72);
    padding: 12px 14px;
    text-align: center;
    box-shadow: 0 5px 18px rgba(18,59,45,.05);
  }

  .cit-planner-stats strong {
    display: block;
    color: #123b2d;
    font-size: 27px;
    line-height: 1;
  }

  .cit-planner-stats span {
    display: block;
    margin-top: 4px;
    color: #728078;
    font-size: 10px;
    font-weight: 750;
  }

  .cit-planner-hero-actions {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: stretch;
    gap: 9px;
  }

  .cit-planner-share-button {
    border: 1px solid #123b2d;
    border-radius: 12px;
    background: #123b2d;
    color: #fff;
    padding: 9px 13px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 850;
    white-space: nowrap;
  }

  .cit-planner-share-button:hover:not([disabled]) {
    background: #0e3024;
  }

  .cit-planner-share-button[disabled] {
    cursor: default;
    opacity: .55;
  }

  .cit-planner-share-overlay {
    position: fixed;
    inset: 0;
    z-index: 5200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(15,31,25,.57);
    backdrop-filter: blur(6px);
  }

  .cit-planner-share-dialog {
    width: min(470px, 100%);
    border: 1px solid #ddd7cd;
    border-radius: 17px;
    background: #fbfaf6;
    padding: 19px;
    box-shadow: 0 24px 70px rgba(16,34,27,.25);
  }

  .cit-planner-share-dialog h2 {
    margin: 0;
    color: #123b2d;
    font-size: 22px;
    letter-spacing: -.025em;
  }

  .cit-planner-share-dialog p {
    margin: 7px 0 0;
    color: #68756f;
    font-size: 12px;
    line-height: 1.5;
  }

  .cit-planner-share-link {
    margin-top: 15px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #d8d3ca;
    border-radius: 10px;
    background: #fff;
    color: #40574f;
    padding: 10px 11px;
    font-size: 11px;
  }

  .cit-planner-share-error {
    margin-top: 12px;
    border: 1px solid #e7c2c2;
    border-radius: 9px;
    background: #fff2f2;
    color: #8b3434;
    padding: 9px 10px;
    font-size: 11px;
  }

  .cit-planner-share-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 13px;
  }

  .cit-planner-share-actions button,
  .cit-planner-share-actions a {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    padding: 8px 11px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
    text-decoration: none;
  }

  .cit-planner-share-primary {
    border: 1px solid #123b2d;
    background: #123b2d;
    color: #fff;
  }

  .cit-planner-share-secondary {
    border: 1px solid #d8d3ca;
    background: #fff;
    color: #365249;
  }

  .cit-planner-share-stop {
    border: 1px solid #e2b7b7;
    background: #fff4f4;
    color: #8f3535;
  }

  .cit-planner-share-close {
    margin-left: auto;
    border: 0;
    background: transparent;
    color: #747e79;
  }

  .cit-planner-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin: 18px 0 12px;
  }

  .cit-planner-view-switch {
    display: inline-flex;
    gap: 3px;
    border: 1px solid #ddd8cf;
    border-radius: 11px;
    background: #f3f0ea;
    padding: 3px;
  }

  .cit-planner-view-switch button {
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #607069;
    padding: 7px 12px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
  }

  .cit-planner-view-switch button.is-active {
    background: #fff;
    color: #123b2d;
    box-shadow: 0 2px 7px rgba(28, 48, 39, .08);
  }

  .cit-planner-month-nav {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .cit-planner-month-nav strong {
    min-width: 140px;
    color: #29473d;
    text-align: center;
    font-size: 12px;
  }

  .cit-planner-month-nav button {
    width: 31px;
    height: 31px;
    border: 1px solid #ddd8cf;
    border-radius: 9px;
    background: #fff;
    color: #365249;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
  }

  .cit-planner-calendar-wrap {
    overflow: hidden;
    border: 1px solid #ded9d0;
    border-radius: 15px;
    background: #fffdf9;
    box-shadow: 0 6px 22px rgba(33, 48, 41, .045);
  }

  .cit-planner-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid #e5e0d7;
    background: #f6f3ed;
  }

  .cit-planner-weekdays span {
    padding: 9px 8px;
    color: #77827d;
    text-align: center;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: .05em;
    text-transform: uppercase;
  }

  .cit-planner-calendar {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .cit-planner-calendar-cell {
    min-width: 0;
    min-height: 142px;
    border-right: 1px solid #ece7df;
    border-bottom: 1px solid #ece7df;
    background: #fffdf9;
    padding: 8px;
  }

  .cit-planner-calendar-cell:nth-child(7n) {
    border-right: 0;
  }

  .cit-planner-calendar-cell--blank {
    background: #faf8f3;
  }

  .cit-planner-calendar-cell.has-events {
    background:
      linear-gradient(180deg, rgba(242,247,243,.75), rgba(255,253,249,1) 44%);
  }

  .cit-planner-day-number {
    color: #748079;
    font-size: 10px;
    font-weight: 850;
  }

  .cit-planner-day-events {
    display: grid;
    gap: 5px;
    margin-top: 7px;
  }

  .cit-planner-calendar-event {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 25px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    border: 1px solid #d9e1dc;
    border-radius: 8px;
    background: #f7faf8;
    padding: 4px;
    color: #24483b;
    text-align: left;
    cursor: pointer;
  }

  .cit-planner-calendar-event:hover {
    border-color: #b8c9c0;
    background: #f1f7f3;
  }

  .cit-planner-calendar-event span {
    min-width: 0;
  }

  .cit-planner-calendar-event strong {
    display: block;
    overflow: hidden;
    color: #24483b;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cit-planner-calendar-event small {
    display: block;
    margin-top: 2px;
    color: #87918c;
    font-size: 8px;
  }

  .cit-planner-poster,
  .cit-planner-poster-placeholder {
    width: 72px;
    aspect-ratio: 2 / 3;
    display: block;
    border-radius: 8px;
    object-fit: cover;
    background: #e8e4dc;
  }

  .cit-planner-poster--small,
  .cit-planner-poster-placeholder--small {
    width: 25px;
    border-radius: 5px;
  }

  .cit-planner-poster-placeholder {
    display: grid;
    place-items: center;
    color: #8c948f;
    text-align: center;
    font-size: 8px;
  }

  .cit-planner-month-empty {
    padding: 14px;
    color: #858e89;
    text-align: center;
    font-size: 11px;
  }

  .cit-planner-upcoming {
    display: grid;
    gap: 22px;
  }

  .cit-planner-day-group {
    display: grid;
    gap: 9px;
  }

  .cit-planner-day-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 0 2px;
  }

  .cit-planner-day-heading span {
    color: #183d31;
    font-size: 15px;
    font-weight: 850;
  }

  .cit-planner-day-heading small {
    color: #8a928e;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .cit-planner-day-list {
    display: grid;
    gap: 8px;
  }

  .cit-planner-upcoming-card {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
    border: 1px solid #e0dbd2;
    border-radius: 13px;
    background: rgba(255,255,255,.9);
    padding: 9px;
    box-shadow: 0 3px 13px rgba(31, 47, 39, .04);
  }

  .cit-planner-film-button,
  .cit-planner-title-button {
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .cit-planner-title-button {
    color: #183d31;
    text-align: left;
    font-size: 14px;
    font-weight: 850;
    line-height: 1.25;
  }

  .cit-planner-upcoming-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .cit-planner-event-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    margin-top: 4px;
    color: #78847e;
    font-size: 9px;
  }

  .cit-planner-event-meta span + span::before {
    content: "•";
    margin-right: 10px;
    color: #bdc3bf;
  }

  .cit-planner-notes {
    margin-top: 7px;
    color: #5f6f67;
    font-size: 10px;
    line-height: 1.4;
  }

  .cit-planner-providers {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }

  .cit-planner-provider {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid #e0dcd4;
    border-radius: 999px;
    background: #f8f6f1;
    padding: 3px 6px;
    color: #53655d;
    font-size: 8px;
    font-weight: 750;
  }

  .cit-planner-provider img {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    object-fit: cover;
  }

  .cit-planner-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 9px;
  }

  .cit-planner-card-actions button {
    border-radius: 8px;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 9px;
    font-weight: 800;
  }

  .cit-planner-edit-button {
    border: 1px solid #d7d2ca;
    background: #fff;
    color: #486057;
  }

  .cit-planner-watched-button {
    border: 1px solid #c9d9d0;
    background: #eef6f1;
    color: #285b45;
  }

  .cit-planner-watched-button--done {
    cursor: default !important;
    opacity: .68;
  }

  .cit-planner-loading,
  .cit-planner-error,
  .cit-planner-empty {
    margin-top: 18px;
    border: 1px solid #e0dbd2;
    border-radius: 15px;
    background: rgba(255,255,255,.82);
    padding: 28px 20px;
    color: #68756f;
    text-align: center;
  }

  .cit-planner-error {
    border-color: #e5c0c0;
    background: #fff4f4;
    color: #8d3939;
  }

  .cit-planner-empty-icon {
    font-size: 26px;
  }

  .cit-planner-empty h1,
  .cit-planner-empty h2 {
    margin: 7px 0 0;
    color: #123b2d;
  }

  .cit-planner-empty p {
    max-width: 500px;
    margin: 8px auto 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .cit-planner-empty button {
    margin-top: 13px;
    border: 1px solid #123b2d;
    border-radius: 9px;
    background: #123b2d;
    color: #fff;
    padding: 9px 12px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 850;
  }

  .cit-planner-edit-overlay {
    position: fixed;
    inset: 0;
    z-index: 4800;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(15,31,25,.57);
    backdrop-filter: blur(6px);
  }

  .cit-planner-edit-modal {
    width: min(500px, 100%);
    max-height: 92vh;
    overflow: auto;
    border: 1px solid #ddd7cd;
    border-radius: 17px;
    background: #fbfaf6;
    box-shadow: 0 24px 70px rgba(16,34,27,.25);
  }

  .cit-planner-edit-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 18px;
    border-bottom: 1px solid #e6e0d7;
  }

  .cit-planner-edit-head h2 {
    margin: 0;
    color: #123b2d;
    font-size: 21px;
    letter-spacing: -.025em;
  }

  .cit-planner-round-close {
    width: 35px;
    height: 35px;
    border: 1px solid #ddd7cd;
    border-radius: 50%;
    background: #fff;
    color: #5b6963;
    cursor: pointer;
    font-size: 18px;
  }

  .cit-planner-edit-form {
    display: grid;
    gap: 13px;
    padding: 17px 18px 19px;
  }

  .cit-planner-edit-form label {
    display: grid;
    gap: 6px;
  }

  .cit-planner-edit-form label > span {
    color: #455b52;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: .05em;
    text-transform: uppercase;
  }

  .cit-planner-edit-form input,
  .cit-planner-edit-form select,
  .cit-planner-edit-form textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #d8d3ca;
    border-radius: 9px;
    background: #fff;
    color: #28483e;
    padding: 10px;
    font: inherit;
    font-size: 12px;
  }

  .cit-planner-edit-form textarea {
    min-height: 82px;
    resize: vertical;
  }

  .cit-planner-edit-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .cit-planner-edit-actions {
    display: flex;
    gap: 8px;
  }

  .cit-planner-edit-actions button {
    flex: 1 1 0;
    min-height: 40px;
    border-radius: 9px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 850;
  }

  .cit-planner-save-edit {
    border: 1px solid #123b2d;
    background: #123b2d;
    color: #fff;
  }

  .cit-planner-delete {
    border: 1px solid #e1bcbc;
    background: #fff3f3;
    color: #8e3434;
  }

  @media (max-width: 720px) {
    .cit-planner-page {
      width: min(100% - 24px, 1180px);
      margin-top: 16px;
      margin-bottom: 105px;
    }

    .cit-planner-hero {
      align-items: stretch;
      flex-direction: column;
      gap: 14px;
      padding: 19px 17px;
      border-radius: 15px;
    }

    .cit-planner-hero h1 {
      font-size: 30px;
    }

    .cit-planner-hero p {
      font-size: 12px;
    }

    .cit-planner-hero-actions {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .cit-planner-share-button {
      flex: 1 1 auto;
    }

    .cit-planner-stats {
      width: fit-content;
      min-width: 100px;
      text-align: left;
    }

    .cit-planner-stats strong,
    .cit-planner-stats span {
      display: inline;
    }

    .cit-planner-stats span {
      margin-left: 5px;
    }

    .cit-planner-toolbar {
      align-items: stretch;
      flex-direction: column;
      margin-top: 13px;
    }

    .cit-planner-view-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .cit-planner-month-nav {
      justify-content: center;
    }

    .cit-planner-calendar-wrap {
      overflow-x: auto;
      border-radius: 12px;
    }

    .cit-planner-weekdays,
    .cit-planner-calendar {
      min-width: 760px;
    }

    .cit-planner-calendar-cell {
      min-height: 128px;
    }

    .cit-planner-day-heading span {
      font-size: 14px;
    }

    .cit-planner-upcoming-card {
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 10px;
    }

    .cit-planner-poster,
    .cit-planner-poster-placeholder {
      width: 64px;
    }

    .cit-planner-edit-overlay {
      align-items: flex-end;
      padding: 0;
    }

    .cit-planner-edit-modal {
      max-height: 94vh;
      border-radius: 18px 18px 0 0;
      border-left: 0;
      border-right: 0;
      border-bottom: 0;
    }

    .cit-planner-edit-row {
      grid-template-columns: 1fr;
    }

    .cit-planner-edit-form input,
    .cit-planner-edit-form select,
    .cit-planner-edit-form textarea {
      font-size: 16px;
    }

    .cit-planner-share-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .cit-planner-share-close {
      margin-left: 0;
    }

    .cit-planner-edit-actions {
      flex-direction: column;
    }
  }

  @media (hover: none) {
    .cit-planner-calendar-event:hover {
      border-color: #d9e1dc;
      background: #f7faf8;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cit-planner-page *,
    .cit-planner-page *::before,
    .cit-planner-page *::after {
      scroll-behavior: auto !important;
      transition: none !important;
    }
  }
`;

