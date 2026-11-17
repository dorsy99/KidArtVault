import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtworkCard } from './ArtworkCard';
import type { Artwork } from '../types';

const BASE_ARTWORK: Artwork = {
  id: 'art-1',
  kid_id: 1,
  kid_name: 'Maya',
  kid_birthdate: '2022-01-01',
  kid_color: '#f28482',
  title: '',
  notes: '',
  location: 'Home',
  tags: [],
  artwork_date: '2026-11-17',
  is_favorite: false,
  width: 800,
  height: 600,
  file_size: 12345,
  created_at: '2026-11-17',
  updated_at: '2026-11-17',
};

describe('ArtworkCard', () => {
  it('omits title when blank and renders it when populated', () => {
    const { rerender } = render(
      <ArtworkCard artwork={BASE_ARTWORK} thumbUrl="/thumb.webp" onClick={vi.fn()} />,
    );
    expect(screen.queryByText(/untitled/i)).not.toBeInTheDocument();

    rerender(
      <ArtworkCard
        artwork={{ ...BASE_ARTWORK, title: 'Rainbow Dino' }}
        thumbUrl="/thumb.webp"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Rainbow Dino')).toBeInTheDocument();
  });
});
