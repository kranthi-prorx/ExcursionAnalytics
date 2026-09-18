// ─── Location Identity Helpers ───────────────────────────────────────────────
// Shared by data entry, analytics, charts, drill-downs, and exports.
// Maps left/right fingertip variants into a single logical "Fingertips" group
// while preserving ISO 5 vs ISO 7 as separate aggregates.

import type { ISOClass } from '../types';

// ─── All known fingertip spelling variants ───────────────────────────────────
export const FINGERTIP_VARIANTS = new Set([
  'left fingertips',
  'right fingertips',
  'left finger tips',
  'right finger tips',
]);

/**
 * Normalize a location name for comparison (lowercase, trimmed, collapsed spaces).
 */
export function normalizeLocationName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Determine the logical location group. Fingertip variants → 'Fingertips'.
 * All other locations pass through with cleaned display casing.
 */
export function getLogicalLocation(raw: string): string {
  const normalized = normalizeLocationName(raw);
  if (FINGERTIP_VARIANTS.has(normalized)) {
    return 'Fingertips';
  }
  // Return cleaned version (trim + collapse) preserving original casing
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Check if a location name is a fingertip variant.
 */
export function isFingertipLocation(raw: string): boolean {
  return FINGERTIP_VARIANTS.has(normalizeLocationName(raw));
}

/**
 * Generate the display label that includes ISO class.
 * e.g. "Fingertips — ISO 5", "Left Sleeve — ISO 7"
 */
export function getLocationDisplayLabel(logicalLocation: string, isoClass: string): string {
  return `${logicalLocation} — ${isoClass}`;
}

// ─── Combined Fingertip Status (ISO 7 Crimper/Helper) ───────────────────────
// BUSINESS RULE (updated 2026-09-18):
//   Combined (L+R) is the SOLE authoritative variable for ISO 7 fingertip events.
//   ISO 7 Crimper/Helper only — ISO 5 Filling/Stoppering is unaffected.
//
//   Combined  0–3 → Normal  (status: 'ok')
//   Combined  4–5 → Alert   (combined > 3,  status: 'alert')
//   Combined  6+  → Action  (combined > 5,  status: 'action')
//
//   Action supersedes Alert: at most ONE combined event per record.
//
// Previous thresholds (superseded 2026-09-18):
//   alertThreshold:  null (no combined alert)
//   actionThreshold: 3   (action when combined > 3)
//
// New thresholds:
//   alertThreshold:  3   (alert  when combined > 3,  i.e. combined >= 4)
//   actionThreshold: 5   (action when combined > 5,  i.e. combined >= 6)

// ─── Centralized combined fingertip threshold config ─────────────────────────
// Mirrors backend ISO7_CRIMPER_COMBINED_FINGERTIP.
// Update here to keep UI in sync with backend.
export const ISO7_COMBINED_FINGERTIP_ALERT_THRESHOLD  = 3;  // Alert  when combined > 3
export const ISO7_COMBINED_FINGERTIP_ACTION_THRESHOLD = 5;  // Action when combined > 5

export interface CombinedFingertipResult {
  combinedHits: number;
  leftHits: number;
  rightHits: number;
  isoClass: string;
  /** Alert threshold: combined > alertThreshold triggers ALERT */
  alertThreshold: number;
  /** Action threshold: combined > actionThreshold triggers ACTION */
  actionThreshold: number;
  /** 'ok' | 'alert' | 'action' */
  status: 'ok' | 'alert' | 'action';
  /** Legacy field: 'exceeded' when status is 'alert' or 'action', else 'ok' */
  exceeded: boolean;
}

/**
 * Calculate combined fingertip status for ISO 7 Crimper/Helper.
 * Action supersedes Alert — returns exactly one status per record.
 *
 * Examples (ISO 7):
 *  Combined 0–3 → ok
 *  Combined 4–5 → alert   (> 3)
 *  Combined 6+  → action  (> 5)
 */
export function calculateGroupedStatus(
  leftHits: number,
  rightHits: number,
  isoClass: string = 'ISO 7',
): CombinedFingertipResult {
  const combined = leftHits + rightHits;
  const alertThreshold  = ISO7_COMBINED_FINGERTIP_ALERT_THRESHOLD;
  const actionThreshold = ISO7_COMBINED_FINGERTIP_ACTION_THRESHOLD;

  let status: 'ok' | 'alert' | 'action' = 'ok';
  if (combined > actionThreshold) {
    status = 'action';
  } else if (combined > alertThreshold) {
    status = 'alert';
  }

  return {
    combinedHits: combined,
    leftHits,
    rightHits,
    isoClass,
    alertThreshold,
    actionThreshold,
    status,
    exceeded: status !== 'ok',
  };
}

/**
 * Given an array of hit detail rows, extract combined fingertip results
 * grouped by ISO class. Returns one result per ISO class that has fingertip data.
 * Never combines measurements from different ISO classes.
 */
export function getCombinedFingertipStatus(
  hitDetails: Array<{ location: string; hit_value: number; iso_class: string }>,
): CombinedFingertipResult[] {
  // Group fingertip hits by ISO class
  const byIso = new Map<string, { left: number; right: number }>();

  for (const h of hitDetails) {
    const norm = normalizeLocationName(h.location);
    const isLeft = norm.startsWith('left finger');
    const isRight = norm.startsWith('right finger');
    if (!isLeft && !isRight) continue;

    if (!byIso.has(h.iso_class)) {
      byIso.set(h.iso_class, { left: 0, right: 0 });
    }
    const group = byIso.get(h.iso_class)!;
    if (isLeft) group.left += h.hit_value ?? 0;
    else        group.right += h.hit_value ?? 0;
  }

  if (byIso.size === 0) return [];

  return [...byIso.entries()].map(([iso, { left, right }]) =>
    calculateGroupedStatus(left, right, iso)
  );
}

