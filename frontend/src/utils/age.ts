/**
 * Compute a human-readable age at the time an artwork was created.
 */
export function formatAgeAtDate(birthdate: string | null | undefined, artworkDate: string): string | null {
  if (!birthdate || !artworkDate) return null;
  const b = new Date(`${birthdate}T00:00:00`);
  const a = new Date(`${artworkDate}T00:00:00`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(a.getTime()) || a < b) return null;

  let months = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (a.getDate() < b.getDate()) {
    months -= 1;
  }
  if (months < 0) return null;
  if (months < 24) {
    return `${months} ${months === 1 ? 'mo' : 'mos'}`;
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} yrs`;
  return `${years} yrs ${remMonths} mos`;
}
