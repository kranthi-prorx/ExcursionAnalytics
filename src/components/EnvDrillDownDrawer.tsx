import { useState, useEffect, useRef } from 'react';
import {
  X, AlertCircle, CheckCircle, Activity,
  MapPin, FlaskConical, Wind, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from '../lib/utils';
import { envAnalyticsAPI } from '../lib/api';
import type { EnvSampleDetail, EnvSampleStatus, MonitoringContext } from '../types';

interface Props {
  sampleId:   string | null;
  sampleType: string | null;
  onClose: () => void;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<EnvSampleStatus, string> = {
  NORMAL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ALERT:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ACTION: 'bg-red-100  text-red-700   dark:bg-red-900/30   dark:text-red-400',
};

const STATUS_BORDER: Record<EnvSampleStatus, string> = {
  NORMAL: 'border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10',
  ALERT:  'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10',
  ACTION: 'border-red-200   dark:border-red-800   bg-red-50/60   dark:bg-red-900/10',
};

const STATUS_ICON: Record<EnvSampleStatus, LucideIcon> = {
  NORMAL: CheckCircle,
  ALERT:  AlertCircle,
  ACTION: AlertCircle,
};

const STATUS_ICON_COLOR: Record<EnvSampleStatus, string> = {
  NORMAL: 'text-green-600 dark:text-green-400',
  ALERT:  'text-amber-600 dark:text-amber-400',
  ACTION: 'text-red-600   dark:text-red-400',
};

const SAMPLE_TYPE_ICONS: Record<string, LucideIcon> = {
  VIABLE_AIR:    FlaskConical,
  NONVIABLE_AIR: Wind,
  SURFACE:       MapPin,
};

const SAMPLE_TYPE_LABELS: Record<string, string> = {
  VIABLE_AIR:    'Viable Air',
  NONVIABLE_AIR: 'Non-Viable Air',
  SURFACE:       'Surface',
};

const CTX_LABELS: Partial<Record<MonitoringContext, string>> = {
  BATCH:           'Batch Monitoring',
  ROUTINE_MONTHLY: 'Routine Monthly',
  ROUTINE_WEEKLY:  'Routine Weekly',
  OTHER:           'Other',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '\u2014';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${m}/${d}/${y}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  label, value, className,
}: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{value || '\u2014'}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="bg-surface-50 dark:bg-surface-800 px-4 py-2 text-[10px] font-bold text-surface-500 uppercase tracking-widest">
      {title}
    </div>
  );
}

function MeasRow({
  label, value, unit, status, alertThresh, actionThresh,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  status: EnvSampleStatus | null | undefined;
  alertThresh?: number | null;
  actionThresh?: number | null;
}) {
  const isNull = value === null || value === undefined;
  return (
    <div className="py-2 border-b border-surface-100 dark:border-surface-800 last:border-0">
      <div className="flex items-center justify-between text-sm">
        <span className="text-surface-600 dark:text-surface-400 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {isNull ? (
            <span className="italic text-surface-400 dark:text-surface-500 text-xs">Not collected</span>
          ) : (
            <>
              <span className="font-bold text-surface-800 dark:text-surface-100">
                {Number(value).toLocaleString()} {unit}
              </span>
              {status && (
                <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full', STATUS_COLORS[status])}>
                  {status}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {!isNull && (alertThresh !== undefined || actionThresh !== undefined) && (
        <div className="mt-1 flex gap-3 text-[10px] text-surface-400 dark:text-surface-500">
          {alertThresh !== null && alertThresh !== undefined && (
            <span className="text-amber-500">Alert {'\u2265'} {alertThresh.toLocaleString()}</span>
          )}
          {actionThresh !== null && actionThresh !== undefined && (
            <span className="text-red-500">Action {'\u2265'} {actionThresh.toLocaleString()}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-surface-200 dark:bg-surface-700 rounded-xl" />
      <div className="h-28 bg-surface-200 dark:bg-surface-700 rounded-xl" />
      <div className="h-36 bg-surface-200 dark:bg-surface-700 rounded-xl" />
      <div className="h-16 bg-surface-200 dark:bg-surface-700 rounded-xl" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EnvDrillDownDrawer({ sampleId, sampleType, onClose }: Props) {
  const [detail, setDetail]   = useState<EnvSampleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  // Track which sampleId is in-flight so fast clicks cancel stale responses
  const currentReqId = useRef<string | null>(null);

  useEffect(() => {
    if (!sampleId) {
      setDetail(null);
      setError(null);
      return;
    }
    // Clear stale data before each new request
    setDetail(null);
    setError(null);
    setLoading(true);
    currentReqId.current = sampleId;

    envAnalyticsAPI.sampleDetail(sampleId, sampleType ?? undefined)
      .then(res => {
        if (currentReqId.current !== sampleId) return; // stale
        setDetail(res.data);
      })
      .catch(err => {
        if (currentReqId.current !== sampleId) return;
        const httpStatus = err?.response?.status;
        if (httpStatus === 404) {
          setError('Environmental sample was not found.');
        } else if (httpStatus === 403) {
          setError('You do not have permission to view this record.');
        } else {
          setError('Unable to load Environmental Monitoring details.');
        }
      })
      .finally(() => {
        if (currentReqId.current === sampleId) setLoading(false);
      });

    return () => { currentReqId.current = null; };
  }, [sampleId, sampleType]);

  if (!sampleId) return null;

  const s = detail?.sample;
  const SampleIcon = SAMPLE_TYPE_ICONS[s?.sample_type ?? sampleType ?? ''] || Activity;
  const worstStatus = s?.status ?? null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl z-50 bg-white dark:bg-surface-900 border-l border-surface-200 dark:border-surface-800 flex flex-col shadow-2xl animate-slide-in-right overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'p-2 rounded-xl',
              worstStatus === 'ACTION' ? 'bg-red-100 dark:bg-red-900/30' :
              worstStatus === 'ALERT'  ? 'bg-amber-100 dark:bg-amber-900/30' :
              'bg-brand-100 dark:bg-brand-900/30',
            )}>
              <SampleIcon size={16} className={
                worstStatus === 'ACTION' ? 'text-red-600 dark:text-red-400' :
                worstStatus === 'ALERT'  ? 'text-amber-600 dark:text-amber-400' :
                'text-brand-600 dark:text-brand-400'
              } />
            </div>
            <div>
              <h2 className="text-base font-bold text-surface-900 dark:text-white">
                Environmental Monitoring Detail
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                {s
                  ? (SAMPLE_TYPE_LABELS[s.sample_type] || s.sample_type)
                  : (SAMPLE_TYPE_LABELS[sampleType ?? ''] || 'Sample Detail')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-xl">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">

          {loading && <Skeleton />}

          {!loading && error && (
            <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && s && (
            <>
              {/* Status banner */}
              {worstStatus && (
                <div className={clsx('flex items-center gap-3 p-3 rounded-xl border', STATUS_BORDER[worstStatus])}>
                  {(() => {
                    const Icon = STATUS_ICON[worstStatus];
                    return <Icon size={16} className={STATUS_ICON_COLOR[worstStatus]} />;
                  })()}
                  <span className={clsx('text-sm font-semibold', STATUS_ICON_COLOR[worstStatus])}>
                    {worstStatus === 'ACTION' ? 'Action Required' :
                     worstStatus === 'ALERT'  ? 'Alert Exceedance' :
                     'Within Normal Limits'}
                  </span>
                  <span className={clsx('ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_COLORS[worstStatus])}>
                    {worstStatus}
                  </span>
                </div>
              )}

              {/* Sample Information */}
              <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
                <SectionHeader title="Sample Information" />
                <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailRow label="Date"        value={formatDate(s.monitoring_date)} />
                  <DetailRow label="Context"     value={CTX_LABELS[s.monitoring_context as MonitoringContext] || s.monitoring_context} />
                  <DetailRow label="ISO Class"   value={s.iso_class} />
                  <DetailRow label="Sample Type" value={SAMPLE_TYPE_LABELS[s.sample_type] || s.sample_type} />
                  <DetailRow label="Location"    value={s.location_name || s.location_code || undefined} />
                  {s.room_or_area && <DetailRow label="Room / Area" value={s.room_or_area} />}
                  {s.lot_number ? (
                    <DetailRow label="Lot Number" value={s.lot_number} className="col-span-2" />
                  ) : (
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-0.5">Lot Number</p>
                      <p className="text-xs text-surface-400 dark:text-surface-500 italic">Not Batch Linked</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Measurements */}
              <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
                <SectionHeader title="Measurement Results" />
                <div className="p-4">
                  {s.sample_type === 'VIABLE_AIR' && (
                    <MeasRow
                      label="Viable CFU" value={s.viable_cfu} unit="CFU"
                      status={s.status_viable}
                      alertThresh={s.viable_alert_threshold}
                      actionThresh={s.viable_action_threshold}
                    />
                  )}
                  {s.sample_type === 'NONVIABLE_AIR' && (
                    <>
                      <MeasRow
                        label="0.5 µm Particles" value={s.particle_count_0_5} unit="p/m³"
                        status={s.status_0_5}
                        alertThresh={s.nonviable_0_5_thresholds?.alert}
                        actionThresh={s.nonviable_0_5_thresholds?.action}
                      />
                      <MeasRow
                        label="5.0 µm Particles" value={s.particle_count_5_0} unit="p/m³"
                        status={s.status_5_0}
                        alertThresh={s.nonviable_5_0_thresholds?.alert}
                        actionThresh={s.nonviable_5_0_thresholds?.action}
                      />
                    </>
                  )}
                  {s.sample_type === 'SURFACE' && (
                    <>
                      <MeasRow
                        label="Surface CFU" value={s.surface_cfu} unit="CFU"
                        status={s.status}
                        alertThresh={s.surface_alert_threshold}
                        actionThresh={s.surface_action_threshold}
                      />
                      {s.organism_id && (
                        <div className="pt-2 text-sm">
                          <span className="text-surface-500 dark:text-surface-400">Organism: </span>
                          <span className="font-medium text-surface-800 dark:text-surface-100">{s.organism_id}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Record metadata */}
              <div className="rounded-xl border border-surface-100 dark:border-surface-700 overflow-hidden">
                <SectionHeader title="Record Details" />
                <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailRow label="Entered By" value={s.created_by_name} />
                  <DetailRow label="Created At"  value={s.created_at ? new Date(s.created_at).toLocaleDateString() : undefined} />
                  {s.deviation_number && (
                    <DetailRow label="Deviation #" value={s.deviation_number} className="col-span-2" />
                  )}
                  {s.notes && (
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-0.5">Notes</p>
                      <p className="text-sm text-surface-600 dark:text-surface-400 italic">{s.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Session linkage note — always informational, never an error */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-100 dark:border-surface-700 text-xs text-surface-500 dark:text-surface-400">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>
                  This sample was recorded directly via the Viable / Surface entry form.
                  No linked Monitoring Session is available for this record.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
