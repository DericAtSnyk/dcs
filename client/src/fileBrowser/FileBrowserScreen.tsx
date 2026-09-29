import { useEffect, useState } from 'react';
import { useEditorStore } from '../state/editorStore.js';
import { createCircuit, deleteCircuitFile, listCircuits, loadCircuitFile, type CircuitListEntry } from '../persistence/serialize.js';

interface FileBrowserScreenProps {
  onOpen: () => void;
}

export function FileBrowserScreen({ onOpen }: FileBrowserScreenProps) {
  const [files, setFiles] = useState<CircuitListEntry[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loadCircuit = useEditorStore((s) => s.loadCircuit);

  function refresh() {
    listCircuits()
      .then(setFiles)
      .catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function handleOpen(filename: string) {
    try {
      const circuit = await loadCircuitFile(filename);
      loadCircuit(filename, circuit);
      onOpen();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const circuit = await createCircuit(newName.trim());
      loadCircuit(newName.trim(), circuit);
      setNewName('');
      onOpen();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(filename: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (!confirm(`Delete circuit "${filename}"? This cannot be undone.`)) return;
    try {
      await deleteCircuitFile(filename);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ padding: 24, color: '#e4e4e7', maxWidth: 480 }}>
      <h1>Digital Circuit Simulator</h1>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New circuit name"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          style={{ flex: 1, padding: '6px 10px', background: '#27272a', border: '1px solid #52525b', color: '#e4e4e7' }}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {files.map((f) => (
          <li
            key={f.filename}
            onClick={() => handleOpen(f.filename)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#27272a',
              marginBottom: 6,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <span>{f.filename}</span>
            <button onClick={(e) => handleDelete(f.filename, e)}>Delete</button>
          </li>
        ))}
        {files.length === 0 && <p style={{ color: '#a1a1aa' }}>No saved circuits yet.</p>}
      </ul>
    </div>
  );
}
