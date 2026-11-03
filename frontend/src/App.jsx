import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { Toasts } from './components/Feedback';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ResumeUpload from './pages/ResumeUpload';
import Notes from './pages/Notes';
import ProfileDashboard from './pages/ProfileDashboard';
import JobDashboard from './pages/JobDashboard';
import MockInterview from './pages/MockInterview';
import LearningDashboard from './pages/LearningDashboard';
export default function App() {
  const pages = [['/dashboard', Dashboard], ['/resume', ResumeUpload], ['/notes', Notes], ['/profile', ProfileDashboard], ['/jobs', JobDashboard], ['/interviews', MockInterview], ['/interviews/:sessionId', MockInterview], ['/learning', LearningDashboard]];
  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Toasts /><Routes><Route path="/" element={<Login />} /><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />{pages.map(([path, Page]) => <Route key={path} path={path} element={<ProtectedRoute><Page /></ProtectedRoute>} />)}<Route path="*" element={<main className="feature-page"><h1>Page not found</h1><Link to="/dashboard">Go to dashboard</Link></main>} /></Routes></BrowserRouter>;
}
