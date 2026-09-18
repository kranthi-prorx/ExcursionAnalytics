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

  // Crimping / Helper — Finger Tips only → ISO 7
  // Combined (L+R): Alert > 3, Action > 5 (evaluated by threshold engine, not here)
  // Individual L/R cards show no Alert or Action badge — combined is the sole event.
  // alert_level=0 suppresses individual card badges. action_level=9999 is a sentinel.
  return { iso_class: 'ISO 7', alert_level: 0, action_level: 9999 };
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
  date_of_batch: string;        // DATE the hit occurred (YYYY-MM-DD), user-entered
  timestamp: string;       // Entry timestamp
  created_by: string;      // User ID
  user_name?: string;      // Joined user name
  hit_details: HitLocation[];// Aggregated hit details array
  total_hits: number;      // Computed total across all details
  personnel_id?: string;   // Joined personnel profile ID
  lot_id?: string;         // Joined lot profile ID
  name_key?: string;
  lot_number_key?: string;
  // Soft-delete fields
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
}

export interface BatchTotal {
  batch_id: string;
  batch_number: string;
  date_of_batch: string;
  iso_class: string;
  batch_hits: number;
  personnel_record_count: number;
  distinct_personnel_count: number;
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
  processed_batch_count?: number;
  average_hits_per_batch?: number;
}

export interface PersonHits {
  name: string;
  name_key?: string;
  personnel_type?: string;
  hits: number;
  records: number;
  iso5: number;
  iso7: number;
}

export interface LocationHits {
  location: string;
  logical_location?: string;
  iso_class?: string;
  display_label?: string;
  hits: number;
  percentage: number;
  raw_locations?: Array<{ location: string; hits: number }>;
}

export interface LotHits {
  lot_number: string;
  lot_number_key?: string;
  hits: number;
  records?: number;
}

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
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
  type: 'person' | 'lot' | 'location' | 'iso' | 'record' | 'all';
  label: string;
  records: ExcursionRecord[];
  filters?: Partial<FilterState>;
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

// ─── Audit Log ────────────────────────────────────────────────────────────────
export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface AuditLog {
  id: string;
  action_type: AuditActionType;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  occurred_at: string;
  deletion_reason: string | null;
  before_values: Record<string, unknown> | null;
  after_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
  personnel_name: string | null;
  batch_number: string | null;
  date_of_batch: string | null;
}

export interface AuditLogListItem extends Omit<AuditLog, 'before_values' | 'after_values'> {}

export interface AuditLogsResponse {
  logs: AuditLogListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Threshold Events ─────────────────────────────────────────────────────────
export interface ThresholdEvent {
  record_id: string;
  personnel_name: string;
  personnel_type: string;
  lot_number: string;
  date_of_batch: string;
  iso_class: string;
  rule_key: string;
  location: string;
  display_label: string;
  severity: 'ALERT' | 'ACTION';
  measured_value: number;
  threshold_value: number;
  threshold_description?: string;
  left_value?: number;
  right_value?: number;
}

export interface PersonEventCount {
  name: string;
  name_key: string;
  personnel_type: string;
  alert_events: number;
  action_events: number;
}

// ─── Environmental Monitoring Types ──────────────────────────────────────────

export type MonitoringContext = 'BATCH' | 'ROUTINE_MONTHLY' | 'ROUTINE_WEEKLY' | 'OTHER';
export type EnvSampleType     = 'VIABLE_AIR' | 'NONVIABLE_AIR' | 'SURFACE';
export type EnvISOClass       = 'ISO 5' | 'ISO 7' | 'ISO 8';
export type EnvSampleStatus   = 'NORMAL' | 'ALERT' | 'ACTION';
export type CompletionStatus  = 'COMPLETE' | 'INCOMPLETE';

export const MONITORING_CONTEXT_LABELS: Record<MonitoringContext, string> = {
  BATCH:           'Batch Monitoring',
  ROUTINE_MONTHLY: 'Routine Monthly Monitoring',
  ROUTINE_WEEKLY:  'Routine Weekly Monitoring',
  OTHER:           'Other',
};

export const ENV_SAMPLE_TYPE_LABELS: Record<EnvSampleType, string> = {
  VIABLE_AIR:   'Viable Air',
  NONVIABLE_AIR: 'Non-Viable Air',
  SURFACE:      'Surface',
};

export const AIR_CONTEXTS: MonitoringContext[] = ['BATCH', 'ROUTINE_MONTHLY', 'OTHER'];
export const SURFACE_CONTEXTS: MonitoringContext[] = ['BATCH', 'ROUTINE_WEEKLY', 'OTHER'];
export const ENV_ISO_CLASSES: EnvISOClass[] = ['ISO 5', 'ISO 7', 'ISO 8'];
export const BATCH_AIR_ISO_CLASSES: EnvISOClass[] = ['ISO 5', 'ISO 7']; // ISO 8 not for batch air

export interface EnvLocationProfile {
  id: string;
  location_code: string;
  location_code_key: string;
  display_name: string;
  room_or_area: string;
  iso_class: EnvISOClass;
  allowed_sample_types: EnvSampleType[];
  allowed_contexts: MonitoringContext[];
  frequency: string | null;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  created_by_name?: string;
  updated_by_name?: string;
}

export interface EnvMonitoringSession {
  id: string;
  monitoring_date: string;       // YYYY-MM-DD
  monitoring_context: MonitoringContext;
  room_or_area: string | null;
  batch_id: string | null;       // FK to lot_profiles.id
  lot_number?: string;           // joined from lot_profiles.display_lot
  lot_key?: string;
  custom_reason: string | null;
  completion_status: CompletionStatus;
  missing_requirements: string[] | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  deleted_at: string | null;
  created_by_name?: string;
  sample_count?: number;
  alert_count?: number;
  action_count?: number;
  samples?: EnvSample[];
}

export interface EnvSample {
  id: string;
  session_id: string;
  location_profile_id: string | null;
  sample_location_text: string | null;
  sample_type: EnvSampleType;
  iso_class: EnvISOClass;
  viable_cfu: number | null;       // null = not collected — never zero-filled
  surface_cfu: number | null;
  particle_count_0_5: number | null;
  particle_count_5_0: number | null;
  status_viable: EnvSampleStatus | null;
  status_0_5: EnvSampleStatus | null;
  status_5_0: EnvSampleStatus | null;
  status: EnvSampleStatus | null;
  organism_id: string | null;
  deviation_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  location_code?: string;
  location_display_name?: string;
  profile_iso_class?: string;
  created_by_name?: string;
}

export interface EnvAnalyticsTrendPoint {
  date: string;
  context: MonitoringContext;
  room_or_area: string | null;
  completion_status: CompletionStatus;
  missing_requirements: string[] | null;
  sample_id: string;
  /** Synthetic grouping key — NOT a real DB session UUID. Never use as a session PK. */
  session_group_key: string;
  iso_class: EnvISOClass;
  sample_type: EnvSampleType;
  location_profile_id: string | null;
  location_code: string | null;
  location_display_name: string | null;
  lot_number: string | null;
  batch_id: string | null;
  created_by_name: string | null;
  // Viable specific
  viable_cfu?: number | null;
  status?: EnvSampleStatus | null;
  // Nonviable specific
  particle_count_0_5?: number | null;
  particle_count_5_0?: number | null;
  status_0_5?: EnvSampleStatus | null;
  status_5_0?: EnvSampleStatus | null;
  // Surface specific
  surface_cfu?: number | null;
  organism_id?: string | null;
}

/** Detail response from GET /api/env/analytics/sample/:sampleId */
export interface EnvSampleDetail {
  source_table: 'viable_data' | 'surface_sampling';
  session: null;       // always null for analytics-tracked records
  session_note: string | null;
  sample: {
    id: string;
    monitoring_date: string;
    monitoring_context: MonitoringContext;
    iso_class: EnvISOClass;
    sample_type: EnvSampleType;
    location_code: string | null;
    location_name: string | null;
    room_or_area: string | null;
    lot_number: string | null;
    batch_id: string | null;
    location_profile_id: string | null;
    // Measurements
    viable_cfu: number | null;
    particle_count_0_5: number | null;
    particle_count_5_0: number | null;
    surface_cfu: number | null;
    organism_id: string | null;
    // Status
    status_viable: EnvSampleStatus | null;
    status_0_5: EnvSampleStatus | null;
    status_5_0: EnvSampleStatus | null;
    status: EnvSampleStatus | null;
    // Thresholds (backend-derived from constants)
    viable_alert_threshold: number | null;
    viable_action_threshold: number | null;
    nonviable_0_5_thresholds: { alert: number | null; action: number } | null;
    nonviable_5_0_thresholds: { alert: number | null; action: number } | null;
    surface_alert_threshold: number | null;
    surface_action_threshold: number | null;
    // Meta
    deviation_number: string | null;
    notes: string | null;
    created_by_name: string | null;
    created_at: string;
  };
}

export interface EnvKPISummary {
  total_sessions: number;
  complete_sessions: number;
  incomplete_sessions: number;
  total_samples: number;
  alert_count: number;
  action_count: number;
  viable_air_count: number;
  nonviable_air_count: number;
  surface_count: number;
}

export interface EnvFilterState {
  dateFrom: string;
  dateTo: string;
  context: MonitoringContext | '';
  isoClass: EnvISOClass | '';
  sampleType: EnvSampleType | '';
  locationProfileId: string;
  roomOrArea: string;
  batchId: string;
  completionStatus: CompletionStatus | '';
  resultStatus: EnvSampleStatus | '';
  createdBy: string;
  lotNumber: string;
}

// Environmental thresholds shape (matches backend ENV_MONITORING_THRESHOLDS)
export interface EnvThresholdSet {
  alert: number | null;
  action: number;
}
export interface EnvThresholds {
  viable_air: Record<EnvISOClass, EnvThresholdSet>;
  surface: Record<EnvISOClass, EnvThresholdSet>;
  nonviable_0_5: Record<EnvISOClass, EnvThresholdSet>;
  nonviable_5_0: Record<EnvISOClass, EnvThresholdSet>;
}

