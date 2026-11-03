import StatCard from './StatCard';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiFileText, FiTarget, FiMic, FiBookOpen, FiArrowUpRight } from 'react-icons/fi';
import api from '../lib/api';
export default function WorkspaceOverview({
  resumes,
  loading
}) {
  const [summary, setSummary] = useState({}),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.allSettled(['/jobs/reports', '/interviews'].map(url => api.get(url, {
      signal: controller.signal
    }))).then(results => {
      if (!active) return;
      const [matches, interviews] = results;
      setSummary({
        matches: matches.status === 'fulfilled' ? matches.value.data : null,
        interviews: interviews.status === 'fulfilled' ? interviews.value.data : null
      });
      setFailed(results.some(r => r.status === 'rejected'));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const interviews = Array.isArray(summary.interviews) ? summary.interviews : null,
    matches = Array.isArray(summary.matches) ? summary.matches : null;
  const completed = interviews?.filter(s => s.status === 'completed').length;
  const cards = [['Resume versions', loading ? null : resumes.length, FiFileText], ['Saved comparisons', matches?.length, FiTarget], ['Completed interviews', completed, FiMic], ['Interviews in progress', interviews?.filter(s => s.status !== 'completed').length, FiBookOpen]];
  const activity = [...resumes.map(r => ({
    id: r._id,
    title: r.originalName || r.fileName,
    description: 'Resume uploaded',
    date: r.uploadedAt,
    to: '/profile'
  })), ...(interviews || []).map(s => ({
    id: s._id,
    title: `${s.config.type} interview`,
    description: s.status,
    date: s.createdAt,
    to: `/interviews/${s._id}`
  })), ...(matches || []).map(r => ({
    id: r._id,
    title: r.jobTitle || 'Job comparison',
    description: 'Comparison saved',
    date: r.createdAt,
    to: '/jobs'
  }))].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return <><section className="hero"><span className="eyebrow">YOUR CAREER, IN FOCUS</span><h2>Small steps. Stronger interviews.</h2><p>Understand your experience, find the right fit, and turn practice into progress.</p><Link className="button-link" to={resumes.length ? '/interviews' : '/resume'}>{resumes.length ? 'Start a practice interview' : 'Upload your first resume'} <FiArrowUpRight /></Link></section><div className="stat-grid">{cards.map(([label, value, Icon]) => <StatCard key={label} title={label} value={value} icon={Icon} />)}</div>{failed && <p className="muted">Some saved activity could not be loaded. Visit job matching or interviews to retry.</p>}<h2>Your preparation toolkit</h2><div className="quick-grid">{[['/profile', 'Know your strengths', 'Build a clear, evidence-based candidate profile.', FiFileText], ['/jobs', 'Find your fit', 'Compare your experience with the role you want.', FiTarget], ['/learning', 'Close the gaps', 'Turn feedback into a focused learning roadmap.', FiBookOpen]].map(([to, title, description, Icon]) => <Link className="quick-card" to={to} key={to}><Icon /><h3>{title}</h3><p>{description}</p><small>Explore workspace →</small></Link>)}</div><section className="panel"><h2>Recent activity</h2>{loading ? <div className="skeleton" aria-label="Loading recent activity" /> : activity.length ? activity.map(a => <div className="activity-row" key={a.id}><span><Link to={a.to}>{a.title}</Link><small>{a.description}</small></span><time>{a.date ? new Date(a.date).toLocaleDateString() : 'Saved'}</time></div>) : <p>Your preparation story starts here. Upload a resume to see your activity and unlock personalized tools.</p>}</section></>;
}
