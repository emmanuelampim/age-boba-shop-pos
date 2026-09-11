export default function Skeleton({ width, height = 16, count = 1 }) {
  const style = { width: width || '100%', height };

  if (count <= 1) {
    return <div className="skeleton" style={style} />;
  }

  return (
    <div className="skeleton-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={style} />
      ))}
    </div>
  );
}