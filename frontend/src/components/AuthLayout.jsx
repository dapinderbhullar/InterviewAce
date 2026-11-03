import { FiZap, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi';
import { useState } from 'react';
export function PasswordInput({
  value,
  onChange,
  register = false,
  disabled = false
}) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field"><input id="password" type={visible ? 'text' : 'password'} required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} value={value} onChange={onChange} disabled={disabled} placeholder={register ? 'At least 8 characters' : 'Enter your password'} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <FiEyeOff /> : <FiEye />}</button></div>;
}
export default function AuthLayout({
  children
}) {
  return <main className="auth-layout"><section className="auth-story"><div className="brand"><span className="brand-mark"><FiZap /></span>InterviewAce</div><div><span className="eyebrow">PREPARE WITH PURPOSE</span><h1>Your next chapter<br />starts here.</h1><p>From your first resume to your next interview.<br />One focused workspace for every step.</p><div className="journey">{['Discover your strengths', 'Find your fit', 'Practice with confidence'].map((text, i) => <div key={text}><span>0{i + 1}</span><strong>{text}</strong><FiCheck /></div>)}</div></div><small>AI-powered preparation. Human potential.</small></section><section className="auth-main">{children}<small className="auth-footer">Built for the opportunity ahead.</small></section></main>;
}
