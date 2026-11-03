import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FiGrid, FiFileText, FiUser, FiTarget, FiMic, FiBookOpen, FiEdit3, FiChevronLeft, FiMenu, FiX, FiLogOut, FiMoon, FiSun, FiZap } from 'react-icons/fi';
import { useAuth } from '../context/auth';
const links = [['/dashboard', 'Overview', FiGrid], ['/resume', 'Resume library', FiFileText], ['/profile', 'Resume intelligence', FiUser], ['/jobs', 'Job matching', FiTarget], ['/interviews', 'Mock interviews', FiMic], ['/learning', 'Adaptive learning', FiBookOpen], ['/notes', 'My notes', FiEdit3]];
export default function Navbar() {
  const navigate = useNavigate();
  const {
    user,
    logout
  } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ia-sidebar') === 'collapsed');
  const [mobile, setMobile] = useState(false);
  const menuButton = useRef(null);
  useEffect(() => {
    if (!mobile) return;
    function escape(event) {
      if (event.key === "Escape") {
        setMobile(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [mobile]);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  function collapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ia-sidebar', next ? 'collapsed' : 'expanded');
  }
  function theme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('ia-theme', next ? 'dark' : 'light');
  }
  return <><a className="skip-link" href="#workspace">Skip to content</a><header className="mobile-bar"><span className="brand"><FiZap /> InterviewAce</span><button ref={menuButton} className="icon-button" aria-controls="main-sidebar" aria-label={mobile ? 'Close navigation' : 'Open navigation'} aria-expanded={mobile} onClick={() => setMobile(!mobile)}>{mobile ? <FiX /> : <FiMenu />}</button></header>
    {mobile && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside id="main-sidebar" className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}>
      <NavLink className="brand" to="/dashboard" aria-label="InterviewAce home"><span className="brand-mark"><FiZap /></span><span className="nav-label">InterviewAce</span></NavLink>
      <div className="workspace-label nav-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">{links.map(([to, label, Icon]) => <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={() => setMobile(false)} className={({
          isActive
        }) => `nav-item ${isActive ? 'active' : ''}`}><Icon aria-hidden="true" /><span className="nav-label">{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip nav-label"><FiZap /><strong>A little practice. A lot of progress.</strong><p>Your next opportunity starts with preparation.</p></div>
      <button className="nav-item" onClick={theme} aria-label={dark ? "Use light appearance" : "Use dark appearance"} title="Toggle color theme">{dark ? <FiSun /> : <FiMoon />}<span className="nav-label">{dark ? 'Light appearance' : 'Dark appearance'}</span></button>
      <button className="nav-item collapse-control" onClick={collapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title="Toggle sidebar"><FiChevronLeft /><span className="nav-label">Collapse sidebar</span></button>
      <div className="account"><span className="avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</span><div className="nav-label"><strong>{user?.name || 'Your account'}</strong><small>Personal workspace</small></div><button className="icon-button" title="Log out" aria-label="Log out" onClick={() => {
            logout();
            navigate('/login');
          }}><FiLogOut /></button></div></div>
    </aside></>;
}
