export type AdminRole = 'SUPER_ADMIN' | 'OPS' | 'FINANCE' | 'SUPPORT' | 'VERIFICATION'

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super admin',
  OPS: 'Operations',
  FINANCE: 'Finance',
  SUPPORT: 'Support',
  VERIFICATION: 'Rider verification',
}

// Which roles may use which part of the panel. This only decides what is SHOWN: the API checks
// every request again, so hiding a button never replaces a real permission check.
// An empty list means super admins only.
export const ACCESS = {
  overview: ['OPS', 'FINANCE', 'SUPPORT', 'VERIFICATION'],
  dispatchBoard: ['OPS', 'SUPPORT'],
  dispatchActions: ['OPS'],
  deliveries: ['OPS', 'SUPPORT', 'FINANCE'],
  refundSettle: ['FINANCE'],
  riderReview: ['VERIFICATION'],
  riderPerformance: ['OPS', 'SUPPORT'],
  riderSuspend: ['OPS'],
  finance: ['FINANCE'],
  pricing: ['OPS'],
  businesses: ['OPS', 'SUPPORT', 'FINANCE'],
  businessCredit: ['FINANCE'],
  businessStatus: ['OPS', 'FINANCE'],
  reports: ['OPS', 'FINANCE'],
  staff: [],
  audit: [],
} as const satisfies Record<string, readonly AdminRole[]>

export type Area = keyof typeof ACCESS

export function isAllowed(role: AdminRole | null | undefined, allowed: readonly AdminRole[]): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return allowed.includes(role)
}

export function canAccess(role: AdminRole | null | undefined, area: Area): boolean {
  return isAllowed(role, ACCESS[area])
}
