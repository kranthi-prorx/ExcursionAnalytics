import axios from 'axios';
import type {
  ExcursionRecord, KPISummary, TrendData, PersonHits,
  LocationHits, LotHits, FilterState, User, BatchTotal,
  AuditLog, AuditLogListItem, AuditLogsResponse,
  ThresholdEvent, PersonEventCount,
} from '../types';

const api = axios.create({
  // In dev: VITE_API_URL is empty → Vite proxy handles /api → localhost:3001
  // In production: VITE_API_URL = https://<app-runner-url>
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('eha_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('eha_token');
      localStorage.removeItem('eha_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth API ────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post<{ token: string; user: User }>('/auth/register', data),
  me: () => api.get<User>('/auth/me'),
};

// ─── Records API ─────────────────────────────────────────────────────────────
const buildParams = (filters: Partial<FilterState>) => {
  const p: Record<string, string> = {};
  if (filters.dateFrom)      p.date_from       = filters.dateFrom;
  if (filters.dateTo)        p.date_to         = filters.dateTo;
  if (filters.person)        p.person          = filters.person;
  if (filters.lotNumber)     p.lot_number      = filters.lotNumber;
  if (filters.isoClass)      p.iso_class       = filters.isoClass;
  if (filters.location)      p.location        = filters.location;
  if (filters.personnelType) p.personnel_type  = filters.personnelType;
  return p;
};

export const recordsAPI = {
  getAll: (filters?: Partial<FilterState>) =>
    api.get<{ records: ExcursionRecord[]; total: number }>('/records', { params: buildParams(filters ?? {}) }),
  getById: (id: string) =>
    api.get<ExcursionRecord>(`/records/${id}`),
  create: (data: Omit<ExcursionRecord, 'id' | 'timestamp' | 'created_by'>) =>
    api.post<ExcursionRecord>('/records', data),
  update: (id: string, data: Partial<ExcursionRecord>) =>
    api.put<ExcursionRecord>(`/records/${id}`, data),
  // Soft-delete: reason is required (3-500 chars)
  delete: (id: string, reason: string) =>
    api.delete(`/records/${id}`, { data: { reason } }),
  restore: (id: string) =>
    api.post(`/records/${id}/restore`),
};

// ─── Analytics API ───────────────────────────────────────────────────────────
export const analyticsAPI = {
  kpi: (filters?: Partial<FilterState>) =>
    api.get<KPISummary>('/analytics/kpi', { params: buildParams(filters ?? {}) }),
  trends: (filters?: Partial<FilterState>) =>
    api.get<TrendData[]>('/analytics/trends', { params: buildParams(filters ?? {}) }),
  batchDistribution: (filters?: Partial<FilterState>) =>
    api.get<BatchTotal[]>('/analytics/batch-distribution', { params: buildParams(filters ?? {}) }),
  trendsByLot: (filters?: Partial<FilterState>) =>
    api.get<{ date: string; lot_number: string; hits: number }[]>('/analytics/trends-by-lot', { params: buildParams(filters ?? {}) }),
  byPerson: (filters?: Partial<FilterState>) =>
    api.get<PersonHits[]>('/analytics/by-person', { params: buildParams(filters ?? {}) }),
  byLocation: (filters?: Partial<FilterState>) =>
    api.get<LocationHits[]>('/analytics/by-location', { params: buildParams(filters ?? {}) }),
  byLot: (filters?: Partial<FilterState>) =>
    api.get<LotHits[]>('/analytics/by-lot', { params: buildParams(filters ?? {}) }),
  byIso: (filters?: Partial<FilterState>) =>
    api.get<{ iso_class: string; hits: number }[]>('/analytics/by-iso', { params: buildParams(filters ?? {}) }),
  persons: () => api.get<string[]>('/analytics/persons'),
  lots: () => api.get<string[]>('/analytics/lots'),
  drillDown: (params: {
    type: string; key?: string; date_from?: string; date_to?: string; limit?: number; offset?: number;
  }) => api.get<{ records: ExcursionRecord[]; total: number; limit: number; offset: number }>(
    '/analytics/drill-down', { params }
  ),
  thresholdEvents: (filters?: Partial<FilterState>) =>
    api.get<ThresholdEvent[]>('/analytics/threshold-events', { params: buildParams(filters ?? {}) }),
  byPersonEvents: (filters?: Partial<FilterState>) =>
    api.get<PersonEventCount[]>('/analytics/by-person-events', { params: buildParams(filters ?? {}) }),
};

// ─── Users API ───────────────────────────────────────────────────────────────
export const usersAPI = {
  getAll: () => api.get<User[]>('/users'),
  update: (id: string, data: Partial<User>) => api.put<User>(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),
};

// ─── Viable/Non-Viable API ────────────────────────────────────────────────────
export interface ViableRecord {
  id: number; lot_number: string; sample_date: string; iso_class: string;
  room_number?: string;
  iso5_cfu: number; iso7_cfu: number; iso8_cfu: number;
  particle_05um: number; particle_50um: number;
  deviation_number?: string; notes?: string; created_by_name?: string; created_at: string;
}
export interface ViableByLot {
  lot_number: string; iso5_total: number; iso7_total: number; iso8_total: number;
  avg_05um: number; avg_50um: number; sample_count: number;
}
export const viableAPI = {
  getAll:   () => api.get<ViableRecord[]>('/viable'),
  getByLot: () => api.get<ViableByLot[]>('/viable/by-lot'),
  update:   (id: number, data: Partial<ViableRecord>) => api.put(`/viable/${id}`, data),
  delete:   (id: number, reason: string) => api.delete(`/viable/${id}`, { data: { reason } }),
  restore:  (id: number) => api.post(`/viable/${id}/restore`),
};

// ─── Surface Sampling API ─────────────────────────────────────────────────────
export interface SurfaceRecord {
  id: number; sample_location: string; lot_number: string; sample_date: string;
  iso_class: string; cfu_found: number; organism_id?: string;
  deviation_number?: string; notes?: string; created_by_name?: string; created_at: string;
}
export const surfaceAPI = {
  getAll:  () => api.get<SurfaceRecord[]>('/surface'),
  update:  (id: number, data: Partial<SurfaceRecord>) => api.put(`/surface/${id}`, data),
  delete:  (id: number, reason: string) => api.delete(`/surface/${id}`, { data: { reason } }),
  restore: (id: number) => api.post(`/surface/${id}/restore`),
};

// ─── Processed Batches API ────────────────────────────────────────────────────
export interface ProcessedBatch {
  id: number; lot_number: string; lot_number_key: string; batch_date: string;
  room_area?: string; notes?: string; created_by_name?: string; created_at: string;
}
export const processedBatchesAPI = {
  getAll: () => api.get<ProcessedBatch[]>('/processed-batches'),
  create: (data: { lot_number: string; batch_date: string; room_area?: string; notes?: string }) =>
    api.post<ProcessedBatch>('/processed-batches', data),
  delete: (id: number, reason: string) => api.delete(`/processed-batches/${id}`, { data: { reason } }),
};

// ─── Profiles API (Personnel & Lot master data) ──────────────────────────────
export interface PersonnelProfile {
  id: string; display_name: string; name_key: string;
  personnel_type: string; is_active: boolean;
  created_at: string; updated_at: string;
}
export interface LotProfile {
  id: string; display_lot: string; lot_key: string;
  created_at: string; updated_at: string;
}
export const profilesAPI = {
  searchPersonnel: (q?: string) =>
    api.get<PersonnelProfile[]>('/profiles/personnel', { params: q ? { q } : {} }),
  createPersonnel: (data: { name: string; personnel_type: string }) =>
    api.post<PersonnelProfile>('/profiles/personnel', data),
  searchLots: (q?: string) =>
    api.get<LotProfile[]>('/profiles/lots', { params: q ? { q } : {} }),
  createLot: (data: { lot_number: string }) =>
    api.post<LotProfile>('/profiles/lots', data),
};

// ─── Audit Logs API (admin only) ───────────────────────────────────────────────
export const auditLogsAPI = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
    actor_user_id?: string;
    action_type?: string;
    entity_type?: string;
    personnel_name?: string;
    batch_number?: string;
    sort?: string;
  }) => api.get<AuditLogsResponse>('/audit-logs', { params }),
  getById: (id: string) => api.get<AuditLog>(`/audit-logs/${id}`),
};

// ─── Environmental Location Profiles API ──────────────────────────────────────
import type {
  EnvLocationProfile, EnvMonitoringSession, EnvSample,
  EnvAnalyticsTrendPoint, EnvKPISummary, EnvThresholds, EnvSampleDetail,
  MonitoringContext, EnvSampleType, EnvISOClass, EnvSampleStatus,
  CompletionStatus, EnvFilterState,
} from '../types';

const buildEnvParams = (filters: Partial<EnvFilterState>): Record<string, string> => {
  const p: Record<string, string> = {};
  if (filters.dateFrom)          p.date_from           = filters.dateFrom;
  if (filters.dateTo)            p.date_to             = filters.dateTo;
  if (filters.context)           p.context             = filters.context;
  if (filters.isoClass)          p.iso_class           = filters.isoClass;
  if (filters.sampleType)        p.sample_type         = filters.sampleType;
  if (filters.locationProfileId) p.location_profile_id = filters.locationProfileId;
  if (filters.roomOrArea)        p.room_or_area        = filters.roomOrArea;
  if (filters.batchId)           p.batch_id            = filters.batchId;
  if (filters.completionStatus)  p.completion_status   = filters.completionStatus;
  if (filters.resultStatus)      p.status              = filters.resultStatus;
  if (filters.createdBy)         p.created_by          = filters.createdBy;
  if (filters.lotNumber)         p.lot_number          = filters.lotNumber;
  return p;
};

export const envLocationProfilesAPI = {
  search: (params?: { q?: string; iso_class?: string; room_or_area?: string; active?: boolean; sample_type?: string; context?: string }) =>
    api.get<EnvLocationProfile[]>('/env/location-profiles', { params }),
  getById: (id: string) => api.get<EnvLocationProfile>(`/env/location-profiles/${id}`),
  create: (data: {
    location_code: string; display_name: string; room_or_area: string; iso_class: string;
    allowed_sample_types?: string[]; allowed_contexts?: string[];
    frequency?: string; notes?: string;
  }) => api.post<EnvLocationProfile>('/env/location-profiles', data),
  update: (id: string, data: Partial<{
    location_code: string; display_name: string; room_or_area: string; iso_class: string;
    allowed_sample_types: string[]; allowed_contexts: string[];
    frequency: string; notes: string;
  }>) => api.put<EnvLocationProfile>(`/env/location-profiles/${id}`, data),
  deactivate: (id: string) => api.patch(`/env/location-profiles/${id}/deactivate`),
  reactivate: (id: string) => api.patch(`/env/location-profiles/${id}/reactivate`),
};

export const envSessionsAPI = {
  getAll: (params?: {
    date_from?: string; date_to?: string; context?: string; room_or_area?: string;
    batch_id?: string; completion_status?: string; created_by?: string; lot_number?: string;
    limit?: number; offset?: number;
  }) => api.get<{ sessions: EnvMonitoringSession[]; total: number; limit: number; offset: number }>(
    '/env/sessions', { params }
  ),
  getById: (id: string) => api.get<EnvMonitoringSession & { samples: EnvSample[] }>(`/env/sessions/${id}`),
  create: (data: {
    monitoring_date: string; monitoring_context: MonitoringContext;
    room_or_area?: string; batch_id?: string; custom_reason?: string; notes?: string;
  }) => api.post<EnvMonitoringSession>('/env/sessions', data),
  update: (id: string, data: Partial<{
    monitoring_date: string; monitoring_context: MonitoringContext;
    room_or_area: string; batch_id: string; custom_reason: string; notes: string;
  }>) => api.put<EnvMonitoringSession>(`/env/sessions/${id}`, data),
  delete: (id: string, reason: string) => api.delete(`/env/sessions/${id}`, { data: { reason } }),
  restore: (id: string) => api.post(`/env/sessions/${id}/restore`),
};

export const envSamplesAPI = {
  create: (data: {
    session_id: string;
    location_profile_id?: string;
    sample_location_text?: string;
    sample_type: EnvSampleType;
    iso_class: EnvISOClass;
    viable_cfu?: number | null;
    surface_cfu?: number | null;
    particle_count_0_5?: number | null;
    particle_count_5_0?: number | null;
    organism_id?: string;
    deviation_number?: string;
    notes?: string;
  }) => api.post<EnvSample>('/env/samples', data),
  update: (id: string, data: Partial<{
    location_profile_id: string; sample_location_text: string;
    sample_type: EnvSampleType; iso_class: EnvISOClass;
    viable_cfu: number | null; surface_cfu: number | null;
    particle_count_0_5: number | null; particle_count_5_0: number | null;
    organism_id: string; deviation_number: string; notes: string;
  }>) => api.put<EnvSample>(`/env/samples/${id}`, data),
  delete: (id: string, reason: string) => api.delete(`/env/samples/${id}`, { data: { reason } }),
  restore: (id: string) => api.post(`/env/samples/${id}/restore`),
};

export const envAnalyticsAPI = {
  kpi:               (filters?: Partial<EnvFilterState> & { tab_type?: string }) =>
    api.get<EnvKPISummary>('/env/analytics/kpi', {
      params: { ...buildEnvParams(filters ?? {}), ...(filters?.tab_type ? { tab_type: filters.tab_type } : {}) }
    }),
  viableAirTrend:    (filters?: Partial<EnvFilterState>) =>
    api.get<EnvAnalyticsTrendPoint[]>('/env/analytics/viable-air-trend', { params: buildEnvParams(filters ?? {}) }),
  nonviableAirTrend: (filters?: Partial<EnvFilterState>) =>
    api.get<EnvAnalyticsTrendPoint[]>('/env/analytics/nonviable-air-trend', { params: buildEnvParams(filters ?? {}) }),
  surfaceTrend:      (filters?: Partial<EnvFilterState>) =>
    api.get<EnvAnalyticsTrendPoint[]>('/env/analytics/surface-trend', { params: buildEnvParams(filters ?? {}) }),
  locationTrend:     (location_profile_id: string, filters?: Partial<EnvFilterState>) =>
    api.get<EnvAnalyticsTrendPoint[]>('/env/analytics/location-trend', {
      params: { location_profile_id, ...buildEnvParams(filters ?? {}) }
    }),
  sessions:          (params?: {
    date_from?: string; date_to?: string; context?: string; room_or_area?: string;
    batch_id?: string; completion_status?: string; lot_number?: string;
    limit?: number; offset?: number;
  }) => api.get<{ sessions: EnvMonitoringSession[]; total: number; limit: number; offset: number }>(
    '/env/analytics/sessions', { params }
  ),
  lots:              () => api.get<{ id: string; lot_number: string; lot_key: string }[]>('/env/analytics/lots'),
  thresholds:        () => api.get<EnvThresholds>('/env/analytics/thresholds'),
  /** Primary drill-down: fetch a single sample by its real DB primary key. */
  sampleDetail:      (sampleId: string, sampleType?: string) =>
    api.get<EnvSampleDetail>(`/env/analytics/sample/${sampleId}`, {
      params: sampleType ? { sample_type: sampleType } : {},
    }),
  exportCsvUrl:      (filters?: Partial<EnvFilterState>) => {
    const params = new URLSearchParams(buildEnvParams(filters ?? {}));
    const token = localStorage.getItem('eha_token') || '';
    if (token) params.set('_token', token);
    return `${import.meta.env.VITE_API_URL || ''}/api/env/analytics/export/csv?${params.toString()}`;
  },
};

export default api;

