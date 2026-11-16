import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Share2, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { ShareModal } from '../components/ShareModal';
import type { ShareLink, User } from '../types';

interface SettingsPageProps {
  user: User;
  onUserChanged: (user: User) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, onUserChanged }) => {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [showNewShare, setShowNewShare] = useState(false);

  // 2FA setup state
  const [setup2fa, setSetup2fa] = useState<{ secret: string; qr_data_uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [twoFaMsg, setTwoFaMsg] = useState('');
  const [twoFaErr, setTwoFaErr] = useState('');

  // Password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const loadShares = async () => {
    const list = await api.shares.list();
    setShares(list);
  };

  useEffect(() => {
    loadShares();
  }, []);

  const handleStart2fa = async () => {
    setTwoFaErr('');
    setTwoFaMsg('');
    const data = await api.auth.begin2faSetup();
    setSetup2fa({ secret: data.secret, qr_data_uri: data.qr_data_uri });
  };

  const handleEnable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup2fa) return;
    setTwoFaErr('');
    try {
      await api.auth.enable2fa(setup2fa.secret, totpCode.trim());
      onUserChanged({ ...user, totp_enabled: true });
      setSetup2fa(null);
      setTotpCode('');
      setTwoFaMsg('Two-factor authentication is now enabled.');
    } catch (err) {
      setTwoFaErr(err instanceof Error ? err.message : 'Failed to enable 2FA');
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaErr('');
    try {
      await api.auth.disable2fa(disablePw, disableCode.trim());
      onUserChanged({ ...user, totp_enabled: false });
      setDisablePw('');
      setDisableCode('');
      setTwoFaMsg('Two-factor authentication disabled.');
    } catch (err) {
      setTwoFaErr(err instanceof Error ? err.message : 'Failed to disable 2FA');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr('');
    setPwMsg('');
    try {
      await api.auth.changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setPwMsg('Password updated successfully.');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Failed to update password');
    }
  };

  const handleRevoke = async (token: string) => {
    await api.shares.revoke(token);
    setShares((prev) => prev.filter((s) => s.token !== token));
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 780 }}>
      {/* 2FA Section */}
      <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={20} color={user.totp_enabled ? 'var(--sage)' : 'var(--text-muted)'} />
            Two-Factor Authentication (TOTP)
          </h2>
          <span
            className="badge"
            style={{
              background: user.totp_enabled ? '#eaf6ef' : 'var(--surface-alt)',
              color: user.totp_enabled ? '#1c6b3a' : 'var(--text-muted)',
              padding: '4px 10px',
            }}
          >
            {user.totp_enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Recommended before exposing KidArtVault externally via Synology Reverse Proxy or Cloudflare Tunnel.
        </p>

        {twoFaMsg && <div className="success-banner">{twoFaMsg}</div>}
        {twoFaErr && <div className="error-banner">{twoFaErr}</div>}

        {!user.totp_enabled && !setup2fa && (
          <div>
            <button type="button" className="btn btn-primary" onClick={handleStart2fa}>
              Set Up Authenticator App
            </button>
          </div>
        )}

        {!user.totp_enabled && setup2fa && (
          <form onSubmit={handleEnable2fa} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <img
                src={setup2fa.qr_data_uri}
                alt="TOTP QR Code"
                style={{ width: 164, height: 164, borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: '0.9rem' }}>
                  1. Scan this QR code with Google Authenticator, Bitwarden, 1Password, or Aegis.
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Manual key: <code>{setup2fa.secret}</code>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                    2. Enter 6-digit verification code
                  </label>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="123456"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">
                Verify &amp; Enable 2FA
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setSetup2fa(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {user.totp_enabled && (
          <form onSubmit={handleDisable2fa} style={{ display: 'grid', gap: 10, maxWidth: 380 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              To disable 2FA, confirm your password and current authenticator code:
            </div>
            <input
              type="password"
              className="input"
              placeholder="Current password"
              value={disablePw}
              onChange={(e) => setDisablePw(e.target.value)}
              required
            />
            <input
              className="input"
              inputMode="numeric"
              placeholder="6-digit authenticator code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              required
            />
            <div>
              <button type="submit" className="btn btn-secondary">
                <ShieldOff size={15} />
                Disable 2FA
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Family Share Links */}
      <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={20} />
            Read-Only Family Share Links
          </h2>
          <button type="button" className="btn btn-primary" onClick={() => setShowNewShare(true)}>
            Create Gallery Link
          </button>
        </div>

        {shares.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No active share links. Create one to share artworks with grandparents without giving them an account.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {shares.map((s) => {
              const url = `${window.location.origin}/s/${s.token}`;
              return (
                <div
                  key={s.token}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.label || 'Family Share'}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Scope: {s.artwork_title ? `Artwork "${s.artwork_title}"` : s.kid_name ? `${s.kid_name}'s Gallery` : 'Full Gallery'}
                      {s.expires_at ? ` · Expires ${s.expires_at.slice(0, 10)}` : ' · No expiration'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigator.clipboard.writeText(url)}
                      style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                    >
                      <Copy size={14} />
                      Copy URL
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: 'var(--danger)', padding: '6px 10px' }}
                      onClick={() => handleRevoke(s.token)}
                      title="Revoke link"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Change Password */}
      <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={20} />
          Change Password
        </h2>
        {pwMsg && <div className="success-banner">{pwMsg}</div>}
        {pwErr && <div className="error-banner">{pwErr}</div>}
        <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 10, maxWidth: 380 }}>
          <input
            type="password"
            className="input"
            placeholder="Current password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
          />
          <input
            type="password"
            className="input"
            placeholder="New password (min 8 chars)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            minLength={8}
            required
          />
          <div>
            <button type="submit" className="btn btn-secondary">
              Update Password
            </button>
          </div>
        </form>
      </section>

      {showNewShare && (
        <ShareModal
          defaultLabel="Family Gallery"
          onClose={() => setShowNewShare(false)}
          onCreated={(share) => setShares((prev) => [share, ...prev])}
        />
      )}
    </div>
  );
};
