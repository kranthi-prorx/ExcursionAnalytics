// ─── Identity & Location Normalization (Backend) ─────────────────────────────
// CommonJS version of the frontend normalization utilities.
// Must be kept in sync with:
//   - src/lib/normalizeIdentity.ts
//   - src/lib/locationHelpers.ts

/**
 * Create a canonical key for grouping and comparison.
 * Unicode NFC → trim → collapse spaces → lowercase
 */
function normalizeKey(value) {
  if (!value) return '';
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Create a clean display value (preserves original casing).
 * Unicode NFC → trim → collapse spaces
 */
function cleanDisplayValue(value) {
  if (!value) return '';
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

// All known fingertip spelling variants (lowercase, normalized)
const FINGERTIP_VARIANTS = new Set([
  'left fingertips',
  'right fingertips',
  'left finger tips',
  'right finger tips',
]);

/**
 * Determine the logical location group.
 * All fingertip variants → 'Fingertips'.
 * Other locations pass through cleaned.
 */
function getLogicalLocation(raw) {
  const normalized = normalizeKey(raw);
  if (FINGERTIP_VARIANTS.has(normalized)) {
    return 'Fingertips';
  }
  return cleanDisplayValue(raw);
}

/**
 * Check if a location name is a fingertip variant.
 */
function isFingertipLocation(raw) {
  return FINGERTIP_VARIANTS.has(normalizeKey(raw));
}

module.exports = {
  normalizeKey,
  cleanDisplayValue,
  getLogicalLocation,
  isFingertipLocation,
  FINGERTIP_VARIANTS,
};
