
import React from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";
const linkCache = new Map();

function normaliseProviderName(name = "") {
  const trimmed = String(name).trim();

  const names = {
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
    "Now TV Cinema": "NOW",
    "NOW Cinema": "NOW",
  };

  if (names[trimmed]) return names[trimmed];

  if (/^now(?:\s+tv)?(?:\s+cinema|\s+entertainment)?$/i.test(trimmed)) {
    return "NOW";
  }

  if (trimmed.endsWith(" Amazon Channel")) {
    return `${trimmed.replace(/ Amazon Channel$/, "")} (Prime Video Channel)`;
  }

  return trimmed;
}

function providerOpenUrl(providerName, filmTitle = "") {
  const name = normaliseProviderName(providerName);
  const title = encodeURIComponent(filmTitle.trim());

  if (name.endsWith("(Prime Video Channel)")) {
    return `https://www.primevideo.com/search/?phrase=${title}`;
  }

  switch (name) {
    case "Netflix":
      return `https://www.netflix.com/search?q=${title}`;
    case "Disney+":
      return "https://www.disneyplus.com/en-gb/browse/search";
    case "Prime Video":
    case "Amazon Video":
      return `https://www.primevideo.com/search/?phrase=${title}`;
    case "Apple TV":
      return `https://tv.apple.com/gb/search?term=${title}`;
    case "Paramount+":
      return "https://www.paramountplus.com/gb/";
    case "NOW":
      return "https://www.nowtv.com/";
    case "Sky Go":
      return "https://www.sky.com/watch/sky-go";
    case "BBC iPlayer":
      return `https://www.bbc.co.uk/iplayer/search?q=${title}`;
    case "ITVX":
      return "https://www.itv.com/watch";
    case "Channel 4":
    case "All 4":
      return "https://www.channel4.com/";
    case "Channel 5":
    case "My5":
      return "https://www.channel5.com/";
    case "UKTV Play":
      return "https://u.co.uk/";
    case "Virgin TV Go":
      return "https://virgintvgo.virginmedia.com/";
    case "Hayu":
      return "https://www.hayu.com/";
    case "Sky Store":
      return "https://www.skystore.com/";
    case "YouTube":
      return `https://www.youtube.com/results?search_query=${title}`;
    case "Google Play Movies":
      return `https://play.google.com/store/search?q=${title}&c=movies`;
    default:
      return "";
  }
}

async function getExactUrl(supabase, tmdbId, provider) {
  if (!supabase || !tmdbId) return "";

  const key = `${tmdbId}__${provider}`;

  if (linkCache.has(key)) return linkCache.get(key);

  const { data, error } = await supabase.functions.invoke(
    "watchmode-title-link",
    {
      body: {
        tmdbId,
        provider,
        region: "GB",
      },
    }
  );

  if (error) throw error;

  const url = data?.url || "";
  linkCache.set(key, url);

  return url;
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function StreamingLinks({
  providers = [],
  filmTitle = "",
  filmTmdbId = null,
  supabase = null,
  max = 20,
}) {
  const seen = new Set();

  const unique = providers.filter((provider) => {
    const name = normaliseProviderName(provider.provider_name);
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  }).slice(0, max);

  return (
    <div className="cit-streaming-links">
      <style>{`
        .cit-streaming-links {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .cit-streaming-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 9px;
          border: 1px solid #dedbd3;
          border-radius: 999px;
          background: #fff;
          color: #28483e;
          font-size: 11px;
          font-weight: 650;
          text-decoration: none;
          transition: background .15s, border-color .15s;
        }
        .cit-streaming-link:hover {
          background: #edf6f1;
          border-color: #9bb8a8;
        }
        .cit-streaming-link img {
          width: 19px;
          height: 19px;
          object-fit: cover;
          border-radius: 4px;
        }
      `}</style>

      {unique.map((provider) => {
        const name = normaliseProviderName(provider.provider_name);
        const fallbackUrl = providerOpenUrl(name, filmTitle);

        const contents = (
          <>
            {provider.logo_path && (
              <img
                src={`${TMDB_IMG}/w45${provider.logo_path}`}
                alt=""
                aria-hidden="true"
              />
            )}
            <span>{name}</span>
            {fallbackUrl && <span aria-hidden="true">↗</span>}
          </>
        );

        if (!fallbackUrl) {
          return (
            <span key={name} className="cit-streaming-link">
              {contents}
            </span>
          );
        }

        return (
          <a
            key={name}
            className="cit-streaming-link"
            href={fallbackUrl}
            target={isMobile() ? "_self" : "_blank"}
            rel="noopener noreferrer"
            title={`Open ${name} for ${filmTitle}`}
            onClick={async (event) => {
              if (!supabase || !filmTmdbId) return;

              // Preserve normal browser behaviour for modified clicks.
              if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              ) return;

              event.preventDefault();

              // Open a blank tab immediately on desktop to avoid
              // popup blockers rejecting the asynchronous lookup.
              const tab = isMobile()
                ? null
                : window.open("about:blank", "_blank");

              try {
                const exact = await getExactUrl(
                  supabase,
                  filmTmdbId,
                  name
                );
                const destination = exact || fallbackUrl;

                if (isMobile()) {
                  window.location.assign(destination);
                } else if (tab && !tab.closed) {
                  tab.location.replace(destination);
                } else {
                  window.location.assign(destination);
                }
              } catch (error) {
                console.warn("Exact streaming link unavailable", error);

                if (isMobile()) {
                  window.location.assign(fallbackUrl);
                } else if (tab && !tab.closed) {
                  tab.location.replace(fallbackUrl);
                } else {
                  window.location.assign(fallbackUrl);
                }
              }
            }}
          >
            {contents}
          </a>
        );
      })}
    </div>
  );
}
