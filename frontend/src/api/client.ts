import type { Artwork, AuthStatus, Kid, PublicShareData, ShareLink, User, UserRole } from '../types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    status: () => request<AuthStatus>('/api/auth/status'),
    setup: (username: string, password: string) =>
      request<{ user: User }>('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    login: (username: string, password: string) =>
      request<{ requires_2fa: boolean; user?: User }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    verify2fa: (code: string) =>
      request<{ user: User }>('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    begin2faSetup: () =>
      request<{ secret: string; otpauth_uri: string; qr_data_uri: string }>('/api/auth/2fa/setup', {
        method: 'POST',
      }),
    enable2fa: (secret: string, code: string) =>
      request<{ totp_enabled: boolean }>('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, code }),
      }),
    disable2fa: (password: string, code: string) =>
      request<{ totp_enabled: boolean }>('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      }),
    changePassword: (current_password: string, new_password: string) =>
      request<{ ok: boolean }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  kids: {
    list: () => request<Kid[]>('/api/kids'),
    create: (data: { name: string; birthdate: string | null; color: string }) =>
      request<Kid>('/api/kids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<{ name: string; birthdate: string | null; color: string }>) =>
      request<Kid>(`/api/kids/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    remove: (id: number) => request<void>(`/api/kids/${id}`, { method: 'DELETE' }),
  },

  artworks: {
    list: (params: {
      kid_id?: number | null;
      location?: string;
      tag?: string;
      favorite?: boolean;
      q?: string;
      limit?: number;
      offset?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params.kid_id != null) sp.set('kid_id', String(params.kid_id));
      if (params.location) sp.set('location', params.location);
      if (params.tag) sp.set('tag', params.tag);
      if (params.favorite) sp.set('favorite', 'true');
      if (params.q) sp.set('q', params.q);
      if (params.limit != null) sp.set('limit', String(params.limit));
      if (params.offset != null) sp.set('offset', String(params.offset));
      const qs = sp.toString();
      return request<{ total: number; items: Artwork[] }>(`/api/artworks${qs ? `?${qs}` : ''}`);
    },
    facets: () => request<{ locations: string[]; tags: string[] }>('/api/artworks/meta/facets'),
    upload: (formData: FormData) =>
      request<Artwork>('/api/artworks', {
        method: 'POST',
        body: formData,
      }),
    update: (
      id: string,
      data: Partial<{
        kid_id: number;
        title: string;
        notes: string;
        location: string;
        tags: string[];
        artwork_date: string;
        is_favorite: boolean;
      }>,
    ) =>
      request<Artwork>(`/api/artworks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<void>(`/api/artworks/${id}`, { method: 'DELETE' }),
  },

  shares: {
    list: () => request<ShareLink[]>('/api/shares'),
    create: (data: { label: string; kid_id?: number | null; artwork_id?: string | null; expires_days?: number | null }) =>
      request<ShareLink>('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    revoke: (token: string) => request<void>(`/api/shares/${token}`, { method: 'DELETE' }),
    getPublic: (token: string) => request<PublicShareData>(`/api/public/share/${token}`),
  },

  options: {
    get: () => request<{ locations: string[]; tags: string[] }>('/api/options'),
    add: (kind: 'location' | 'tag', value: string) =>
      request<{ locations: string[]; tags: string[] }>(`/api/options/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      }),
    remove: (kind: 'location' | 'tag', value: string) =>
      request<{ locations: string[]; tags: string[] }>(
        `/api/options/${kind}?value=${encodeURIComponent(value)}`,
        { method: 'DELETE' },
      ),
  },

  users: {
    list: () => request<User[]>('/api/users'),
    create: (data: { username: string; password: string; role: UserRole }) =>
      request<User>('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { role?: UserRole; password?: string }) =>
      request<User>(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    remove: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  },
};
