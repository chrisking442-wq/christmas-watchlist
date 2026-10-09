import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const WATCHMODE_API_KEY = Deno.env.get("WATCHMODE_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normaliseProviderName(value: string) {
  const name = (value || "").trim().toLowerCase();

  if (name.includes("netflix")) return "Netflix";
  if (name.includes("disney")) return "Disney+";
  if (name.includes("prime") || name.includes("amazon")) return "Prime Video";

  return value || "";
}

function providerMatches(requested: string, sourceName: string) {
  return (
    normaliseProviderName(requested).toLowerCase() ===
    normaliseProviderName(sourceName).toLowerCase()
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!WATCHMODE_API_KEY) {
      throw new Error("WATCHMODE_API_KEY is not configured.");
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = await req.json();

    const tmdbId = Number(body?.tmdbId);
    const provider = String(body?.provider || "").trim();
    const region = String(body?.region || "GB").trim().toUpperCase();

    if (!tmdbId || !provider) {
      return new Response(
        JSON.stringify({
          error: "tmdbId and provider are required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const watchmodeUrl =
      `https://api.watchmode.com/v1/title/movie-${tmdbId}/sources/` +
      `?regions=${encodeURIComponent(region)}`;

    const response = await fetch(watchmodeUrl, {
      headers: {
        "X-API-Key": WATCHMODE_API_KEY,
      },
    });

    if (!response.ok) {
      const details = await response.text();

      console.error("Watchmode request failed:", response.status, details);

      return new Response(
        JSON.stringify({
          error: `Watchmode request failed (${response.status})`,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const sources = await response.json();

    const typeOrder: Record<string, number> = {
      sub: 0,
      free: 1,
      tve: 2,
      rent: 3,
      buy: 4,
    };

    const matches = (Array.isArray(sources) ? sources : [])
      .filter(
        (source) =>
          String(source?.region || "").toUpperCase() === region &&
          providerMatches(provider, String(source?.name || "")) &&
          source?.web_url
      )
      .sort(
        (a, b) =>
          (typeOrder[a?.type] ?? 9) - (typeOrder[b?.type] ?? 9)
      );

    const best = matches[0] || null;

    return new Response(
      JSON.stringify({
        url: best?.web_url || "",
        source: best
          ? {
              name: best.name || "",
              type: best.type || "",
              region: best.region || "",
            }
          : null,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=21600",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
