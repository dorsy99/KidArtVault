import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, Heart, Search, Users, X } from 'lucide-react';
import { api } from '../api/client';
import { ArtworkCard } from '../components/ArtworkCard';
import { ArtworkDetailModal } from '../components/ArtworkDetailModal';
import type { Artwork, Kid } from '../types';

const PAGE_SIZE = 30;

interface GalleryPageProps {
  kids: Kid[];
  canEdit: boolean;
  refreshKey: number;
  onOpenUpload: () => void;
}

export const GalleryPage: React.FC<GalleryPageProps> = ({ kids, canEdit, refreshKey, onOpenUpload }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialKid = searchParams.get('kid');
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedKidId, setSelectedKidId] = useState<number | null>(
    initialKid && !Number.isNaN(Number(initialKid)) ? Number(initialKid) : null,
  );
  const [locationFilter, setLocationFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [activeArtwork, setActiveArtwork] = useState<Artwork | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const buildParams = useCallback(
    (offset: number) => ({
      kid_id: selectedKidId,
      location: locationFilter || undefined,
      tag: tagFilter || undefined,
      favorite: favoritesOnly || undefined,
      q: search.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort,
      limit: PAGE_SIZE,
      offset,
    }),
    [selectedKidId, locationFilter, tagFilter, favoritesOnly, search, dateFrom, dateTo, sort],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [res, facets] = await Promise.all([
        api.artworks.list(buildParams(0)),
        api.artworks.facets(),
      ]);
      setArtworks(res.items);
      setTotal(res.total);
      setAvailableLocations(facets.locations);
      setAvailableTags(facets.tags);
    } finally {
      setLoading(false);
    }
  }, [buildParams, refreshKey]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || artworks.length >= total) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await api.artworks.list(buildParams(artworks.length));
      setArtworks((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const next = res.items.filter((a) => !seen.has(a.id));
        return [...prev, ...next];
      });
      setTotal(res.total);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [artworks.length, total, buildParams]);

  useEffect(() => {
    const param = searchParams.get('kid');
    const parsed = param && !Number.isNaN(Number(param)) ? Number(param) : null;
    setSelectedKidId(parsed);
  }, [searchParams]);

  const selectKid = (id: number | null) => {
    setSelectedKidId(id);
    const next = new URLSearchParams(searchParams);
    if (id == null) next.delete('kid');
    else next.set('kid', String(id));
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || artworks.length >= total || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '260px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [artworks.length, total, loading, loadMore]);

  const handleToggleFavorite = async (e: React.MouseEvent, art: Artwork) => {
    e.stopPropagation();
    const updated = await api.artworks.update(art.id, { is_favorite: !art.is_favorite });
    setArtworks((prev) => prev.map((a) => (a.id === art.id ? updated : a)));
  };

  const hasFilters = Boolean(
    selectedKidId || locationFilter || tagFilter || favoritesOnly || search || dateFrom || dateTo,
  );

  const clearFilters = () => {
    selectKid(null);
    setLocationFilter('');
    setTagFilter('');
    setFavoritesOnly(false);
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Kid pills */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        <button
          type="button"
          className={`pill ${selectedKidId === null ? 'active' : ''}`}
          onClick={() => selectKid(null)}
        >
          All Kids
        </button>
        {kids.map((kid) => (
          <button
            key={kid.id}
            type="button"
            className={`pill ${selectedKidId === kid.id ? 'active' : ''}`}
            onClick={() => selectKid(kid.id)}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: kid.color,
                display: 'inline-block',
              }}
            />
            {kid.name}
          </button>
        ))}
      </div>

      {/* Search, location, tag, date & sort controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: 190, flex: '1 1 200px', maxWidth: 280 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            className="input"
            placeholder="Search titles, notes, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, paddingTop: 7, paddingBottom: 7, fontSize: '0.88rem' }}
          />
        </div>

        <select
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
          aria-label="Sort by date"
          style={{ width: 'auto', paddingTop: 7, paddingBottom: 7, fontSize: '0.88rem' }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <input
            type="date"
            className="input"
            aria-label="From date"
            title="From date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ width: 'auto', paddingTop: 6, paddingBottom: 6, fontSize: '0.85rem' }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
          <input
            type="date"
            className="input"
            aria-label="To date"
            title="To date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ width: 'auto', paddingTop: 6, paddingBottom: 6, fontSize: '0.85rem' }}
          />
        </div>

        {availableLocations.length > 0 && (
          <select
            className="select"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            style={{ width: 'auto', paddingTop: 7, paddingBottom: 7, fontSize: '0.88rem' }}
          >
            <option value="">All locations</option>
            {availableLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        )}

        {availableTags.length > 0 && (
          <select
            className="select"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={{ width: 'auto', paddingTop: 7, paddingBottom: 7, fontSize: '0.88rem' }}
          >
            <option value="">All tags</option>
            {availableTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          className={`pill ${favoritesOnly ? 'active' : ''}`}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          <Heart size={14} fill={favoritesOnly ? '#fff' : 'none'} />
          Favorites
        </button>

        {hasFilters && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters} style={{ padding: '6px 10px', fontSize: '0.84rem' }}>
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      {kids.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center', display: 'grid', gap: 12, placeItems: 'center' }}>
          <Users size={38} color="var(--accent)" />
          <h2 style={{ margin: 0 }}>Welcome to KidArtVault</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: 420 }}>
            Start by adding a profile for each of your children so their artworks and ages are tracked automatically.
          </p>
          <Link to="/options" className="btn btn-primary">
            Add Your First Child in Options
          </Link>
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading artworks...</div>
      ) : artworks.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center', display: 'grid', gap: 12, placeItems: 'center' }}>
          <Camera size={38} color="var(--accent)" />
          <h3 style={{ margin: 0 }}>No artworks found</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            {hasFilters
              ? 'Try clearing your filters or search query.'
              : 'Tap Capture Art to photograph your first A4 drawing or painting!'}
          </p>
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={onOpenUpload}>
              <Camera size={16} />
              Capture Artwork
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Showing {artworks.length} of {total} artworks
          </div>
          <div className="gallery-grid">
            {artworks.map((art) => (
              <ArtworkCard
                key={art.id}
                artwork={art}
                thumbUrl={`/api/artworks/${art.id}/thumb`}
                onClick={() => setActiveArtwork(art)}
                onToggleFavorite={canEdit ? (e) => handleToggleFavorite(e, art) : undefined}
              />
            ))}
          </div>

          {artworks.length < total && (
            <div ref={sentinelRef} style={{ padding: '16px 0', textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading more...' : `Load more (${total - artworks.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {activeArtwork && (
        <ArtworkDetailModal
          artwork={activeArtwork}
          kids={kids}
          imageUrl={`/api/artworks/${activeArtwork.id}/image`}
          readOnly={!canEdit}
          onClose={() => setActiveArtwork(null)}
          onUpdated={(updated) => {
            setArtworks((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setActiveArtwork(updated);
          }}
          onDeleted={(id) => {
            setArtworks((prev) => prev.filter((a) => a.id !== id));
            setTotal((t) => Math.max(0, t - 1));
            setActiveArtwork(null);
          }}
        />
      )}
    </div>
  );
};
