import { useState } from 'react';
import { useEditorStore } from '../state/editorStore.js';

export function TabBar() {
  const modules = useEditorStore((s) => s.modules);
  const activeModuleId = useEditorStore((s) => s.activeModuleId);
  const switchModule = useEditorStore((s) => s.switchModule);
  const addModule = useEditorStore((s) => s.addModule);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  function handleCreate() {
    const name = newName.trim() || `Module ${modules.length + 1}`;
    addModule(name);
    setNewName('');
    setAdding(false);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#18181b' }}>
      {modules.map((m) => (
        <button
          key={m.id}
          onClick={() => switchModule(m.id)}
          style={{
            padding: '4px 10px',
            borderRadius: '4px 4px 0 0',
            border: 'none',
            background: m.id === activeModuleId ? '#3f3f46' : '#27272a',
            color: m.id === activeModuleId ? '#fff' : '#a1a1aa',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {m.name}
          {m.isTopLevel && ' ★'}
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') setAdding(false);
          }}
          onBlur={handleCreate}
          placeholder="Module name"
          style={{ fontSize: 13, padding: '3px 6px', background: '#27272a', color: '#e4e4e7', border: '1px solid #52525b' }}
        />
      ) : (
        <button onClick={() => setAdding(true)} title="New sub-circuit module" style={{ fontSize: 13, padding: '4px 8px' }}>
          +
        </button>
      )}
    </div>
  );
}
