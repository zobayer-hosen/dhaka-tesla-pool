// The only place money is formatted. The API sends integer paisa (8500) and the
// browser divides by 100 only to show it: 8500 → "৳85.00". It never calculates fares.
export function formatTaka(paisa: number): string {
  return `৳${(paisa / 100).toFixed(2)}`;
}
