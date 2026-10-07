import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";

const TMDB_IMG = "https://image.tmdb.org/t/p";

const THEMES = [
  { value: "", label: "No theme" },
  { value: "Family Night", label: "Family Night" },
  { value: "Date Night", label: "Date Night" },
  { value: "Christmas Classics", label: "Christmas Classics" },
  { value: "Christmas Comedy", label: "Christmas Comedy" },
  { value: "Festive Favourites", label: "Festive Favourites" },
  { value: "Cosy Night", label: "Cosy Night" },
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function defaultPlannerDate() {
  const now = new Date();
  const year = now.getFullYear();

  if (now.getMonth() === 11) {
    return `${year}-12-${pad(now.getDate())}`;
  }

  return `${year}-12-01`;
}

function formatFriendlyDate(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function PlannerAddModal({
  film,
  supabase,
  session,
  onClose,
  onAdded,
}) {
  const [plannedDate, setPlannedDate] = useState(defaultPlannerDate);
  const [plannedTime, setPlannedTime] = useState("");
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const filmTitle = film?.title || "Film";

  const datePreview = useMemo(
    () => formatFriendlyDate(plannedDate),
    [plannedDate]
  );

  async function savePlannerEvent(event) {
    event.preventDefault();

    if (!session?.user || !supabase) {
      setError("Please sign in to add films to your planner.");
      return;
    }

    if (!film?.id) {
      setError("This film isn't ready to be added to the planner yet.");
      return;
    }

    if (!plannedDate) {
      setError("Choose a date for your movie night.");
      return;
    }

    setSaving(true);
    setError("");

    const { data: plannerId, error: plannerError } = await supabase.rpc(
      "v2_get_or_create_default_planner"
    );

    if (plannerError || !plannerId) {
      console.error("Couldn't get planner:", plannerError);
      setError(
        plannerError?.message || "Couldn't open your Christmas planner."
      );
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("v2_planner_events")
      .insert({
        planner_id: plannerId,
        film_id: film.id,
        planned_date: plannedDate,
        planned_time: plannedTime || null,
        theme: theme || null,
        notes: notes.trim() || null,
      });

    if (insertError) {
      console.error("Couldn't add planner event:", insertError);
      setError(insertError.message || "Couldn't add this movie night.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    onAdded?.({
      film,
      plannedDate,
      plannedTime: plannedTime || null,
      theme: theme || null,
      notes: notes.trim() || null,
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="cit-planner-add-overlay"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();

        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <style>{`
        .cit-planner-add-overlay {
          position: fixed;
          inset: 0;
          z-index: 5000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(14, 30, 24, .58);
          backdrop-filter: blur(6px);
        }

        .cit-planner-add-modal {
          width: min(520px, 100%);
          max-height: 92vh;
          overflow: auto;
          box-sizing: border-box;
          border: 1px solid #ddd7cd;
          border-radius: 18px;
          background: #fbfaf6;
          color: #18382f;
          box-shadow: 0 24px 70px rgba(16, 34, 27, .25);
        }

        .cit-planner-add-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid #e7e1d8;
        }

        .cit-planner-add-header h2 {
          margin: 0;
          color: #123b2d;
          font-size: 23px;
          line-height: 1.05;
          letter-spacing: -.03em;
        }

        .cit-planner-add-header p {
          margin: 6px 0 0;
          color: #6e7973;
          font-size: 11px;
          line-height: 1.45;
        }

        .cit-planner-add-close {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          border: 1px solid #ddd7cd;
          border-radius: 999px;
          background: #fff;
          color: #56645e;
          cursor: pointer;
          font-size: 18px;
        }

        .cit-planner-film {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 11px;
          align-items: center;
          margin: 15px 18px 0;
          padding: 10px;
          border: 1px solid #e5dfd6;
          border-radius: 12px;
          background: rgba(255,255,255,.7);
        }

        .cit-planner-film img,
        .cit-planner-film-placeholder {
          width: 58px;
          aspect-ratio: 2 / 3;
          border-radius: 8px;
          object-fit: cover;
          background: #ece8df;
        }

        .cit-planner-film-placeholder {
          display: grid;
          place-items: center;
          color: #8b938f;
          font-size: 9px;
        }

        .cit-planner-film-title {
          color: #18382f;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.25;
        }

        .cit-planner-film-meta {
          margin-top: 4px;
          color: #858d89;
          font-size: 10px;
        }

        .cit-planner-add-form {
          display: grid;
          gap: 14px;
          padding: 17px 18px 19px;
        }

        .cit-planner-field {
          display: grid;
          gap: 6px;
        }

        .cit-planner-field label {
          color: #40564e;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .cit-planner-field input,
        .cit-planner-field select,
        .cit-planner-field textarea {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid #d8d3ca;
          border-radius: 10px;
          background: #fff;
          color: #28483e;
          padding: 10px 11px;
          font: inherit;
          font-size: 13px;
          outline: none;
        }

        .cit-planner-field input:focus,
        .cit-planner-field select:focus,
        .cit-planner-field textarea:focus {
          border-color: #6f9284;
          box-shadow: 0 0 0 3px rgba(18,59,45,.08);
        }

        .cit-planner-field textarea {
          min-height: 78px;
          resize: vertical;
        }

        .cit-planner-date-preview {
          color: #858d89;
          font-size: 10px;
        }

        .cit-planner-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .cit-planner-error {
          border: 1px solid #e3bcbc;
          border-radius: 10px;
          background: #fff2f2;
          color: #8c3636;
          padding: 9px 10px;
          font-size: 11px;
          line-height: 1.4;
        }

        .cit-planner-save {
          width: 100%;
          min-height: 43px;
          border: 1px solid #123b2d;
          border-radius: 10px;
          background: #123b2d;
          color: #fff;
          padding: 10px 14px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
        }

        .cit-planner-save:hover:not([disabled]) {
          background: #0d3024;
        }

        .cit-planner-save[disabled] {
          cursor: default;
          opacity: .68;
        }

        .cit-planner-saved {
          padding: 24px 20px 22px;
          text-align: center;
        }

        .cit-planner-saved-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 11px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #e9f4ee;
          color: #1f5b43;
          font-size: 20px;
          font-weight: 900;
        }

        .cit-planner-saved h3 {
          margin: 0;
          color: #123b2d;
          font-size: 20px;
        }

        .cit-planner-saved p {
          margin: 7px auto 15px;
          max-width: 350px;
          color: #6d7872;
          font-size: 12px;
          line-height: 1.5;
        }

        .cit-planner-done {
          min-height: 40px;
          border: 1px solid #123b2d;
          border-radius: 9px;
          background: #123b2d;
          color: #fff;
          padding: 8px 18px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
        }

        @media (max-width: 620px) {
          .cit-planner-add-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .cit-planner-add-modal {
            max-height: 94vh;
            border-radius: 19px 19px 0 0;
            border-left: 0;
            border-right: 0;
            border-bottom: 0;
          }

          .cit-planner-row {
            grid-template-columns: 1fr;
          }

          .cit-planner-field input,
          .cit-planner-field select,
          .cit-planner-field textarea {
            font-size: 16px;
          }
        }
      `}</style>

      <div
        className="cit-planner-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cit-planner-add-title"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cit-planner-add-header">
          <div>
            <h2 id="cit-planner-add-title">Add to Planner</h2>
            <p>Choose when this film gets its Christmas movie night.</p>
          </div>

          <button
            type="button"
            className="cit-planner-add-close"
            onClick={onClose}
            aria-label="Close planner"
          >
            ×
          </button>
        </div>

        <div className="cit-planner-film">
          {film?.poster_path ? (
            <img
              src={`${TMDB_IMG}/w154${film.poster_path}`}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <div className="cit-planner-film-placeholder">No poster</div>
          )}

          <div>
            <div className="cit-planner-film-title">{filmTitle}</div>
            <div className="cit-planner-film-meta">
              {film?.release_year || "Year unknown"}
            </div>
          </div>
        </div>

        {saved ? (
          <div className="cit-planner-saved">
            <div className="cit-planner-saved-icon">✓</div>
            <h3>Movie night planned</h3>
            <p>
              {filmTitle} is in your planner for {datePreview}
              {plannedTime ? ` at ${plannedTime}` : ""}.
            </p>
            <button
              type="button"
              className="cit-planner-done"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <form className="cit-planner-add-form" onSubmit={savePlannerEvent}>
            <div className="cit-planner-row">
              <div className="cit-planner-field">
                <label htmlFor="cit-planner-date">Date</label>
                <input
                  id="cit-planner-date"
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                  required
                />
                <div className="cit-planner-date-preview">{datePreview}</div>
              </div>

              <div className="cit-planner-field">
                <label htmlFor="cit-planner-time">Time (optional)</label>
                <input
                  id="cit-planner-time"
                  type="time"
                  value={plannedTime}
                  onChange={(event) => setPlannedTime(event.target.value)}
                />
              </div>
            </div>

            <div className="cit-planner-field">
              <label htmlFor="cit-planner-theme">Movie night theme</label>
              <select
                id="cit-planner-theme"
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
              >
                {THEMES.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="cit-planner-field">
              <label htmlFor="cit-planner-notes">Notes (optional)</label>
              <textarea
                id="cit-planner-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                placeholder="e.g. Pizza, pyjamas and hot chocolate!"
              />
            </div>

            {error && <div className="cit-planner-error">{error}</div>}

            <button
              type="submit"
              className="cit-planner-save"
              disabled={saving}
            >
              {saving ? "Adding to Planner…" : "📅 Add to Planner"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
