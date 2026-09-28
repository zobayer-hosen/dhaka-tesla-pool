// "GULSHAN_1" → "Gulshan 1": the API sends zone ids, people read names.
export function zoneName(id: string): string {
  return id.charAt(0) + id.slice(1).toLowerCase().replace('_', ' ');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
