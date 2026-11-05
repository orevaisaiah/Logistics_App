export type AdminRoleName = 'SUPER_ADMIN' | 'OPS' | 'FINANCE' | 'SUPPORT' | 'VERIFICATION'

// SUPER_ADMIN may do everything. Everyone else needs their role to be on the route's list.
// A route with an empty list is for super admins only.
export function isAdminAllowed(role: AdminRoleName | null | undefined, allowed: readonly AdminRoleName[]): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return allowed.includes(role)
}
