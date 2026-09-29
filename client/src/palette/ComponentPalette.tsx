import type { ComponentType } from '@dcs/shared';
import { useEditorStore } from '../state/editorStore.js';

const SECTIONS: { title: string; items: { type: ComponentType; label: string }[] }[] = [
  {
    title: 'I/O',
    items: [
      { type: 'SWITCH', label: 'Switch' },
      { type: 'BUTTON', label: 'Push Button' },
      { type: 'CLOCK', label: 'Clock' },
      { type: 'LED', label: 'LED' },
      { type: 'VALUE_DISPLAY', label: 'Value Display' },
      { type: 'SEVEN_SEG', label: '7-Segment' },
    ],
  },
  {
    title: 'Gates',
    items: [
      { type: 'AND', label: 'AND' },
      { type: 'OR', label: 'OR' },
      { type: 'NOT', label: 'NOT' },
      { type: 'NAND', label: 'NAND' },
      { type: 'NOR', label: 'NOR' },
      { type: 'XOR', label: 'XOR' },
      { type: 'XNOR', label: 'XNOR' },
    ],
  },
  {
    title: 'Bus',
    items: [
      { type: 'MERGER', label: 'Merger' },
      { type: 'SPLITTER', label: 'Splitter' },
    ],
  },
  {
    title: 'Sequential',
    items: [
      { type: 'D_FF', label: 'D Flip-Flop' },
      { type: 'JK_FF', label: 'JK Flip-Flop' },
      { type: 'SR_FF', label: 'SR Flip-Flop' },
      { type: 'D_LATCH', label: 'D Latch' },
      { type: 'SR_LATCH', label: 'SR Latch' },
    ],
  },
  {
    title: 'MSI ICs',
    items: [
      { type: 'MUX', label: 'Multiplexer' },
      { type: 'DEMUX', label: 'Demultiplexer' },
      { type: 'ENCODER', label: 'Encoder' },
      { type: 'DECODER', label: 'Decoder' },
      { type: 'ADDER', label: 'Adder' },
      { type: 'REGISTER', label: 'Register' },
      { type: 'COUNTER', label: 'Counter' },
      { type: 'BCD_DECODER', label: 'BCD Decoder' },
    ],
  },
  {
    title: 'Module Boundary',
    items: [
      { type: 'INPUT_PIN', label: 'Input Pin' },
      { type: 'OUTPUT_PIN', label: 'Output Pin' },
    ],
  },
];

const itemStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#27272a',
  border: '1px solid #52525b',
  borderRadius: 6,
  color: '#e4e4e7',
  cursor: 'grab',
  userSelect: 'none',
  fontSize: 13,
};

function MyModulesSection() {
  const modules = useEditorStore((s) => s.modules);
  const activeModuleId = useEditorStore((s) => s.activeModuleId);
  const instantiable = modules.filter((m) => m.id !== activeModuleId);

  if (instantiable.length === 0) return null;

  return (
    <div>
      <h3 style={{ margin: '0 0 6px', fontSize: 12, color: '#a1a1aa', textTransform: 'uppercase' }}>My Modules</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {instantiable.map((m) => (
          <div
            key={m.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-dcs-subcircuit-module-id', String(m.id))}
            style={itemStyle}
            title={`Place a sub-circuit instance of "${m.name}"`}
          >
            {m.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComponentPalette() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, width: 160, overflowY: 'auto' }}>
      <MyModulesSection />
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 style={{ margin: '0 0 6px', fontSize: 12, color: '#a1a1aa', textTransform: 'uppercase' }}>
            {section.title}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {section.items.map(({ type, label }) => (
              <div
                key={type}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/x-dcs-component-type', type)}
                style={itemStyle}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
