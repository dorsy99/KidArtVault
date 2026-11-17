import React from 'react';
import { Heart, MapPin } from 'lucide-react';
import type { Artwork } from '../types';
import { formatAgeAtDate } from '../utils/age';

interface ArtworkCardProps {
  artwork: Artwork;
  thumbUrl: string;
  onClick: () => void;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export const ArtworkCard: React.FC<ArtworkCardProps> = ({
  artwork,
  thumbUrl,
  onClick,
  onToggleFavorite,
}) => {
  const age = formatAgeAtDate(artwork.kid_birthdate, artwork.artwork_date);

  return (
    <article
      className="card"
      onClick={onClick}
      style={{
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.15s',
      }}
    >
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          background: 'var(--surface-alt)',
          overflow: 'hidden',
        }}
      >
        <img
          src={thumbUrl}
          alt={artwork.title || `${artwork.kid_name}'s artwork`}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {onToggleFavorite && (
          <button
            type="button"
            aria-label={artwork.is_favorite ? 'Remove favorite' : 'Favorite'}
            onClick={onToggleFavorite}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.9)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Heart
              size={16}
              fill={artwork.is_favorite ? '#e07a5f' : 'none'}
              color={artwork.is_favorite ? '#e07a5f' : '#6c6f82'}
            />
          </button>
        )}
      </div>

      <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
        {artwork.title && (
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {artwork.title}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
          <span
            className="badge"
            style={{
              background: `${artwork.kid_color}22`,
              color: artwork.kid_color,
            }}
          >
            {artwork.kid_name}
            {age ? ` · ${age}` : ''}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {artwork.location && (
              <>
                <MapPin size={12} />
                {artwork.location} ·{' '}
              </>
            )}
            {artwork.artwork_date}
          </span>
        </div>
      </div>
    </article>
  );
};
