import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  KeyRound,
  MapPin,
  Plus,
  Share2,
  ShieldCheck,
  ShieldOff,
  Tag,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { ShareModal } from '../components/ShareModal';
import { KID_COLORS, type Kid, type ShareLink, type User, type UserRole } from '../types';

interface OptionsPageProps {
  user: User;
  kids: Kid[];
  onKidsChanged: () => void;
  onUserChanged: (user: User) => void;
}

type SectionTab = 'all' | 'users' | 'children' | 'locations' | 'tags' | 'shares' | 'backup' | 'security';

export const OptionsPage: React.FC<OptionsPageProps> = ({ user, kids, onKidsChanged, onUserChanged }) => {
  const isAdmin = user.role === 'admin';
  const [activeTab, setActiveTab] = useState<SectionTab>(isAdmin ? 'all' : 'security');

  // Users management state (admin only)
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('member');
  const [userSaving, setUserSaving] = useState(false);
  const [userErr, setUserErr] = useState('');

  // Children management state
  const [kidName, setKidName] = useState('');
  const [kidBirthdate, setKidBirthdate] = useState('');
  const [kidColor, setKidColor] = useState(KID_COLORS[0]);
  const [kidSaving, setKidSaving] = useState(false);
  const [kidErr, setKidErr] = useState('');
  const [editingKidId, setEditingKidId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editBirthdate, setEditBirthdate] = useState('');
  const [editColor, setEditColor] = useState(KID_COLORS[0]);

  // Locations & Tags state
  const [locations, setLocations] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [newTag, setNewTag] = useState('');
  const [optErr, setOptErr] = useState('');

  // Shares state
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [showNewShare, setShowNewShare] = useState(false);
  const [shareErr, setShareErr] = useState('');
  const [copiedShareToken, setCopiedShareToken] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isAdmin) return;
    api.users.list().then(setUsers).catch(() => {});
    api.options
      .get()
      .then((res) => {
        setLocations(res.locations);
        setTags(res.tags);
      })
      .catch(() => {});
    api.shares
      .list()
      .then(setShares)
      .catch((err) => setShareErr(err instanceof Error ? err.message : 'Failed to load share links'));
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSaving(true);
    setUserErr('');
    try {
      const created = await api.users.create({
        username: newUsername.trim(),
        password: newUserPassword,
        role: newUserRole,
      });
      setUsers((prev) => [...prev, created]);
      setNewUsername('');
      setNewUserPassword('');
      setNewUserRole('member');
    } catch (err) {
      setUserErr(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setUserSaving(false);
    }
  };

  const handleChangeUserRole = async (target: User, role: UserRole) => {
    setUserErr('');
    try {
      const updated = await api.users.update(target.id, { role });
      setUsers((prev) => prev.map((u) => (u.id === target.id ? updated : u)));
      if (target.id === user.id) onUserChanged(updated);
    } catch (err) {
      setUserErr(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleDeleteUser = async (target: User) => {
    if (!confirm(`Delete user "${target.username}"?`)) return;
    setUserErr('');
    try {
      await api.users.remove(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
    } catch (err) {
      setUserErr(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleCreateKid = async (e: React.FormEvent) => {
    e.preventDefault();
    setKidSaving(true);
    setKidErr('');
    try {
      await api.kids.create({
        name: kidName.trim(),
        birthdate: kidBirthdate || null,
        color: kidColor,
      });
      setKidName('');
      setKidBirthdate('');
      onKidsChanged();
    } catch (err) {
      setKidErr(err instanceof Error ? err.message : 'Failed to add child');
    } finally {
      setKidSaving(false);
    }
  };

  const startEditKid = (kid: Kid) => {
    setEditingKidId(kid.id);
    setEditName(kid.name);
    setEditBirthdate(kid.birthdate || '');
    setEditColor(kid.color);
    setKidErr('');
  };

  const handleSaveEditKid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingKidId == null) return;
    setKidSaving(true);
    setKidErr('');
    try {
      await api.kids.update(editingKidId, {
        name: editName.trim(),
        birthdate: editBirthdate || '',
        color: editColor,
      });
      setEditingKidId(null);
      onKidsChanged();
    } catch (err) {
      setKidErr(err instanceof Error ? err.message : 'Failed to update child');
    } finally {
      setKidSaving(false);
    }
  };

  const handleDeleteKid = async (kid: Kid) => {
    if (!confirm(`Delete ${kid.name} and all ${kid.artwork_count} of their artworks? This cannot be undone.`)) {
      return;
    }
    await api.kids.remove(kid.id);
    onKidsChanged();
  };

  const handleAddOption = async (kind: 'location' | 'tag', value: string, clear: () => void) => {
    const clean = value.trim();
    if (!clean) return;
    setOptErr('');
    try {
      const updated = await api.options.add(kind, clean);
      setLocations(updated.locations);
      setTags(updated.tags);
      clear();
    } catch (err) {
      setOptErr(err instanceof Error ? err.message : 'Failed to add option');
    }
  };

  const handleRemoveOption = async (kind: 'location' | 'tag', value: string) => {
    setOptErr('');
    try {
      const updated = await api.options.remove(kind, value);
      setLocations(updated.locations);
      setTags(updated.tags);
    } catch (err) {
      setOptErr(err instanceof Error ? err.message : 'Failed to remove option');
    }
  };

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

  const handleRevoke = async (share: ShareLink) => {
    const label = share.label || 'Family Share';
    if (!confirm(`Revoke share link "${label}"? Anyone with this link will immediately lose access.`)) {
      return;
    }
    setShareErr('');
    setRevokingToken(share.token);
    try {
      await api.shares.revoke(share.token);
      setShares((prev) => prev.filter((s) => s.token !== share.token));
    } catch (err) {
      setShareErr(err instanceof Error ? err.message : 'Failed to revoke share link');
    } finally {
      setRevokingToken(null);
    }
  };

  const handleCopyShare = async (token: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareToken(token);
      setTimeout(() => {
        setCopiedShareToken((curr) => (curr === token ? null : curr));
      }, 2000);
    } catch {
      setShareErr('Could not copy link to clipboard.');
    }
  };

  const show = (tab: Exclude<SectionTab, 'all'>) => {
    if (!isAdmin && tab !== 'security') return false;
    return activeTab === 'all' || activeTab === tab;
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{isAdmin ? 'Options' : 'Account Security'}</h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All'],
                ['users', 'Users'],
                ['children', 'Children'],
                ['locations', 'Locations'],
                ['tags', 'Tags'],
                ['shares', shares.length > 0 ? `Shares (${shares.length})` : 'Shares'],
                ['backup', 'Backup'],
                ['security', 'Security'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`pill ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {optErr && <div className="error-banner">{optErr}</div>}

      {/* Users Subsection (Admin Only) */}
      {show('users') && (
        <section className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={20} color="var(--accent)" />
            Users
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Admins have full access. <strong>Members</strong> can capture, edit, and view artworks. <strong>Viewers</strong> have read-only gallery access.
          </p>
          {userErr && <div className="error-banner">{userErr}</div>}

          <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <input
                className="input"
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                minLength={2}
                required
              />
              <input
                type="password"
                className="input"
                placeholder="Password (min 8 chars)"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                minLength={8}
                required
              />
              <select
                className="select"
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              >
                <option value="member">Member (Upload &amp; Edit)</option>
                <option value="viewer">Viewer (Read-only)</option>
                <option value="admin">Admin (Full access)</option>
              </select>
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={userSaving}>
                <Plus size={16} />
                {userSaving ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </form>

          <div style={{ display: 'grid', gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
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
                  <div style={{ fontWeight: 700 }}>
                    {u.username}{' '}
                    {u.id === user.id && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>(you)</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    2FA: {u.totp_enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    className="select"
                    value={u.role}
                    onChange={(e) => handleChangeUserRole(u, e.target.value as UserRole)}
                    style={{ width: 'auto', padding: '6px 10px', fontSize: '0.84rem' }}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {u.id !== user.id && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: 'var(--danger)', padding: '6px 8px' }}
                      onClick={() => handleDeleteUser(u)}
                      title="Delete user"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Children Subsection */}
      {show('children') && (
        <section className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={20} color="var(--accent)" />
            Children
          </h2>
          {kidErr && <div className="error-banner">{kidErr}</div>}

          <form onSubmit={handleCreateKid} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: 4 }}>Name</label>
                <input
                  className="input"
                  placeholder="e.g. Maya"
                  value={kidName}
                  onChange={(e) => setKidName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: 4 }}>
                  Birthdate (for age calculation)
                </label>
                <input
                  type="date"
                  className="input"
                  value={kidBirthdate}
                  onChange={(e) => setKidBirthdate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, marginRight: 4 }}>Colour:</span>
                {KID_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setKidColor(c)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: c,
                      border: kidColor === c ? '3px solid var(--text)' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <button type="submit" className="btn btn-primary" disabled={kidSaving}>
                <Plus size={16} />
                {kidSaving ? 'Adding...' : 'Add Child'}
              </button>
            </div>
          </form>

          {kids.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
              {kids.map((kid) =>
                editingKidId === kid.id ? (
                  <form
                    key={kid.id}
                    onSubmit={handleSaveEditKid}
                    style={{
                      padding: 12,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-alt)',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                      <input
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                      />
                      <input
                        type="date"
                        className="input"
                        value={editBirthdate}
                        onChange={(e) => setEditBirthdate(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {KID_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: c,
                              border: editColor === c ? '3px solid var(--text)' : '2px solid transparent',
                              cursor: 'pointer',
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditingKidId(null)} style={{ padding: '6px 10px' }}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={kidSaving} style={{ padding: '6px 12px' }}>
                          <Check size={15} />
                          Save
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div
                    key={kid.id}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          background: kid.color,
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                        }}
                      >
                        {kid.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700 }}>{kid.name}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {kid.artwork_count} {kid.artwork_count === 1 ? 'artwork' : 'artworks'}
                          {kid.birthdate ? ` · Born ${kid.birthdate}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="btn btn-ghost" onClick={() => startEditKid(kid)} title="Edit child" style={{ padding: '6px 8px' }}>
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: 'var(--danger)', padding: '6px 8px' }}
                        onClick={() => handleDeleteKid(kid)}
                        title="Delete child"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      )}

      {/* Locations Subsection */}
      {show('locations') && (
        <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={20} color="var(--accent)" />
            Locations
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Quick-select places shown when capturing or editing artwork (e.g. Home, School, Kindergarten).
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {locations.map((loc) => (
              <span
                key={loc}
                className="pill"
                style={{ cursor: 'default', background: 'var(--surface-alt)', paddingRight: 8 }}
              >
                {loc}
                <button
                  type="button"
                  aria-label={`Remove ${loc}`}
                  onClick={() => handleRemoveOption('location', loc)}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 2,
                    display: 'inline-flex',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddOption('location', newLocation, () => setNewLocation(''));
            }}
            style={{ display: 'flex', gap: 8, maxWidth: 400 }}
          >
            <input
              className="input"
              placeholder="Add location (e.g. Art Class)"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              <Plus size={16} />
              Add
            </button>
          </form>
        </section>
      )}

      {/* Tags Subsection */}
      {show('tags') && (
        <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag size={20} color="var(--sage)" />
            Tags
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Quick-select tags shown when capturing or editing artwork.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((tag) => (
              <span
                key={tag}
                className="pill"
                style={{ cursor: 'default', background: 'var(--surface-alt)', paddingRight: 8 }}
              >
                #{tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => handleRemoveOption('tag', tag)}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 2,
                    display: 'inline-flex',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddOption('tag', newTag, () => setNewTag(''));
            }}
            style={{ display: 'flex', gap: 8, maxWidth: 400 }}
          >
            <input
              className="input"
              placeholder="Add tag (e.g. Watercolour)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              <Plus size={16} />
              Add
            </button>
          </form>
        </section>
      )}

      {/* Shares Subsection */}
      {show('shares') && (
        <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Share2 size={20} color="var(--accent)" />
              Read-Only Family Share Links
            </h2>
            <button type="button" className="btn btn-primary" onClick={() => setShowNewShare(true)}>
              Create Gallery Link
            </button>
          </div>

          {shareErr && <div className="error-banner">{shareErr}</div>}

          {shares.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No active share links. Create one to share artworks with grandparents without giving them an account.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {shares.map((s) => {
                const url = `${window.location.origin}/s/${s.token}`;
                const isExpired = Boolean(s.expires_at && new Date(s.expires_at).getTime() < Date.now());
                const scopeLabel = s.artwork_id
                  ? s.artwork_title
                    ? `Artwork "${s.artwork_title}"`
                    : 'Single Artwork'
                  : s.kid_name
                    ? `${s.kid_name}'s Gallery`
                    : 'Full Gallery';
                const isCopied = copiedShareToken === s.token;
                const isRevoking = revokingToken === s.token;

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
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>{s.label || 'Family Share'}</span>
                        <span
                          className="badge"
                          style={{
                            background: isExpired ? '#fdecec' : '#eaf6ef',
                            color: isExpired ? '#9b1c1c' : '#1c6b3a',
                          }}
                        >
                          {isExpired ? 'Expired' : 'Active'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Scope: {scopeLabel}
                        {s.expires_at
                          ? ` · ${isExpired ? 'Expired' : 'Expires'} ${s.expires_at.slice(0, 10)}`
                          : ' · No expiration'}
                        {s.created_at ? ` · Created ${s.created_at.slice(0, 10)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleCopyShare(s.token, url)}
                        style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                        {isCopied ? 'Copied' : 'Copy URL'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: 'var(--danger)', padding: '6px 10px', fontSize: '0.82rem' }}
                        onClick={() => handleRevoke(s)}
                        disabled={isRevoking}
                        title="Revoke link"
                      >
                        <Trash2 size={15} />
                        {isRevoking ? 'Revoking...' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Full Backup Subsection (Admin Only) */}
      {show('backup') && (
        <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={20} color="var(--accent)" />
            Full Backup
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Download a compressed <code>.zip</code> archive containing all original artwork images (organized in per-child folders) along with a <code>metadata.json</code> file of titles, dates, locations, tags, and stories.
          </p>
          <div>
            <a href="/api/backup/download" download className="btn btn-primary">
              <Download size={16} />
              Download Full Backup (.zip)
            </a>
          </div>
        </section>
      )}

      {/* Security Subsection */}
      {show('security') && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color={user.totp_enabled ? 'var(--sage)' : 'var(--text-muted)'} />
                Security · Two-Factor Authentication (TOTP)
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
        </div>
      )}

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
