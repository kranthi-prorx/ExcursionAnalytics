// ─── Centralized CFU & Particle Threshold Configuration ──────────────────────
// This module is the SINGLE SOURCE OF TRUTH for all viable CFU thresholds
// and non-viable particle thresholds. Do NOT duplicate these values elsewhere.
//
// ISO 8 thresholds use STRICT GREATER-THAN (>), not >=:
//   Alert  > 50  → 50 is OK, 51 is Alert
//   Action > 100 → 100 is Alert, 101 is Action

export type ViableISOClass = 'ISO 5' | 'ISO 7' | 'ISO 8';

// ─── CFU Thresholds ──────────────────────────────────────────────────────────
export interface CfuThreshold {
  /** Alert threshold. null = N/A (no alert level defined). Uses >= for ISO 5/7, > for ISO 8 */
  alert: number | null;
  /** Action threshold. Uses >= for ISO 5/7, > for ISO 8 */
  action: number;
  /** If true, alert/action use strict > instead of >= */
  strictGreaterThan: boolean;
}

export const CFU_THRESHOLDS: Record<ViableISOClass, CfuThreshold> = {
  'ISO 5': { alert: null,  action: 1,   strictGreaterThan: false },  // N/A alert; action ≥ 1
  'ISO 7': { alert: 5,     action: 10,  strictGreaterThan: false },  // alert ≥ 5; action ≥ 10
  'ISO 8': { alert: 50,    action: 100, strictGreaterThan: true  },  // alert > 50; action > 100
} as const;

/**
 * Evaluate CFU status against thresholds for a given ISO class.
 * Returns 'action', 'alert', or 'ok'.
 */
export function evaluateCfuStatus(
  value: number,
  isoClass: ViableISOClass,
): 'ok' | 'alert' | 'action' {
  const t = CFU_THRESHOLDS[isoClass];
  if (!t) return 'ok';

  if (t.strictGreaterThan) {
    // ISO 8: strict >
    if (value > t.action) return 'action';
    if (t.alert !== null && value > t.alert) return 'alert';
  } else {
    // ISO 5, ISO 7: >=
    if (value >= t.action) return 'action';
    if (t.alert !== null && value >= t.alert) return 'alert';
  }
  return 'ok';
}

/**
 * Return human-readable threshold label for a given ISO class.
 */
export function getCfuThresholdLabel(isoClass: ViableISOClass): {
  alertLabel: string;
  actionLabel: string;
} {
  const t = CFU_THRESHOLDS[isoClass];
  if (isoClass === 'ISO 8') {
    return {
      alertLabel:  `Alert > ${t.alert} CFU`,
      actionLabel: `Action > ${t.action} CFU`,
    };
  }
  if (isoClass === 'ISO 5') {
    return {
      alertLabel:  'Alert: N/A',
      actionLabel: `Action ≥ ${t.action} CFU`,
    };
  }
  // ISO 7
  return {
    alertLabel:  `Alert ≥ ${t.alert} CFU`,
    actionLabel: `Action ≥ ${t.action} CFU`,
  };
}

/**
 * statusColor: returns Tailwind border/bg classes based on CFU status.
 * Compatible with ViableDataEntryPage styling.
 */
export function cfuStatusColor(value: number, isoClass: ViableISOClass): string {
  const status = evaluateCfuStatus(value, isoClass);
  if (status === 'action') return 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-900/15';
  if (status === 'alert')  return 'border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/15';
  return 'border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50';
}


// ─── Particle Thresholds (Non-Viable Air) ────────────────────────────────────
export interface ParticleThreshold {
  um05: { alert: number; action: number };
  um50: { alert: number; action: number };
}

export const PARTICLE_THRESHOLDS: Record<ViableISOClass, ParticleThreshold> = {
  'ISO 5': { um05: { alert: 3_000,       action: 3_520       }, um50: { alert: 20,     action: 29      } },
  'ISO 7': { um05: { alert: 300_000,     action: 352_000     }, um50: { alert: 2_000,  action: 2_930   } },
  'ISO 8': { um05: { alert: 3_000_000,   action: 3_520_000   }, um50: { alert: 20_000, action: 29_300  } },
} as const;

// All viable ISO classes
export const VIABLE_ISO_CLASSES: ViableISOClass[] = ['ISO 5', 'ISO 7', 'ISO 8'];
