import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KidRadioSelector } from './KidRadioSelector';
import type { Kid } from '../types';

const KIDS: Kid[] = [
  { id: 1, name: 'Maya', birthdate: '2021-05-10', color: '#f28482', created_at: '2026-01-01', artwork_count: 3 },
  { id: 2, name: 'Leo', birthdate: '2023-02-01', color: '#7ec8a7', created_at: '2026-01-01', artwork_count: 1 },
];

describe('KidRadioSelector', () => {
  it('shows empty state when no kids exist', () => {
    render(<KidRadioSelector kids={[]} value={0} onChange={vi.fn()} />);
    expect(screen.getByText(/no kids added yet/i)).toBeInTheDocument();
  });

  it('renders radio pills for each child and calls onChange when selected', () => {
    const onChange = vi.fn();
    render(<KidRadioSelector kids={KIDS} value={1} onChange={onChange} />);

    const mayaRadio = screen.getByRole('radio', { name: /maya/i });
    const leoRadio = screen.getByRole('radio', { name: /leo/i });
    expect(mayaRadio).toBeChecked();
    expect(leoRadio).not.toBeChecked();

    fireEvent.click(leoRadio);
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
