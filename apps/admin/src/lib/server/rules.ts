// The admin website passes admin calls to the logistics API, and nothing else.
// The API checks the signed-in admin's role on every call, so this list is a second lock, not the only one.
export function isAllowed(method: string, path: string): boolean {
  if (path.includes('..') || path.includes('%') || path.includes('//')) return false
  // Signing in has its own route, which puts the tokens in cookies instead of handing them to the page
  if (path === '/v1/admin/auth/login') return false
  if (!/^\/v1\/admin\/[A-Za-z0-9_/:.-]+$/.test(path)) return false
  return ['GET', 'POST', 'PATCH', 'PUT'].includes(method.toUpperCase())
}
