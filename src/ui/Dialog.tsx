/**
 * Rückfrage vor Aktionen, die sich nicht rückgängig machen lassen
 */

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  danger,
  onConfirm,
  onCancel,
}) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 className="dialog-title" id="dialog-title">
        {title}
      </h2>
      <div className="stack-s">{children}</div>
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
};
