// Check It Twice: trusted, single-film UK availability refresh.
// Deploy with legacy JWT verification OFF: this handler validates the user JWT itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TMDB_KEY = Deno.env.get("TMDB_API_KEY") || "";
const CACHE_MS = 24 * 60 * 60 * 1000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function providerName(name: string): string {
  const aliases: Record<string, string> = {
    "Amazon Prime Video": "Prime Video",
    "Amazon Prime Video with Ads": "Prime Video",
    "Netflix basic with Ads": "Netflix",
    "Netflix Standard with Ads": "Netflix",
    "Netflix Kids": "Netflix",
    "Disney Plus": "Disney+",
    "Paramount Plus": "Paramount+",
    "Apple TV Plus": "Apple TV+",
    "Apple TV Amazon Channel": "Apple TV (Prime Video Channel)",
  };
  return aliases[name] || (name.endsWith(" Amazon Channel")
    ? `${name.slice(0, -" Amazon Channel".length)} (Prime Video Channel)`
    : name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY || !TMDB_KEY) {
    console.error("Missing Edge Function configuration");
    return json({ error: "Server configuration incomplete" }, 500);
  }
  // A valid signed-in user is required. An anon/publishable key alone cannot refresh.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in to refresh availability" }, 401);
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Valid sign-in required" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const payload = await req.json();
    const filmId = Number(payload?.film_id);
    if (!Number.isSafeInteger(filmId) || filmId <= 0) {
      return json({ error: "Valid film_id required" }, 400);
    }
    const { data: film, error: filmError } = await admin
      .from("v2_films").select("id, tmdb_id").eq("id", filmId).maybeSingle();
    if (filmError) throw filmError;
    if (!film?.tmdb_id) return json({ error: "Film not found or missing TMDB ID" }, 404);

    const { data: profile, error: profileError } = await admin
      .from("v2_profiles").select("is_admin").eq("id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    const isAdmin = profile?.is_admin === true;

    const cachedResponse = async () => {
      const { data: rows, error } = await admin
        .from("v2_streaming_availability")
        .select("provider_id,provider_name,provider_type,logo_path,watch_url,checked_at")
        .eq("film_id", filmId).eq("region", "GB");
      if (error) throw error;
      const checkedAt = (rows || []).reduce<string | null>((acc, row) =>
        (!acc || (row.checked_at && row.checked_at > acc)) ? row.checked_at : acc, null);
      return { rows: rows || [], checkedAt };
    };

    const cache = await cachedResponse();
    const age = cache.checkedAt ? Date.now() - Date.parse(cache.checkedAt) : Infinity;
    // Non-admin users cannot force repeated third-party API calls.
    if (!isAdmin && cache.rows.length > 0 && Number.isFinite(age) && age >= 0 && age < CACHE_MS) {
      return json({ ok: true, cached: true, providers: cache.rows, checked_at: cache.checkedAt });
    }
    const url = new URL(`https://api.themoviedb.org/3/movie/${film.tmdb_id}/watch/providers`);
    url.searchParams.set("api_key", TMDB_KEY);
    const tmdb = await fetch(url);
    if (!tmdb.ok) return json({ error: `Provider lookup failed (${tmdb.status})` }, 502);
    const data = await tmdb.json();
    const gb = data?.results?.GB || {};
    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const [field, type] of [["flatrate", "subscription"], ["free", "free"], ["ads", "ads"]]) {
      for (const item of (Array.isArray(gb[field]) ? gb[field] : [])) {
        const name = providerName(String(item.provider_name || ""));
        if (!name) continue;
        const key = `${name}|${type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          provider_id: Number.isInteger(item.provider_id) ? item.provider_id : null,
          provider_name: name,
          provider_type: type,
          logo_path: typeof item.logo_path === "string" ? item.logo_path : null,
          watch_url: typeof gb.link === "string" ? gb.link : null,
        });
      }
    }
    // Only the server supplies trusted provider records to the privileged RPC.
    const { error: saveError } = await admin.rpc("v2_replace_streaming_availability", {
      p_film_id: filmId, p_providers: rows,
    });
    if (saveError) throw saveError;
    const updated = await cachedResponse();
    return json({ ok: true, cached: false, providers: updated.rows, checked_at: updated.checkedAt });
  } catch (error) {
    console.error("refresh-film-availability failed:", error);
    return json({ error: "Could not refresh UK availability" }, 500);
  }
});
