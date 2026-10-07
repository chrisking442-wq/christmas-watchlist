import React, { useEffect, useMemo, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";

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
    "Sky Go": "Sky Go",
  };

  return direct[value] || value;
}

function uniqueProviders(rows = []) {
  const seen = new Set();

  return rows.filter((row) => {
    const name = normaliseProviderName(row.provider_name);
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function ProviderBadges({ providers }) {
  if (!providers.length) return null;

  return (
    <div className="cit-shared-providers">
      {providers.slice(0, 3).map((provider) => (
        <span
          className="cit-shared-provider"
          key={`${provider.provider_id || provider.provider_name}`}
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

export default function SharedList({ supabase, token }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !token) {
      setError("This shared list isn't available.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSharedList() {
      setLoading(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc(
        "v2_get_public_shared_list",
        { p_token: token }
      );

      if (cancelled) return;

      if (rpcError) {
        console.error("Couldn't load shared list:", rpcError);
        setError("This shared list couldn't be loaded.");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("This shared link has expired or sharing has been turned off.");
        setLoading(false);
        return;
      }

      setShare(data);
      setLoading(false);
    }

    loadSharedList();

    return () => {
      cancelled = true;
    };
  }, [supabase, token]);

  const items = Array.isArray(share?.items) ? share.items : [];

  const ownerText = useMemo(() => {
    const name = String(share?.owner_name || "").trim();
    return name ? `Shared by ${name}` : "A shared Check It Twice list";
  }, [share]);

  return (
    <main className="cit-shared-page">
      <style>{`
        .cit-shared-page {
          min-height: 100vh;
          box-sizing: border-box;
          background:
            radial-gradient(circle at 12% 4%, rgba(255,255,255,.88), transparent 24%),
            #f7f4ee;
          color: #18382f;
          padding: 24px 18px 44px;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .cit-shared-shell {
          width: min(1120px, 100%);
          margin: 0 auto;
        }

        .cit-shared-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e2ddd4;
        }

        .cit-shared-logo {
          width: min(330px, 56vw);
          height: auto;
          display: block;
        }

        .cit-shared-badge {
          flex: 0 0 auto;
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

        .cit-shared-hero {
          padding: 30px 0 22px;
        }

        .cit-shared-eyebrow {
          margin-bottom: 7px;
          color: #922b2f;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        .cit-shared-hero h1 {
          margin: 0;
          color: #123b2d;
          font-size: clamp(30px, 5vw, 46px);
          line-height: 1;
          letter-spacing: -.045em;
        }

        .cit-shared-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 9px;
          color: #6c7771;
          font-size: 12px;
        }

        .cit-shared-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
        }

        .cit-shared-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid #e2ddd4;
          border-radius: 14px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 3px 12px rgba(32,43,37,.045);
        }

        .cit-shared-poster-wrap {
          aspect-ratio: 2 / 3;
          overflow: hidden;
          background: #ebe7df;
        }

        .cit-shared-poster {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .cit-shared-no-poster {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: #838c87;
          font-size: 11px;
        }

        .cit-shared-card-body {
          padding: 10px;
        }

        .cit-shared-title {
          min-height: 35px;
          color: #18382f;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.3;
        }

        .cit-shared-year {
          margin-top: 3px;
          color: #828b86;
          font-size: 10px;
        }

        .cit-shared-providers {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 8px;
        }

        .cit-shared-provider {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #ded9d0;
          border-radius: 999px;
          background: #f8f7f3;
          padding: 3px 6px;
          color: #4c5e56;
          font-size: 9px;
          font-weight: 700;
        }

        .cit-shared-provider img {
          width: 15px;
          height: 15px;
          border-radius: 4px;
          object-fit: cover;
        }

        .cit-shared-no-streaming {
          margin-top: 8px;
          color: #8a918d;
          font-size: 9px;
          line-height: 1.35;
        }

        .cit-shared-empty,
        .cit-shared-status {
          border: 1px solid #e2ddd4;
          border-radius: 15px;
          background: rgba(255,255,255,.82);
          padding: 24px;
          color: #65716b;
          text-align: center;
        }

        .cit-shared-empty strong,
        .cit-shared-status strong {
          display: block;
          margin-bottom: 5px;
          color: #123b2d;
          font-size: 16px;
        }

        .cit-shared-footer {
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

        .cit-shared-home {
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

        @media (max-width: 960px) {
          .cit-shared-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .cit-shared-page {
            padding: 16px 12px 34px;
          }

          .cit-shared-logo {
            width: min(290px, 72vw);
          }

          .cit-shared-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .cit-shared-hero {
            padding: 23px 0 18px;
          }

          .cit-shared-footer {
            align-items: stretch;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="cit-shared-shell">
        <header className="cit-shared-topbar">
          <a href="/" aria-label="Check It Twice home">
            <img
              className="cit-shared-logo"
              src="/check-it-twice-logo-final.png"
              alt="Check It Twice — The Ultimate Christmas Watchlist"
            />
          </a>

          <span className="cit-shared-badge">Shared list</span>
        </header>

        {loading ? (
          <div className="cit-shared-status" style={{ marginTop: 28 }}>
            <strong>Opening Christmas list…</strong>
            Just a moment.
          </div>
        ) : error ? (
          <div className="cit-shared-status" style={{ marginTop: 28 }}>
            <strong>We couldn't open this list</strong>
            {error}
          </div>
        ) : (
          <>
            <section className="cit-shared-hero">
              <div className="cit-shared-eyebrow">Check It Twice</div>
              <h1>{share?.name || "Christmas List"}</h1>
              <div className="cit-shared-meta">
                <span>{ownerText}</span>
                <span>
                  {items.length} {items.length === 1 ? "film" : "films"}
                </span>
              </div>
            </section>

            {items.length === 0 ? (
              <div className="cit-shared-empty">
                <strong>This Christmas list is empty</strong>
                There's nothing here yet — check back later.
              </div>
            ) : (
              <div className="cit-shared-grid">
                {items.map((item) => {
                  const film = item?.film || {};
                  const providers = uniqueProviders(
                    Array.isArray(item?.availability)
                      ? item.availability
                      : []
                  );

                  return (
                    <article className="cit-shared-card" key={item.item_id}>
                      <div className="cit-shared-poster-wrap">
                        {film.poster_path ? (
                          <img
                            className="cit-shared-poster"
                            src={`${TMDB_IMG}/w342${film.poster_path}`}
                            alt={film.title || "Film poster"}
                            loading="lazy"
                          />
                        ) : (
                          <div className="cit-shared-no-poster">
                            No poster
                          </div>
                        )}
                      </div>

                      <div className="cit-shared-card-body">
                        <div className="cit-shared-title">
                          {film.title || "Untitled film"}
                        </div>

                        <div className="cit-shared-year">
                          {film.release_year || "Year unknown"}
                        </div>

                        {providers.length > 0 ? (
                          <ProviderBadges providers={providers} />
                        ) : (
                          <div className="cit-shared-no-streaming">
                            No included UK streaming service currently listed.
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <footer className="cit-shared-footer">
              <span>
                UK streaming availability can change. Powered by Check It Twice.
              </span>

              <a className="cit-shared-home" href="/">
                Build your own list
              </a>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
