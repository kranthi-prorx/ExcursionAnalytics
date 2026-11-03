// ─── Cleanroom room → ISO class map ───────────────────────────────────────────
// Single source of truth for which rooms get their own trend graph and which
// ISO classes are sampled in each. Add a room here to give it a graph.
import type { EnvISOClass } from '../types';

export interface RoomConfig {
  /** Canonical room name, used as the grouping key and chart title */
  room: string;
  /** ISO classes sampled in this room (one line group per class on its graph) */
  isoClasses: EnvISOClass[];
}

export const ROOM_CONFIG: RoomConfig[] = [
  { room: '103',  isoClasses: ['ISO 8'] },
  { room: '104',  isoClasses: ['ISO 8'] },
  { room: '105',  isoClasses: ['ISO 7'] },
  { room: '105A', isoClasses: ['ISO 5', 'ISO 7'] },
];

export const UNASSIGNED_ROOM = 'Unassigned Room';

/**
 * Normalise free-text room entries so "Room 105A", "room 105a" and " 105A "
 * all map to the canonical "105A". Unknown rooms are returned trimmed as-is.
 */
export function normalizeRoom(raw: unknown): string {
  const text = (raw ?? '').toString().trim();
  if (!text) return UNASSIGNED_ROOM;
  const stripped = text.replace(/^room\s*/i, '').trim();
  const known = ROOM_CONFIG.find(r => r.room.toLowerCase() === stripped.toLowerCase());
  return known ? known.room : text;
}

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Configured rooms first (config order), then any other rooms found in data. */
export function orderRooms(rooms: string[]): string[] {
  const configured = ROOM_CONFIG.map(r => r.room);
  const extras = rooms.filter(r => !configured.includes(r)).sort(naturalCompare);
  return [...configured, ...extras];
}

export function configuredIsoClasses(room: string): EnvISOClass[] {
  return ROOM_CONFIG.find(r => r.room === room)?.isoClasses ?? [];
}
