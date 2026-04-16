export const CSRF_COOKIE = 'buck_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function readCsrfCookie(): string {
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match
    ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1))
    : '';
}
