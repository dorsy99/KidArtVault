import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { ShareLink, User } from '../types';
import { OptionsPage } from './OptionsPage';

const adminUser: User = {
  id: 1,
  username: 'parent',
  role: 'admin',
  totp_enabled: false,
};

const sampleShares: ShareLink[] = [
  {
    token: 'tok-active',
    label: 'Grandma',
    kid_id: 1,
    artwork_id: null,
    kid_name: 'Maya',
    artwork_title: null,
    expires_at: '2099-01-01T00:00:00+00:00',
    created_at: '2026-11-18 10:00:00',
  },
  {
    token: 'tok-untitled-art',
    label: 'School Share',
    kid_id: null,
    artwork_id: 'art-123',
    kid_name: null,
    artwork_title: '',
    expires_at: '2020-01-01T00:00:00+00:00',
    created_at: '2026-11-10 10:00:00',
  },
];

describe('OptionsPage shares management', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists current shares with scope/status and revokes a share on confirmation', async () => {
    vi.spyOn(api.users, 'list').mockResolvedValue([adminUser]);
    vi.spyOn(api.options, 'get').mockResolvedValue({ locations: ['Home'], tags: ['A4'] });
    vi.spyOn(api.shares, 'list').mockResolvedValue(sampleShares);
    const revokeSpy = vi.spyOn(api.shares, 'revoke').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <OptionsPage
        user={adminUser}
        kids={[]}
        onKidsChanged={vi.fn()}
        onUserChanged={vi.fn()}
      />,
    );

    expect(await screen.findByText('Grandma')).toBeInTheDocument();
    expect(screen.getByText(/Maya's Gallery/)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    expect(screen.getByText('School Share')).toBeInTheDocument();
    expect(screen.getByText(/Single Artwork/)).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole('button', { name: /Revoke/i });
    fireEvent.click(revokeButtons[0]);

    await waitFor(() => {
      expect(revokeSpy).toHaveBeenCalledWith('tok-active');
      expect(screen.queryByText('Grandma')).not.toBeInTheDocument();
    });
    expect(screen.getByText('School Share')).toBeInTheDocument();
  });
});
