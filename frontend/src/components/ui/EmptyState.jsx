export default function EmptyState({ icon = '📦', message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      {message && <p className="empty-state-message">{message}</p>}
      {action && (
        <button className="empty-state-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}