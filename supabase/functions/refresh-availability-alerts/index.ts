import { withSupabase } from "npm:@supabase/server@1";

const TMDB_KEY = Deno.env.get("TMDB_API_KEY") || "";
const REQUEST_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      String(provider.provider_name || "")
    )}__${String(provider.provider_type || "")}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function tmdbWatchProviders(tmdbId) {
  if (!TMDB_KEY) {
    throw new Error("TMDB_API_KEY is not configured.");
  }

  const url = new URL(
    `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`
  );

  url.searchParams.set("api_key", TMDB_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB request failed (${response.status})`);
  }

  return response.json();
}

export default {
  fetch: withSupabase(
    { auth: "secret:availability_cron" },
    async (_req, ctx) => {
      try {
        const { data: alerts, error: alertsError } =
          await ctx.supabaseAdmin
            .from("v2_availability_alerts")
            .select("film_id")
            .eq("active", true);

        if (alertsError) {
          throw alertsError;
        }

        const filmIds = [
          ...new Set(
            (alerts || [])
              .map((row) => row.film_id)
              .filter(Boolean)
          ),
        ];

        if (!filmIds.length) {
          return Response.json({
            ok: true,
            checked: 0,
            updated: 0,
            failed: 0,
            message: "No active availability alerts.",
          });
        }

        const { data: films, error: filmsError } =
          await ctx.supabaseAdmin
            .from("v2_films")
            .select("id, tmdb_id, title")
            .in("id", filmIds);

        if (filmsError) {
          throw filmsError;
        }

        const filmsToCheck = films || [];
        let updated = 0;
        let failed = 0;
        const failures = [];

        for (let i = 0; i < filmsToCheck.length; i++) {
          const film = filmsToCheck[i];

          if (!film.tmdb_id) {
            failed += 1;
            failures.push({
              film_id: film.id,
              title: film.title || "Unknown film",
              error: "Missing TMDB ID",
            });
            continue;
          }

          try {
            const data = await tmdbWatchProviders(film.tmdb_id);
            const gb = data?.results?.GB || {};

            const providerRows = uniqueProviders([
              ...(gb.flatrate || []).map((provider) => ({
                provider_id: provider.provider_id ?? null,
                provider_name: normaliseProviderName(
                  String(provider.provider_name || "")
                ),
                provider_type: "subscription",
                logo_path: provider.logo_path || null,
                watch_url: gb.link || null,
              })),

              ...(gb.free || []).map((provider) => ({
                provider_id: provider.provider_id ?? null,
                provider_name: normaliseProviderName(
                  String(provider.provider_name || "")
                ),
                provider_type: "free",
                logo_path: provider.logo_path || null,
                watch_url: gb.link || null,
              })),

              ...(gb.ads || []).map((provider) => ({
                provider_id: provider.provider_id ?? null,
                provider_name: normaliseProviderName(
                  String(provider.provider_name || "")
                ),
                provider_type: "ads",
                logo_path: provider.logo_path || null,
                watch_url: gb.link || null,
              })),
            ]);

            const { error: saveError } =
              await ctx.supabaseAdmin.rpc(
                "v2_replace_streaming_availability",
                {
                  p_film_id: film.id,
                  p_providers: providerRows,
                }
              );

            if (saveError) {
              throw saveError;
            }

            updated += 1;
          } catch (error) {
            failed += 1;

            failures.push({
              film_id: film.id,
              title: film.title || "Unknown film",
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            });
          }

          if (i < filmsToCheck.length - 1) {
            await sleep(REQUEST_DELAY_MS);
          }
        }

        return Response.json({
          ok: failed === 0,
          checked: filmsToCheck.length,
          updated,
          failed,
          failures,
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          { status: 500 }
        );
      }
    }
  ),
};
