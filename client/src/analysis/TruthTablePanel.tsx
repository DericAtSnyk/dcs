import { useState } from 'react';
import type { Bit } from '@dcs/shared';
import { useEditorStore } from '../state/editorStore.js';
import { generateTruthTable, type TruthTableResult } from '../model/simulation/truthTable.js';

function bitsToDisplay(bits: Bit[]): string {
  return [...bits].reverse().join(''); // MSB-first for reading, stored LSB-first
}

interface TruthTablePanelProps {
  onClose: () => void;
}

export function TruthTablePanel({ onClose }: TruthTablePanelProps) {
  const modules = useEditorStore((s) => s.modules);
  const activeModuleId = useEditorStore((s) => s.activeModuleId);
  const simGraph = useEditorStore((s) => s.simGraph);
  const [result, setResult] = useState<TruthTableResult | null>(null);

  function handleGenerate() {
    setResult(generateTruthTable(modules, activeModuleId, simGraph));
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        right: 12,
        width: 420,
        maxHeight: '70vh',
        overflow: 'auto',
        background: '#18181b',
        border: '1px solid #52525b',
        borderRadius: 8,
        padding: 16,
        color: '#e4e4e7',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Truth Table</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleGenerate}>Generate</button>
          <button onClick={onClose}>&times;</button>
        </div>
      </div>

      {!result && <p style={{ color: '#a1a1aa', fontSize: 13 }}>Click Generate to sweep this module's inputs.</p>}

      {result?.exceedsCap && (
        <p style={{ color: '#f87171', fontSize: 13 }}>
          This module has {result.totalInputBits} input bits — truth tables are capped at 10 input bits (1024 rows) to
          stay usable. Try generating one for a smaller sub-circuit instead.
        </p>
      )}

      {result && !result.exceedsCap && (
        <>
          {result.hasSequentialElements && (
            <p style={{ color: '#f59e0b', fontSize: 13, marginBottom: 8 }}>
              This module contains sequential elements (flip-flops/latches). This table reflects a snapshot against
              their <em>current</em> state, not their full behavior over time.
            </p>
          )}
          {result.inputs.length === 0 && (
            <p style={{ color: '#a1a1aa', fontSize: 13 }}>
              No switches, buttons, or input pins found in this module — nothing to sweep.
            </p>
          )}
          {result.rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
              <thead>
                <tr>
                  {result.inputs.map((col) => (
                    <th key={`i${col.componentId}`} style={{ borderBottom: '1px solid #52525b', padding: 4, textAlign: 'center' }}>
                      {col.label}
                    </th>
                  ))}
                  <th style={{ borderBottom: '1px solid #52525b', borderLeft: '2px solid #52525b', width: 8 }} />
                  {result.outputs.map((col) => (
                    <th key={`o${col.componentId}`} style={{ borderBottom: '1px solid #52525b', padding: 4, textAlign: 'center' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {row.inputBits.map((bits, j) => (
                      <td key={j} style={{ padding: 4, textAlign: 'center' }}>
                        {bitsToDisplay(bits)}
                      </td>
                    ))}
                    <td style={{ borderLeft: '2px solid #52525b' }} />
                    {row.outputBits.map((bits, j) => (
                      <td key={j} style={{ padding: 4, textAlign: 'center' }}>
                        {bitsToDisplay(bits)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
