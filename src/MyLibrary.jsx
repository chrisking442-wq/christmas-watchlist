import React, { useEffect, useState } from "react";

export default function MyLibrary({ supabase, session }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !session?.user) {
      setLists([]);
      return;
    }

    let cancelled = false;

    async function loadLists() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("v2_lists")
        .select("id, name, list_type")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setLists([]);
      } else {
        setLists(data || []);
      }

      setLoading(false);
    }

    loadLists();

    return () => {
      cancelled = true;
    };
  }, [supabase, session]);

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

      {loading && <div>Loading your lists…</div>}

      {error && (
        <div style={{ color: "#b91c1c" }}>
          Couldn't load your library: {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {lists.map((list) => (
            <div
              key={list.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <strong>{list.name}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}