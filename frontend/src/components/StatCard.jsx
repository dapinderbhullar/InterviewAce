export default function StatCard({ title, value, icon: Icon }) {
  return <div className="stat-tile">{Icon && <Icon aria-hidden="true" />}<strong>{value ?? '—'}</strong><span>{title}</span></div>;
}
