import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { Artwork, Kid } from '../types';
import { UploadModal } from './UploadModal';

const kids: Kid[] = [
  { id: 1, name: 'Maya', birthdate: '2021-01-01', color: '#f28482', artwork_count: 2, created_at: '2026-11-01 00:00:00' },
  { id: 2, name: 'Leo', birthdate: '2023-05-01', color: '#7ec8a7', artwork_count: 1, created_at: '2026-11-01 00:00:00' },
];

const dummyArtwork: Artwork = {
  id: 'art-1',
  kid_id: 2,
  kid_name: 'Leo',
  kid_birthdate: '2023-05-01',
  kid_color: '#7ec8a7',
  title: 'Drawing 1',
  notes: 'First note',
  location: 'School',
  tags: ['A4'],
  artwork_date: '2026-11-20',
  is_favorite: true,
  width: 800,
  height: 600,
  file_size: 12345,
  created_at: '2026-11-20 10:00:00',
  updated_at: '2026-11-20 10:00:00',
};

describe('UploadModal Save & Capture Next flow', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('saves artwork, returns to capture, preserves child and location, and resets per-artwork fields', async () => {
    vi.spyOn(api.options, 'get').mockResolvedValue({ locations: ['Home', 'School'], tags: ['A4'] });
    vi.spyOn(api.artworks, 'facets').mockResolvedValue({ locations: [], tags: [] });
    const uploadSpy = vi.spyOn(api.artworks, 'upload').mockResolvedValue(dummyArtwork);
    const onUploaded = vi.fn();

    const { container } = render(
      <UploadModal kids={kids} onClose={vi.fn()} onUploaded={onUploaded} />,
    );

    // Pick first file
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(['img1'], 'first.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file1] } });

    // Skip crop to details
    fireEvent.click(screen.getByRole('button', { name: /Use Full Image/i }));

    // Select Leo, location School, enter title & story
    fireEvent.click(screen.getByRole('radio', { name: /Leo/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'School' }));
    fireEvent.change(screen.getByPlaceholderText(/Rainbow Dinosaur/i), { target: { value: 'Drawing 1' } });
    fireEvent.change(screen.getByPlaceholderText(/What did they say/i), { target: { value: 'First note' } });
    fireEvent.click(screen.getByRole('checkbox'));

    // Click Save & Capture Next
    fireEvent.click(screen.getByRole('button', { name: /Save & Capture Next/i }));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });
    expect(onUploaded).toHaveBeenCalledWith(dummyArtwork, { keepOpen: true });

    // Back at capture screen with saved confirmation
    expect(await screen.findByText(/Saved 1 artwork! Ready to capture the next one\./i)).toBeInTheDocument();

    // Pick second file and proceed to details
    const fileInput2 = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file2 = new File(['img2'], 'second.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput2, { target: { files: [file2] } });
    fireEvent.click(screen.getByRole('button', { name: /Use Full Image/i }));

    // Child (Leo) and Location (School) are preserved; title, notes, favorite are cleared
    expect(screen.getByRole('radio', { name: /Leo/i })).toBeChecked();
    expect(screen.getByRole('button', { name: 'School' })).toHaveClass('active');
    expect(screen.getByPlaceholderText(/Rainbow Dinosaur/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/What did they say/i)).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
