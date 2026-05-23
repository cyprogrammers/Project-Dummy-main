/**
 * frontend/src/pages/LoginPage.jsx  
 * =================================================
 * Drop-in replacement for the existing LoginPage.jsx.
 * Now calls the real RBAC API instead of hardcoded credentials.
 * Supports: normal login, MFA second-factor step, locked-account messages.
 */
import { useState, useEffect } from 'react'
import logo from '../components/images/cut-logo.jpg'
import { login } from '../services/authService'

export default function LoginPage({ onLogin }) {
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [totpCode,    setTotpCode]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [mfaStep,     setMfaStep]     = useState(false)   // true = show TOTP input
  const [mfaEmail,    setMfaEmail]    = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [popiaScore,  setPopiaScore]  = useState('—')

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    fetch(`/api/v1/popia/evaluate?since=${encodeURIComponent(midnight)}`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.overall_score != null) setPopiaScore(`${d.overall_score}%`) })
      .catch(() => {})
  }, [])

  const formattedTime = currentTime.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  // ── Step 1: email + password ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login({ email, password })
      if (result.mfa_required) {
        setMfaEmail(result.email)
        setMfaStep(true)
      } else {
        onLogin(result.role, result.user)
      }
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: TOTP code ────────────────────────────────────────────────────
  const handleMFA = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login({ email: mfaEmail, password, totpCode })
      if (result.mfa_required) {
        setError('Invalid MFA code — please try again')
      } else {
        onLogin(result.role, result.user)
      }
    } catch (err) {
      setError(err.message || 'MFA verification failed')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      {/* Left Panel */}
      <div style={styles.leftPanel}>
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <div style={styles.logoName}>AITRMS</div>
            <div style={styles.logoSub}>Automated IT Risk Management</div>
          </div>
        </div>

        <div style={styles.headline}>
          <span style={styles.headlineWhite}>Secure Your{'\n'}University's{'\n'}</span>
          <span style={styles.headlineTeal}>Digital Infrastructure</span>
        </div>

        <p style={styles.description}>
          Continuous vulnerability scanning, automated compliance enforcement, and real-time incident
          alerting — purpose-built for Chinhoyi University of Technology.
        </p>

        <div style={styles.statsGrid}>
          {[
            { value: '—', color: '#ef4444', label: 'Critical CVEs Active'   },
            { value: '—', color: '#3b82f6', label: 'Endpoints Monitored'    },
            { value: popiaScore, color: '#14b8a6', label: 'POPIA Compliance'       },
            { value: '—', color: '#f59e0b', label: 'Open Incidents'         },
          ].map(({ value, color, label }) => (
            <div key={label} style={styles.statCard}>
              <div style={{ ...styles.statValue, color }}>{value}</div>
              <div style={styles.statLabel}>{label}</div>
            </div>
          ))}
        </div>

        <div style={styles.statusBar}>
          <span style={styles.statusDot} />
          <span>All systems operational &nbsp;·&nbsp; {formattedTime}</span>
        </div>

        <div style={styles.badgesRow}>
          {['GDPR', 'POPIA', 'ISO 27001', 'TLS 1.3'].map(b => (
            <span key={b} style={styles.badge}>{b}</span>
          ))}
        </div>

        <p style={styles.leftFooter}>
          © 2026 Chinhoyi University of Technology · IT Security Division. All rights reserved.
        </p>
      </div>

      {/* Right Panel */}
      <div style={styles.rightPanel}>
        <div style={styles.card}>
          {/* Logo */}
          <div style={styles.lockIconWrapper}>
            <img src={logo} alt="CUT Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          {!mfaStep ? (
            <>
              <h2 style={styles.cardTitle}>Welcome Back</h2>
              <p style={styles.cardSubtitle}>Sign in to access the AITRMS security dashboard</p>

              {/* Last session banner */}
              <div style={styles.sessionBanner}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={styles.sessionText}>
                  Secured by <strong style={{ color: '#16a34a' }}>AITRMS RBAC &amp; Keycloak SSO</strong>
                </span>
              </div>

              <form onSubmit={handleSubmit} style={styles.form}>
                {/* Email */}
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Institutional Email</label>
                  <div style={styles.inputWrapper}>
                    <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <input
                      type="email" placeholder="you@cut.ac.zw"
                      value={email} onChange={e => setEmail(e.target.value)}
                      required style={styles.input}
                    />
                  </div>
                </div>

                {/* Password */}
                <div style={styles.fieldGroup}>
                  <div style={styles.passwordLabelRow}>
                    <label style={styles.label}>Password</label>
                    <a href="#" style={styles.forgotLink}>Forgot password?</a>
                  </div>
                  <div style={styles.inputWrapper}>
                    <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type={showPass ? 'text' : 'password'} placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      required style={{ ...styles.input, paddingRight: '44px' }}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={styles.eyeBtn} tabIndex={-1}>
                      {showPass
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      }
                    </button>
                  </div>
                </div>

                {error && <div style={styles.errorBanner}>{error}</div>}

                <button type="submit" disabled={loading} style={{ ...styles.signInBtn, opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          ) : (
            /* ── MFA Step ───────────────────────────────────────────────── */
            <>
              <h2 style={styles.cardTitle}>Two-Factor Authentication</h2>
              <p style={styles.cardSubtitle}>Enter the 6-digit code from your authenticator app</p>

              <div style={{ ...styles.sessionBanner, background: '#fff7ed', borderColor: '#fed7aa' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span style={{ fontSize: '12px', color: '#374151' }}>
                  MFA required for <strong style={{ color: '#f97316' }}>{mfaEmail}</strong>
                </span>
              </div>

              <form onSubmit={handleMFA} style={styles.form}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Authenticator Code</label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]{6}"
                    placeholder="000000" maxLength={6}
                    value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    style={{
                      ...styles.input, paddingLeft: '14px', textAlign: 'center',
                      fontSize: '24px', fontWeight: '700', letterSpacing: '8px',
                    }}
                  />
                </div>

                {error && <div style={styles.errorBanner}>{error}</div>}

                <button type="submit" disabled={loading || totpCode.length !== 6}
                  style={{ ...styles.signInBtn, opacity: (loading || totpCode.length !== 6) ? 0.6 : 1 }}>
                  {loading ? 'Verifying…' : 'Verify Code'}
                </button>

                <button type="button" onClick={() => { setMfaStep(false); setTotpCode(''); setError(''); setEmail(''); setPassword(''); setMfaEmail(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#6b7280', marginTop: '4px', textDecoration: 'underline' }}>
                  ← Back to login
                </button>
              </form>
            </>
          )}

          {/* Security footer */}
          <div style={styles.securityRow}>
            <span style={styles.securityItem}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Protected by CUT SSO
            </span>
            <span style={styles.tlsBadge}>TLS 1.3</span>
            <span style={styles.securityItem}>· Contact IT for access</span>
          </div>

          <p style={styles.legalNote}>
            Unauthorised access is monitored and logged<br />
            in accordance with POPIA &amp; ISO 27001.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Styles (unchanged from original) ─────────────────────────────────────────
const styles = {
  wrapper:      { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Inter', 'Segoe UI', sans-serif" },
  leftPanel:    { width: '48%', background: 'linear-gradient(160deg, #0f1f5c 0%, #1a3a8f 100%)', padding: '28px 44px', display: 'flex', flexDirection: 'column', gap: '16px', color: 'white', overflow: 'hidden' },
  logoRow:      { display: 'flex', alignItems: 'center', gap: '12px' },
  logoIcon:     { width: '44px', height: '44px', background: 'rgba(255,255,255,0.15)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoName:     { fontSize: '18px', fontWeight: '700', lineHeight: '1.2' },
  logoSub:      { fontSize: '12px', color: 'rgba(255,255,255,0.7)' },
  headline:     { fontSize: '28px', fontWeight: '800', lineHeight: '1.25', whiteSpace: 'pre-line' },
  headlineWhite:{ color: 'white' },
  headlineTeal: { color: '#4ade80' },
  description:  { fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.6', margin: 0, maxWidth: '420px' },
  statsGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  statCard:     { background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px 18px', border: '1px solid rgba(255,255,255,0.1)' },
  statValue:    { fontSize: '22px', fontWeight: '800' },
  statLabel:    { fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '3px' },
  statusBar:    { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', color: 'rgba(255,255,255,0.85)' },
  statusDot:    { width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 6px #4ade80' },
  badgesRow:    { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  badge:        { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  leftFooter:   { fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: 'auto', margin: 0 },
  rightPanel:   { flex: 1, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 28px', overflow: 'hidden' },
  card:         { background: 'white', borderRadius: '18px', padding: '28px 36px', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' },
  lockIconWrapper:{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', background: 'white', border: '2px solid #e5e7eb', flexShrink: 0 },
  cardTitle:    { fontSize: '22px', fontWeight: '700', color: '#111827', margin: '0 0 4px 0' },
  cardSubtitle: { fontSize: '13px', color: '#6b7280', margin: '0 0 14px 0', textAlign: 'center' },
  sessionBanner:{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', width: '100%', boxSizing: 'border-box', marginBottom: '16px' },
  sessionText:  { fontSize: '12px', color: '#374151' },
  form:         { width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' },
  fieldGroup:   { display: 'flex', flexDirection: 'column', gap: '5px' },
  label:        { fontSize: '13px', fontWeight: '600', color: '#111827' },
  passwordLabelRow:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  forgotLink:   { fontSize: '12px', color: '#1565c0', textDecoration: 'none', fontWeight: '500' },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon:    { position: 'absolute', left: '12px', pointerEvents: 'none' },
  input:        { width: '100%', padding: '10px 12px 10px 40px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '13px', color: '#111827', outline: 'none', boxSizing: 'border-box', background: '#f9fafb' },
  eyeBtn:       { position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center' },
  signInBtn:    { width: '100%', padding: '11px', background: '#1a237e', color: 'white', border: 'none', borderRadius: '9px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginTop: '2px', letterSpacing: '0.3px' },
  errorBanner:  { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', textAlign: 'center' },
  securityRow:  { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '11px', color: '#6b7280', flexWrap: 'wrap', justifyContent: 'center' },
  securityItem: { display: 'flex', alignItems: 'center' },
  tlsBadge:     { background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: '600', color: '#374151' },
  legalNote:    { fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '10px', lineHeight: '1.5' },
}
