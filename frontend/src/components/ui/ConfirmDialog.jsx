import Modal from './Modal';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
  withReason = false,
  reason = '',
  onReasonChange,
  reasonLabel = 'Reason (optional)',
  reasonPlaceholder = 'e.g. customer changed their mind',
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn btn-${variant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
      {withReason && (
        <div className="input-group mt-sm">
          <label htmlFor="confirm-reason">{reasonLabel}</label>
          <input
            id="confirm-reason"
            className="input"
            value={reason}
            onChange={(e) => onReasonChange?.(e.target.value)}
            maxLength={500}
            placeholder={reasonPlaceholder}
          />
        </div>
      )}
    </Modal>
  );
}