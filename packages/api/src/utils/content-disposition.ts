/**
 * Build a safe `Content-Disposition` value. Defends against CRLF / quote
 * injection in `filename` (VULN-001): non-printable / quote / control
 * characters are stripped from the ASCII fallback, and the full UTF-8
 * form is exposed via `filename*=` per RFC 5987. Browsers prefer
 * `filename*` when both are present.
 *
 * Used by `routes/attachments.ts` (inline serving) and
 * `routes/workspace.ts` (force download on dangerous extensions, VULN-003).
 */
export function contentDisposition(
  type: 'inline' | 'attachment',
  filename: string,
): string {
  // ASCII fallback: keep only printable safe ASCII excluding `"` and `\`.
  const ascii = filename.replace(/[^\x20-\x21\x23-\x5B\x5D-\x7E]/g, '_');
  // RFC 5987 percent-encoding for the UTF-8 form.
  const utf8 = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
