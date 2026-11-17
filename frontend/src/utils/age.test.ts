import { describe, expect, it } from 'vitest';
import { formatAgeAtDate } from './age';

describe('formatAgeAtDate', () => {
  it('returns null when birthdate is missing or artwork is before birthdate', () => {
    expect(formatAgeAtDate(null, '2026-11-17')).toBeNull();
    expect(formatAgeAtDate(undefined, '2026-11-17')).toBeNull();
    expect(formatAgeAtDate('2026-12-01', '2026-11-17')).toBeNull();
  });

  it('formats singular and plural months under 2 years', () => {
    expect(formatAgeAtDate('2026-10-01', '2026-11-10')).toBe('1 mo');
    expect(formatAgeAtDate('2025-05-10', '2026-11-17')).toBe('18 mos');
  });

  it('formats exact years and years + months from 2 years onwards', () => {
    expect(formatAgeAtDate('2024-11-17', '2026-11-17')).toBe('2 yrs');
    expect(formatAgeAtDate('2022-08-10', '2026-11-17')).toBe('4 yrs 3 mos');
  });

  it('handles day-of-month not yet reached in the current month', () => {
    expect(formatAgeAtDate('2022-08-20', '2026-11-17')).toBe('4 yrs 2 mos');
  });
});
