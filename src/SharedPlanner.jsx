import React, { useEffect, useMemo, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function formatDate(value) {
  if (!value) return "";

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : value;
}

function normaliseProviderName(name = "") {
  const value = String(name || "").trim();

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

  return direct[value] || value;
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

export default function SharedPlanner({ supabase, token }) {
  const [planner, setPlanner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !token) {
      setError("This shared planner isn't available.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPlanner() {
      setLoading(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc(
        "v2_get_public_shared_planner",
        { p_token: token }
      );

      if (cancelled) return;

      if (rpcError) {
        console.error("Couldn't load shared planner:", rpcError);
        setError("This shared planner couldn't be loaded.");
        setLoading(false);
        return;
      }

      if (!data) {
        setError(
          "This shared link has expired or planner sharing has been turned off."
        );
        setLoading(false);
        return;
      }

      setPlanner(data);
      setLoading(false);
    }

    loadPlanner();

    return () => {
      cancelled = true;
    };
  }, [supabase, token]);

  const events = Array.isArray(planner?.events) ? planner.events : [];

  const groups = useMemo(() => {
    const map = new Map();

    for (const event of events) {
      const key = event.planned_date || "Date to be confirmed";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }

    return [...map.entries()];
  }, [events]);

  const ownerText = String(planner?.owner_name || "").trim()
    ? `Shared by ${planner.owner_name}`
    : "A shared Check It Twice planner";

  return (
    <main className="cit-shared-planner-page">
      <style>{styles}</style>

      <div className="cit-shared-planner-shell">
        <header className="cit-shared-planner-topbar">
          <a href="/" aria-label="Check It Twice home">
            <img
              className="cit-shared-planner-logo"
              src="/check-it-twice-logo-final.png"
              alt="Check It Twice — The Ultimate Christmas Watchlist"
            />
          </a>

          <span className="cit-shared-planner-badge">Shared planner</span>
        </header>

        {loading ? (
          <div className="cit-shared-planner-status">
            <strong>Opening Christmas planner…</strong>
            Just a moment.
          </div>
        ) : error ? (
          <div className="cit-shared-planner-status">
            <strong>We couldn't open this planner</strong>
            {error}
          </div>
        ) : (
          <>
            <section className="cit-shared-planner-hero">
              <div>
                <div className="cit-shared-planner-eyebrow">
                  Christmas movie nights
                </div>
                <h1>{planner?.name || "My Christmas Planner"}</h1>
                <div className="cit-shared-planner-meta">
                  <span>{ownerText}</span>
                  <span>
                    {events.length}{" "}
                    {events.length === 1 ? "movie night" : "movie nights"}
                  </span>
                </div>
              </div>

              <div className="cit-shared-planner-count">
                <strong>{events.length}</strong>
                <span>planned</span>
              </div>
            </section>

            {!events.length ? (
              <div className="cit-shared-planner-empty">
                <strong>No movie nights planned yet</strong>
                Check back soon.
              </div>
            ) : (
              <section className="cit-shared-planner-schedule">
                {groups.map(([date, dayEvents]) => (
                  <div className="cit-shared-planner-day" key={date}>
                    <div className="cit-shared-planner-day-heading">
                      <h2>{formatDate(date)}</h2>
                      <span>
                        {dayEvents.length}{" "}
                        {dayEvents.length === 1 ? "film" : "films"}
                      </span>
                    </div>

                    <div className="cit-shared-planner-day-list">
                      {dayEvents.map((event) => {
                        const film = event?.film || {};
                        const providers = uniqueProviders(
                          Array.isArray(event?.availability)
                            ? event.availability
                            : []
                        );

                        return (
                          <article
                            className="cit-shared-planner-card"
                            key={event.event_id}
                          >
                            <div className="cit-shared-planner-poster-wrap">
                              {film.poster_path ? (
                                <img
                                  src={`${TMDB_IMG}/w185${film.poster_path}`}
                                  alt=""
                                  aria-hidden="true"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="cit-shared-planner-no-poster">
                                  No poster
                                </div>
                              )}
                            </div>

                            <div className="cit-shared-planner-card-body">
                              <h3>{film.title || "Untitled film"}</h3>

                              <div className="cit-shared-planner-card-meta">
                                {event.planned_time && (
                                  <span>{formatTime(event.planned_time)}</span>
                                )}
                                {event.theme && <span>{event.theme}</span>}
                                {film.release_year && (
                                  <span>{film.release_year}</span>
                                )}
                              </div>

                              {event.notes && (
                                <p className="cit-shared-planner-notes">
                                  {event.notes}
                                </p>
                              )}

                              {providers.length > 0 && (
                                <div className="cit-shared-planner-providers">
                                  {providers.slice(0, 4).map((provider) => (
                                    <span
                                      className="cit-shared-planner-provider"
                                      key={`${
                                        provider.provider_id ||
                                        provider.provider_name
                                      }`}
                                    >
                                      {provider.logo_path ? (
                                        <img
                                          src={`${TMDB_IMG}/w45${provider.logo_path}`}
                                          alt=""
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                      {normaliseProviderName(
                                        provider.provider_name
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}

            <footer className="cit-shared-planner-footer">
              <span>
                UK streaming availability can change. Powered by Check It Twice.
              </span>

              <a className="cit-shared-planner-home" href="/">
                Build your own planner
              </a>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

const styles = `
  .cit-shared-planner-page {
    min-height: 100vh;
    box-sizing: border-box;
    background:
      radial-gradient(circle at 12% 5%, rgba(255,255,255,.92), transparent 24%),
      #f7f4ee;
    color: #18382f;
    padding: 24px 18px 44px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .cit-shared-planner-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
  }

  .cit-shared-planner-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    padding-bottom: 18px;
    border-bottom: 1px solid #e2ddd4;
  }

  .cit-shared-planner-logo {
    width: min(330px, 56vw);
    height: auto;
    display: block;
  }

  .cit-shared-planner-badge {
    border: 1px solid #d8d3ca;
    background: rgba(255,255,255,.82);
    color: #6b756f;
    border-radius: 999px;
    padding: 7px 10px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .cit-shared-planner-hero {
    position: relative;
    overflow: hidden;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    margin-top: 24px;
    border: 1px solid #d9ded8;
    border-radius: 18px;
    background:
      radial-gradient(circle at 88% 12%, rgba(255,255,255,.95), transparent 22%),
      linear-gradient(135deg, #eef3ef 0%, #f6f3eb 58%, #edf3f0 100%);
    padding: 25px 26px;
  }

  .cit-shared-planner-eyebrow {
    margin-bottom: 7px;
    color: #922b2f;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .13em;
    text-transform: uppercase;
  }

  .cit-shared-planner-hero h1 {
    margin: 0;
    color: #123b2d;
    font-size: clamp(30px, 5vw, 44px);
    line-height: 1;
    letter-spacing: -.045em;
  }

  .cit-shared-planner-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin-top: 10px;
    color: #6c7771;
    font-size: 12px;
  }

  .cit-shared-planner-count {
    min-width: 96px;
    border: 1px solid rgba(18,59,45,.12);
    border-radius: 13px;
    background: rgba(255,255,255,.75);
    padding: 11px 13px;
    text-align: center;
  }

  .cit-shared-planner-count strong {
    display: block;
    color: #123b2d;
    font-size: 25px;
  }

  .cit-shared-planner-count span {
    color: #718078;
    font-size: 9px;
    font-weight: 750;
  }

  .cit-shared-planner-schedule {
    display: grid;
    gap: 22px;
    margin-top: 24px;
  }

  .cit-shared-planner-day {
    display: grid;
    gap: 9px;
  }

  .cit-shared-planner-day-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 0 2px;
  }

  .cit-shared-planner-day-heading h2 {
    margin: 0;
    color: #123b2d;
    font-size: 16px;
  }

  .cit-shared-planner-day-heading span {
    color: #89918d;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .cit-shared-planner-day-list {
    display: grid;
    gap: 8px;
  }

  .cit-shared-planner-card {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 12px;
    border: 1px solid #e0dbd2;
    border-radius: 13px;
    background: rgba(255,255,255,.91);
    padding: 9px;
    box-shadow: 0 3px 13px rgba(31,47,39,.04);
  }

  .cit-shared-planner-poster-wrap img,
  .cit-shared-planner-no-poster {
    width: 76px;
    aspect-ratio: 2 / 3;
    display: block;
    border-radius: 8px;
    object-fit: cover;
    background: #ebe7df;
  }

  .cit-shared-planner-no-poster {
    display: grid;
    place-items: center;
    color: #87908b;
    text-align: center;
    font-size: 9px;
  }

  .cit-shared-planner-card-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .cit-shared-planner-card-body h3 {
    margin: 0;
    color: #183d31;
    font-size: 15px;
    line-height: 1.25;
  }

  .cit-shared-planner-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    margin-top: 5px;
    color: #78847e;
    font-size: 10px;
  }

  .cit-shared-planner-card-meta span + span::before {
    content: "•";
    margin-right: 10px;
    color: #bdc3bf;
  }

  .cit-shared-planner-notes {
    margin: 8px 0 0;
    color: #5f6f67;
    font-size: 11px;
    line-height: 1.45;
  }

  .cit-shared-planner-providers {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }

  .cit-shared-planner-provider {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #e0dcd4;
    border-radius: 999px;
    background: #f8f6f1;
    padding: 3px 6px;
    color: #53655d;
    font-size: 9px;
    font-weight: 750;
  }

  .cit-shared-planner-provider img {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    object-fit: cover;
  }

  .cit-shared-planner-empty,
  .cit-shared-planner-status {
    margin-top: 24px;
    border: 1px solid #e2ddd4;
    border-radius: 15px;
    background: rgba(255,255,255,.82);
    padding: 24px;
    color: #65716b;
    text-align: center;
  }

  .cit-shared-planner-empty strong,
  .cit-shared-planner-status strong {
    display: block;
    margin-bottom: 5px;
    color: #123b2d;
    font-size: 16px;
  }

  .cit-shared-planner-footer {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid #e2ddd4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    color: #78817c;
    font-size: 11px;
  }

  .cit-shared-planner-home {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    border: 1px solid #123b2d;
    border-radius: 10px;
    background: #123b2d;
    color: #fff;
    padding: 8px 12px;
    text-decoration: none;
    font-size: 11px;
    font-weight: 800;
  }

  @media (max-width: 720px) {
    .cit-shared-planner-page {
      padding: 16px 12px 34px;
    }

    .cit-shared-planner-logo {
      width: min(290px, 72vw);
    }

    .cit-shared-planner-hero {
      align-items: stretch;
      flex-direction: column;
      gap: 13px;
      padding: 19px 17px;
    }

    .cit-shared-planner-count {
      width: fit-content;
      text-align: left;
    }

    .cit-shared-planner-count strong,
    .cit-shared-planner-count span {
      display: inline;
    }

    .cit-shared-planner-count span {
      margin-left: 5px;
    }

    .cit-shared-planner-card {
      grid-template-columns: 66px minmax(0, 1fr);
    }

    .cit-shared-planner-poster-wrap img,
    .cit-shared-planner-no-poster {
      width: 66px;
    }

    .cit-shared-planner-footer {
      align-items: stretch;
      flex-direction: column;
    }
  }
`;
