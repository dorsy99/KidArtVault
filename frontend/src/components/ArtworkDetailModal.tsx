import React, { useEffect, useState } from 'react';
import { Download, Heart, MapPin, Share2, Trash2, X, Edit3 } from 'lucide-react';
import { api } from '../api/client';
import type { Artwork, Kid } from '../types';
import { formatAgeAtDate } from '../utils/age';
import { ShareModal } from './ShareModal';
import { TagLocationPicker } from './TagLocationPicker';
import { KidRadioSelector } from './KidRadioSelector';

interface ArtworkDetailModalProps {
  artwork: Artwork;
  kids: Kid[];
  imageUrl: string;
  readOnly?: boolean;
  onClose: () => void;
  onUpdated?: (artwork: Artwork) => void;
  onDeleted?: (id: string) => void;
}

export const ArtworkDetailModal: React.FC<ArtworkDetailModalProps> = ({
  artwork,
  kids,
  imageUrl,
  readOnly = false,
  onClose,
  onUpdated,
  onDeleted,
}) => {
  const [editing, setEditing] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [saving, setSaving] = useState(false);

  const [kidId, setKidId] = useState(artwork.kid_id);
  const [title, setTitle] = useState(artwork.title);
  const [location, setLocation] = useState(artwork.location || '');
  const [artworkDate, setArtworkDate] = useState(artwork.artwork_date);
  const [tags, setTags] = useState<string[]>(artwork.tags);
  const [notes, setNotes] = useState(artwork.notes);
  const [suggestedLocations, setSuggestedLocations] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  useEffect(() => {
    if (!readOnly && editing) {
      Promise.all([
        api.options.get().catch(() => ({ locations: [], tags: [] })),
        api.artworks.facets().catch(() => ({ locations: [], tags: [] })),
      ]).then(([opts, facets]) => {
        setSuggestedLocations(Array.from(new Set([...opts.locations, ...facets.locations])));
        setSuggestedTags(Array.from(new Set([...opts.tags, ...facets.tags])));
      });
    }
  }, [readOnly, editing]);

  const age = formatAgeAtDate(artwork.kid_birthdate, artwork.artwork_date);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.artworks.update(artwork.id, {
        kid_id: kidId,
        title: title.trim(),
        location,
        artwork_date: artworkDate,
        tags,
        notes,
      });
      onUpdated?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFav = async () => {
    const updated = await api.artworks.update(artwork.id, { is_favorite: !artwork.is_favorite });
    onUpdated?.(updated);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${artwork.title}" permanently?`)) return;
    await api.artworks.remove(artwork.id);
    onDeleted?.(artwork.id);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="badge"
              style={{ background: `${artwork.kid_color}22`, color: artwork.kid_color, fontSize: '0.82rem', padding: '4px 10px' }}
            >
              {artwork.kid_name}
              {age ? ` · ${age}` : ''}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{artwork.artwork_date}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!readOnly && (
              <>
                <button type="button" className="btn btn-ghost" onClick={handleToggleFav} title="Favorite">
                  <Heart size={18} fill={artwork.is_favorite ? '#e07a5f' : 'none'} color={artwork.is_favorite ? '#e07a5f' : 'currentColor'} />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowShare(true)} title="Share link">
                  <Share2 size={18} />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing((v) => !v)} title="Edit details">
                  <Edit3 size={18} />
                </button>
              </>
            )}
            <a
              className="btn btn-ghost"
              href={imageUrl}
              download={`${artwork.title || `${artwork.kid_name}-${artwork.artwork_date}`}.jpg`}
              title="Download original"
            >
              <Download size={18} />
            </a>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div
          style={{
            background: '#1a1b26',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            maxHeight: '62dvh',
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <img
            src={imageUrl}
            alt={artwork.title || `${artwork.kid_name}'s artwork`}
            style={{ maxWidth: '100%', maxHeight: '62dvh', objectFit: 'contain' }}
          />
        </div>

        {!editing ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {artwork.title && <h2 style={{ margin: 0 }}>{artwork.title}</h2>}
            {artwork.notes && (
              <p style={{ margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {artwork.notes}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {artwork.location && (
                <span className="pill" style={{ cursor: 'default', fontSize: '0.78rem' }}>
                  <MapPin size={12} />
                  {artwork.location}
                </span>
              )}
              {artwork.tags.map((t) => (
                <span key={t} className="pill" style={{ cursor: 'default', fontSize: '0.78rem', background: 'var(--surface-alt)' }}>
                  #{t}
                </span>
              ))}
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete}>
                  <Trash2 size={16} />
                  Delete Artwork
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Artist</label>
              <KidRadioSelector kids={kids} value={kidId} onChange={setKidId} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Date</label>
              <input type="date" className="input" value={artworkDate} onChange={(e) => setArtworkDate(e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
                Title (optional)
              </label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <TagLocationPicker
              location={location}
              onLocationChange={setLocation}
              tags={tags}
              onTagsChange={setTags}
              suggestedLocations={suggestedLocations}
              suggestedTags={suggestedTags}
            />

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Story / Memory</label>
              <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {showShare && (
          <ShareModal
            artworkId={artwork.id}
            defaultLabel={artwork.title}
            onClose={() => setShowShare(false)}
          />
        )}
      </div>
    </div>
  );
};
