/** Escape a string for safe use inside a RegExp (prevents regex injection / ReDoS). */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
