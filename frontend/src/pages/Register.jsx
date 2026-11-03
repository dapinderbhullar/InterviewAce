import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import AuthLayout, { PasswordInput } from '../components/AuthLayout';
export default function Register() {
  const [form, setForm] = useState({
      name: '',
      email: '',
      password: ''
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  const change = key => e => setForm({
    ...form,
    [key]: e.target.value
  });
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/register', form);
      navigate('/login', {
        state: {
          registered: true
        }
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <AuthLayout><form className="auth-form" onSubmit={submit}><span className="eyebrow">YOUR NEXT CHAPTER</span><h2>Invest in your potential.</h2><p>Create your InterviewAce preparation workspace.</p>{error && <p role="alert">{error}</p>}<label htmlFor="name">Full name</label><input id="name" required maxLength={100} autoComplete="name" placeholder="Your name" value={form.name} onChange={change('name')} disabled={busy} /><label htmlFor="email">Email address</label><input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={change('email')} disabled={busy} /><label htmlFor="password">Password</label><PasswordInput register value={form.password} onChange={change('password')} disabled={busy} /><small>Use at least 8 characters.</small><button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create your account →'}</button><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></form></AuthLayout>;
}
