// ─── PM Monitoring Threshold Event Engine ────────────────────────────────────
// SINGLE SOURCE OF TRUTH for all PM threshold rules.
// Do NOT duplicate threshold logic in data entry, analytics, drill-downs,
// CSV exports, or PDF exports. Always call these helpers.
//
// Key distinctions:
//   Hit totals:       The numerical number of hits recorded.
//   Threshold events: The number of monitored rules that triggered Alert/Action.
//
// One person may trigger multiple events. One rule_key produces at most one
// event per record (enforced by the rule_key uniqueness model).

'use strict';

// ─── Rule Definitions ────────────────────────────────────────────────────────
// Each rule maps a location (or virtual location) to its threshold logic.
// `evaluator` receives the hit_details array for one record and returns
// zero or one event object (or null).

const FINGERTIP_LEFT_NORM  = new Set(['left fingertips', 'left finger tips']);
const FINGERTIP_RIGHT_NORM = new Set(['right fingertips', 'right finger tips']);

function normLoc(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function findHitValue(hitDetails, locationSet, isoClass) {
  for (const hd of hitDetails) {
    if (locationSet.has(normLoc(hd.location)) && (hd.iso_class || '') === isoClass) {
      return parseInt(hd.hit_value) || 0;
    }
  }
  return 0;
}

function findHitValueByExact(hitDetails, locationNorm, isoClass) {
  for (const hd of hitDetails) {
    if (normLoc(hd.location) === locationNorm && (hd.iso_class || '') === isoClass) {
      return parseInt(hd.hit_value) || 0;
    }
  }
  return 0;
}

// ─── ISO 5 Fingertip Rules (Filling/Stoppering) ─────────────────────────────
// Left and Right are INDEPENDENT action variables.
// >= 1 → ACTION.  No combined ISO 5 variable.

function iso5LeftFingertipAction(hitDetails) {
  const val = findHitValue(hitDetails, FINGERTIP_LEFT_NORM, 'ISO 5');
  if (val >= 1) {
    return {
      rule_key: 'iso5_left_fingertip_action',
      location: 'Left Fingertip',
      display_label: 'Left Fingertip — ISO 5',
      iso_class: 'ISO 5',
      severity: 'ACTION',
      measured_value: val,
      threshold_value: 1,
      threshold_description: '>= 1',
    };
  }
  return null;
}

function iso5RightFingertipAction(hitDetails) {
  const val = findHitValue(hitDetails, FINGERTIP_RIGHT_NORM, 'ISO 5');
  if (val >= 1) {
    return {
      rule_key: 'iso5_right_fingertip_action',
      location: 'Right Fingertip',
      display_label: 'Right Fingertip — ISO 5',
      iso_class: 'ISO 5',
      severity: 'ACTION',
      measured_value: val,
      threshold_value: 1,
      threshold_description: '>= 1',
    };
  }
  return null;
}

// ─── ISO 7 Fingertip Rules (Crimping/Helper) ────────────────────────────────
// Individual L/R: Alert at >= 1.  NEVER generate Action individually.
// Combined (L+R): Action when > 3.  No separate combined Alert.

function iso7LeftFingertipAlert(hitDetails) {
  const val = findHitValue(hitDetails, FINGERTIP_LEFT_NORM, 'ISO 7');
  if (val >= 1) {
    return {
      rule_key: 'iso7_left_fingertip_alert',
      location: 'Left Fingertip',
      display_label: 'Left Fingertip — ISO 7',
      iso_class: 'ISO 7',
      severity: 'ALERT',
      measured_value: val,
      threshold_value: 1,
      threshold_description: '>= 1',
    };
  }
  return null;
}

function iso7RightFingertipAlert(hitDetails) {
  const val = findHitValue(hitDetails, FINGERTIP_RIGHT_NORM, 'ISO 7');
  if (val >= 1) {
    return {
      rule_key: 'iso7_right_fingertip_alert',
      location: 'Right Fingertip',
      display_label: 'Right Fingertip — ISO 7',
      iso_class: 'ISO 7',
      severity: 'ALERT',
      measured_value: val,
      threshold_value: 1,
      threshold_description: '>= 1',
    };
  }
  return null;
}

function iso7CombinedFingertipsAction(hitDetails) {
  const left  = findHitValue(hitDetails, FINGERTIP_LEFT_NORM, 'ISO 7');
  const right = findHitValue(hitDetails, FINGERTIP_RIGHT_NORM, 'ISO 7');
  const combined = left + right;
  if (combined > 3) {
    return {
      rule_key: 'iso7_combined_fingertips_action',
      location: 'Fingertips (Combined)',
      display_label: 'Fingertips — ISO 7',
      iso_class: 'ISO 7',
      severity: 'ACTION',
      measured_value: combined,
      threshold_value: 3,
      threshold_description: '> 3',
      left_value: left,
      right_value: right,
    };
  }
  return null;
}

// ─── Gown & Sleeve Rules (Filling) ──────────────────────────────────────────
// Action supersedes Alert for the same metric.
// Gown:   Alert >= 6, Action >= 11
// Sleeve: Alert >= 2, Action >= 4

function makeGownSleeveRule(locationNorm, displayLocation, alertThreshold, actionThreshold) {
  return function(hitDetails) {
    const val = findHitValueByExact(hitDetails, locationNorm, 'ISO 7');
    if (val >= actionThreshold) {
      // Action supersedes Alert
      return {
        rule_key: locationNorm.replace(/\s+/g, '_') + '_action',
        location: displayLocation,
        display_label: displayLocation + ' — ISO 7',
        iso_class: 'ISO 7',
        severity: 'ACTION',
        measured_value: val,
        threshold_value: actionThreshold,
        threshold_description: '>= ' + actionThreshold,
      };
    }
    if (val >= alertThreshold) {
      return {
        rule_key: locationNorm.replace(/\s+/g, '_') + '_alert',
        location: displayLocation,
        display_label: displayLocation + ' — ISO 7',
        iso_class: 'ISO 7',
        severity: 'ALERT',
        measured_value: val,
        threshold_value: alertThreshold,
        threshold_description: '>= ' + alertThreshold,
      };
    }
    return null;
  };
}

// ─── All Rules by Personnel Type ─────────────────────────────────────────────

const FILLING_RULES = [
  iso5LeftFingertipAction,
  iso5RightFingertipAction,
  makeGownSleeveRule('left gown',    'Left Gown',    6, 11),
  makeGownSleeveRule('right gown',   'Right Gown',   6, 11),
  makeGownSleeveRule('left sleeve',  'Left Sleeve',  2,  4),
  makeGownSleeveRule('right sleeve', 'Right Sleeve', 2,  4),
];

const CRIMPING_RULES = [
  iso7LeftFingertipAlert,
  iso7RightFingertipAlert,
  iso7CombinedFingertipsAction,
];

function getRulesForPersonnelType(personnelType) {
  if ((personnelType || '').toLowerCase() === 'crimping') return CRIMPING_RULES;
  return FILLING_RULES;
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Calculate all threshold events for a single PM record.
 *
 * @param {object} record - Must have: id, name, lot_number, date_of_batch, personnel_type, iso_class
 * @param {Array}  hitDetails - Array of { location, iso_class, hit_value, alert_level, action_level }
 * @returns {Array} Array of threshold event objects
 */
function calculateThresholdEvents(record, hitDetails) {
  const rules = getRulesForPersonnelType(record.personnel_type);
  const events = [];

  for (const rule of rules) {
    const event = rule(hitDetails || []);
    if (event) {
      events.push({
        record_id: record.id,
        personnel_name: record.name,
        personnel_type: record.personnel_type,
        lot_number: record.lot_number,
        date_of_batch: record.date_of_batch,
        ...event,
      });
    }
  }

  return events;
}

/**
 * Calculate correct PM hit totals for a record.
 *
 * ISO 5 fingertip hits = leftISO5 + rightISO5 (independent, no combined)
 * ISO 7 fingertip hits = combined ISO 7 = leftISO7 + rightISO7 (counted ONCE)
 * Other locations: sum hit_value directly
 *
 * @param {Array} hitDetails
 * @returns {{ totalHits: number, iso5Hits: number, iso7Hits: number }}
 */
function calculatePmHitTotals(hitDetails) {
  let iso5Hits = 0;
  let iso7Hits = 0;

  for (const hd of (hitDetails || [])) {
    const val = parseInt(hd.hit_value) || 0;
    const iso = (hd.iso_class || '').trim();
    // All hit_details rows contribute to their ISO class total directly.
    // There is no "combined" row stored in the DB — combined is always derived.
    // So summing all rows gives correct totals without double-counting.
    if (iso === 'ISO 5') iso5Hits += val;
    else if (iso === 'ISO 7') iso7Hits += val;
  }

  return {
    totalHits: iso5Hits + iso7Hits,
    iso5Hits,
    iso7Hits,
  };
}

/**
 * Summarize events: count alerts and actions.
 */
function summarizeEvents(events) {
  let alertCount = 0;
  let actionCount = 0;
  for (const e of events) {
    if (e.severity === 'ALERT') alertCount++;
    else if (e.severity === 'ACTION') actionCount++;
  }
  return { alertCount, actionCount };
}

module.exports = {
  calculateThresholdEvents,
  calculatePmHitTotals,
  summarizeEvents,
  getRulesForPersonnelType,
  // Exposed for testing
  normLoc,
  findHitValue,
  FINGERTIP_LEFT_NORM,
  FINGERTIP_RIGHT_NORM,
};
