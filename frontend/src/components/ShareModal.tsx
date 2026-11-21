import React, { useState } from 'react';
import { Copy, Check, Share2, X } from 'lucide-react';
import { api } from '../api/client';
import type { ShareLink } from '../types';

interface ShareModalProps {
  kidId?: number | null;
  artworkId?: string | null;
  defaultLabel?: string;
  onClose: () => void;
  onCreated?: (share: ShareLink) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  kidId = null,
  artworkId = null,
  defaultLabel = '',
  onClose,
  onCreated,
}) => {
  const [label, setLabel] = useState(defaultLabel);
  const [expiresDays, setExpiresDays] = useState<string>('30');
  const [creating, setCreating] = useState(false);
  const [createdShare, setCreatedShare] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const share = await api.shares.create({
        label: label.trim() || 'Family Share',
        kid_id: kidId,
        artwork_id: artworkId,
        expires_days: expiresDays ? Number(expiresDays) : null,
      });
      setCreatedShare(share);
      onCreated?.(share);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  };

  const shareUrl = createdShare ? `${window.location.origin}/s/${createdShare.token}` : '';

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={18} />
            Create Read-Only Family Link
          </h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        {!createdShare ? (
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Who is this link for?
              </label>
              <input
                className="input"
                placeholder="e.g. Grandma & Grandpa"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Link Expiration
              </label>
              <select className="select" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="">Never expires (until revoked)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Link'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="success-banner">
              Anyone with this link can view {artworkId ? 'this artwork' : kidId ? 'this child’s gallery' : 'the gallery'} in read-only mode. You can manage or revoke it anytime in Options → Shares.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-primary" onClick={copyLink}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
