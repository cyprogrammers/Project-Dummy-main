/**
 * frontend/src/App.jsx  
 * =====================================
 * Updated to handle real auth state from authService.
 * onLogin(role, user) now receives the full user object from the API.
 * onLogout calls the real API endpoint via authService.logout().
 */
import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SecurityAnalystPage from './pages/SecurityAnalystPage'
import ComplianceOfficerPage from './pages/ComplianceOfficerPage'
import ITTechnicianPage from './pages/ITTechnicianPage'
import SystemAuditorPage from './pages/SystemAuditorPage'
import { logout as apiLogout } from './services/authService'

function App() {
  const [userRole, setUserRole] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  const handleLogin = (role, user) => {
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

  if (!userRole) {
    return <LoginPage onLogin={handleLogin} />
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
