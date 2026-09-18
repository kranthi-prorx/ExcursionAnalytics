// â”€â”€â”€ PM Monitoring Threshold Engine â€” Acceptance Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tests all acceptance scenarios for the updated ISO 7 Crimper/Helper thresholds.
//
// NEW THRESHOLDS (2026-09-18):
//   Combined ISO 7 Crimper/Helper fingertips:
//     Alert:  combined > 3  (combined >= 4)
//     Action: combined > 5  (combined >= 6)
//   Individual L/R events: NONE (combined is the sole event)
//
// Run: node backend/lib/thresholds.test.js

'use strict';

const { calculateThresholdEvents, calculatePmHitTotals, summarizeEvents } = require('./thresholds');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log('  PASS:', testName);
  } else {
    failed++;
    console.error('  FAIL:', testName);
  }
}

function makeRecord(personnelType, id) {
  return {
    id: id || 'test-rec-1',
    name: 'Test Person',
    lot_number: 'LOT-001',
    date_of_batch: '2026-01-15',
    personnel_type: personnelType,
    iso_class: personnelType === 'Filling' ? 'ISO 5' : 'ISO 7',
  };
}

function makeFillingHits(leftFinger, rightFinger, leftGown, rightGown, leftSleeve, rightSleeve) {
  return [
    { location: 'Left Fingertips',  iso_class: 'ISO 5', hit_value: leftFinger,  alert_level: 0, action_level: 1 },
    { location: 'Right Fingertips', iso_class: 'ISO 5', hit_value: rightFinger, alert_level: 0, action_level: 1 },
    { location: 'Left Gown',       iso_class: 'ISO 7', hit_value: leftGown,    alert_level: 6, action_level: 11 },
    { location: 'Right Gown',      iso_class: 'ISO 7', hit_value: rightGown,   alert_level: 6, action_level: 11 },
    { location: 'Left Sleeve',     iso_class: 'ISO 7', hit_value: leftSleeve,  alert_level: 2, action_level: 4 },
    { location: 'Right Sleeve',    iso_class: 'ISO 7', hit_value: rightSleeve, alert_level: 2, action_level: 4 },
  ];
}

function makeCrimpingHits(left, right) {
  return [
    { location: 'Left Finger Tips',  iso_class: 'ISO 7', hit_value: left,  alert_level: 0, action_level: 9999 },
    { location: 'Right Finger Tips', iso_class: 'ISO 7', hit_value: right, alert_level: 0, action_level: 9999 },
  ];
}

// ===============================================================================
console.log('\n=== ISO 5 Fingertip Tests (unchanged â€” Acceptance Test #11) ===');
// ===============================================================================

// Test 1: ISO 5 L=0, R=0 â†’ 0 Action events
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(0, 0, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 0, '#1  ISO 5 L=0 R=0 â†’ 0 Action events');
}

// Test 2: ISO 5 L=1, R=0 â†’ 1 Action event
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 0, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 1, '#2  ISO 5 L=1 R=0 â†’ 1 Action event');
  const act = events.filter(e => e.severity === 'ACTION');
  assert(act[0].rule_key === 'iso5_left_fingertip_action', '#2b rule_key is iso5_left_fingertip_action');
}

// Test 3: ISO 5 L=1, R=1 â†’ 2 Action events
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 1, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 2, '#3  ISO 5 L=1 R=1 â†’ 2 Action events');
}

// Test 4: ISO 5 L=4, R=4 â†’ 2 Action events, NOT 8
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(4, 4, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 2, '#4  ISO 5 L=4 R=4 â†’ 2 Action events (not 8)');
}

// Test 5: No combined ISO 5 field
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(4, 4, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const combined = events.filter(e => e.rule_key && e.rule_key.includes('combined') && e.iso_class === 'ISO 5');
  assert(combined.length === 0, '#5  No combined ISO 5 event');
}

// Test 6: No combined ISO 5 event (duplicate check)
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 1, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const ruleKeys = events.map(e => e.rule_key);
  assert(!ruleKeys.some(k => k.includes('iso5') && k.includes('combined')), '#6  No combined ISO 5 event generated');
}

// ===============================================================================
console.log('\n=== ISO 7 Combined Fingertip Tests â€” NEW THRESHOLDS (Alert >3 / Action >5) ===');
// ===============================================================================

// Acceptance Test 1: Left 0 + Right 0 = 0 â†’ Normal
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 0,  'AT#1  L=0 R=0 Combined=0 â†’ 0 events (Normal)');
  assert(alertCount  === 0,    'AT#1a L=0 R=0 â†’ 0 Alerts');
  assert(actionCount === 0,    'AT#1b L=0 R=0 â†’ 0 Actions');
}

// Acceptance Test 2: Left 1 + Right 1 = 2 â†’ Normal
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(1, 1);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 0,  'AT#2  L=1 R=1 Combined=2 â†’ 0 events (Normal)');
  assert(alertCount  === 0,    'AT#2a â†’ 0 Alerts');
  assert(actionCount === 0,    'AT#2b â†’ 0 Actions');
}

// Acceptance Test 3: Left 2 + Right 1 = 3 â†’ Normal
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 1);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 0,  'AT#3  L=2 R=1 Combined=3 â†’ 0 events (Normal)');
  assert(alertCount  === 0,    'AT#3a â†’ 0 Alerts');
  assert(actionCount === 0,    'AT#3b â†’ 0 Actions');
}

// Acceptance Test 4: Left 2 + Right 2 = 4 â†’ Alert
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 2);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 1,  'AT#4  L=2 R=2 Combined=4 â†’ 1 event');
  assert(alertCount  === 1,    'AT#4a Combined=4 â†’ Alert');
  assert(actionCount === 0,    'AT#4b Combined=4 â†’ NOT Action');
  assert(events[0].rule_key === 'iso7_combined_fingertips_alert', 'AT#4c rule_key = iso7_combined_fingertips_alert');
  assert(events[0].measured_value === 4, 'AT#4d measured_value = 4');
}

// Acceptance Test 5: Left 3 + Right 2 = 5 â†’ Alert
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(3, 2);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 1,  'AT#5  L=3 R=2 Combined=5 â†’ 1 event');
  assert(alertCount  === 1,    'AT#5a Combined=5 â†’ Alert');
  assert(actionCount === 0,    'AT#5b Combined=5 â†’ NOT Action');
}

// Acceptance Test 6: Left 3 + Right 3 = 6 â†’ Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(3, 3);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 1,  'AT#6  L=3 R=3 Combined=6 â†’ 1 event');
  assert(alertCount  === 0,    'AT#6a Combined=6 â†’ 0 Alerts (Action supersedes)');
  assert(actionCount === 1,    'AT#6b Combined=6 â†’ 1 Action');
  assert(events[0].rule_key === 'iso7_combined_fingertips_action', 'AT#6c rule_key = iso7_combined_fingertips_action');
  assert(events[0].measured_value === 6, 'AT#6d measured_value = 6');
}

// Acceptance Test 7: Left 4 + Right 4 = 8 â†’ exactly ONE Action event
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(4, 4);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(events.length === 1,  'AT#7  L=4 R=4 Combined=8 â†’ exactly 1 event');
  assert(alertCount  === 0,    'AT#7a Combined=8 â†’ 0 Alerts');
  assert(actionCount === 1,    'AT#7b Combined=8 â†’ exactly 1 Action');
}

// Acceptance Test 8: Combined 4 does NOT create an Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 2);  // combined=4
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 0, 'AT#8  Combined=4 â†’ 0 Actions (Alert only)');
}

// Acceptance Test 9: Combined 5 does NOT create an Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(3, 2);  // combined=5
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 0, 'AT#9  Combined=5 â†’ 0 Actions (Alert only)');
}

// Acceptance Test 10: Combined 6 creates an Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(3, 3);  // combined=6
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 1, 'AT#10 Combined=6 â†’ 1 Action');
}

// â”€â”€â”€ No individual ISO 7 L/R events (Acceptance Test 16) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(10, 10);
  const events = calculateThresholdEvents(rec, hd);
  const individualEvents = events.filter(e =>
    e.rule_key === 'iso7_left_fingertip_alert'  ||
    e.rule_key === 'iso7_right_fingertip_alert' ||
    e.rule_key === 'iso7_left_fingertip_action' ||
    e.rule_key === 'iso7_right_fingertip_action'
  );
  assert(individualEvents.length === 0,         'AT#16  No individual ISO 7 L/R events');
  assert(events.length === 1,                   'AT#16b Exactly 1 combined event for L=10 R=10');
  assert(events[0].rule_key === 'iso7_combined_fingertips_action', 'AT#16c The 1 event is combined action');
}

// â”€â”€â”€ Boundary: Combined exactly 3 â†’ Normal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 1);  // combined=3
  const events = calculateThresholdEvents(rec, hd);
  assert(events.length === 0, 'Boundary: Combined=3 â†’ Normal (0 events)');
}

// â”€â”€â”€ Boundary: Combined exactly 4 â†’ Alert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 2);  // combined=4
  const events = calculateThresholdEvents(rec, hd);
  assert(events.filter(e => e.severity === 'ALERT').length  === 1, 'Boundary: Combined=4 â†’ 1 Alert');
  assert(events.filter(e => e.severity === 'ACTION').length === 0, 'Boundary: Combined=4 â†’ 0 Actions');
}

// â”€â”€â”€ Boundary: Combined exactly 5 â†’ Alert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(3, 2);  // combined=5
  const events = calculateThresholdEvents(rec, hd);
  assert(events.filter(e => e.severity === 'ALERT').length  === 1, 'Boundary: Combined=5 â†’ 1 Alert');
  assert(events.filter(e => e.severity === 'ACTION').length === 0, 'Boundary: Combined=5 â†’ 0 Actions');
}

// â”€â”€â”€ Boundary: Combined exactly 6 â†’ Action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(3, 3);  // combined=6
  const events = calculateThresholdEvents(rec, hd);
  assert(events.filter(e => e.severity === 'ACTION').length === 1, 'Boundary: Combined=6 â†’ 1 Action');
  assert(events.filter(e => e.severity === 'ALERT').length  === 0, 'Boundary: Combined=6 â†’ 0 Alerts (Action supersedes)');
}

// ===============================================================================
console.log('\n=== ISO 7 Hit Totals ===');
// ===============================================================================

{
  const hd = makeCrimpingHits(4, 4);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso7Hits === 8, 'ISO 7 hit total = 8 (4+4 counted once)');
  assert(totals.iso7Hits !== 16, 'ISO 7 hits != 16 (no triple count)');
  assert(totals.iso7Hits !== 12, 'ISO 7 hits != 12');
}

// ===============================================================================
console.log('\n=== Gown & Sleeve Unchanged Tests (Acceptance Test #12) ===');
// ===============================================================================

{
  const rec = makeRecord('Filling');

  // Left Gown: Alert >= 6, Action >= 11
  const hdGownAlert = makeFillingHits(0, 0, 6, 0, 0, 0);
  const evGownAlert = calculateThresholdEvents(rec, hdGownAlert);
  assert(evGownAlert.some(e => e.severity === 'ALERT'  && e.location === 'Left Gown'), 'AT#12a Left Gown=6 â†’ Alert (unchanged)');

  const hdGownAction = makeFillingHits(0, 0, 11, 0, 0, 0);
  const evGownAction = calculateThresholdEvents(rec, hdGownAction);
  assert(evGownAction.some(e => e.severity === 'ACTION' && e.location === 'Left Gown'), 'AT#12b Left Gown=11 â†’ Action (unchanged)');

  // Left Sleeve: Alert >= 2, Action >= 4
  const hdSleeveAlert = makeFillingHits(0, 0, 0, 0, 2, 0);
  const evSleeveAlert = calculateThresholdEvents(rec, hdSleeveAlert);
  assert(evSleeveAlert.some(e => e.severity === 'ALERT'  && e.location === 'Left Sleeve'), 'AT#12c Left Sleeve=2 â†’ Alert (unchanged)');

  const hdSleeveAction = makeFillingHits(0, 0, 0, 0, 4, 0);
  const evSleeveAction = calculateThresholdEvents(rec, hdSleeveAction);
  assert(evSleeveAction.some(e => e.severity === 'ACTION' && e.location === 'Left Sleeve'), 'AT#12d Left Sleeve=4 â†’ Action (unchanged)');
}

// ===============================================================================
console.log('\n=== Multi-location Filling Tests ===');
// ===============================================================================

// 1 person with 3 action-level locations â†’ 3 Action events
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 0, 11, 0, 4, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 3, 'Filling: 3 action locations â†’ 3 Action events');
}

// Action supersedes Alert for gown
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(0, 0, 12, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const gownEvents = events.filter(e => e.location === 'Left Gown');
  assert(gownEvents.length === 1, 'Left Gown at action level â†’ exactly 1 event');
  assert(gownEvents[0].severity === 'ACTION', 'That event is ACTION, not ALERT');
}

// No duplicate rule_keys
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(5, 3, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const ruleKeys = events.map(e => e.rule_key);
  const unique = new Set(ruleKeys);
  assert(ruleKeys.length === unique.size, 'No duplicate rule_keys');
}

// ===============================================================================
console.log('\n=== Hit Totals Tests ===');
// ===============================================================================

{
  const hd = makeFillingHits(4, 4, 0, 0, 0, 0);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso5Hits === 8,  'ISO 5 fingertip hits = 8 (4+4)');
  assert(totals.iso7Hits === 0,  'ISO 7 hits = 0 when only ISO 5 has values');
  assert(totals.totalHits === 8, 'Total hits = 8');
}

{
  const hd = makeFillingHits(2, 3, 5, 0, 2, 0);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso5Hits  === 5,  'ISO 5 hits = 5 (2+3)');
  assert(totals.iso7Hits  === 7,  'ISO 7 hits = 7 (5+0+2+0)');
  assert(totals.totalHits === 12, 'Total hits = 12');
}

// ===============================================================================

console.log('\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error('SOME TESTS FAILED!');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED!');
}

