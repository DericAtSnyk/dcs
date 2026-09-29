import { useEditorStore } from '../state/editorStore.js';

export function ClockToolbar() {
  const isRunning = useEditorStore((s) => s.isRunning);
  const frequency = useEditorStore((s) => s.clockFrequencyHz);
  const stepClock = useEditorStore((s) => s.stepClock);
  const startClock = useEditorStore((s) => s.startClock);
  const stopClock = useEditorStore((s) => s.stopClock);
  const setClockFrequency = useEditorStore((s) => s.setClockFrequency);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e4e4e7' }}>
      <span style={{ fontSize: 13, color: '#a1a1aa' }}>Clock</span>
      <button onClick={() => (isRunning ? stopClock() : startClock())}>{isRunning ? 'Pause' : 'Run'}</button>
      <button onClick={stepClock} disabled={isRunning}>
        Step
      </button>
      <input
        type="number"
        min={0.1}
        max={100}
        step={0.1}
        value={frequency}
        onChange={(e) => setClockFrequency(Number(e.target.value))}
        style={{ width: 64, background: '#18181b', color: '#e4e4e7', border: '1px solid #52525b' }}
      />
      <span style={{ fontSize: 13, color: '#a1a1aa' }}>Hz</span>
    </div>
  );
}
