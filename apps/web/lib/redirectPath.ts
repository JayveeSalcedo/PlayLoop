/**
 * Validates a `redirect`/`redirectTo` query value before it's ever handed to
 * redirect(): must be a same-site path, not a protocol-relative or
 * backslash-prefixed URL (both of which browsers can treat as an off-site
 * redirect — e.g. "//evil.com" or "/\evil.com").
 */
export function safeRedirectPath(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}
