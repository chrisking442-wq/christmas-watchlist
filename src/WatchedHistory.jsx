import React, { useEffect, useState } from "react";
import FilmDetailsModal from "./FilmDetailsModal";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function WatchedHistory({
  supabase,
  session,
  onBrowseDiscover,
}) {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFilm, setSelectedFilm] = useState(null);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setFilms([]);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("v2_viewing_events")
        .select(`
          id,
          film_id,
          watched_at,
          rating,
          notes,
          v2_films (
            id,
            tmdb_id,
            title,
            release_year,
            overview,
            poster_path,
            backdrop_path
          )
        `)
        .eq("user_id", session.user.id)
        .order("watched_at", { ascending: false });

      if (cancelled) return;

      if (loadError) {
        console.error(loadError);
        setError(loadError.message);
        setFilms([]);
        setLoading(false);
        return;
      }

      // Keep one card per film, but preserve repeat-watch history.
      const grouped = new Map();

      for (const event of data || []) {
        const film = event.v2_films;
        if (!film?.id) continue;

        const key = String(film.id);

        if (!grouped.has(key)) {
          grouped.set(key, {
            film,
            latestWatchedAt: event.watched_at,
            watchCount: 0,
            dates: [],
          });
        }

        const item = grouped.get(key);
        item.watchCount += 1;
        item.dates.push(event.watched_at);

        if (
          new Date(event.watched_at) >
          new Date(item.latestWatchedAt)
        ) {
          item.latestWatchedAt = event.watched_at;
        }
      }

      const groupedFilms = [...grouped.values()].sort(
        (a, b) =>
          new Date(b.latestWatchedAt) -
          new Date(a.latestWatchedAt)
      );

      setFilms(groupedFilms);
      setLoading(false);
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [supabase, session]);

  if (!session?.user) {
    return (
      <div className="cit-watched-empty">
        Sign in to see your viewing history.
      </div>
    );
  }

  return (
    <div className="cit-watched-view">
      <style>{`
        .cit-watched-view {
          margin: 24px 0 30px;
        }

        .cit-watched-header {
          margin-bottom: 16px;
        }

        .cit-watched-header h1 {
          margin: 0;
          color: #123b2d;
          font-size: clamp(25px, 3.8vw, 36px);
          line-height: 1.05;
          letter-spacing: -0.035em;
        }

        .cit-watched-subtitle {
          margin-top: 7px;
          color: #68756f;
          font-size: 13px;
        }

        .cit-watched-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .cit-watched-card {
          overflow: hidden;
          cursor: pointer;
          border: 1px solid #e2ddd4;
          border-radius: 14px;
          background: rgba(255,255,255,.9);
          box-shadow: 0 3px 12px rgba(32,43,37,.045);
          transition:
            transform .16s ease,
            box-shadow .16s ease,
            border-color .16s ease;
        }

        .cit-watched-card:hover {
          transform: translateY(-4px);
          border-color: #d1cbbf;
          box-shadow: 0 14px 28px rgba(32,43,37,.10);
        }

        .cit-watched-card:hover .cit-watched-poster {
          transform: scale(1.025);
        }

        .cit-watched-card:focus-visible {
          outline: 3px solid rgba(18, 59, 45, .16);
          outline-offset: 3px;
        }

        .cit-watched-poster-wrap {
          position: relative;
          aspect-ratio: 2 / 3;
          overflow: hidden;
          background: #eae6df;
        }

        .cit-watched-poster {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          transition: transform .22s ease;
        }

        .cit-watched-no-poster {
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

        .cit-watched-body {
          padding: 11px 11px 13px;
        }

        .cit-watched-title {
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

        .cit-watched-year {
          margin-top: 4px;
          color: #7b837f;
          font-size: 11px;
        }

        .cit-watched-date {
          margin-top: 10px;
          color: #315447;
          font-size: 11px;
          font-weight: 750;
        }

        .cit-watched-count {
          margin-top: 4px;
          color: #8b928e;
          font-size: 10px;
        }

        .cit-watched-empty-card {
          max-width: 520px;
          padding: 24px;
          border: 1px solid #e0dbd2;
          border-radius: 14px;
          background: rgba(255,255,255,.64);
        }

        .cit-watched-empty-card h2 {
          margin: 0;
          color: #18382f;
          font-size: 18px;
        }

        .cit-watched-empty-card p {
          margin: 8px 0 0;
          color: #6f7974;
          font-size: 13px;
          line-height: 1.5;
        }

        .cit-watched-empty-card button {
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

        .cit-watched-error,
        .cit-watched-empty {
          margin: 24px 0;
          color: #6f7974;
          font-size: 13px;
        }

        .cit-watched-error {
          color: #a22626;
        }

        @media (hover: none) {
          .cit-watched-card:hover {
            transform: none;
            box-shadow: 0 3px 12px rgba(32,43,37,.045);
          }

          .cit-watched-card:hover .cit-watched-poster {
            transform: none;
          }
        }

        @media (max-width: 1050px) {
          .cit-watched-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .cit-watched-view {
            margin-top: 20px;
          }

          .cit-watched-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .cit-watched-card {
            border-radius: 12px;
          }

          .cit-watched-body {
            padding: 9px 9px 11px;
          }

          .cit-watched-title {
            min-height: 36px;
            font-size: 13px;
          }
        }

        @media (max-width: 360px) {
          .cit-watched-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="cit-watched-header">
        <h1>Watched</h1>
        <div className="cit-watched-subtitle">
          {loading
            ? "Loading your viewing history…"
            : `${films.length} ${
                films.length === 1 ? "film" : "films"
              } watched`}
        </div>
      </div>

      {error && (
        <div className="cit-watched-error">
          Couldn't load viewing history: {error}
        </div>
      )}

      {!loading && !error && films.length === 0 && (
        <div className="cit-watched-empty-card">
          <h2>Nothing watched yet</h2>
          <p>
            When you finish a film, mark it as watched and it will appear
            here with the date. Rewatches can be recorded again in future.
          </p>
          <button type="button" onClick={onBrowseDiscover}>
            Browse films
          </button>
        </div>
      )}

      {!loading && !error && films.length > 0 && (
        <div className="cit-watched-grid">
          {films.map(({ film, latestWatchedAt, watchCount }) => (
            <article
              key={film.id}
              className="cit-watched-card"
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
              <div className="cit-watched-poster-wrap">
                {film.poster_path ? (
                  <img
                    className="cit-watched-poster"
                    src={`${TMDB_IMG}/w342${film.poster_path}`}
                    alt={film.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="cit-watched-no-poster">
                    No poster
                  </div>
                )}

                <span className="cit-watched-badge">✓ Watched</span>
              </div>

              <div className="cit-watched-body">
                <div className="cit-watched-title">
                  {film.title || "Untitled film"}
                </div>

                <div className="cit-watched-year">
                  {film.release_year || "Year unknown"}
                </div>

                <div className="cit-watched-date">
                  Last watched {formatDate(latestWatchedAt)}
                </div>

                {watchCount > 1 && (
                  <div className="cit-watched-count">
                    Watched {watchCount} times
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedFilm && (
        <FilmDetailsModal
          film={selectedFilm}
          supabase={supabase}
          session={session}
          onClose={() => setSelectedFilm(null)}
        />
      )}
    </div>
  );
}
