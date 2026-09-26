import { useEffect, useRef, type ReactNode } from 'react';

type ModalProps = { title: string; children: ReactNode; onClose: () => void; className?: string };

export function Modal({ title, children, onClose, className = '' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={ref} className={`modal ${className}`} aria-labelledby="modal-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button className="close-button" aria-label="Close dialog" onClick={onClose}><span aria-hidden="true">×</span></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
