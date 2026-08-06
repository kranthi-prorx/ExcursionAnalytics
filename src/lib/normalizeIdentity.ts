// ─── Identity Normalization ──────────────────────────────────────────────────
// Shared normalization for personnel names and lot numbers.
// Eliminates duplicate analytical identities caused by:
//   - Uppercase vs lowercase
//   - Leading/trailing spaces
//   - Repeated internal spaces
//   - Unicode normalization differences
//
// Examples:
//   "Jane Smith" / "jane smith" / "  Jane  Smith  " → key: "jane smith"
//   "LOT-100" / "lot-100" / " LOT-100 " → key: "lot-100"

/**
 * Create a canonical key for grouping and comparison.
 * 1. Unicode NFC normalize
 * 2. Trim leading/trailing whitespace
 * 3. Collapse repeated internal whitespace
 * 4. Lowercase
 */
export function normalizeKey(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Create a clean display value (preserves original casing).
 * 1. Unicode NFC normalize
 * 2. Trim leading/trailing whitespace
 * 3. Collapse repeated internal whitespace
 */
export function cleanDisplayValue(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}
