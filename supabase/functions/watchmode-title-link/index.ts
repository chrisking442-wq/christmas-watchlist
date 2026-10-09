import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const WATCHMODE_API_KEY = Deno.env.get("WATCHMODE_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clean(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalProvider(value: string) {
  const name = clean(value);
  const compact = name.replace(/\s+/g, "");

  // Prime Video add-on channels need to stay distinct from the
  // provider's own app/service.
  const isPrimeChannel =
    compact.includes("amazonchannel") ||
    compact.includes("primevideochannel");

  if (isPrimeChannel) {
    if (compact.includes("apple")) return "prime-channel:apple";
    if (compact.includes("paramount")) return "prime-channel:paramount";
    if (compact.includes("hayu")) return "prime-channel:hayu";
    if (compact.includes("mgm")) return "prime-channel:mgm";
    if (compact.includes("discovery")) return "prime-channel:discovery";
    return `prime-channel:${name}`;
  }

  if (compact.includes("netflix")) return "netflix";
  if (compact.includes("disney")) return "disney";
  if (
    compact.includes("amazonprime") ||
    compact.includes("primevideo")
  ) {
    return "prime-video";
  }

  if (
    compact.includes("appletv") ||
    compact === "apple"
  ) {
    return "apple-tv";
  }

  if (compact.includes("paramount")) return "paramount";
  if (
    compact === "now" ||
    compact.includes("nowtv") ||
    compact.includes("nowcinema") ||
    compact.includes("nowentertainment")
  ) {
    return "now";
  }

  if (compact.includes("skygo")) return "sky-go";
  if (compact.includes("skystore")) return "sky-store";

  if (
    compact.includes("bbciplayer") ||
    compact === "iplayer"
  ) {
    return "bbc-iplayer";
  }

  if (
    compact.includes("itvx") ||
    compact === "itv"
  ) {
    return "itvx";
  }

  if (
    compact.includes("channel4") ||
    compact.includes("all4")
  ) {
    return "channel-4";
  }

  if (
    compact.includes("my5") ||
    compact.includes("channel5")
  ) {
    return "my5";
  }

  if (compact.includes("uktvplay")) return "uktv-play";
  if (compact.includes("virgintvgo")) return "virgin-tv-go";
  if (compact.includes("hayu")) return "hayu";
  if (compact.includes("youtube")) return "youtube";
  if (compact.includes("googleplay")) return "google-play";

  // Amazon Video is deliberately separate from Prime Video because it
  // can represent a rent/buy store result rather than subscription.
  if (compact.includes("amazonvideo")) return "amazon-video";

  return name;
}

function providerMatches(requested: string, sourceName: string) {
  return canonicalProvider(requested) === canonicalProvider(sourceName);
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
      ads: 3,
      rent: 4,
      buy: 5,
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
        requested_provider: provider,
        matched_provider: best?.name || "",
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
