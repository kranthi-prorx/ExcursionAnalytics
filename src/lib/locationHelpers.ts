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

// ─── Combined Fingertip Status ───────────────────────────────────────────────
// Combined (left + right) fingertip threshold: combinedFingertipHits > 3
// This threshold applies regardless of ISO class (ISO 5 or ISO 7 fingertips).
// There is NO approved alert threshold for the combined group (N/A).
//
// IMPORTANT: The combined threshold label (currently "Action") requires
// Quality Unit confirmation. It is centralized here — change `thresholdLabel`
// to update the entire application.

/** Configurable threshold label — QU to confirm if this is "Alert" or "Action" */
export const COMBINED_FINGERTIP_THRESHOLD_LABEL = 'Action' as const; // TODO: QU confirmation needed

export interface CombinedFingertipResult {
  combinedHits: number;
  leftHits: number;
  rightHits: number;
  isoClass: string;
  /** null = N/A (no alert threshold defined for combined fingertips) */
  alertThreshold: number | null;
  /** Combined action threshold: > 3 */
  actionThreshold: number;
  status: 'ok' | 'exceeded';
  /** Label for the exceeded status — centralized config */
  thresholdLabel: string;
}

/**
 * Calculate combined fingertip status.
 * Action rule: combinedFingertipHits > 3
 * Alert rule: N/A (null)
 *
 * Examples:
 *  - Left 1 + Right 2 = 3 → OK
 *  - Left 2 + Right 2 = 4 → Exceeded
 *  - Left 0 + Right 4 = 4 → Exceeded
 */
export function calculateGroupedStatus(
  leftHits: number,
  rightHits: number,
  isoClass: string = 'ISO 5',
): CombinedFingertipResult {
  const combined = leftHits + rightHits;
  return {
    combinedHits: combined,
    leftHits,
    rightHits,
    isoClass,
    alertThreshold: null,  // N/A — no approved alert threshold
    actionThreshold: 3,    // exceeded when > 3
    status: combined > 3 ? 'exceeded' : 'ok',
    thresholdLabel: COMBINED_FINGERTIP_THRESHOLD_LABEL,
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

