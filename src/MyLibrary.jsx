import React, { useEffect, useState } from "react";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export default function MyLibrary({ supabase, session }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user) {
      setLists([]);
      setSelectedList(null);
      setItems([]);
      return;
    }

    async function loadLists() {
      setLoadingLists(true);
      setError("");

      const { data, error } = await supabase
        .from("v2_lists")
        .select("id, name, list_type")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
        setLists([]);
      } else {
        setLists(data || []);
      }

      setLoadingLists(false);
    }

    loadLists();
  }, [supabase, session]);

  async function openList(list) {
    setSelectedList(list);
    setLoadingItems(true);
    setError("");

    const { data, error } = await supabase
      .from("v2_list_items")
      .select(`
        id,
        added_at,
        v2_films (
          id,
          tmdb_id,
          title,
          release_year,
          overview,
          poster_path
        )
      `)
      .eq("list_id", list.id)
      .order("added_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(error.message);
      setItems([]);
    } else {
      setItems(data || []);
    }

    setLoadingItems(false);
  }

  if (!session?.user) return null;

  return (
    <div
      style={{
        marginBottom: 18,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 10px" }}>My Library</h2>

      {loadingLists && <div>Loading your lists…</div>}

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: selectedList ? 18 : 0,
        }}
      >
        {lists.map((list) => (
          <button
            key={list.id}
            onClick={() => openList(list)}
            style={{
              border:
                selectedList?.id === list.id
                  ? "2px solid #166534"
                  : "1px solid #ddd",
              background:
                selectedList?.id === list.id ? "#f0fdf4" : "#fff",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {list.name}
          </button>
        ))}
      </div>

      {selectedList && (
        <div>
          <h3 style={{ margin: "0 0 12px" }}>
            {selectedList.name}
          </h3>

          {loadingItems && <div>Loading films…</div>}

          {!loadingItems && items.length === 0 && (
            <div style={{ color: "#666" }}>
              No films in this list yet.
            </div>
          )}

          {!loadingItems && items.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {items.map((item) => {
                const film = item.v2_films;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr",
                      gap: 12,
                      border: "1px solid #eee",
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    {film?.poster_path ? (
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
                        {film?.title}
                        {film?.release_year
                          ? ` (${film.release_year})`
                          : ""}
                      </strong>

                      {film?.overview && (
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}