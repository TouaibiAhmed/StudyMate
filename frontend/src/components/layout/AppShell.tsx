import { Bell, BookOpen, Check, ChevronDown, Compass, Home, Map, Menu, Search, Settings, Sparkles, UserRound, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { preferencesService } from '../../services/api-client'
import type { StudentProfile } from '../../services/contracts/preferences'
import { useAuth } from '../../features/auth/hooks/useAuth'

const navigation = [
  { label: 'Home', path: '/', icon: Home, end: true },
  { label: 'Courses', path: '/courses', icon: BookOpen },
  { label: 'Study Progress', path: '/progress', icon: Compass },
  { label: 'Learning Roadmaps', path: '/roadmaps', icon: Map },
  { label: 'Practice Exams', path: '/exams', icon: Check },
]

const pageContexts = [
  { match: (path: string) => path === '/', label: 'Home' },
  { match: (path: string) => path.startsWith('/courses'), label: 'Courses' },
  { match: (path: string) => path.startsWith('/study'), label: 'Study session' },
  { match: (path: string) => path.startsWith('/progress'), label: 'Study Progress' },
  { match: (path: string) => path.startsWith('/roadmaps'), label: 'Learning Roadmaps' },
  { match: (path: string) => path.startsWith('/exams'), label: 'Practice Exams' },
  { match: (path: string) => path.startsWith('/profile'), label: 'Profile' },
  { match: (path: string) => path.startsWith('/settings'), label: 'Settings' },
]

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profile, setProfile] = useState<StudentProfile>()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const profileRef = useRef<HTMLDivElement>(null)
  const current = pageContexts.find(({ match }) => match(location.pathname))?.label ?? 'Study Partner'

  useEffect(() => {
    void preferencesService.getProfile().then(setProfile)
    function refreshProfile() { void preferencesService.getProfile().then(setProfile) }
    function closeProfile(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', closeProfile)
    window.addEventListener('studymate:profile-updated', refreshProfile)
    return () => {
      document.removeEventListener('mousedown', closeProfile)
      window.removeEventListener('studymate:profile-updated', refreshProfile)
    }
  }, [])

  useEffect(() => {
    function closeMobileNavigation(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        setProfileOpen(false)
      }
    }
    window.addEventListener('keydown', closeMobileNavigation)
    return () => window.removeEventListener('keydown', closeMobileNavigation)
  }, [])

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const query = form.get('query')?.toString().trim()
    if (query) navigate(`/courses?search=${encodeURIComponent(query)}`)
  }

  function closeMenus() {
    setMobileOpen(false)
    setProfileOpen(false)
  }

  async function handleLogout() {
    closeMenus()
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>Study<span className="brand-accent">mate</span></span></div>
        <div className="sidebar-label">Workspace</div>
        <nav id="primary-navigation" className="nav-list" aria-label="Main navigation">
          {navigation.map(({ label, path, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} onClick={closeMenus} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              {({ isActive }) => <><Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} /><span>{label}</span></>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-label">Account</div>
        <NavLink to="/profile" onClick={closeMenus} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><UserRound size={18} /><span>Profile</span></NavLink>
        <NavLink to="/settings" onClick={closeMenus} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings size={18} /><span>Settings</span></NavLink>
        <button className="sidebar-user" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
          <div className="avatar avatar-small">{user?.name.slice(0, 2).toUpperCase() ?? 'AM'}</div><div><strong>{user?.name ?? 'Student'}</strong><small>{profile?.fieldOfStudy ?? 'Student account'}</small></div><ChevronDown size={15} />
        </button>
      </aside>
      {mobileOpen && <button className="sidebar-overlay" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="primary-navigation"><Menu size={21} /></button>
          <div className="page-context"><span className="eyebrow">Good morning, {user?.name.split(' ')[0] ?? 'there'} · {profile?.level ?? 'Student'}</span><h1>{current}</h1></div>
          <div className="topbar-actions">
            <form className="topbar-search" onSubmit={handleSearchSubmit}><Search size={16} /><input name="query" aria-label="Search courses" placeholder="Search courses" /></form>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><i /></button>
            <div className="profile-menu" ref={profileRef}>
              <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="menu">
                <div className="avatar">{user?.name.slice(0, 2).toUpperCase() ?? 'AM'}</div><ChevronDown size={15} />
              </button>
              {profileOpen && <div className="profile-dropdown" role="menu"><div className="profile-dropdown-heading"><strong>{user?.name ?? 'Student'}</strong><span>{user?.email}</span></div><NavLink to="/profile" onClick={closeMenus} role="menuitem"><UserRound size={15} /> Profile</NavLink><NavLink to="/settings" onClick={closeMenus} role="menuitem"><Settings size={15} /> Settings</NavLink><button role="menuitem" onClick={handleLogout}>Sign out</button><button role="menuitem" onClick={() => setProfileOpen(false)}><X size={15} /> Close menu</button></div>}
            </div>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
