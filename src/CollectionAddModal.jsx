import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export default function CollectionAddModal({
  film,
  supabase,
  session,
  onClose,
  onChanged,
}) {
  const [collections, setCollections] = useState([]);
  const [memberIds, setMemberIds] = useState(new Set());
  const [resolvedFilmId, setResolvedFilmId] = useState(film?.id || null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    loadCollectionsAndMembership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film?.id, film?.tmdb_id, session?.user?.id]);

  async function loadCollectionsAndMembership() {
    if (!supabase || !session?.user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data: collectionRows, error: collectionsError } =
      await supabase.rpc("v2_get_custom_collections");

    if (collectionsError) {
      console.error(collectionsError);
      setError(collectionsError.message);
      setCollections([]);
      setLoading(false);
      return;
    }

    const rows = collectionRows || [];
    setCollections(rows);

    let filmId = film?.id || null;

    if (!filmId && film?.tmdb_id) {
      const { data: filmRow, error: filmLookupError } = await supabase
        .from("v2_films")
        .select("id")
        .eq("tmdb_id", film.tmdb_id)
        .maybeSingle();

      if (filmLookupError) {
        console.error(filmLookupError);
      } else {
        filmId = filmRow?.id || null;
        setResolvedFilmId(filmId);
      }
    }

    if (!filmId || rows.length === 0) {
      setMemberIds(new Set());
      setLoading(false);
      return;
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("v2_list_items")
      .select(`
        list_id,
        v2_lists!inner (
          user_id,
          list_type
        )
      `)
      .eq("film_id", filmId)
      .eq("v2_lists.user_id", session.user.id)
      .eq("v2_lists.list_type", "custom");

    if (membershipError) {
      console.error(membershipError);
      setError(membershipError.message);
    } else {
      setMemberIds(
        new Set((memberships || []).map((row) => row.list_id).filter(Boolean))
      );
    }

    setLoading(false);
  }

  function filmPayload(listId) {
    return {
      p_list_id: listId,
      p_tmdb_id: film.tmdb_id,
      p_title: film.title,
      p_original_title: film.original_title || null,
      p_release_date:
        film.release_date ||
        (film.release_year ? `${film.release_year}-01-01` : null),
      p_overview: film.overview || null,
      p_poster_path: film.poster_path || null,
      p_backdrop_path: film.backdrop_path || null,
    };
  }

  async function addToCollection(listId) {
    const { data: filmId, error: saveError } = await supabase.rpc(
      "v2_save_film_to_collection",
      filmPayload(listId)
    );

    if (saveError) throw saveError;

    if (filmId) setResolvedFilmId(filmId);

    setMemberIds((prev) => {
      const next = new Set(prev);
      next.add(listId);
      return next;
    });

    setCollections((prev) =>
      prev.map((row) =>
        row.id === listId
          ? { ...row, item_count: Number(row.item_count || 0) + 1 }
          : row
      )
    );

    onChanged?.();
  }

  async function removeFromCollection(listId) {
    const filmId = resolvedFilmId || film?.id;

    if (!filmId) {
      throw new Error("This film could not be matched to your library.");
    }

    const { error: removeError } = await supabase.rpc(
      "v2_remove_film_from_collection",
      {
        p_list_id: listId,
        p_film_id: filmId,
      }
    );

    if (removeError) throw removeError;

    setMemberIds((prev) => {
      const next = new Set(prev);
      next.delete(listId);
      return next;
    });

    setCollections((prev) =>
      prev.map((row) =>
        row.id === listId
          ? {
              ...row,
              item_count: Math.max(0, Number(row.item_count || 0) - 1),
            }
          : row
      )
    );

    onChanged?.();
  }

  async function toggleCollection(collection) {
    if (!collection?.id || busyId) return;

    setBusyId(collection.id);
    setError("");

    try {
      if (memberIds.has(collection.id)) {
        await removeFromCollection(collection.id);
      } else {
        await addToCollection(collection.id);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Couldn't update the collection.");
    } finally {
      setBusyId("");
    }
  }

  async function createAndAdd(event) {
    event.preventDefault();

    const name = newName.trim();
    if (!name || creating) return;

    setCreating(true);
    setError("");

    try {
      const { data: listId, error: createError } = await supabase.rpc(
        "v2_create_custom_collection",
        { p_name: name }
      );

      if (createError) throw createError;

      const newCollection = {
        id: listId,
        name,
        item_count: 0,
      };

      setCollections((prev) =>
        [...prev, newCollection].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        )
      );

      await addToCollection(listId);
      setNewName("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Couldn't create the collection.");
    } finally {
      setCreating(false);
    }
  }

  if (!film || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="cit-collection-add-overlay"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose?.();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <style>{`
        .cit-collection-add-overlay {
          position: fixed;
          inset: 0;
          z-index: 5500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(14, 30, 24, .58);
          backdrop-filter: blur(6px);
        }

        .cit-collection-add-modal {
          width: min(520px, 100%);
          max-height: 90vh;
          overflow: auto;
          box-sizing: border-box;
          border: 1px solid #ddd7cd;
          border-radius: 18px;
          background: #fbfaf6;
          color: #18382f;
          box-shadow: 0 24px 70px rgba(16, 34, 27, .25);
        }

        .cit-collection-add-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px;
          border-bottom: 1px solid #e7e1d8;
        }

        .cit-collection-add-header h2 {
          margin: 0;
          color: #123b2d;
          font-size: 23px;
          line-height: 1.05;
          letter-spacing: -.03em;
        }

        .cit-collection-add-header p {
          margin: 6px 0 0;
          color: #6e7973;
          font-size: 12px;
          line-height: 1.4;
        }

        .cit-collection-add-close {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          border: 1px solid #ddd7cd;
          border-radius: 999px;
          background: #fff;
          color: #56645e;
          cursor: pointer;
          font-size: 18px;
        }

        .cit-collection-add-film {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr);
          gap: 11px;
          align-items: center;
          margin: 14px 18px 0;
          padding: 9px;
          border: 1px solid #e5dfd6;
          border-radius: 12px;
          background: rgba(255,255,255,.7);
        }

        .cit-collection-add-film img,
        .cit-collection-add-poster-empty {
          width: 52px;
          aspect-ratio: 2 / 3;
          border-radius: 7px;
          object-fit: cover;
          background: #ece8df;
        }

        .cit-collection-add-poster-empty {
          display: grid;
          place-items: center;
        }

        .cit-collection-add-film strong {
          display: block;
          font-size: 14px;
          line-height: 1.25;
        }

        .cit-collection-add-film span {
          display: block;
          margin-top: 3px;
          color: #758079;
          font-size: 11px;
        }

        .cit-collection-add-body {
          padding: 16px 18px 18px;
        }

        .cit-collection-add-list {
          display: grid;
          gap: 8px;
        }

        .cit-collection-add-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
          padding: 11px 12px;
          border: 1px solid #e2ddd4;
          border-radius: 12px;
          background: #fff;
          color: #193a30;
          text-align: left;
          cursor: pointer;
        }

        .cit-collection-add-row:hover {
          border-color: #aab8b1;
        }

        .cit-collection-add-row strong {
          display: block;
          font-size: 14px;
        }

        .cit-collection-add-row small {
          display: block;
          margin-top: 2px;
          color: #7a847f;
        }

        .cit-collection-add-check {
          display: grid;
          place-items: center;
          width: 27px;
          height: 27px;
          border: 1px solid #d2d8d4;
          border-radius: 999px;
          background: #f8f8f6;
          color: transparent;
          font-weight: 900;
        }

        .cit-collection-add-row.is-selected .cit-collection-add-check {
          border-color: #123b2d;
          background: #123b2d;
          color: #fff;
        }

        .cit-collection-add-create {
          margin-top: 16px;
          padding-top: 15px;
          border-top: 1px solid #e7e1d8;
        }

        .cit-collection-add-create-title {
          margin-bottom: 7px;
          font-size: 12px;
          font-weight: 800;
        }

        .cit-collection-add-create form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
        }

        .cit-collection-add-create input {
          min-width: 0;
          border: 1px solid #d8d2c8;
          border-radius: 10px;
          padding: 10px 11px;
          background: #fff;
          color: #173f31;
          font: inherit;
          outline: none;
        }

        .cit-collection-add-create button,
        .cit-collection-add-done {
          border: 0;
          border-radius: 10px;
          padding: 10px 13px;
          background: #123b2d;
          color: #fff;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        .cit-collection-add-create button:disabled {
          opacity: .55;
          cursor: default;
        }

        .cit-collection-add-error {
          margin-bottom: 10px;
          padding: 9px 10px;
          border: 1px solid #efcccc;
          border-radius: 9px;
          background: #fff4f4;
          color: #8b3035;
          font-size: 12px;
        }

        .cit-collection-add-muted {
          padding: 12px 2px;
          color: #718078;
          font-size: 13px;
          line-height: 1.45;
        }

        .cit-collection-add-footer {
          display: flex;
          justify-content: flex-end;
          padding: 0 18px 18px;
        }

        @media (max-width: 640px) {
          .cit-collection-add-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .cit-collection-add-modal {
            width: 100%;
            max-height: 88vh;
            border-radius: 20px 20px 0 0;
            padding-bottom: env(safe-area-inset-bottom);
          }

          .cit-collection-add-create form {
            grid-template-columns: 1fr;
          }

          .cit-collection-add-create button {
            width: 100%;
          }
        }
      `}</style>

      <div className="cit-collection-add-modal">
        <div className="cit-collection-add-header">
          <div>
            <h2>Add to collection</h2>
            <p>Choose one or more collections for this film.</p>
          </div>

          <button
            type="button"
            className="cit-collection-add-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="cit-collection-add-film">
          {film.poster_path ? (
            <img
              src={`${TMDB_IMG}/w185${film.poster_path}`}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <div className="cit-collection-add-poster-empty">🎬</div>
          )}

          <div>
            <strong>{film.title}</strong>
            {film.release_year ? <span>{film.release_year}</span> : null}
          </div>
        </div>

        <div className="cit-collection-add-body">
          {error && <div className="cit-collection-add-error">{error}</div>}

          {loading ? (
            <div className="cit-collection-add-muted">
              Loading your collections…
            </div>
          ) : collections.length ? (
            <div className="cit-collection-add-list">
              {collections.map((collection) => {
                const selected = memberIds.has(collection.id);
                const busy = busyId === collection.id;

                return (
                  <button
                    type="button"
                    key={collection.id}
                    className={`cit-collection-add-row ${
                      selected ? "is-selected" : ""
                    }`}
                    onClick={() => toggleCollection(collection)}
                    disabled={!!busyId || creating}
                  >
                    <span>
                      <strong>{collection.name}</strong>
                      <small>
                        {Number(collection.item_count || 0)}{" "}
                        {Number(collection.item_count || 0) === 1
                          ? "film"
                          : "films"}
                        {busy ? " · Saving…" : ""}
                      </small>
                    </span>

                    <span className="cit-collection-add-check">
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="cit-collection-add-muted">
              You don't have any collections yet. Create one below and this
              film will be added to it automatically.
            </div>
          )}

          <div className="cit-collection-add-create">
            <div className="cit-collection-add-create-title">
              ＋ Create a new collection
            </div>

            <form onSubmit={createAndAdd}>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={80}
                placeholder="e.g. Christmas Eve"
              />
              <button
                type="submit"
                disabled={creating || !!busyId || !newName.trim()}
              >
                {creating ? "Creating…" : "Create & add"}
              </button>
            </form>
          </div>
        </div>

        <div className="cit-collection-add-footer">
          <button
            type="button"
            className="cit-collection-add-done"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
