import type { ComponentType } from '@dcs/shared';
import { useEditorStore, CONFIGURABLE_GATES, BUS_COMPONENTS, SELECT_COMPONENTS, BOUNDARY_MARKERS } from '../state/editorStore.js';

interface PropertyField {
  key: string;
  label: string;
  min: number;
  max: number;
}

function propertyFieldFor(type: ComponentType): PropertyField | null {
  if (CONFIGURABLE_GATES.includes(type)) return { key: 'inputCount', label: 'Inputs', min: 2, max: 8 };
  if (SELECT_COMPONENTS.includes(type)) return { key: 'selectBits', label: 'Select bits', min: 1, max: 3 };
  if (BUS_COMPONENTS.includes(type) || BOUNDARY_MARKERS.includes(type)) {
    return { key: 'width', label: 'Width', min: 1, max: 16 };
  }
  return null;
}

function PropertyField() {
  const selectedComponentId = useEditorStore((s) => s.selectedComponentId);
  const component = useEditorStore((s) => s.module.components.find((c) => c.id === s.selectedComponentId));
  const updateComponentProperties = useEditorStore((s) => s.updateComponentProperties);

  if (selectedComponentId == null || !component) return null;
  const field = propertyFieldFor(component.type);
  if (!field) return null;

  const value = (component.properties[field.key] as number | undefined) ?? field.min;

  return (
    <>
      <div style={{ width: 1, height: 20, background: '#52525b' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#e4e4e7' }}>
        {field.label}
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => {
            const next = Math.max(field.min, Math.min(field.max, Number(e.target.value) || field.min));
            updateComponentProperties(selectedComponentId, { [field.key]: next });
          }}
          style={{ width: 48, background: '#18181b', color: '#e4e4e7', border: '1px solid #52525b' }}
        />
      </label>
    </>
  );
}

export function EditToolbar() {
  const selectedComponentId = useEditorStore((s) => s.selectedComponentId);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const rotateComponent = useEditorStore((s) => s.rotateComponent);
  const mirrorComponent = useEditorStore((s) => s.mirrorComponent);
  const deleteComponent = useEditorStore((s) => s.deleteComponent);
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection);

  const hasSelection = selectedComponentId != null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
        Undo
      </button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
        Redo
      </button>
      <div style={{ width: 1, height: 20, background: '#52525b' }} />
      <button onClick={() => hasSelection && rotateComponent(selectedComponentId!)} disabled={!hasSelection} title="Rotate (R)">
        Rotate
      </button>
      <button onClick={() => hasSelection && mirrorComponent(selectedComponentId!)} disabled={!hasSelection} title="Mirror (M)">
        Mirror
      </button>
      <button onClick={duplicateSelection} disabled={!hasSelection} title="Duplicate (Ctrl/Cmd+D)">
        Duplicate
      </button>
      <button
        onClick={() => hasSelection && deleteComponent(selectedComponentId!)}
        disabled={!hasSelection}
        title="Delete (Del)"
      >
        Delete
      </button>
      <PropertyField />
    </div>
  );
}
