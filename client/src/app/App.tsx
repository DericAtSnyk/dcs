import { useState } from 'react';
import { ComponentPalette } from '../palette/ComponentPalette.js';
import { SchematicCanvas } from '../canvas/SchematicCanvas.js';
import { FileBrowserScreen } from '../fileBrowser/FileBrowserScreen.js';
import { ClockToolbar } from '../clockControls/ClockToolbar.js';
import { EditToolbar } from '../canvas/EditToolbar.js';
import { TabBar } from '../tabs/TabBar.js';
import { TruthTablePanel } from '../analysis/TruthTablePanel.js';
import { WaveformViewer } from '../waveform/WaveformViewer.js';
import { WiringErrorToast } from '../canvas/WiringErrorToast.js';
import { useEditorStore } from '../state/editorStore.js';
import { saveCircuitFile } from '../persistence/serialize.js';

type Screen = 'browser' | 'editor';

export function App() {
  const [screen, setScreen] = useState<Screen>('browser');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showTruthTable, setShowTruthTable] = useState(false);
  const [showWaveform, setShowWaveform] = useState(false);
  const filename = useEditorStore((s) => s.currentFilename);
  const toCircuitFile = useEditorStore((s) => s.toCircuitFile);
  const stopClock = useEditorStore((s) => s.stopClock);

  if (screen === 'browser') {
    return <FileBrowserScreen onOpen={() => setScreen('editor')} />;
  }

  async function handleSave() {
    if (!filename) return;
    setSaveStatus('saving');
    try {
      await saveCircuitFile(filename, toCircuitFile());
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          background: '#27272a',
          color: '#e4e4e7',
        }}
      >
        <button
          onClick={() => {
            stopClock();
            setScreen('browser');
          }}
        >
          &larr; Files
        </button>
        <strong>{filename}</strong>
        <button onClick={handleSave}>Save</button>
        <span style={{ color: '#a1a1aa', fontSize: 13 }}>
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && 'Save failed'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowTruthTable((v) => !v)}>Truth Table</button>
        <button onClick={() => setShowWaveform((v) => !v)}>Waveform</button>
        <div style={{ width: 1, height: 20, background: '#52525b' }} />
        <EditToolbar />
        <div style={{ width: 1, height: 20, background: '#52525b' }} />
        <ClockToolbar />
      </div>
      <TabBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <ComponentPalette />
        <SchematicCanvas />
        <WiringErrorToast />
        {showTruthTable && <TruthTablePanel onClose={() => setShowTruthTable(false)} />}
        {showWaveform && <WaveformViewer onClose={() => setShowWaveform(false)} />}
      </div>
    </div>
  );
}
