import React, { useEffect, useState } from "react";

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY || "";

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);

  url.searchParams.set("api_key", TMDB_KEY);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB request failed (${response.status})`);
  }

  return response.json();
}

export default function CatalogueAdmin({
  supabase,
  session,
  onCatalogueUpdated,
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }

    async function checkAdmin() {
      setCheckingAdmin(true);

      const { data, error } = await supabase
        .from("v2_profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      if (error) {
        console.error(error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data?.is_admin);
      }

      setCheckingAdmin(false);
    }

    checkAdmin();
  }, [supabase, session]);

  async function findChristmasKeyword() {
    const result = await tmdb("/search/keyword", {
      query: "christmas",
      page: 1,
    });

    const exact = (result.results || []).find(
      (item) => item.name?.toLowerCase() === "christmas"
    );

    return exact?.id || null;
  }

  async function refreshCatalogue() {
    if (!isAdmin || refreshing) return;

    setRefreshing(true);
    setStatus("Finding Christmas films…");

    try {
      const keywordId = await findChristmasKeyword();

      if (!keywordId) {
        throw new Error("TMDB Christmas keyword could not be found.");
      }

      const discovered = new Map();

      // Start with five pages = up to 100 candidates.
      for (let page = 1; page <= 5; page++) {
        setStatus(`Finding Christmas films… page ${page} of 5`);

        const result = await tmdb("/discover/movie", {
          with_keywords: keywordId,
          include_adult: "false",
          language: "en-GB",
          sort_by: "popularity.desc",
          page,
        });

        for (const film of result.results || []) {
          discovered.set(film.id, film);
        }
      }

      const films = [...discovered.values()];

      let saved = 0;
      let failed = 0;

      for (let i = 0; i < films.length; i++) {
        const film = films[i];

        setStatus(
          `Saving Christmas catalogue… ${i + 1} of ${films.length}`
        );

        const { error } = await supabase.rpc(
          "v2_save_catalogue_film",
          {
            p_tmdb_id: film.id,
            p_title: film.title,
            p_original_title: film.original_title || null,
            p_release_date: film.release_date || null,
            p_overview: film.overview || null,
            p_poster_path: film.poster_path || null,
            p_backdrop_path: film.backdrop_path || null,
            p_classification: "christmas",
            p_discovery_source: "tmdb-keyword",
          }
        );

        if (error) {
          console.error("Failed:", film.title, error);
          failed += 1;
        } else {
          saved += 1;
        }
      }

      setStatus(
        `Catalogue refreshed: ${saved} saved${
          failed ? `, ${failed} failed` : ""
        }.`
      );

      if (onCatalogueUpdated) {
        onCatalogueUpdated();
      }
    } catch (error) {
      console.error(error);
      setStatus(`Refresh failed: ${error.message}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (!session?.user || checkingAdmin || !isAdmin) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        border: "1px solid #d1fae5",
        background: "#f0fdf4",
        borderRadius: 10,
      }}
    >
      <strong>Catalogue admin</strong>

      <div style={{ marginTop: 8 }}>
        <button
          onClick={refreshCatalogue}
          disabled={refreshing || !TMDB_KEY}
          style={{
            border: "1px solid #86efac",
            background: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          {refreshing
            ? "Refreshing catalogue…"
            : "🎄 Refresh Christmas Catalogue"}
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "#444",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}