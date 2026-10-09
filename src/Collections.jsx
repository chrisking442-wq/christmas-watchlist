import React, { useEffect, useMemo, useState } from "react";
import FilmDetailsModal from "./FilmDetailsModal";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export default function Collections({ supabase, session }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [notice, setNotice] = useState("");
  const [detailFilm, setDetailFilm] = useState(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareSaving, setShareSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareRevoking, setShareRevoking] = useState(false);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function loadCollections() {
    if (!supabase || !session?.user) {
      setCollections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("v2_get_custom_collections");

    if (error) {
      console.error(error);
      setError(error.message);
      setCollections([]);
    } else {
      setCollections(data || []);

      if (selected) {
        const refreshed = (data || []).find((x) => x.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    }

    setLoading(false);
  }

  async function loadItems(collection) {
    if (!collection?.id) return;

    setSelected(collection);
    setShareOpen(false);
    setShareUrl("");
    setShareCopied(false);
    setShareError("");
    setItemsLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("v2_list_items")
      .select(`
        film_id,
        v2_films!inner(
          id,
          tmdb_id,
          title,
          original_title,
          release_date,
          release_year,
          overview,
          poster_path,
          backdrop_path
        )
      `)
      .eq("list_id", collection.id);

    if (error) {
      console.error(error);
      setError(error.message);
      setItems([]);
    } else {
      const rows = (data || [])
        .map((row) => ({
          film_id: row.film_id,
          ...row.v2_films,
        }))
        .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

      setItems(rows);
    }

    setItemsLoading(false);
  }

  async function createCollection(e) {
    e?.preventDefault();

    const name = newName.trim();
    if (!name) return;

    setSaving(true);
    setError("");

    const { data, error } = await supabase.rpc(
      "v2_create_custom_collection",
      { p_name: name }
    );

    if (error) {
      console.error(error);
      setError(error.message);
      setSaving(false);
      return;
    }

    setNewName("");
    setShowCreate(false);
    setSaving(false);
    setNotice("Collection created ✓");
    setTimeout(() => setNotice(""), 1800);

    await loadCollections();

    if (data) {
      const { data: all } = await supabase.rpc("v2_get_custom_collections");
      const created = (all || []).find((x) => x.id === data);
      if (created) {
        setSelected(created);
        setItems([]);
      }
    }
  }

  async function renameCollection(e) {
    e?.preventDefault();

    const name = renameValue.trim();
    if (!selected?.id || !name) return;

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc(
      "v2_rename_custom_collection",
      {
        p_list_id: selected.id,
        p_name: name,
      }
    );

    if (error) {
      console.error(error);
      setError(error.message);
      setSaving(false);
      return;
    }

    setShowRename(false);
    setSaving(false);
    setNotice("Collection renamed ✓");
    setTimeout(() => setNotice(""), 1800);

    const updated = { ...selected, name };
    setSelected(updated);
    await loadCollections();
  }

  async function deleteCollection() {
    if (!selected?.id) return;

    const ok = window.confirm(
      `Delete "${selected.name}"? The films themselves will not be deleted.`
    );

    if (!ok) return;

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc(
      "v2_delete_custom_collection",
      { p_list_id: selected.id }
    );

    if (error) {
      console.error(error);
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSelected(null);
    setItems([]);
    setNotice("Collection deleted");
    setTimeout(() => setNotice(""), 1800);
    await loadCollections();
  }

  async function removeFilm(film) {
    if (!selected?.id || !film?.film_id) return;

    const { error } = await supabase.rpc(
      "v2_remove_film_from_collection",
      {
        p_list_id: selected.id,
        p_film_id: film.film_id,
      }
    );

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    setItems((prev) => prev.filter((x) => x.film_id !== film.film_id));

    setCollections((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, item_count: Math.max(0, Number(c.item_count || 0) - 1) }
          : c
      )
    );

    setSelected((prev) =>
      prev
        ? { ...prev, item_count: Math.max(0, Number(prev.item_count || 0) - 1) }
        : prev
    );
  }

  async function openSharePanel() {
    if (!selected?.id || !supabase) return;

    setShareOpen(true);
    setShareError("");
    setShareCopied(false);

    if (shareUrl) return;

    setShareSaving(true);

    const { data, error: shareRpcError } = await supabase.rpc(
      "v2_create_or_get_list_share",
      { p_list_id: selected.id }
    );

    setShareSaving(false);

    if (shareRpcError) {
      console.error("Couldn't create collection share link:", shareRpcError);
      setShareError(
        shareRpcError.message || "Couldn't create a share link."
      );
      return;
    }

    if (!data) {
      setShareError("Couldn't create a share link.");
      return;
    }

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("share", data);

    setShareUrl(url.toString());
  }

  async function copyShareLink() {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  }

  async function nativeShareCollection() {
    if (!shareUrl || typeof navigator.share !== "function") return;

    try {
      await navigator.share({
        title: selected?.name || "Christmas collection",
        text: `Here's my ${
          selected?.name || "Christmas collection"
        } on Check It Twice.`,
        url: shareUrl,
      });
    } catch (shareNativeError) {
      if (shareNativeError?.name !== "AbortError") {
        console.warn("Native sharing wasn't available:", shareNativeError);
      }
    }
  }

  async function stopSharingCollection() {
    if (!selected?.id || !supabase || shareRevoking) return;

    const confirmed = window.confirm(
      "Stop sharing this collection? Anyone using the current public link will no longer be able to open it."
    );

    if (!confirmed) return;

    setShareRevoking(true);
    setShareError("");

    const { error: disableError } = await supabase.rpc(
      "v2_disable_list_share",
      { p_list_id: selected.id }
    );

    setShareRevoking(false);

    if (disableError) {
      console.error("Couldn't stop sharing collection:", disableError);
      setShareError(
        disableError.message || "Couldn't stop sharing this collection."
      );
      return;
    }

    setShareUrl("");
    setShareCopied(false);
    setShareOpen(false);
  }

  const selectedCount = useMemo(
    () => Number(selected?.item_count || items.length || 0),
    [selected, items.length]
  );

  if (!session?.user) {
    return (
      <div className="cit-collections-page">
        <style>{styles}</style>
        <section className="cit-collections-empty">
          <div className="cit-collections-icon">🎬</div>
          <h2>Collections</h2>
          <p>Sign in to create your own Christmas film collections.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="cit-collections-page">
      <style>{styles}</style>

      {notice && <div className="cit-collections-toast">{notice}</div>}

      {!selected ? (
        <>
          <section className="cit-collections-hero">
            <div>
              <div className="cit-collections-eyebrow">YOUR LIBRARY</div>
              <h1>Collections</h1>
              <p>
                Build your own Christmas film lists — family nights, festive
                rom-coms, Christmas Eve picks, favourites from the 90s, or
                anything else you like.
              </p>
            </div>

            <button
              className="cit-collections-primary"
              onClick={() => setShowCreate(true)}
            >
              ＋ New collection
            </button>
          </section>

          {error && <div className="cit-collections-error">{error}</div>}

          {loading ? (
            <div className="cit-collections-loading">Loading collections…</div>
          ) : collections.length === 0 ? (
            <section className="cit-collections-empty">
              <div className="cit-collections-icon">🎞️</div>
              <h2>Your collections will appear here</h2>
              <p>
                Create one for Christmas Eve, family films, festive rom-coms,
                classics — whatever works for you.
              </p>
              <button
                className="cit-collections-primary"
                onClick={() => setShowCreate(true)}
              >
                Create your first collection
              </button>
            </section>
          ) : (
            <div className="cit-collections-grid">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  className="cit-collection-card"
                  onClick={() => loadItems(collection)}
                >
                  <div className="cit-collection-card-art">
                    <span>🎬</span>
                  </div>
                  <div className="cit-collection-card-copy">
                    <strong>{collection.name}</strong>
                    <span>
                      {Number(collection.item_count || 0)}{" "}
                      {Number(collection.item_count || 0) === 1
                        ? "film"
                        : "films"}
                    </span>
                  </div>
                  <div className="cit-collection-arrow">›</div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="cit-collection-toolbar">
            <button
              className="cit-collections-back"
              onClick={() => {
                setSelected(null);
                setItems([]);
              }}
            >
              ← Collections
            </button>

            <div className="cit-collection-actions">
              <button
                className="cit-collections-share"
                onClick={openSharePanel}
              >
                ↗ Share
              </button>
              <button
                onClick={() => {
                  setRenameValue(selected.name || "");
                  setShowRename(true);
                }}
              >
                Rename
              </button>
              <button
                className="cit-collections-danger"
                onClick={deleteCollection}
                disabled={saving}
              >
                Delete
              </button>
            </div>
          </div>

          <section className="cit-collection-heading">
            <div>
              <div className="cit-collections-eyebrow">COLLECTION</div>
              <h1>{selected.name}</h1>
              <p>
                {selectedCount} {selectedCount === 1 ? "film" : "films"}
              </p>
            </div>
          </section>

          {error && <div className="cit-collections-error">{error}</div>}

          {itemsLoading ? (
            <div className="cit-collections-loading">Loading films…</div>
          ) : items.length === 0 ? (
            <section className="cit-collections-empty cit-collections-empty--compact">
              <div className="cit-collections-icon">🍿</div>
              <h2>No films in this collection yet</h2>
              <p>
                Next we’ll add an “Add to collection” action to film details
                and search.
              </p>
            </section>
          ) : (
            <div className="cit-collection-films">
              {items.map((film) => (
                <article
                  key={film.film_id}
                  className="cit-collection-film"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open details for ${film.title}`}
                  onClick={() => setDetailFilm(film)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailFilm(film);
                    }
                  }}
                >
                  <div className="cit-collection-poster">
                    {film.poster_path ? (
                      <img
                        src={`${TMDB_IMG}/w342${film.poster_path}`}
                        alt={film.title || ""}
                      />
                    ) : (
                      <div className="cit-collection-poster-empty">🎬</div>
                    )}
                  </div>

                  <div className="cit-collection-film-copy">
                    <strong>{film.title}</strong>
                    {film.release_year ? <span>{film.release_year}</span> : null}
                  </div>

                  <button
                    className="cit-collection-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFilm(film);
                    }}
                    title="Remove from collection"
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {shareOpen && selected && (
        <div
          className="cit-collections-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShareOpen(false);
            }
          }}
        >
          <div
            className="cit-collections-modal cit-collections-share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cit-collection-share-title"
          >
            <div className="cit-collections-modal-top">
              <div>
                <div className="cit-collections-eyebrow">SHARE COLLECTION</div>
                <h2 id="cit-collection-share-title">{selected.name}</h2>
              </div>
              <button
                type="button"
                className="cit-collections-close"
                onClick={() => setShareOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="cit-collections-share-copy">
              Anyone with this link can view the collection. They don't need
              a Check It Twice account, and the shared page is read-only.
            </p>

            {shareSaving ? (
              <p className="cit-collections-share-copy">
                Creating your share link…
              </p>
            ) : shareError ? (
              <div className="cit-collections-error">{shareError}</div>
            ) : shareUrl ? (
              <>
                <input
                  className="cit-collections-share-link"
                  value={shareUrl}
                  readOnly
                  aria-label="Public collection share link"
                  onFocus={(event) => event.target.select()}
                />

                <div className="cit-collections-share-actions">
                  <button
                    type="button"
                    className="cit-collections-primary"
                    onClick={copyShareLink}
                  >
                    {shareCopied ? "✓ Copied" : "Copy link"}
                  </button>

                  {typeof navigator.share === "function" && (
                    <button
                      type="button"
                      onClick={nativeShareCollection}
                    >
                      Share…
                    </button>
                  )}

                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>

                  <button
                    type="button"
                    className="cit-collections-stop-share"
                    onClick={stopSharingCollection}
                    disabled={shareRevoking}
                  >
                    {shareRevoking ? "Stopping…" : "Stop sharing"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {detailFilm && (
        <FilmDetailsModal
          film={detailFilm}
          supabase={supabase}
          session={session}
          onClose={() => setDetailFilm(null)}
        />
      )}

      {showCreate && (
        <div
          className="cit-collections-modal-backdrop"
          onClick={() => {
            if (!saving) setShowCreate(false);
          }}
        >
          <form
            className="cit-collections-modal"
            onSubmit={createCollection}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cit-collections-modal-top">
              <div>
                <div className="cit-collections-eyebrow">NEW COLLECTION</div>
                <h2>Create collection</h2>
              </div>
              <button
                type="button"
                className="cit-collections-close"
                onClick={() => setShowCreate(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <label>
              Collection name
              <input
                autoFocus
                maxLength={80}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Christmas Eve"
              />
            </label>

            <button
              className="cit-collections-primary cit-collections-primary--wide"
              type="submit"
              disabled={saving || !newName.trim()}
            >
              {saving ? "Creating…" : "Create collection"}
            </button>
          </form>
        </div>
      )}

      {showRename && selected && (
        <div
          className="cit-collections-modal-backdrop"
          onClick={() => {
            if (!saving) setShowRename(false);
          }}
        >
          <form
            className="cit-collections-modal"
            onSubmit={renameCollection}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cit-collections-modal-top">
              <div>
                <div className="cit-collections-eyebrow">COLLECTION</div>
                <h2>Rename collection</h2>
              </div>
              <button
                type="button"
                className="cit-collections-close"
                onClick={() => setShowRename(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <label>
              Collection name
              <input
                autoFocus
                maxLength={80}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </label>

            <button
              className="cit-collections-primary cit-collections-primary--wide"
              type="submit"
              disabled={saving || !renameValue.trim()}
            >
              {saving ? "Saving…" : "Save name"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = `
  .cit-collections-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 18px 0 88px;
    color: #163b2e;
  }

  .cit-collections-hero,
  .cit-collection-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding: 24px;
    border: 1px solid #e4ded3;
    border-radius: 18px;
    background:
      linear-gradient(135deg, rgba(18,59,45,.06), rgba(145,49,55,.05)),
      #fbf9f4;
  }

  .cit-collections-hero h1,
  .cit-collection-heading h1 {
    margin: 4px 0 5px;
    font-size: clamp(28px, 4vw, 42px);
    line-height: 1;
  }

  .cit-collections-hero p,
  .cit-collection-heading p {
    max-width: 680px;
    margin: 0;
    color: #66736c;
    line-height: 1.5;
  }

  .cit-collections-eyebrow {
    color: #91404a;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .15em;
  }

  .cit-collections-primary {
    flex: 0 0 auto;
    border: 0;
    border-radius: 999px;
    padding: 11px 16px;
    background: #123b2d;
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 5px 14px rgba(18,59,45,.14);
  }

  .cit-collections-primary:disabled {
    opacity: .55;
    cursor: default;
  }

  .cit-collections-primary--wide {
    width: 100%;
    margin-top: 6px;
  }

  .cit-collections-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .cit-collection-card {
    display: grid;
    grid-template-columns: 66px 1fr 20px;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px;
    border: 1px solid #e3ddd3;
    border-radius: 15px;
    background: #fff;
    color: inherit;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 5px 16px rgba(54,43,29,.035);
  }

  .cit-collection-card:hover {
    border-color: rgba(18,59,45,.28);
    box-shadow: 0 8px 22px rgba(54,43,29,.065);
  }

  .cit-collection-card-art {
    display: grid;
    place-items: center;
    width: 66px;
    height: 66px;
    border-radius: 12px;
    background:
      linear-gradient(145deg, #123b2d 0%, #225b46 55%, #8d3037 100%);
    color: #fff;
    font-size: 25px;
  }

  .cit-collection-card-copy {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .cit-collection-card-copy strong {
    overflow: hidden;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cit-collection-card-copy span {
    color: #738078;
    font-size: 13px;
  }

  .cit-collection-arrow {
    color: #9aa39d;
    font-size: 28px;
    line-height: 1;
  }

  .cit-collections-empty {
    margin-top: 18px;
    padding: 52px 20px;
    border: 1px dashed #d7d0c5;
    border-radius: 18px;
    background: rgba(255,255,255,.58);
    text-align: center;
  }

  .cit-collections-empty--compact {
    padding: 38px 20px;
  }

  .cit-collections-empty h2 {
    margin: 6px 0;
  }

  .cit-collections-empty p {
    max-width: 560px;
    margin: 0 auto 18px;
    color: #6b766f;
    line-height: 1.5;
  }

  .cit-collections-icon {
    font-size: 32px;
  }

  .cit-collection-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .cit-collections-back,
  .cit-collection-actions button,
  .cit-collection-remove {
    border: 1px solid #ded8cf;
    border-radius: 10px;
    padding: 8px 11px;
    background: #fff;
    color: #173f31;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .cit-collection-actions {
    display: flex;
    gap: 8px;
  }

  .cit-collection-actions .cit-collections-share {
    border-color: #123b2d;
    background: #123b2d;
    color: #fff;
  }

  .cit-collection-actions .cit-collections-danger {
    border-color: #efd3d3;
    color: #8f2f35;
    background: #fffafa;
  }

  .cit-collection-films {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(185px, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .cit-collection-film {
    overflow: hidden;
    border: 1px solid #e3ddd3;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(54,43,29,.035);
    cursor: pointer;
    outline: none;
    transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
  }

  .cit-collection-film:hover {
    transform: translateY(-2px);
    border-color: rgba(18,59,45,.24);
    box-shadow: 0 10px 24px rgba(54,43,29,.08);
  }

  .cit-collection-film:focus-visible {
    border-color: #688878;
    box-shadow: 0 0 0 3px rgba(18,59,45,.12);
  }

  .cit-collection-poster {
    aspect-ratio: 2 / 3;
    background: #ebe7df;
  }

  .cit-collection-poster img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cit-collection-poster-empty {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: 32px;
  }

  .cit-collection-film-copy {
    display: grid;
    gap: 4px;
    padding: 10px 11px 8px;
  }

  .cit-collection-film-copy strong {
    line-height: 1.25;
  }

  .cit-collection-film-copy span {
    color: #7a847e;
    font-size: 12px;
  }

  .cit-collection-remove {
    margin: 0 11px 11px;
    padding: 6px 9px;
    color: #8e3439;
    font-size: 12px;
  }

  .cit-collections-error {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid #efcccc;
    border-radius: 10px;
    background: #fff4f4;
    color: #8b3035;
  }

  .cit-collections-loading {
    padding: 30px 4px;
    color: #6f7973;
  }

  .cit-collections-toast {
    position: fixed;
    right: 18px;
    bottom: 88px;
    z-index: 7000;
    padding: 10px 13px;
    border-radius: 999px;
    background: #123b2d;
    color: #fff;
    font-weight: 800;
    box-shadow: 0 8px 22px rgba(0,0,0,.16);
  }

  .cit-collections-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 6500;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(13,31,25,.48);
    backdrop-filter: blur(5px);
  }

  .cit-collections-modal {
    width: min(100%, 430px);
    padding: 18px;
    border-radius: 18px;
    background: #fbf9f4;
    box-shadow: 0 24px 70px rgba(0,0,0,.24);
  }

  .cit-collections-modal-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .cit-collections-modal h2 {
    margin: 4px 0 0;
  }

  .cit-collections-close {
    border: 0;
    background: transparent;
    color: #5d6862;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }

  .cit-collections-modal label {
    display: grid;
    gap: 7px;
    color: #415249;
    font-size: 13px;
    font-weight: 700;
  }

  .cit-collections-modal input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #d9d2c8;
    border-radius: 11px;
    padding: 11px 12px;
    background: #fff;
    color: #173f31;
    font: inherit;
    outline: none;
  }

  .cit-collections-modal input:focus {
    border-color: #758f82;
    box-shadow: 0 0 0 3px rgba(18,59,45,.06);
  }

  .cit-collections-share-modal {
    width: min(100%, 520px);
  }

  .cit-collections-share-copy {
    margin: -5px 0 16px;
    color: #66736c;
    font-size: 13px;
    line-height: 1.5;
  }

  .cit-collections-share-link {
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid #d9d2c8;
    border-radius: 10px;
    background: #fff;
    color: #344940;
    font: inherit;
    font-size: 12px;
  }

  .cit-collections-share-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .cit-collections-share-actions button,
  .cit-collections-share-actions a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid #d9d2c8;
    border-radius: 10px;
    background: #fff;
    color: #173f31;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  .cit-collections-share-actions .cit-collections-primary {
    border-color: #123b2d;
    background: #123b2d;
    color: #fff;
  }

  .cit-collections-share-actions .cit-collections-stop-share {
    border-color: #efd3d3;
    background: #fffafa;
    color: #8f2f35;
  }

  .cit-collections-share-actions .cit-collections-stop-share:disabled {
    opacity: .55;
    cursor: default;
  }

  @media (max-width: 720px) {
    .cit-collections-page {
      padding: 10px 0 86px;
    }

    .cit-collections-hero,
    .cit-collection-heading {
      align-items: flex-start;
      flex-direction: column;
      padding: 18px;
    }

    .cit-collections-primary {
      width: 100%;
    }

    .cit-collections-grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .cit-collection-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .cit-collection-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .cit-collection-films {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .cit-collections-modal-backdrop {
      align-items: end;
      padding: 0;
    }

    .cit-collections-modal {
      width: 100%;
      box-sizing: border-box;
      border-radius: 20px 20px 0 0;
      padding: 20px 16px calc(18px + env(safe-area-inset-bottom));
    }
  }
`;
