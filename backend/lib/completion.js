// ─── Environmental Monitoring Completion Status Calculator ────────────────────
// Determines whether a monitoring session is COMPLETE or INCOMPLETE.
// Missing measurements are listed explicitly — NEVER stored as zero.
//
// For BATCH monitoring:
//   Expected: ISO 5 Viable Air, ISO 5 Nonviable 0.5µm, ISO 5 Nonviable 5µm,
//             ISO 7 Viable Air, ISO 7 Nonviable 0.5µm, ISO 7 Nonviable 5µm.
//   Note: ISO 8 is NOT expected for batch monitoring. ISO 8 is routine monthly only.
//
// For ROUTINE_MONTHLY / ROUTINE_WEEKLY / OTHER:
//   Completeness is based on the location profiles associated with the session.
//   If no profiles are attached, session is always COMPLETE (no expected set).

'use strict';

/**
 * Calculate completion status and list missing requirements for a session.
 *
 * @param {object} session  - { id, monitoring_context }
 * @param {Array}  samples  - Array of env_samples rows for the session (non-deleted)
 *                            Each has: { sample_type, iso_class, viable_cfu, surface_cfu,
 *                                        particle_count_0_5, particle_count_5_0 }
 * @param {Array}  [locationProfiles] - Optional array of linked env_location_profiles
 * @returns {{ completion_status: 'COMPLETE'|'INCOMPLETE', missing_requirements: string[] }}
 */
function calculateCompletionStatus(session, samples, locationProfiles = []) {
  const context = (session.monitoring_context || '').toUpperCase();

  // ── BATCH monitoring: evaluate against expected ISO 5 + ISO 7 set ────────
  if (context === 'BATCH') {
    return calculateBatchCompletion(samples, locationProfiles);
  }

  // ── ROUTINE_MONTHLY: evaluate against location profiles if any ───────────
  if (context === 'ROUTINE_MONTHLY') {
    return calculateRoutineCompletion(samples, locationProfiles, 'ROUTINE_MONTHLY');
  }

  // ── ROUTINE_WEEKLY: evaluate against location profiles if any ────────────
  if (context === 'ROUTINE_WEEKLY') {
    return calculateRoutineCompletion(samples, locationProfiles, 'ROUTINE_WEEKLY');
  }

  // ── OTHER: no strict expected set; always COMPLETE unless zero samples ────
  if (samples.length === 0) {
    return { completion_status: 'INCOMPLETE', missing_requirements: ['At least one sample result is required'] };
  }
  return { completion_status: 'COMPLETE', missing_requirements: [] };
}

/**
 * Batch completion: expects ISO 5 + ISO 7 viable air AND nonviable air.
 */
function calculateBatchCompletion(samples, locationProfiles) {
  const missing = [];
  const activeSamples = samples.filter(s => !s.deleted_at);

  // Helper: find matching sample
  const has = (type, iso, field) => activeSamples.some(s =>
    s.sample_type === type &&
    s.iso_class === iso &&
    s[field] !== null &&
    s[field] !== undefined
  );

  // Expected for each ISO class
  const isoClasses = ['ISO 5', 'ISO 7'];

  // If location profiles are provided, use their allowed_sample_types to scope expectations
  if (locationProfiles && locationProfiles.length > 0) {
    const viableProfiles = locationProfiles.filter(p =>
      p.allowed_sample_types && p.allowed_sample_types.includes('VIABLE_AIR')
    );
    const nonviableProfiles = locationProfiles.filter(p =>
      p.allowed_sample_types && p.allowed_sample_types.includes('NONVIABLE_AIR')
    );

    for (const iso of isoClasses) {
      const viableExpected = viableProfiles.some(p => p.iso_class === iso);
      const nonviableExpected = nonviableProfiles.some(p => p.iso_class === iso);

      if (viableExpected && !has('VIABLE_AIR', iso, 'viable_cfu')) {
        missing.push(`${iso} Viable Air (CFU)`);
      }
      if (nonviableExpected) {
        if (!has('NONVIABLE_AIR', iso, 'particle_count_0_5')) {
          missing.push(`${iso} Nonviable Air — 0.5 µm`);
        }
        if (!has('NONVIABLE_AIR', iso, 'particle_count_5_0')) {
          missing.push(`${iso} Nonviable Air — 5.0 µm`);
        }
      }
    }
  } else {
    // Fallback: expect all 6 standard batch monitoring components
    for (const iso of isoClasses) {
      if (!has('VIABLE_AIR', iso, 'viable_cfu')) {
        missing.push(`${iso} Viable Air (CFU)`);
      }
      if (!has('NONVIABLE_AIR', iso, 'particle_count_0_5')) {
        missing.push(`${iso} Nonviable Air — 0.5 µm`);
      }
      if (!has('NONVIABLE_AIR', iso, 'particle_count_5_0')) {
        missing.push(`${iso} Nonviable Air — 5.0 µm`);
      }
    }
  }

  if (missing.length === 0) {
    return { completion_status: 'COMPLETE', missing_requirements: [] };
  }
  return { completion_status: 'INCOMPLETE', missing_requirements: missing };
}

/**
 * Routine completion: evaluate against linked location profiles.
 * If no profiles, any submitted samples = COMPLETE.
 */
function calculateRoutineCompletion(samples, locationProfiles, contextType) {
  const activeSamples = samples.filter(s => !s.deleted_at);

  if (!locationProfiles || locationProfiles.length === 0) {
    // No profiles configured → completion can't be evaluated strictly;
    // treat as complete if at least one sample exists.
    if (activeSamples.length === 0) {
      return { completion_status: 'INCOMPLETE', missing_requirements: ['At least one sample result is required'] };
    }
    return { completion_status: 'COMPLETE', missing_requirements: [] };
  }

  const missing = [];
  const contextKey = contextType === 'ROUTINE_WEEKLY' ? 'ROUTINE_WEEKLY' : 'ROUTINE_MONTHLY';

  // For each profile that allows this context, check that at least one sample exists
  const relevantProfiles = locationProfiles.filter(p =>
    p.active &&
    p.allowed_contexts &&
    p.allowed_contexts.includes(contextKey)
  );

  for (const profile of relevantProfiles) {
    const profileSamples = activeSamples.filter(s =>
      s.location_profile_id === profile.id
    );

    const types = profile.allowed_sample_types || [];

    if (types.includes('VIABLE_AIR')) {
      const hasViable = profileSamples.some(s =>
        s.sample_type === 'VIABLE_AIR' && s.viable_cfu !== null && s.viable_cfu !== undefined
      );
      if (!hasViable) {
        missing.push(`${profile.location_code} (${profile.iso_class}) Viable Air`);
      }
    }

    if (types.includes('NONVIABLE_AIR')) {
      const has05 = profileSamples.some(s =>
        s.sample_type === 'NONVIABLE_AIR' && s.particle_count_0_5 !== null && s.particle_count_0_5 !== undefined
      );
      const has50 = profileSamples.some(s =>
        s.sample_type === 'NONVIABLE_AIR' && s.particle_count_5_0 !== null && s.particle_count_5_0 !== undefined
      );
      if (!has05) missing.push(`${profile.location_code} (${profile.iso_class}) Nonviable 0.5 µm`);
      if (!has50) missing.push(`${profile.location_code} (${profile.iso_class}) Nonviable 5.0 µm`);
    }

    if (types.includes('SURFACE')) {
      const hasSurface = profileSamples.some(s =>
        s.sample_type === 'SURFACE' && s.surface_cfu !== null && s.surface_cfu !== undefined
      );
      if (!hasSurface) {
        missing.push(`${profile.location_code} (${profile.iso_class}) Surface`);
      }
    }
  }

  if (missing.length === 0) {
    return { completion_status: 'COMPLETE', missing_requirements: [] };
  }
  return { completion_status: 'INCOMPLETE', missing_requirements: missing };
}

module.exports = { calculateCompletionStatus };
