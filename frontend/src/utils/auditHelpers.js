/**
 * Shared audit-log classification helpers.
 * Used by both DashboardPage (trend chart) and SystemAuditorPage (metrics / export).
 * Keeping them here ensures both pages always count events the same way.
 */

export const ACCESS_CHANGE_ACTIONS = new Set([
  'ROLE_ASSIGN', 'ROLE_REMOVE',
  'PERM_REQUEST', 'PERM_UPDATE',
  'STATUS_CHANGE',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'MFA_TOGGLE', 'PASSWORD_CHANGE',
])

/** Returns true when the log entry represents a blocked / enforcement failure. */
export const isBlocked = (log) => {
  const r = String(log.result).toUpperCase()
  return r === 'FAILED' || r === 'ENFORCED'
}

/** Returns true when the log entry is an access / permission change event. */
export const isAccessChange = (log) =>
  ACCESS_CHANGE_ACTIONS.has(String(log.action).toUpperCase())
