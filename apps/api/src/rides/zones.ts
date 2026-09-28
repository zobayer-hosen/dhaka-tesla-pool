import { Zone } from '../database/enums';

// The 8 Dhaka zones (PRD A1), in the order the web app lists them.
export const ZONES: { id: Zone; name: string }[] = [
  { id: Zone.BANANI, name: 'Banani' },
  { id: Zone.GULSHAN_1, name: 'Gulshan 1' },
  { id: Zone.MOHAKHALI, name: 'Mohakhali' },
  { id: Zone.DHANMONDI, name: 'Dhanmondi' },
  { id: Zone.MIRPUR, name: 'Mirpur' },
  { id: Zone.UTTARA, name: 'Uttara' },
  { id: Zone.FARMGATE, name: 'Farmgate' },
  { id: Zone.BASHUNDHARA, name: 'Bashundhara' },
];

// Road distance in metres between two zones, written once per pair: A → B is the
// same as B → A. Fixed numbers (no maps API) so every fare can be checked by hand.
// All are whole hundreds of metres, so the distance charge is always whole paisa.
const DISTANCES: [Zone, Zone, number][] = [
  [Zone.BANANI, Zone.GULSHAN_1, 4000],
  [Zone.BANANI, Zone.MOHAKHALI, 3000],
  [Zone.BANANI, Zone.DHANMONDI, 10000],
  [Zone.BANANI, Zone.MIRPUR, 7000],
  [Zone.BANANI, Zone.UTTARA, 12000],
  [Zone.BANANI, Zone.FARMGATE, 6000],
  [Zone.BANANI, Zone.BASHUNDHARA, 6000],
  [Zone.GULSHAN_1, Zone.MOHAKHALI, 3000],
  [Zone.GULSHAN_1, Zone.DHANMONDI, 9000],
  [Zone.GULSHAN_1, Zone.MIRPUR, 9000],
  [Zone.GULSHAN_1, Zone.UTTARA, 14000],
  [Zone.GULSHAN_1, Zone.FARMGATE, 6000],
  [Zone.GULSHAN_1, Zone.BASHUNDHARA, 5000],
  [Zone.MOHAKHALI, Zone.DHANMONDI, 7000],
  [Zone.MOHAKHALI, Zone.MIRPUR, 7000],
  [Zone.MOHAKHALI, Zone.UTTARA, 14000],
  [Zone.MOHAKHALI, Zone.FARMGATE, 4000],
  [Zone.MOHAKHALI, Zone.BASHUNDHARA, 8000],
  [Zone.DHANMONDI, Zone.MIRPUR, 8000],
  [Zone.DHANMONDI, Zone.UTTARA, 20000],
  [Zone.DHANMONDI, Zone.FARMGATE, 3000],
  [Zone.DHANMONDI, Zone.BASHUNDHARA, 14000],
  [Zone.MIRPUR, Zone.UTTARA, 12000],
  [Zone.MIRPUR, Zone.FARMGATE, 6000],
  [Zone.MIRPUR, Zone.BASHUNDHARA, 11000],
  [Zone.UTTARA, Zone.FARMGATE, 16000],
  [Zone.UTTARA, Zone.BASHUNDHARA, 9000],
  [Zone.FARMGATE, Zone.BASHUNDHARA, 11000],
];

export function distanceBetween(from: Zone, to: Zone): number {
  const pair = DISTANCES.find(
    ([a, b]) => (a === from && b === to) || (a === to && b === from),
  );
  if (!pair) {
    // Only reachable with from === to, which validation rejects first.
    throw new Error(`No distance between ${from} and ${to}`);
  }
  return pair[2];
}
