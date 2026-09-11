export default function Badge({ status }) {
  const s = (status || '').toLowerCase().replace(' ', '-')
  return <span className={`badge badge-${s}`}>{status}</span>
}