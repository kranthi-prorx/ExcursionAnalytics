// ─── Types ───────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'manager' | 'user';
export type ISOClass = 'ISO 5' | 'ISO 7';
export type PersonnelType = 'Filling' | 'Crimping';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

// ─── Location Config ─────────────────────────────────────────────────────────
// Defines the ISO class, alert level, and action level for each location
// based on the personnel type. This is the authoritative source of truth.
export interface LocationConfig {
  iso_class: ISOClass;
  alert_level: number;
  action_level: number;
}

export function getLocationConfig(
  personnelType: PersonnelType,
  location: string
): LocationConfig {
  if (personnelType === 'Filling') {
    // Filling / Stoppering Personnel (per SOP)
    // ISO 5  — Fingertips:  Alert Level 0,  Action Level >0  (i.e. ≥1)
    // ISO 7  — Sleeves:     Alert Level >1 (≥2), Action Level >3 (≥4)
    // ISO 7  — Gown:        Alert Level >5 (≥6), Action Level >10 (≥11)
    if (location === 'Left Fingertips' || location === 'Right Fingertips') {
      return { iso_class: 'ISO 5', alert_level: 0, action_level: 1 };
    }
    if (location === 'Left Sleeve' || location === 'Right Sleeve') {
      return { iso_class: 'ISO 7', alert_level: 2, action_level: 4 };
    }
    // Gown locations
    return { iso_class: 'ISO 7', alert_level: 6, action_level: 11 };
  }

  // Crimping / Helper — Finger Tips only → ISO 7: Alert >1 (≥2), Action >3 (≥4)
  return { iso_class: 'ISO 7', alert_level: 2, action_level: 4 };
}

// Locations available per personnel type
export function getLocationsForPersonnelType(personnelType: PersonnelType): string[] {
  if (personnelType === 'Filling') {
    return ['Left Gown', 'Right Gown', 'Left Sleeve', 'Right Sleeve', 'Left Fingertips', 'Right Fingertips'];
  }
  // Crimping / Helper — finger tip locations only
  return ['Left Finger Tips', 'Right Finger Tips'];
}

export interface HitLocation {
  id?: string;
  record_id?: string;
  location: string;
  iso_class: ISOClass;     // derived from personnel type + location
  hit_value: number;       // any non-negative integer (0, 1, 2, 3 …)
  alert_level: number;     // numeric threshold derived from iso_class (read-only)
  action_level: number;    // numeric threshold derived from iso_class (read-only)
}

export interface ExcursionRecord {
  id: string;
  name: string;
  lot_number: string;
  job_function: string;
  personnel_type: PersonnelType;
  iso_class: ISOClass;
  alert_level: number;
  action_level: number;
  hit_date: string;        // DATE the hit occurred (YYYY-MM-DD), user-entered
  timestamp: string;       // when the record was created in the system
  created_by: string;
  hit_details: HitLocation[];
  total_hits?: number;
  user_name?: string;
}

export interface KPISummary {
  total_hits: number;
  iso5_hits: number;
  iso7_hits: number;
  total_records: number;
  unique_persons: number;
  unique_lots: number;
  alert_count: number;
  action_count: number;
}

export interface TrendData {
  date: string;
  hits: number;
  iso5: number;
  iso7: number;
  records: number;
}

export interface PersonHits {
  name: string;
  hits: number;
  records: number;
  iso5: number;
  iso7: number;
}

export interface LocationHits {
  location: string;
  hits: number;
  percentage: number;
}

export interface LotHits {
  lot_number: string;
  hits: number;
  records: number;
}

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  period: 'daily' | 'weekly' | 'monthly' | 'custom';
  person: string;
  lotNumber: string;
  isoClass: string;
  location: string;
  personnelType: string;   // filter by personnel type
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface DrillDownData {
  type: 'person' | 'lot' | 'location' | 'iso' | 'record';
  label: string;
  records: ExcursionRecord[];
}

export const LOCATIONS = [
  'Left Gown',
  'Right Gown',
  'Left Sleeve',
  'Right Sleeve',
  'Left Fingertips',
  'Right Fingertips',
  'Left Finger Tips',
  'Right Finger Tips',
] as const;

export type LocationKey = typeof LOCATIONS[number];

export const PERSONNEL_TYPES: PersonnelType[] = ['Filling', 'Crimping'];

export const ISO_CLASSES: ISOClass[] = ['ISO 5', 'ISO 7'];
export const ROLES: Role[] = ['admin', 'manager', 'user'];

// Human-readable labels for personnel type groups (for UI display)
export const PERSONNEL_TYPE_LABELS: Record<PersonnelType, string> = {
  Filling:  'Filling / Stoppering',
  Crimping: 'Crimping / Helper',
};
