import { describe, it, expect } from 'vitest';
import type { Module, ComponentInstance, Net, PinConnection } from '@dcs/shared';
import { getAutoTracks, sampleWaveform, pushSample, netKey, MAX_WAVEFORM_SAMPLES, type WaveformSample } from './waveform.js';
import { elaborate } from './elaborate.js';
import { tick } from './clock.js';

function component(id: number, type: ComponentInstance['type'], properties: Record<string, unknown> = {}): ComponentInstance {
  return { id, moduleId: 1, type, x: 0, y: 0, rotation: 0, mirrored: false, properties };
}
function net(id: number, bitWidth = 1): Net {
  return { id, moduleId: 1, bitWidth, isBus: false };
}
function conn(id: number, netId: number, componentInstanceId: number, pinIndex: number, pinKind: 'in' | 'out'): PinConnection {
  return { id, netId, componentInstanceId, pinIndex, pinKind };
}

describe('getAutoTracks: clock, switch, LED auto-discovery', () => {
  const module: Module = {
    id: 1,
    name: 'main',
    isTopLevel: true,
    viewState: null,
    pins: [],
    components: [
      component(1, 'CLOCK', { level: 0 }),
      component(2, 'SWITCH', { value: 0 }),
      component(3, 'AND'),
      component(4, 'LED'),
    ],
    nets: [net(1), net(2), net(3)],
    wireSegments: [],
    pinConnections: [
      conn(1, 1, 1, 0, 'out'),
      conn(2, 1, 3, 0, 'in'),
      conn(3, 2, 2, 0, 'out'),
      conn(4, 2, 3, 1, 'in'),
      conn(5, 3, 3, 0, 'out'),
      conn(6, 3, 4, 0, 'in'),
    ],
  };

  it('discovers the clock, the switch, and the LED — never the internal AND gate', () => {
    const tracks = getAutoTracks(module);
    expect(tracks.map((t) => t.key)).toEqual(['c1', 'c2', 'c4']);
    expect(tracks.every((t) => t.kind === 'auto')).toBe(true);
  });
});

describe('sampleWaveform', () => {
  it('captures the current value of every auto-tracked signal plus any requested manual nets', () => {
    const module: Module = {
      id: 1,
      name: 'main',
      isTopLevel: true,
      viewState: null,
      pins: [],
      components: [component(1, 'SWITCH', { value: 1 }), component(2, 'LED')],
      nets: [net(1)],
      wireSegments: [],
      pinConnections: [conn(1, 1, 1, 0, 'out'), conn(2, 1, 2, 0, 'in')],
    };
    const graph = elaborate([module], 1);
    tick(graph);

    const sample = sampleWaveform(module, graph, 0, [1]);
    expect(sample.values['c1'].bits[0]).toBe(1); // switch
    expect(sample.values['c2'].bits[0]).toBe(1); // LED sees the same net
    expect(sample.values[netKey(1)].bits[0]).toBe(1); // manually tracked net, same value
  });
});

describe('pushSample: ring buffer', () => {
  it('keeps at most MAX_WAVEFORM_SAMPLES, dropping the oldest first', () => {
    let samples: WaveformSample[] = [];
    for (let i = 0; i < MAX_WAVEFORM_SAMPLES + 10; i++) {
      samples = pushSample(samples, { tick: i, values: {} });
    }
    expect(samples).toHaveLength(MAX_WAVEFORM_SAMPLES);
    expect(samples[0].tick).toBe(10); // the first 10 were dropped
    expect(samples.at(-1)!.tick).toBe(MAX_WAVEFORM_SAMPLES + 9);
  });
});
