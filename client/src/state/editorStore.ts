import { create } from 'zustand';
import type {
  CircuitFile,
  ComponentInstance,
  ComponentType,
  Module,
  ModulePin,
  Net,
  PinConnection,
  WaveformTrack,
} from '@dcs/shared';
import { SCHEMA_VERSION } from '@dcs/shared';
import type { SimGraph } from '../model/types.js';
import { elaborate, wouldCreateCycle } from '../model/simulation/elaborate.js';
import { tick } from '../model/simulation/clock.js';
import { getComponentDefinition } from '../model/components/registry.js';
import type { SubcircuitPin } from '../model/components/subcircuit.js';
import { sampleWaveform, pushSample, type WaveformSample } from '../model/simulation/waveform.js';

export interface PinRef {
  componentId: number;
  pinKind: 'in' | 'out';
  pinIndex: number;
}

interface Clipboard {
  type: ComponentType;
  properties: Record<string, unknown>;
  x: number;
  y: number;
}

// Exported so the property panel can decide which fields to show for a
// selected component without duplicating these lists.
export const CONFIGURABLE_GATES: ComponentType[] = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
export const BUS_COMPONENTS: ComponentType[] = ['MERGER', 'SPLITTER', 'VALUE_DISPLAY', 'ADDER', 'REGISTER', 'COUNTER'];
export const SELECT_COMPONENTS: ComponentType[] = ['MUX', 'DEMUX', 'ENCODER', 'DECODER'];
export const BOUNDARY_MARKERS: ComponentType[] = ['INPUT_PIN', 'OUTPUT_PIN'];
const PASTE_OFFSET = 40;

function defaultPropertiesFor(type: ComponentType): Record<string, unknown> {
  if (CONFIGURABLE_GATES.includes(type)) return { inputCount: 2 };
  if (BUS_COMPONENTS.includes(type)) return { width: 4 };
  if (SELECT_COMPONENTS.includes(type)) return { selectBits: 2 };
  if (type === 'SWITCH') return { value: 0 };
  if (type === 'CLOCK') return { level: 0 };
  if (type === 'BUTTON') return { pressed: 0 };
  if (type === 'INPUT_PIN') return { width: 1, value: 0 };
  if (type === 'OUTPUT_PIN') return { width: 1 };
  return {};
}

function emptyModule(id: number, name: string, isTopLevel: boolean): Module {
  return { id, name, isTopLevel, viewState: null, pins: [], components: [], nets: [], wireSegments: [], pinConnections: [] };
}

/** Derives a SUBCIRCUIT instance's pin layout from a module's current
 * boundary — captured once at placement time (see addSubcircuitInstance),
 * not kept live-synced if the module's boundary changes afterward. */
function derivePinsFromModule(module: Module): SubcircuitPin[] {
  return [...module.pins].sort((a, b) => a.orderIndex - b.orderIndex).map((p) => ({ direction: p.direction, width: p.bitWidth }));
}

interface EditorState {
  modules: Module[];
  activeModuleId: number;
  /** Always the entry in `modules` whose id === activeModuleId — kept in
   * sync by every mutation, so existing code can keep reading "the current
   * module" directly instead of looking it up from `modules` every time. */
  module: Module;
  simGraph: SimGraph;
  /** Per-module last-known SimGraph, purely for state continuity (net/flip-
   * flop values) when switching back to a tab — not a live background sim. */
  simGraphCache: Map<number, SimGraph>;
  nextId: number;
  /** Separate counter for module ids — see computeNextModuleId. */
  nextModuleId: number;
  currentFilename: string | null;
  clockFrequencyHz: number;
  isRunning: boolean;

  /** Undo/redo via full-modules-array snapshots (not a Command/invert-per-
   * action pattern): circuits here are small (tens–hundreds of components),
   * so the memory cost is negligible, and a snapshot can't diverge from
   * reality the way a hand-written inverse for one specific mutation type
   * could. Undo/redo spans all modules, since a sub-circuit edit and a
   * top-level edit should undo in the order they actually happened. */
  past: Module[][];
  future: Module[][];
  undo: () => void;
  redo: () => void;

  selectedComponentId: number | null;
  selectComponent: (id: number | null) => void;
  clipboard: Clipboard | null;
  pasteCount: number;
  copySelection: () => void;
  paste: () => void;
  duplicateSelection: () => void;

  addComponent: (type: ComponentType, x: number, y: number) => void;
  /** Places a black-box instance of `targetModuleId` in the active module.
   * Returns false (no-op) if that would create a circular sub-circuit
   * reference. */
  addSubcircuitInstance: (targetModuleId: number, x: number, y: number) => boolean;
  deleteComponent: (componentId: number) => void;
  rotateComponent: (componentId: number) => void;
  mirrorComponent: (componentId: number) => void;
  /** Merges `properties` into a component's existing properties (e.g.
   * inputCount, width, selectBits). Any existing wire on a pin whose index
   * no longer exists, or whose width changed, is disconnected — the
   * resulting dead nets are pruned the same way deleteComponent does. */
  updateComponentProperties: (componentId: number, properties: Record<string, unknown>) => void;
  /** Push one undo checkpoint at the start of a drag gesture; see moveComponentLive. */
  beginMove: () => void;
  /** Repositions without pushing history or resimulating — call once per
   * drag gesture via beginMove() first; wiring/values are unaffected by
   * position, so there's nothing to resimulate mid-drag. */
  moveComponentLive: (componentId: number, x: number, y: number) => void;

  /** Creates a new empty, non-top-level module (a new tab) and switches to it. */
  addModule: (name: string) => number;
  switchModule: (moduleId: number) => void;

  toggleSwitch: (componentId: number) => void;
  /** Momentary push button: 1 while held, 0 on release. Simulation-only,
   * like toggleSwitch — doesn't push an undo checkpoint. */
  pressButton: (componentId: number) => void;
  releaseButton: (componentId: number) => void;
  /** Attempts to connect two pins. Returns false if the connection is invalid
   * (same kind, same component, or the input pin already has a driver) —
   * this is the wiring-time bus-conflict prevention. Sets `wiringError` with
   * a human-readable reason on failure. */
  connectPins: (a: PinRef, b: PinRef) => boolean;
  isPinConnected: (pin: PinRef) => boolean;
  /** Last rejected connectPins() attempt's reason, for a transient UI toast.
   * Cleared automatically on the next successful connection, or manually. */
  wiringError: string | null;
  clearWiringError: () => void;

  /** Loads a freshly-fetched circuit file into the editor, replacing current state. */
  loadCircuit: (filename: string, circuit: CircuitFile) => void;
  /** Packages all modules into the persisted wire format for saving. */
  toCircuitFile: () => CircuitFile;

  /** Toggles every CLOCK component's level — one half-period step. Also
   * appends one waveform sample for the active module. */
  stepClock: () => void;
  setClockFrequency: (hz: number) => void;
  startClock: () => void;
  stopClock: () => void;

  /** Manually-tracked nets, persisted (sample history itself is not — see
   * waveformSamples). Scoped per module via each track's topModuleId. */
  waveformTracks: WaveformTrack[];
  /** Per-module ring buffer of samples — not persisted, not a live
   * background sim of inactive tabs; just continuity for the active one. */
  waveformSamples: Map<number, WaveformSample[]>;
  addWaveformTrack: (netId: number) => void;
  removeWaveformTrack: (netId: number) => void;
  isNetTracked: (netId: number) => boolean;
}

/** Owns the Run-mode interval outside React/Zustand state — it's pure side
 * effect plumbing, not something any component reads directly (only the
 * `isRunning` boolean matters to the UI). */
let runIntervalId: ReturnType<typeof setInterval> | null = null;

function resimulate(modules: Module[], activeModuleId: number, previous: SimGraph): SimGraph {
  const graph = elaborate(modules, activeModuleId, previous);
  tick(graph);
  return graph;
}

function getPinWidth(module: Module, pin: PinRef): number {
  const component = module.components.find((c) => c.id === pin.componentId)!;
  const layout = getComponentDefinition(component.type).getPinLayout(component.properties);
  const pins = pin.pinKind === 'in' ? layout.inputs : layout.outputs;
  return pins[pin.pinIndex].width;
}

/** A net is only meaningful if it still has both a driver and at least one
 * consumer; drops any that no longer do (and their now-dangling connections)
 * — shared by deleteComponent and updateComponentProperties, both of which
 * can invalidate specific pin connections. */
function pruneDeadNets(nets: Net[], pinConnections: PinConnection[]): { nets: Net[]; pinConnections: PinConnection[] } {
  const liveNetIds = new Set(
    nets
      .map((n) => n.id)
      .filter((netId) => {
        const remaining = pinConnections.filter((c) => c.netId === netId);
        return remaining.some((c) => c.pinKind === 'out') && remaining.some((c) => c.pinKind === 'in');
      }),
  );
  return {
    nets: nets.filter((n) => liveNetIds.has(n.id)),
    pinConnections: pinConnections.filter((c) => liveNetIds.has(c.netId)),
  };
}

function computeNextId(modules: Module[]): number {
  const ids = modules.flatMap((module) => [
    ...module.pins.map((p) => p.id),
    ...module.components.map((c) => c.id),
    ...module.nets.map((n) => n.id),
    ...module.wireSegments.map((w) => w.id),
    ...module.pinConnections.map((c) => c.id),
  ]);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

/** Module ids are a separate namespace from component/net/pin ids (they're
 * genuinely separate AUTOINCREMENT columns in the persisted schema), so
 * creating a new module can never collide with existing component ids. */
function computeNextModuleId(modules: Module[]): number {
  return Math.max(...modules.map((m) => m.id)) + 1;
}

/** Every structural edit goes through this: computes the new ACTIVE module
 * (and optionally a bumped nextId) via `compute`, resimulates, and pushes
 * the pre-edit modules array onto the undo stack while clearing redo. */
function applyStructuralChange(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  compute: (state: EditorState) => { module: Module; nextId?: number },
): void {
  const state = get();
  const { module, nextId } = compute(state);
  const modules = state.modules.map((m) => (m.id === state.activeModuleId ? module : m));
  const simGraph = resimulate(modules, state.activeModuleId, state.simGraph);
  const simGraphCache = new Map(state.simGraphCache);
  simGraphCache.set(state.activeModuleId, simGraph);
  set({
    modules,
    module,
    nextId: nextId ?? state.nextId,
    simGraph,
    simGraphCache,
    past: [...state.past, state.modules],
    future: [],
  });
}

const initialModule = emptyModule(1, 'main', true);

export const useEditorStore = create<EditorState>((set, get) => ({
  modules: [initialModule],
  activeModuleId: 1,
  module: initialModule,
  simGraph: { nodes: [], nets: new Map() },
  simGraphCache: new Map(),
  nextId: 1,
  nextModuleId: 2, // module id 1 ("main") is already taken
  currentFilename: null,
  clockFrequencyHz: 1,
  isRunning: false,
  past: [],
  future: [],
  selectedComponentId: null,
  clipboard: null,
  pasteCount: 0,
  waveformTracks: [],
  waveformSamples: new Map(),
  wiringError: null,

  undo: () => {
    const state = get();
    if (state.past.length === 0) return;
    const modules = state.past[state.past.length - 1];
    const module = modules.find((m) => m.id === state.activeModuleId) ?? modules[0];
    set({
      modules,
      module,
      past: state.past.slice(0, -1),
      future: [state.modules, ...state.future],
      simGraph: resimulate(modules, module.id, state.simGraph),
      selectedComponentId: null,
    });
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return;
    const modules = state.future[0];
    const module = modules.find((m) => m.id === state.activeModuleId) ?? modules[0];
    set({
      modules,
      module,
      future: state.future.slice(1),
      past: [...state.past, state.modules],
      simGraph: resimulate(modules, module.id, state.simGraph),
      selectedComponentId: null,
    });
  },

  selectComponent: (id) => set({ selectedComponentId: id }),

  copySelection: () => {
    const state = get();
    const component = state.module.components.find((c) => c.id === state.selectedComponentId);
    if (!component) return;
    set({
      clipboard: { type: component.type, properties: component.properties, x: component.x, y: component.y },
      pasteCount: 0,
    });
  },

  paste: () => {
    const before = get();
    if (!before.clipboard) return;
    const id = before.nextId;
    const offset = PASTE_OFFSET * (before.pasteCount + 1);
    const clipboard = before.clipboard;
    applyStructuralChange(get, set, (state) => {
      const component: ComponentInstance = {
        id,
        moduleId: state.module.id,
        type: clipboard.type,
        x: clipboard.x + offset,
        y: clipboard.y + offset,
        rotation: 0,
        mirrored: false,
        properties: clipboard.properties,
      };
      return { module: { ...state.module, components: [...state.module.components, component] }, nextId: id + 1 };
    });
    set({ pasteCount: before.pasteCount + 1, selectedComponentId: id });
  },

  duplicateSelection: () => {
    get().copySelection();
    get().paste();
  },

  addComponent: (type, x, y) => {
    getComponentDefinition(type); // throws if `type` isn't a registered component
    applyStructuralChange(get, set, (state) => {
      const id = state.nextId;
      const component: ComponentInstance = {
        id,
        moduleId: state.module.id,
        type,
        x,
        y,
        rotation: 0,
        mirrored: false,
        properties: defaultPropertiesFor(type),
      };
      let module: Module = { ...state.module, components: [...state.module.components, component] };
      let nextId = id + 1;

      // Placing a boundary marker also registers it as one of this module's
      // pins, so it's immediately available for addSubcircuitInstance
      // elsewhere to pick up.
      if (BOUNDARY_MARKERS.includes(type)) {
        const modulePin: ModulePin = {
          id: nextId++,
          moduleId: module.id,
          direction: type === 'INPUT_PIN' ? 'in' : 'out',
          bitWidth: (component.properties.width as number) ?? 1,
          orderIndex: component.id,
          name: `${type === 'INPUT_PIN' ? 'IN' : 'OUT'}${component.id}`,
          sourceComponentId: component.id,
        };
        module = { ...module, pins: [...module.pins, modulePin] };
      }

      return { module, nextId };
    });
  },

  addSubcircuitInstance: (targetModuleId, x, y) => {
    const state = get();
    if (wouldCreateCycle(state.modules, state.activeModuleId, targetModuleId)) return false;
    const targetModule = state.modules.find((m) => m.id === targetModuleId);
    if (!targetModule) return false;

    applyStructuralChange(get, set, (s) => {
      const id = s.nextId;
      const component: ComponentInstance = {
        id,
        moduleId: s.module.id,
        type: 'SUBCIRCUIT',
        x,
        y,
        rotation: 0,
        mirrored: false,
        properties: { subcircuitModuleId: targetModuleId, pins: derivePinsFromModule(targetModule) },
      };
      return { module: { ...s.module, components: [...s.module.components, component] }, nextId: id + 1 };
    });
    return true;
  },

  deleteComponent: (componentId) => {
    applyStructuralChange(get, set, (state) => {
      const deletedComponent = state.module.components.find((c) => c.id === componentId);
      const components = state.module.components.filter((c) => c.id !== componentId);
      const afterRemoval = state.module.pinConnections.filter((c) => c.componentInstanceId !== componentId);
      const { nets, pinConnections } = pruneDeadNets(state.module.nets, afterRemoval);

      // Deleting a boundary marker also retires its module pin, so any
      // *future* sub-circuit instantiation reflects the smaller boundary
      // (existing instances elsewhere keep their already-captured layout).
      const pins =
        deletedComponent && BOUNDARY_MARKERS.includes(deletedComponent.type)
          ? state.module.pins.filter((p) => p.sourceComponentId !== componentId)
          : state.module.pins;

      return { module: { ...state.module, components, pinConnections, nets, pins } };
    });
    set({ selectedComponentId: null });
  },

  rotateComponent: (componentId) => {
    applyStructuralChange(get, set, (state) => ({
      module: {
        ...state.module,
        components: state.module.components.map((c) =>
          c.id === componentId ? { ...c, rotation: (((c.rotation + 90) % 360) as 0 | 90 | 180 | 270) } : c,
        ),
      },
    }));
  },

  mirrorComponent: (componentId) => {
    applyStructuralChange(get, set, (state) => ({
      module: {
        ...state.module,
        components: state.module.components.map((c) => (c.id === componentId ? { ...c, mirrored: !c.mirrored } : c)),
      },
    }));
  },

  updateComponentProperties: (componentId, properties) => {
    applyStructuralChange(get, set, (state) => {
      const component = state.module.components.find((c) => c.id === componentId);
      if (!component) return { module: state.module };

      const definition = getComponentDefinition(component.type);
      const oldLayout = definition.getPinLayout(component.properties);
      const updatedComponent = { ...component, properties: { ...component.properties, ...properties } };
      const newLayout = definition.getPinLayout(updatedComponent.properties);

      // Drop any existing connection on a pin that no longer exists, or
      // whose width just changed (its net's fixed bitWidth would otherwise
      // silently disagree with the pin it's attached to).
      const afterPropertyChange = state.module.pinConnections.filter((c) => {
        if (c.componentInstanceId !== componentId) return true;
        const oldPins = c.pinKind === 'in' ? oldLayout.inputs : oldLayout.outputs;
        const newPins = c.pinKind === 'in' ? newLayout.inputs : newLayout.outputs;
        if (c.pinIndex >= newPins.length) return false;
        return oldPins[c.pinIndex]?.width === newPins[c.pinIndex].width;
      });
      const { nets, pinConnections } = pruneDeadNets(state.module.nets, afterPropertyChange);

      const components = state.module.components.map((c) => (c.id === componentId ? updatedComponent : c));

      // Keep the module's boundary-pin metadata (used by *future*
      // sub-circuit instantiations) in sync when a marker's width changes.
      const pins = BOUNDARY_MARKERS.includes(updatedComponent.type)
        ? state.module.pins.map((p) =>
            p.sourceComponentId === componentId
              ? { ...p, bitWidth: (newLayout.outputs[0] ?? newLayout.inputs[0]).width }
              : p,
          )
        : state.module.pins;

      return { module: { ...state.module, components, pinConnections, nets, pins } };
    });
  },

  beginMove: () => {
    const state = get();
    set({ past: [...state.past, state.modules], future: [] });
  },

  moveComponentLive: (componentId, x, y) => {
    set((state) => {
      const module: Module = {
        ...state.module,
        components: state.module.components.map((c) => (c.id === componentId ? { ...c, x, y } : c)),
      };
      return { module, modules: state.modules.map((m) => (m.id === state.activeModuleId ? module : m)) };
    });
  },

  addModule: (name) => {
    const state = get();
    const id = state.nextModuleId;
    const newModule = emptyModule(id, name, false);
    const modules = [...state.modules, newModule];
    set({
      modules,
      nextModuleId: id + 1,
      past: [...state.past, state.modules],
      future: [],
    });
    get().switchModule(id);
    return id;
  },

  switchModule: (moduleId) => {
    const state = get();
    const module = state.modules.find((m) => m.id === moduleId);
    if (!module) return;
    const simGraphCache = new Map(state.simGraphCache);
    simGraphCache.set(state.activeModuleId, state.simGraph);
    const simGraph = resimulate(state.modules, moduleId, simGraphCache.get(moduleId) ?? { nodes: [], nets: new Map() });
    simGraphCache.set(moduleId, simGraph);
    set({ activeModuleId: moduleId, module, simGraph, simGraphCache, selectedComponentId: null });
  },

  toggleSwitch: (componentId) => {
    set((state) => {
      // Also handles INPUT_PIN: when a module is viewed standalone (not
      // nested as someone's sub-circuit), its boundary INPUT_PINs act as
      // settable test sources the same way a SWITCH does.
      const components = state.module.components.map((c) =>
        c.id === componentId && (c.type === 'SWITCH' || c.type === 'INPUT_PIN')
          ? { ...c, properties: { ...c.properties, value: c.properties.value === 1 ? 0 : 1 } }
          : c,
      );
      const module: Module = { ...state.module, components };
      const modules = state.modules.map((m) => (m.id === state.activeModuleId ? module : m));
      return { module, modules, simGraph: resimulate(modules, state.activeModuleId, state.simGraph) };
    });
  },

  pressButton: (componentId) => {
    set((state) => {
      const components = state.module.components.map((c) =>
        c.id === componentId && c.type === 'BUTTON' ? { ...c, properties: { ...c.properties, pressed: 1 } } : c,
      );
      const module: Module = { ...state.module, components };
      const modules = state.modules.map((m) => (m.id === state.activeModuleId ? module : m));
      return { module, modules, simGraph: resimulate(modules, state.activeModuleId, state.simGraph) };
    });
  },

  releaseButton: (componentId) => {
    set((state) => {
      const components = state.module.components.map((c) =>
        c.id === componentId && c.type === 'BUTTON' ? { ...c, properties: { ...c.properties, pressed: 0 } } : c,
      );
      const module: Module = { ...state.module, components };
      const modules = state.modules.map((m) => (m.id === state.activeModuleId ? module : m));
      return { module, modules, simGraph: resimulate(modules, state.activeModuleId, state.simGraph) };
    });
  },

  isPinConnected: (pin) => {
    return get().module.pinConnections.some(
      (c) => c.componentInstanceId === pin.componentId && c.pinKind === pin.pinKind && c.pinIndex === pin.pinIndex,
    );
  },

  connectPins: (a, b) => {
    const fail = (message: string) => {
      set({ wiringError: message });
      return false;
    };

    if (a.componentId === b.componentId) return fail("Can't connect a component to itself.");
    if (a.pinKind === b.pinKind) {
      return fail(a.pinKind === 'out' ? "Can't connect two outputs together." : "Can't connect two inputs together.");
    }
    const output = a.pinKind === 'out' ? a : b;
    const input = a.pinKind === 'in' ? a : b;

    const state = get();

    const outputWidth = getPinWidth(state.module, output);
    const inputWidth = getPinWidth(state.module, input);
    if (outputWidth !== inputWidth) {
      return fail(`Bit-width mismatch: ${outputWidth}-bit output can't connect to a ${inputWidth}-bit input.`);
    }

    const inputAlreadyDriven = state.module.pinConnections.some(
      (c) => c.componentInstanceId === input.componentId && c.pinKind === 'in' && c.pinIndex === input.pinIndex,
    );
    if (inputAlreadyDriven) {
      return fail('That input already has a driver — disconnect it first.');
    }

    const existingOutputConnection = state.module.pinConnections.find(
      (c) => c.componentInstanceId === output.componentId && c.pinKind === 'out' && c.pinIndex === output.pinIndex,
    );

    let connectedNetId: number;
    let nets: Net[] = state.module.nets;
    let pinConnections = state.module.pinConnections;
    let nextId = state.nextId;

    if (existingOutputConnection) {
      connectedNetId = existingOutputConnection.netId; // fan-out: reuse the output's existing net
    } else {
      connectedNetId = nextId++;
      nets = [...nets, { id: connectedNetId, moduleId: state.module.id, bitWidth: outputWidth, isBus: outputWidth > 1 }];
      const outputConnection: PinConnection = {
        id: nextId++,
        netId: connectedNetId,
        componentInstanceId: output.componentId,
        pinIndex: output.pinIndex,
        pinKind: 'out',
      };
      pinConnections = [...pinConnections, outputConnection];
    }

    const inputConnection: PinConnection = {
      id: nextId++,
      netId: connectedNetId,
      componentInstanceId: input.componentId,
      pinIndex: input.pinIndex,
      pinKind: 'in',
    };
    pinConnections = [...pinConnections, inputConnection];

    applyStructuralChange(get, set, (s) => ({
      module: { ...s.module, nets, pinConnections },
      nextId,
    }));
    set({ wiringError: null });
    return true;
  },

  clearWiringError: () => set({ wiringError: null }),

  loadCircuit: (filename, circuit) => {
    get().stopClock();
    const activeModuleId = circuit.activeTabModuleId ?? circuit.topLevelModuleId;
    const module = circuit.modules.find((m) => m.id === activeModuleId) ?? circuit.modules[0] ?? emptyModule(1, 'main', true);
    const graph = elaborate(circuit.modules, module.id);
    tick(graph);
    set({
      modules: circuit.modules,
      activeModuleId: module.id,
      module,
      simGraph: graph,
      simGraphCache: new Map([[module.id, graph]]),
      nextId: computeNextId(circuit.modules),
      nextModuleId: computeNextModuleId(circuit.modules),
      currentFilename: filename,
      clockFrequencyHz: circuit.clockFrequencyHz,
      isRunning: false,
      past: [],
      future: [],
      selectedComponentId: null,
      clipboard: null,
      pasteCount: 0,
      waveformTracks: circuit.waveformTracks,
      waveformSamples: new Map(),
    });
  },

  toCircuitFile: () => {
    const { modules, activeModuleId, clockFrequencyHz, waveformTracks } = get();
    const topLevel = modules.find((m) => m.isTopLevel) ?? modules[0];
    return {
      schemaVersion: SCHEMA_VERSION,
      topLevelModuleId: topLevel.id,
      activeTabModuleId: activeModuleId,
      clockFrequencyHz,
      modules,
      waveformTracks,
    };
  },

  stepClock: () => {
    set((state) => {
      const components = state.module.components.map((c) =>
        c.type === 'CLOCK' ? { ...c, properties: { ...c.properties, level: c.properties.level === 1 ? 0 : 1 } } : c,
      );
      const module: Module = { ...state.module, components };
      const modules = state.modules.map((m) => (m.id === state.activeModuleId ? module : m));
      const simGraph = resimulate(modules, state.activeModuleId, state.simGraph);

      const existingSamples = state.waveformSamples.get(state.activeModuleId) ?? [];
      const nextTick = (existingSamples.at(-1)?.tick ?? -1) + 1;
      const manualNetIds = state.waveformTracks
        .filter((t) => t.topModuleId === state.activeModuleId)
        .map((t) => t.instancePath[0]);
      const sample = sampleWaveform(module, simGraph, nextTick, manualNetIds);
      const waveformSamples = new Map(state.waveformSamples);
      waveformSamples.set(state.activeModuleId, pushSample(existingSamples, sample));

      return { module, modules, simGraph, waveformSamples };
    });
  },

  setClockFrequency: (hz) => {
    set({ clockFrequencyHz: Math.max(0.1, Math.min(100, hz)) });
    if (get().isRunning) {
      get().stopClock();
      get().startClock();
    }
  },

  startClock: () => {
    if (runIntervalId != null) return;
    const halfPeriodMs = 1000 / (2 * get().clockFrequencyHz);
    runIntervalId = setInterval(() => get().stepClock(), halfPeriodMs);
    set({ isRunning: true });
  },

  stopClock: () => {
    if (runIntervalId != null) {
      clearInterval(runIntervalId);
      runIntervalId = null;
    }
    set({ isRunning: false });
  },

  isNetTracked: (netId) => {
    const state = get();
    return state.waveformTracks.some((t) => t.topModuleId === state.activeModuleId && t.instancePath[0] === netId);
  },

  addWaveformTrack: (netId) => {
    const state = get();
    if (state.isNetTracked(netId)) return;
    const track: WaveformTrack = {
      id: state.nextId,
      topModuleId: state.activeModuleId,
      instancePath: [netId],
      label: null,
      color: null,
    };
    set({ waveformTracks: [...state.waveformTracks, track], nextId: state.nextId + 1 });
  },

  removeWaveformTrack: (netId) => {
    const state = get();
    set({
      waveformTracks: state.waveformTracks.filter(
        (t) => !(t.topModuleId === state.activeModuleId && t.instancePath[0] === netId),
      ),
    });
  },
}));
