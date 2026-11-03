import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/auth';
import AuthLayout, { PasswordInput } from '../components/AuthLayout';
export default function Login() {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login
  } = useAuth();
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const {
        data
      } = await api.post('/auth/login', {
        email,
        password
      });
      login(data);
      navigate('/dashboard');
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to sign in. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  }
  return <AuthLayout><form className="auth-form" onSubmit={submit}><span className="eyebrow">WELCOME BACK</span><h2>Make your next move.</h2><p>Sign in to your InterviewAce workspace.</p>{location.state?.registered && <p className="success" role="status">Account created. Sign in to get started.</p>}{error && <p role="alert">{error}</p>}<label htmlFor="email">Email address</label><input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /><label htmlFor="password">Password</label><PasswordInput value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to workspace →'}</button><p className="auth-switch">New to InterviewAce? <Link to="/register">Create an account</Link></p></form></AuthLayout>;
}
