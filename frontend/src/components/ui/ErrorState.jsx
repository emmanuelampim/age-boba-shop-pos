export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="error-state">
      <div className="error-state-icon">⚠️</div>
      <p className="error-state-message">{message}</p>
      {onRetry && (
        <button className="error-state-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}