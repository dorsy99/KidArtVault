import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TagLocationPicker } from './TagLocationPicker';

describe('TagLocationPicker', () => {
  it('toggles location and tag pills and supports adding custom ones', () => {
    const onLocationChange = vi.fn();
    const onTagsChange = vi.fn();

    render(
      <TagLocationPicker
        location="Home"
        onLocationChange={onLocationChange}
        tags={['A4']}
        onTagsChange={onTagsChange}
        suggestedLocations={['Home', 'School']}
        suggestedTags={['A4', 'Animals']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'School' }));
    expect(onLocationChange).toHaveBeenCalledWith('School');

    fireEvent.click(screen.getByRole('button', { name: '#Animals' }));
    expect(onTagsChange).toHaveBeenCalledWith(['A4', 'Animals']);

    fireEvent.change(screen.getByPlaceholderText(/add custom tag/i), { target: { value: 'Dinosaur' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onTagsChange).toHaveBeenCalledWith(['A4', 'Dinosaur']);
  });
});
