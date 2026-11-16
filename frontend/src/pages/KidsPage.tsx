import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Share2, Users } from 'lucide-react';
import { ShareModal } from '../components/ShareModal';
import type { Kid } from '../types';
import { formatAgeAtDate } from '../utils/age';

interface KidsPageProps {
  kids: Kid[];
  isAdmin: boolean;
}

export const KidsPage: React.FC<KidsPageProps> = ({ kids, isAdmin }) => {
  const navigate = useNavigate();
  const [shareKid, setShareKid] = useState<Kid | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 780, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Children</h1>
        {isAdmin && (
          <Link to="/options" className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '7px 12px' }}>
            Manage Children in Options
          </Link>
        )}
      </div>

      {kids.length === 0 ? (
        <div className="card" style={{ padding: 36, textAlign: 'center', display: 'grid', gap: 12, placeItems: 'center' }}>
          <Users size={38} color="var(--accent)" />
          <h3 style={{ margin: 0 }}>No children added yet</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: 400 }}>
            Add your children in Options so you can filter the gallery by artist and track their age on every artwork.
          </p>
          <Link to="/options" className="btn btn-primary">
            Add Children in Options
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {kids.map((kid) => {
            const currentAge = formatAgeAtDate(kid.birthdate, today);
            return (
              <div
                key={kid.id}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/?kid=${kid.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/?kid=${kid.id}`);
                  }
                }}
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  cursor: 'pointer',
                  borderLeft: `6px solid ${kid.color}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: kid.color,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                    }}
                  >
                    {kid.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{kid.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {kid.artwork_count} {kid.artwork_count === 1 ? 'artwork' : 'artworks'}
                      {currentAge ? ` · ${currentAge} old` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '7px 12px', fontSize: '0.84rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareKid(kid);
                      }}
                    >
                      <Share2 size={14} />
                      Share Gallery
                    </button>
                  )}
                  <ChevronRight size={20} color="var(--text-muted)" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shareKid && (
        <ShareModal
          kidId={shareKid.id}
          defaultLabel={`${shareKid.name}'s Art Gallery`}
          onClose={() => setShareKid(null)}
        />
      )}
    </div>
  );
};
