import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ArtworkCard } from '../components/ArtworkCard';
import { ArtworkDetailModal } from '../components/ArtworkDetailModal';
import type { Artwork, PublicShareData } from '../types';

export const PublicSharePage: React.FC = () => {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicShareData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Artwork | null>(null);

  useEffect(() => {
    setLoading(true);
    api.shares
      .getPublic(token)
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load shared gallery'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading shared gallery...</div>;
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
        <div className="card" style={{ padding: 28, maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Link Unavailable</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>{error || 'This share link is invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span>{data.share.label || 'Shared Art Gallery'}</span>
          </div>
          {data.share.kid_name && (
            <span className="pill" style={{ cursor: 'default' }}>
              {data.share.kid_name}
            </span>
          )}
        </div>
      </header>

      <main className="main-content">
        {data.artworks.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            No artworks in this shared collection yet.
          </div>
        ) : (
          <div className="gallery-grid">
            {data.artworks.map((art) => (
              <ArtworkCard
                key={art.id}
                artwork={art}
                thumbUrl={`/api/public/share/${token}/artworks/${art.id}/thumb`}
                onClick={() => setActive(art)}
              />
            ))}
          </div>
        )}
      </main>

      {active && (
        <ArtworkDetailModal
          artwork={active}
          kids={[]}
          imageUrl={`/api/public/share/${token}/artworks/${active.id}/image`}
          readOnly
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
};
