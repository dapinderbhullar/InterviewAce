import { useEffect, useRef, useState } from 'react';
export function Toasts() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer;
    function show(e) {
      setMessage(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(''), 5000);
    }
    window.addEventListener('ia-toast', show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('ia-toast', show);
    };
  }, []);
  return message && <div className="toast" role="status">{message}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setMessage('')}>×</button></div>;
}
export function ConfirmButton({
  onConfirm,
  children,
  disabled,
  title = 'Confirm this action',
  description = 'This action changes your saved information.',
  confirmLabel = 'Confirm'
}) {
  const dialog = useRef(null);
  return <><button disabled={disabled} type="button" onClick={() => dialog.current.showModal()}>{children}</button><dialog ref={dialog} className="modal" aria-label={title}><h2>{title}</h2><p>{description}</p><div className="actions"><button autoFocus onClick={() => dialog.current.close()}>Cancel</button><button className="danger" onClick={() => {
          dialog.current.close();
          onConfirm();
        }}>{confirmLabel}</button></div></dialog></>;
}
export function ScoreBar({
  value,
  max = 100,
  label
}) {
  return <meter aria-label={label} min="0" max={max} value={value}>{value}/{max}</meter>;
}
