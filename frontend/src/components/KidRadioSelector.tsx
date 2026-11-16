import React from 'react';
import type { Kid } from '../types';

interface KidRadioSelectorProps {
  kids: Kid[];
  value: number;
  onChange: (kidId: number) => void;
}

export const KidRadioSelector: React.FC<KidRadioSelectorProps> = ({ kids, value, onChange }) => {
  if (kids.length === 0) {
    return (
      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        No kids added yet — add a child in the Kids tab first.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-label="Artist">
      {kids.map((k) => {
        const selected = k.id === value;
        return (
          <label
            key={k.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 999,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              border: `2px solid ${k.color}`,
              background: selected ? k.color : `${k.color}1a`,
              color: selected ? '#ffffff' : 'var(--text)',
              boxShadow: selected ? `0 2px 10px ${k.color}55` : 'none',
              transition: 'background 0.15s, color 0.15s, transform 0.1s',
            }}
          >
            <input
              type="radio"
              name="artist"
              value={k.id}
              checked={selected}
              onChange={() => onChange(k.id)}
              style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
            />
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: selected ? '#ffffff' : k.color,
                display: 'inline-block',
              }}
            />
            {k.name}
          </label>
        );
      })}
    </div>
  );
};
