/**
 * frontend/src/App.jsx  
 * =====================================
 * Updated to handle real auth state from authService.
 * onLogin(role, user) now receives the full user object from the API.
 * onLogout calls the real API endpoint via authService.logout().
 */
import { useState, useEffect, useRef } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SecurityAnalystPage from './pages/SecurityAnalystPage'
import ComplianceOfficerPage from './pages/ComplianceOfficerPage'
import ITTechnicianPage from './pages/ITTechnicianPage'
import SystemAuditorPage from './pages/SystemAuditorPage'
import { logout as apiLogout, getMe } from './services/authService'

function App() {
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const inactivityTimer = useRef(null)

  // Inactivity-based auto-logout: fires after the role's session timeout with no user events
  useEffect(() => {
    if (!userRole) return

    const timeoutMs = parseInt(sessionStorage.getItem('rbac_session_timeout') || '3600', 10) * 1000

    const resetTimer = () => {
      clearTimeout(inactivityTimer.current)
      inactivityTimer.current = setTimeout(async () => {
        try { await apiLogout() } catch (_) {}
        setUserRole(null)
        setCurrentUser(null)
        setSessionExpired(true)
      }, timeoutMs)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      clearTimeout(inactivityTimer.current)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [userRole])

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = sessionStorage.getItem('rbac_access')
        if (token) {
          // Try to get current user to validate token
          const user = await getMe()
          const roleKey = user.roles?.[0]?.frontend_key || 'it-admin'
          setUserRole(roleKey)
          setCurrentUser(user)
        }
      } catch (err) {
        // Token invalid or expired, clear it
        sessionStorage.removeItem('rbac_access')
        sessionStorage.removeItem('rbac_refresh')
      } finally {
        setIsCheckingAuth(false)
      }
    }
    checkAuth()
  }, [])

  const handleLogin = (role, user) => {
    setSessionExpired(false)
    setUserRole(role)
    setCurrentUser(user)
  }

  const handleLogout = async () => {
    try {
      await apiLogout()
    } catch (_) { /* already expired is fine */ }
    setUserRole(null)
    setCurrentUser(null)
  }

  // Show loading while checking for existing session
  if (isCheckingAuth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#6b7280' }}>
        <div>Checking session...</div>
      </div>
    )
  }

  if (!userRole) {
    return (
      <LoginPage
        onLogin={handleLogin}
        sessionExpiredMessage={sessionExpired ? 'Your session expired due to inactivity. Please log in again.' : null}
      />
    )
  }

  const props = { onLogout: handleLogout, currentUser }

  switch (userRole) {
    case 'it-admin':
      return <DashboardPage {...props} />
    case 'security-analyst':
      return <SecurityAnalystPage {...props} />
    case 'compliance-officer':
      return <ComplianceOfficerPage {...props} />
    case 'it-technician':
      return <ITTechnicianPage {...props} />
    case 'systems-auditor':
      return <SystemAuditorPage {...props} />
    default:
      return (
        <div style={placeholderStyle}>
          <h2>Dashboard for <em>{userRole}</em> — coming soon</h2>
          <button onClick={handleLogout} style={logoutStyle}>Log out</button>
        </div>
      )
  }
}

const placeholderStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif',
  gap: '16px', color: '#374151',
}
const logoutStyle = {
  padding: '10px 24px', background: '#1a237e', color: 'white',
  border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
}

export default App
