import React, { useEffect, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export default function Catalogue({ supabase, refreshKey }) {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogue() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("v2_catalogue_entries")
        .select(`
          classification,
          v2_films (
            id,
            tmdb_id,
            title,
            release_year,
            overview,
            poster_path
          )
        `)
        .eq("status", "included");

      if (error) {
        console.error(error);
        setError(error.message);
        setFilms([]);
      } else {
        const rows = (data || [])
          .map((row) => ({
            classification: row.classification,
            ...row.v2_films,
          }))
          .filter((row) => row.id)
          .sort((a, b) =>
            (a.title || "").localeCompare(b.title || "")
          );

        setFilms(rows);
      }

      setLoading(false);
    }

    loadCatalogue();
 }, [supabase, refreshKey]);

  return (
    <div
      style={{
        marginBottom: 22,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 6px" }}>Discover</h2>

      <div
        style={{
          fontSize: 13,
          color: "#666",
          marginBottom: 14,
        }}
      >
        {loading
          ? "Loading Christmas catalogue…"
          : `${films.length} Christmas films`}
      </div>

      {error && (
        <div style={{ color: "#b91c1c" }}>
          Couldn't load catalogue: {error}
        </div>
      )}

      {!loading && !error && films.length === 0 && (
        <div style={{ color: "#666" }}>
          The new Christmas catalogue is empty at the moment.
        </div>
      )}

      {!loading && films.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {films.map((film) => (
            <div
              key={film.id}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr",
                gap: 12,
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 10,
              }}
            >
              {film.poster_path ? (
                <img
                  src={`${TMDB_IMG}/w185${film.poster_path}`}
                  alt={film.title}
                  style={{
                    width: 90,
                    height: 135,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 90,
                    height: 135,
                    background: "#f3f4f6",
                    borderRadius: 8,
                  }}
                />
              )}

              <div>
                <strong>
                  {film.title}
                  {film.release_year
                    ? ` (${film.release_year})`
                    : ""}
                </strong>

                {film.overview && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "#444",
                      lineHeight: 1.35,
                    }}
                  >
                    {film.overview.length > 180
                      ? film.overview.slice(0, 180) + "…"
                      : film.overview}
                  </div>
                )}

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#777",
                  }}
                >
                  {film.classification === "christmas-adjacent"
                    ? "Christmas adjacent"
                    : "Christmas"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}