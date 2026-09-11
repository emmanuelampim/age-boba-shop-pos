export default function Spinner({ size = 24 }) {
  return (
    <div
      className="spinner"
      style={{
        width: size,
        height: size,
        border: '2px solid transparent',
        borderTopColor: 'currentColor',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );
}