import React, { useMemo, useState } from 'react';
import { MapPin, Plus, Tag } from 'lucide-react';

interface TagLocationPickerProps {
  location: string;
  onLocationChange: (loc: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestedLocations?: string[];
  suggestedTags?: string[];
}

function mergeUnique(defaults: string[], extras: string[], selected: string[]): string[] {
  const map = new Map<string, string>();
  for (const item of [...defaults, ...extras, ...selected]) {
    const clean = item.trim();
    if (clean && !map.has(clean.toLowerCase())) {
      map.set(clean.toLowerCase(), clean);
    }
  }
  return Array.from(map.values());
}

export const TagLocationPicker: React.FC<TagLocationPickerProps> = ({
  location,
  onLocationChange,
  tags,
  onTagsChange,
  suggestedLocations = [],
  suggestedTags = [],
}) => {
  const [customLocation, setCustomLocation] = useState('');
  const [newTag, setNewTag] = useState('');

  const allLocations = useMemo(
    () => mergeUnique(suggestedLocations, [], location ? [location] : []),
    [suggestedLocations, location],
  );

  const allTags = useMemo(
    () => mergeUnique(suggestedTags, [], tags),
    [suggestedTags, tags],
  );

  const toggleTag = (tag: string) => {
    const exists = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    if (exists) {
      onTagsChange(tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    } else {
      onTagsChange([...tags, tag]);
    }
  };

  const handleAddTag = () => {
    const clean = newTag.trim();
    if (!clean) return;
    if (!tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      onTagsChange([...tags, clean]);
    }
    setNewTag('');
  };

  const handleAddCustomLocation = () => {
    const clean = customLocation.trim();
    if (!clean) return;
    onLocationChange(clean);
    setCustomLocation('');
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Location Picker */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
          <MapPin size={14} color="var(--accent)" />
          Where was it made?
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {allLocations.map((loc) => {
            const active = location.toLowerCase() === loc.toLowerCase();
            return (
              <button
                key={loc}
                type="button"
                className={`pill ${active ? 'active' : ''}`}
                style={{ padding: '5px 11px', fontSize: '0.82rem' }}
                onClick={() => onLocationChange(active ? '' : loc)}
              >
                {loc}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            placeholder="Or type another location (e.g. Art Class)..."
            value={customLocation}
            onChange={(e) => setCustomLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomLocation();
              }
            }}
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
          />
          {customLocation.trim() && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={handleAddCustomLocation}
            >
              Set
            </button>
          )}
        </div>
      </div>

      {/* Tag Picker */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
          <Tag size={14} color="var(--sage)" />
          Tags (tap to select)
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {allTags.map((tag) => {
            const active = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
            return (
              <button
                key={tag}
                type="button"
                className={`pill ${active ? 'active' : ''}`}
                style={{
                  padding: '5px 11px',
                  fontSize: '0.82rem',
                  background: active ? 'var(--sage)' : undefined,
                  borderColor: active ? 'var(--sage)' : undefined,
                }}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            placeholder="Add custom tag..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
            onClick={handleAddTag}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
};
