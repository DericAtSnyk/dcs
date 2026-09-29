import { useEffect } from 'react';
import { useEditorStore } from '../state/editorStore.js';

const AUTO_DISMISS_MS = 3000;

export function WiringErrorToast() {
  const wiringError = useEditorStore((s) => s.wiringError);
  const clearWiringError = useEditorStore((s) => s.clearWiringError);

  useEffect(() => {
    if (!wiringError) return;
    const timer = setTimeout(clearWiringError, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [wiringError, clearWiringError]);

  if (!wiringError) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#7f1d1d',
        color: '#fecaca',
        border: '1px solid #b91c1c',
        borderRadius: 6,
        padding: '8px 14px',
        fontSize: 13,
        zIndex: 20,
        cursor: 'pointer',
      }}
      onClick={clearWiringError}
      title="Click to dismiss"
    >
      {wiringError}
    </div>
  );
}
