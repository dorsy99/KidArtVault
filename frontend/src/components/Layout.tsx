import React from 'react';
import { NavLink } from 'react-router-dom';
import { Camera, Images, LogOut, Settings, Users } from 'lucide-react';
import type { User } from '../types';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  onOpenUpload: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, onOpenUpload, children }) => {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <img src="/favicon.svg" alt="" width={30} height={30} />
            <span>KidArtVault</span>
          </NavLink>

          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Images size={17} />
              Gallery
            </NavLink>
            <NavLink to="/kids" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={17} />
              Kids
            </NavLink>
            <NavLink to="/options" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Settings size={17} />
              Options
            </NavLink>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={onOpenUpload}>
              <Camera size={17} />
              <span>Capture Art</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              title={`Sign out (${user.username})`}
              onClick={onLogout}
              style={{ padding: '8px 10px' }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">{children}</main>

      <nav className="mobile-nav">
        <NavLink to="/" end className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <Images size={20} />
          <span>Gallery</span>
        </NavLink>
        <button
          type="button"
          className="mobile-nav-item"
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
          onClick={onOpenUpload}
        >
          <Camera size={22} />
          <span>Capture</span>
        </button>
        <NavLink to="/kids" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <Users size={20} />
          <span>Kids</span>
        </NavLink>
        <NavLink to="/options" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} />
          <span>Options</span>
        </NavLink>
      </nav>
    </div>
  );
};
