/**
 * frontend/src/services/authService.js
 * =====================================
 * Replaces the hardcoded CREDENTIALS map in LoginPage.jsx.
 * Calls the real RBAC FastAPI endpoints.
 * Manages tokens in memory (sessionStorage for tab persistence). 
 */

const API_BASE = import.meta.env.VITE_API_URL || "";
const RBAC     = `${API_BASE}/api/v1/rbac`;

// ─── Token storage (sessionStorage survives refresh, clears on tab close) ────
const storage = {
  getAccess:   () => sessionStorage.getItem("rbac_access"),
  getRefresh:  () => sessionStorage.getItem("rbac_refresh"),
  setTokens:   (access, refresh) => {
    sessionStorage.setItem("rbac_access",  access);
    sessionStorage.setItem("rbac_refresh", refresh);
  },
  clearTokens: () => {
    sessionStorage.removeItem("rbac_access");
    sessionStorage.removeItem("rbac_refresh");
    sessionStorage.removeItem("rbac_session_timeout");
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiCall(path, options = {}) {
  const token = storage.getAccess();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${RBAC}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  return res.json();
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

/**
 * login({ email, password, totpCode? })
 * Returns { role, user } on success.
 * Throws on bad credentials / locked accounts.
 * Returns { mfa_required: true } when MFA step is needed.
 */
export async function login({ email, password, totpCode = null }) {
  const body = { email, password };
  if (totpCode) body.totp_code = totpCode;

  const data = await fetch(`${RBAC}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) {
      const e = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(typeof e.detail === "string" ? e.detail : "Login failed");
    }
    return r.json();
  });

  // MFA step required
  if (data.mfa_required) {
    return { mfa_required: true, email };
  }

  // Store tokens and session timeout (expires_in is in seconds)
  storage.setTokens(data.token.access_token, data.token.refresh_token);
  if (data.token?.expires_in) {
    sessionStorage.setItem("rbac_session_timeout", String(data.token.expires_in));
  }

  // Derive the frontend route key from the user's first role
  const roleKey = data.user.roles?.[0]?.frontend_key || "it-admin";

  return {
    mfa_required: false,
    role: roleKey,
    user: data.user,
  };
}

export async function logout() {
  try {
    await apiCall("/auth/logout", { method: "POST" });
  } catch (_) { /* ignore if already expired */ }
  storage.clearTokens();
}

export async function refreshToken() {
  const rt = storage.getRefresh();
  if (!rt) throw new Error("No refresh token");
  const data = await fetch(`${RBAC}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  }).then((r) => r.ok ? r.json() : Promise.reject("Refresh failed"));
  storage.setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function getMe() {
  return apiCall("/auth/me");
}

// ─── Users CRUD ───────────────────────────────────────────────────────────────

export const users = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiCall(`/users${q ? "?" + q : ""}`);
  },
  get:    (id)       => apiCall(`/users/${id}`),
  create: (body)     => apiCall("/users",       { method: "POST",   body: JSON.stringify(body) }),
  update: (id, body) => apiCall(`/users/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
  delete: (id)       => apiCall(`/users/${id}`, { method: "DELETE" }),
  setStatus: (id, status, reason) =>
    apiCall(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
  toggleMFA: (id, enabled) =>
    apiCall(`/users/${id}/mfa`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  changePassword:  (id, current_password, new_password) =>
    apiCall(`/users/${id}/password`, { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  verifyPassword:  (id, current_password) =>
    apiCall(`/users/${id}/verify-password`, { method: "POST", body: JSON.stringify({ current_password }) }),
  sessions: (id) => apiCall(`/users/${id}/sessions`),
  activity: (id) => apiCall(`/users/${id}/activity`),
  stats:    ()   => apiCall("/users/stats"),
  getPermissions:    (id)       => apiCall(`/users/${id}/permissions`),
  updatePermissions: (id, body) => apiCall(`/users/${id}/permissions`, { method: "PUT", body: JSON.stringify(body) }),
};

// ─── Roles CRUD ───────────────────────────────────────────────────────────────

export const roles = {
  list:   ()         => apiCall("/roles"),
  get:    (id)       => apiCall(`/roles/${id}`),
  create: (body)     => apiCall("/roles",       { method: "POST",   body: JSON.stringify(body) }),
  update: (id, body) => apiCall(`/roles/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
  delete: (id)       => apiCall(`/roles/${id}`, { method: "DELETE" }),
  assignUser:  (rid, uid) => apiCall(`/roles/${rid}/users/${uid}`, { method: "POST"   }),
  removeUser:  (rid, uid) => apiCall(`/roles/${rid}/users/${uid}`, { method: "DELETE" }),
  permissions: (rid)      => apiCall(`/roles/${rid}/permissions`),
  updatePerms: (rid, body) =>
    apiCall(`/roles/${rid}/permissions`, { method: "PUT", body: JSON.stringify(body) }),
  getSettings:    (rid)      => apiCall(`/roles/${rid}/settings`),
  updateSettings: (rid, body) =>
    apiCall(`/roles/${rid}/settings`, { method: "PUT", body: JSON.stringify(body) }),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessions = {
  list:      (params = {}) => apiCall("/sessions?" + new URLSearchParams(params)),
  count:     ()            => apiCall("/sessions/active/count"),
  kill:      (id, reason)  => apiCall(`/sessions/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
};

// ─── Activity log ─────────────────────────────────────────────────────────────

export const activity = {
  list: (params = {}) => apiCall("/activity?" + new URLSearchParams(params)),
  get:  (id)          => apiCall(`/activity/${id}`),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboard = {
  rbacStats:    () => apiCall("/dashboard/stats"),
  loginStats:   () => { const tz = -new Date().getTimezoneOffset(); return apiCall(`/dashboard/login-stats?tz_offset=${tz}`); },
  loginHourly:  () => { const tz = -new Date().getTimezoneOffset(); return apiCall(`/dashboard/login-hourly?tz_offset=${tz}`); },
};

// ─── Auto-refresh interceptor ─────────────────────────────────────────────────
// Wraps every fetch to auto-refresh a 401 once
const _origFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const res = await _origFetch(url, opts);
  if (res.status === 401 && storage.getRefresh() && !url.includes("/auth/")) {
    try {
      await refreshToken();
      // Retry with new token
      const newOpts = {
        ...opts,
        headers: { ...opts.headers, Authorization: `Bearer ${storage.getAccess()}` },
      };
      return _origFetch(url, newOpts);
    } catch (_) {
      storage.clearTokens();
      window.location.reload();
    }
  }
  return res;
};

export { storage as tokenStorage };
