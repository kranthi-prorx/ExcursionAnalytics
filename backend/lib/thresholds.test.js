// ─── PM Monitoring Threshold Engine — Acceptance Tests ───────────────────────
// Tests all 27 acceptance scenarios from the requirements.
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
    { location: 'Left Finger Tips',  iso_class: 'ISO 7', hit_value: left,  alert_level: 2, action_level: 4 },
    { location: 'Right Finger Tips', iso_class: 'ISO 7', hit_value: right, alert_level: 2, action_level: 4 },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== ISO 5 Fingertip Tests ===');
// ═══════════════════════════════════════════════════════════════════════════════

// Test 1: ISO 5 L=0, R=0 → 0 Action events
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(0, 0, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 0, '#1  ISO 5 L=0 R=0 → 0 Action events');
}

// Test 2: ISO 5 L=1, R=0 → 1 Action event
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 0, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 1, '#2  ISO 5 L=1 R=0 → 1 Action event');
  const act = events.filter(e => e.severity === 'ACTION');
  assert(act[0].rule_key === 'iso5_left_fingertip_action', '#2b rule_key is iso5_left_fingertip_action');
}

// Test 3: ISO 5 L=1, R=1 → 2 Action events
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 1, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 2, '#3  ISO 5 L=1 R=1 → 2 Action events');
}

// Test 4: ISO 5 L=4, R=4 → 2 Action events, NOT 8
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(4, 4, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 2, '#4  ISO 5 L=4 R=4 → 2 Action events (not 8)');
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

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== ISO 7 Fingertip Tests ===');
// ═══════════════════════════════════════════════════════════════════════════════

// Test 7: ISO 7 L=0, R=0 → no events
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(0, 0);
  const events = calculateThresholdEvents(rec, hd);
  assert(events.length === 0, '#7  ISO 7 L=0 R=0 → 0 events');
}

// Test 8: ISO 7 L=1, R=0 → 1 Alert, 0 Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(1, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(alertCount === 1, '#8a ISO 7 L=1 R=0 → 1 Alert');
  assert(actionCount === 0, '#8b ISO 7 L=1 R=0 → 0 Action');
}

// Test 9: ISO 7 L=1, R=1 → 2 Alerts, 0 Action (combined=2, not > 3)
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(1, 1);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(alertCount === 2, '#9a ISO 7 L=1 R=1 → 2 Alerts');
  assert(actionCount === 0, '#9b ISO 7 L=1 R=1 → 0 Action');
}

// Test 10: ISO 7 L=2, R=2 → 2 Alerts, 1 Action (combined=4 > 3)
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 2);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(alertCount === 2, '#10a ISO 7 L=2 R=2 → 2 Alerts');
  assert(actionCount === 1, '#10b ISO 7 L=2 R=2 → 1 Action (combined=4)');
}

// Test 11: ISO 7 L=4, R=4 → 2 Alerts, exactly 1 Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(4, 4);
  const events = calculateThresholdEvents(rec, hd);
  const { alertCount, actionCount } = summarizeEvents(events);
  assert(alertCount === 2, '#11a ISO 7 L=4 R=4 → 2 Alerts');
  assert(actionCount === 1, '#11b ISO 7 L=4 R=4 → exactly 1 Action');
}

// Test 12: Individual ISO 7 L/R NEVER produce Action
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(10, 10);
  const events = calculateThresholdEvents(rec, hd);
  const individualActions = events.filter(e =>
    e.severity === 'ACTION' && (e.rule_key === 'iso7_left_fingertip_alert' || e.rule_key === 'iso7_right_fingertip_alert')
  );
  assert(individualActions.length === 0, '#12 Individual ISO 7 L/R never produce Action');
  const actions = events.filter(e => e.severity === 'ACTION');
  assert(actions.every(a => a.rule_key === 'iso7_combined_fingertips_action'), '#12b All ISO 7 Actions are combined only');
}

// Test 13: ISO 7 hits = combined once (L+R counted once through sum)
{
  const hd = makeCrimpingHits(4, 4);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso7Hits === 8, '#13 ISO 7 hit total = 8 (4+4 counted once)');
}

// Test 14: ISO 7 hits != L+R+Combined (no triple count)
{
  const hd = makeCrimpingHits(4, 4);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso7Hits !== 16, '#14a ISO 7 hits != 16 (no triple count)');
  assert(totals.iso7Hits !== 12, '#14b ISO 7 hits != 12');
  assert(totals.iso7Hits === 8, '#14c ISO 7 hits = 8');
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== Multiple Events per Person Tests ===');
// ═══════════════════════════════════════════════════════════════════════════════

// Test 15: 1 person with 3 action-level locations → 3 Action events
{
  const rec = makeRecord('Filling');
  // Left Fingertip ISO 5 = 1 (Action), Left Gown = 11 (Action), Left Sleeve = 4 (Action)
  const hd = makeFillingHits(1, 0, 11, 0, 4, 0);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 3, '#15 1 person, 3 action locations → 3 Action events');
}

// Test 16: Top Personnel should show 3 (verified via summarizeEvents)
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 0, 11, 0, 4, 0);
  const events = calculateThresholdEvents(rec, hd);
  const actionEvents = events.filter(e => e.severity === 'ACTION');
  assert(actionEvents.length === 3, '#16 Top Personnel action count = 3, not 1');
}

// Test 17: Events-over-time would display all 3
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(1, 1, 11, 11, 4, 4);
  const events = calculateThresholdEvents(rec, hd);
  const { actionCount } = summarizeEvents(events);
  assert(actionCount === 6, '#17 All 6 locations at action level → 6 Action events');
}

// Test 18: Same rule_key does NOT create duplicates
{
  const rec = makeRecord('Filling');
  const hd = makeFillingHits(5, 3, 0, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const ruleKeys = events.map(e => e.rule_key);
  const unique = new Set(ruleKeys);
  assert(ruleKeys.length === unique.size, '#18 No duplicate rule_keys');
}

// Test 19: Action supersedes Alert for gown (not double-counted)
{
  const rec = makeRecord('Filling');
  // Left Gown = 12 (>= 11 → Action, also >= 6 → Alert, but Action supersedes)
  const hd = makeFillingHits(0, 0, 12, 0, 0, 0);
  const events = calculateThresholdEvents(rec, hd);
  const gownEvents = events.filter(e => e.location === 'Left Gown');
  assert(gownEvents.length === 1, '#19a Left Gown at action level → exactly 1 event');
  assert(gownEvents[0].severity === 'ACTION', '#19b That event is ACTION, not ALERT');
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== ISO 7 Special Coexistence Test ===');
// ═══════════════════════════════════════════════════════════════════════════════

// Test: ISO 7 individual alerts + combined action can coexist
{
  const rec = makeRecord('Crimping');
  const hd = makeCrimpingHits(2, 2);
  const events = calculateThresholdEvents(rec, hd);
  const alerts = events.filter(e => e.severity === 'ALERT');
  const actions = events.filter(e => e.severity === 'ACTION');
  assert(alerts.length === 2, 'ISO 7 L=2 R=2 → 2 individual Alerts');
  assert(actions.length === 1, 'ISO 7 L=2 R=2 → 1 combined Action');
  assert(events.length === 3, 'ISO 7 L=2 R=2 → 3 total events (alerts + action coexist)');
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== Hit Totals Tests ===');
// ═══════════════════════════════════════════════════════════════════════════════

// ISO 5 hit totals
{
  const hd = makeFillingHits(4, 4, 0, 0, 0, 0);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso5Hits === 8, 'ISO 5 fingertip hits = 8 (4+4)');
  assert(totals.iso7Hits === 0, 'ISO 7 hits = 0 when only ISO 5 has values');
  assert(totals.totalHits === 8, 'Total hits = 8');
}

// Mixed ISO 5 + ISO 7 hit totals
{
  const hd = makeFillingHits(2, 3, 5, 0, 2, 0);
  const totals = calculatePmHitTotals(hd);
  assert(totals.iso5Hits === 5, 'ISO 5 hits = 5 (2+3)');
  assert(totals.iso7Hits === 7, 'ISO 7 hits = 7 (5+0+2+0)');
  assert(totals.totalHits === 12, 'Total hits = 12');
}

// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error('SOME TESTS FAILED!');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED!');
}
