// ─── Chart reference-line thresholds (mirrors backend/lib/thresholds.js) ──────
import type { EnvISOClass } from '../types';

export interface ThresholdPair { alert: number | null; action: number }
export type ThresholdSet = ThresholdPair & { iso: EnvISOClass };

type ThresholdTable = Record<EnvISOClass, ThresholdPair>;

export const ISO_CLASSES: EnvISOClass[] = ['ISO 5', 'ISO 7', 'ISO 8'];

export const VIABLE_THRESHOLDS: ThresholdTable = {
  'ISO 5': { alert: null, action: 1   },
  'ISO 7': { alert: 5,    action: 10  },
  'ISO 8': { alert: 50,   action: 100 },
};

export const SURFACE_THRESHOLDS: ThresholdTable = {
  'ISO 5': { alert: null, action: 1  },
  'ISO 7': { alert: 3,    action: 5  },
  'ISO 8': { alert: 25,   action: 50 },
};

export const PARTICLE_0_5_THRESHOLDS: ThresholdTable = {
  'ISO 5': { alert: 3_000,     action: 3_520     },
  'ISO 7': { alert: 300_000,   action: 352_000   },
  'ISO 8': { alert: 3_000_000, action: 3_520_000 },
};

export const PARTICLE_5_0_THRESHOLDS: ThresholdTable = {
  'ISO 5': { alert: 20,     action: 29     },
  'ISO 7': { alert: 2_000,  action: 2_930  },
  'ISO 8': { alert: 20_000, action: 29_300 },
};

/** Build the per-ISO threshold list a chart needs for the classes it shows. */
export function thresholdsFor(table: ThresholdTable, isos: EnvISOClass[]): ThresholdSet[] {
  return isos.map(iso => ({ iso, ...table[iso] }));
}
