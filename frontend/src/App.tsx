import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import { Layout } from './components/Layout';
import { UploadModal } from './components/UploadModal';
import { GalleryPage } from './pages/GalleryPage';
import { KidsPage } from './pages/KidsPage';
import { LoginPage } from './pages/LoginPage';
import { PublicSharePage } from './pages/PublicSharePage';
import { OptionsPage } from './pages/OptionsPage';
import type { Kid, User } from './types';

function AuthenticatedApp() {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadKids = useCallback(async () => {
    const list = await api.kids.list();
    setKids(list);
  }, []);

  useEffect(() => {
    api.auth
      .status()
      .then((res) => {
        setNeedsSetup(res.needs_setup);
        setUser(res.authenticated ? res.user : null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) {
      loadKids();
    }
  }, [user, loadKids]);

  const handleLogout = async () => {
    await api.auth.logout();
    if (typeof window !== 'undefined' && 'caches' in window) {
      await window.caches.delete('artwork-thumbs').catch(() => {});
    }
    setUser(null);
    setNeedsSetup(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        Loading KidArtVault...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        needsSetup={needsSetup}
        onAuthenticated={(u) => {
          setUser(u);
          setNeedsSetup(false);
        }}
      />
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout} onOpenUpload={() => setShowUpload(true)}>
      <Routes>
        <Route
          path="/"
          element={
            <GalleryPage
              kids={kids}
              canEdit={user.role === 'admin' || user.role === 'member'}
              refreshKey={refreshKey}
              onOpenUpload={() => setShowUpload(true)}
            />
          }
        />
        <Route path="/kids" element={<KidsPage kids={kids} isAdmin={user.role === 'admin'} />} />
        <Route
          path="/options"
          element={
            <OptionsPage
              user={user}
              kids={kids}
              onKidsChanged={() => {
                loadKids();
                setRefreshKey((k) => k + 1);
              }}
              onUserChanged={setUser}
            />
          }
        />
        <Route path="/settings" element={<Navigate to="/options" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showUpload && (
        <UploadModal
          kids={kids}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            loadKids();
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/s/:token" element={<PublicSharePage />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
