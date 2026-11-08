// The website's server passes only these calls on to the logistics API.
// Admin, rider and token endpoints are deliberately not reachable from a browser.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const RULES: { methods: string[]; pattern: RegExp }[] = [
  { methods: ['POST'], pattern: /^\/v1\/auth\/otp\/request$/ },
  { methods: ['GET'], pattern: /^\/v1\/me$/ },
  { methods: ['GET', 'POST', 'PATCH'], pattern: /^\/v1\/business$/ },
  { methods: ['GET', 'POST'], pattern: /^\/v1\/deliveries$/ },
  { methods: ['POST'], pattern: /^\/v1\/deliveries\/quote$/ },
  { methods: ['GET'], pattern: new RegExp(`^/v1/deliveries/${UUID}$`, 'i') },
  { methods: ['POST'], pattern: new RegExp(`^/v1/deliveries/${UUID}/cancel$`, 'i') },
  { methods: ['GET'], pattern: /^\/v1\/wallet$/ },
  { methods: ['GET'], pattern: /^\/v1\/wallet\/entries$/ },
  { methods: ['POST'], pattern: /^\/v1\/wallet\/topups$/ },
  { methods: ['GET'], pattern: /^\/v1\/wallet\/topups\/[A-Za-z0-9_-]{8,100}\/verify$/ },
  { methods: ['GET'], pattern: /^\/v1\/track\/[A-Za-z0-9-]{6,20}$/ },
]

export function isAllowed(method: string, path: string): boolean {
  if (path.includes('..') || path.includes('%') || path.includes('//')) return false
  return RULES.some((rule) => rule.methods.includes(method.toUpperCase()) && rule.pattern.test(path))
}
