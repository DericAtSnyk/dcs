import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore.js';
import { getAutoTracks, netKey, type WaveformTrackInfo } from '../model/simulation/waveform.js';
import { bitColor } from '../canvas/bitColor.js';
import { signalToNumber } from '../canvas/valueFormat.js';

const ROW_HEIGHT = 28;
const SAMPLE_WIDTH = 24;
const LABEL_WIDTH = 110;

interface WaveformViewerProps {
  onClose: () => void;
}

export function WaveformViewer({ onClose }: WaveformViewerProps) {
  const module = useEditorStore((s) => s.module);
  const activeModuleId = useEditorStore((s) => s.activeModuleId);
  const waveformTracks = useEditorStore((s) => s.waveformTracks);
  const waveformSamples = useEditorStore((s) => s.waveformSamples);
  const removeWaveformTrack = useEditorStore((s) => s.removeWaveformTrack);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const autoTracks = getAutoTracks(module);
  const manualTracks: WaveformTrackInfo[] = waveformTracks
    .filter((t) => t.topModuleId === activeModuleId)
    .map((t) => ({
      key: netKey(t.instancePath[0]),
      label: t.label ?? `Net ${t.instancePath[0]}`,
      width: module.nets.find((n) => n.id === t.instancePath[0])?.bitWidth ?? 1,
      kind: 'manual' as const,
    }));
  const tracks = [...autoTracks, ...manualTracks];
  const samples = waveformSamples.get(activeModuleId) ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = LABEL_WIDTH + Math.max(samples.length, 1) * SAMPLE_WIDTH;
    const height = Math.max(tracks.length, 1) * ROW_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';

    tracks.forEach((track, row) => {
      const top = row * ROW_HEIGHT;
      ctx.strokeStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(width, top);
      ctx.stroke();

      ctx.fillStyle = '#e4e4e7';
      ctx.fillText(track.label, 6, top + ROW_HEIGHT / 2);

      if (samples.length === 0) return;

      if (track.width === 1) {
        // Classic step trace: high near the top of the row, low near the bottom.
        const highY = top + 6;
        const lowY = top + ROW_HEIGHT - 6;
        let prevY: number | null = null;
        samples.forEach((sample, i) => {
          const x = LABEL_WIDTH + i * SAMPLE_WIDTH;
          const bit = sample.values[track.key]?.bits[0];
          const y = bit === 1 ? highY : lowY;
          ctx.strokeStyle = bitColor(bit);
          if (prevY != null && prevY !== y) {
            ctx.beginPath();
            ctx.moveTo(x, prevY);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + SAMPLE_WIDTH, y);
          ctx.stroke();
          prevY = y;
        });
      } else {
        // Multi-bit: show the numeric value as text in each sample's cell.
        samples.forEach((sample, i) => {
          const x = LABEL_WIDTH + i * SAMPLE_WIDTH;
          const signal = sample.values[track.key];
          const text = signal ? (signalToNumber(signal) ?? 'X') : '';
          ctx.fillStyle = '#a1a1aa';
          ctx.fillText(String(text), x + 2, top + ROW_HEIGHT / 2);
        });
      }
    });
  }, [module, tracks.map((t) => t.key).join(','), samples]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        maxHeight: 260,
        background: '#18181b',
        border: '1px solid #52525b',
        borderRadius: 8,
        color: '#e4e4e7',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px' }}>
        <strong style={{ fontSize: 13 }}>Waveform</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {manualTracks.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) removeWaveformTrack(Number(e.target.value));
                e.target.value = '';
              }}
              value=""
              style={{ fontSize: 12, background: '#27272a', color: '#e4e4e7', border: '1px solid #52525b' }}
            >
              <option value="" disabled>
                Remove tracked wire…
              </option>
              {waveformTracks
                .filter((t) => t.topModuleId === activeModuleId)
                .map((t) => (
                  <option key={t.id} value={t.instancePath[0]}>
                    Net {t.instancePath[0]}
                  </option>
                ))}
            </select>
          )}
          <button onClick={onClose}>&times;</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
      <p style={{ fontSize: 11, color: '#71717a', padding: '0 12px 8px' }}>
        Right-click any wire on the canvas to add or remove it here. Samples advance on each clock Step.
      </p>
    </div>
  );
}
