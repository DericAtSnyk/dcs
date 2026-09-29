import type { ComponentInstance, Module, SignalValue } from '@dcs/shared';
import type { SimGraph } from '../types.js';
import { findSourceComponents, findSinkComponents, findClockComponents, labelFor, pinWidth } from './ioDiscovery.js';
import { rootNodeId, rootNetId } from './elaborate.js';

/** `c<componentId>` for an auto-tracked source/sink/clock pin, or
 * `n<netId>` for a manually-tracked net — one flat namespace so a single
 * ring buffer of samples can hold both kinds uniformly. */
export type TrackKey = string;

export interface WaveformTrackInfo {
  key: TrackKey;
  label: string;
  width: number;
  kind: 'auto' | 'manual';
}

export interface WaveformSample {
  tick: number;
  values: Record<TrackKey, SignalValue>;
}

export const MAX_WAVEFORM_SAMPLES = 200;

function componentKey(component: ComponentInstance): TrackKey {
  return rootNodeId(component.id);
}

export function netKey(netId: number): TrackKey {
  return rootNetId(netId);
}

/** The module's top-level-ish I/O, auto-tracked with no user setup: every
 * clock, source (switch/button/input pin), and sink (LED/value display/7-seg/
 * output pin) in the module. */
export function getAutoTracks(module: Module): WaveformTrackInfo[] {
  const clocks = findClockComponents(module).map((c) => ({ component: c, pinKind: 'out' as const }));
  const sources = findSourceComponents(module).map((c) => ({ component: c, pinKind: 'out' as const }));
  const sinks = findSinkComponents(module).map((c) => ({ component: c, pinKind: 'in' as const }));

  return [...clocks, ...sources, ...sinks].map(({ component, pinKind }) => ({
    key: componentKey(component),
    label: labelFor(module, component),
    width: pinWidth(component, pinKind),
    kind: 'auto' as const,
  }));
}

function pinValue(graph: SimGraph, component: ComponentInstance, pinKind: 'in' | 'out'): SignalValue | undefined {
  const node = graph.nodes.find((n) => n.id === rootNodeId(component.id));
  const netId = pinKind === 'in' ? node?.inputNets[0] : node?.outputNets[0];
  return netId != null ? graph.nets.get(netId)?.value : undefined;
}

/** Captures one sample of every auto-tracked signal, plus every net id in
 * `manualNetIds`, from the current state of `graph`. */
export function sampleWaveform(module: Module, graph: SimGraph, tick: number, manualNetIds: number[]): WaveformSample {
  const values: Record<TrackKey, SignalValue> = {};

  for (const c of findClockComponents(module)) {
    const v = pinValue(graph, c, 'out');
    if (v) values[componentKey(c)] = v;
  }
  for (const c of findSourceComponents(module)) {
    const v = pinValue(graph, c, 'out');
    if (v) values[componentKey(c)] = v;
  }
  for (const c of findSinkComponents(module)) {
    const v = pinValue(graph, c, 'in');
    if (v) values[componentKey(c)] = v;
  }
  for (const netId of manualNetIds) {
    const v = graph.nets.get(rootNetId(netId))?.value;
    if (v) values[netKey(netId)] = v;
  }

  return { tick, values };
}

/** Appends a sample, dropping the oldest once MAX_WAVEFORM_SAMPLES is exceeded. */
export function pushSample(samples: WaveformSample[], sample: WaveformSample): WaveformSample[] {
  const next = [...samples, sample];
  return next.length > MAX_WAVEFORM_SAMPLES ? next.slice(next.length - MAX_WAVEFORM_SAMPLES) : next;
}
