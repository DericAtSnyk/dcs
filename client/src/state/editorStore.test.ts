import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editorStore.js';

function reset() {
  const module = {
    id: 1,
    name: 'main',
    isTopLevel: true,
    viewState: null,
    pins: [],
    components: [],
    nets: [],
    wireSegments: [],
    pinConnections: [],
  };
  useEditorStore.setState({
    modules: [module],
    activeModuleId: 1,
    module,
    simGraph: { nodes: [], nets: new Map() },
    simGraphCache: new Map(),
    nextId: 1,
    nextModuleId: 2,
    past: [],
    future: [],
    selectedComponentId: null,
    clipboard: null,
    pasteCount: 0,
    waveformTracks: [],
    waveformSamples: new Map(),
    wiringError: null,
  });
}

describe('editorStore: two switches -> AND -> LED (Phase 3 target circuit)', () => {
  beforeEach(reset);

  it('wires up live and reflects the AND truth table as switches toggle', () => {
    const store = useEditorStore.getState();

    store.addComponent('SWITCH', 0, 0); // id 1
    store.addComponent('SWITCH', 0, 100); // id 2
    store.addComponent('AND', 200, 50); // id 3
    store.addComponent('LED', 400, 50); // id 4

    const ok1 = store.connectPins(
      { componentId: 1, pinKind: 'out', pinIndex: 0 },
      { componentId: 3, pinKind: 'in', pinIndex: 0 },
    );
    const ok2 = store.connectPins(
      { componentId: 2, pinKind: 'out', pinIndex: 0 },
      { componentId: 3, pinKind: 'in', pinIndex: 1 },
    );
    const ok3 = store.connectPins(
      { componentId: 3, pinKind: 'out', pinIndex: 0 },
      { componentId: 4, pinKind: 'in', pinIndex: 0 },
    );
    expect([ok1, ok2, ok3]).toEqual([true, true, true]);

    const ledInputValue = () => {
      const led = useEditorStore.getState().module.components.find((c) => c.type === 'LED')!;
      const conn = useEditorStore
        .getState()
        .module.pinConnections.find((c) => c.componentInstanceId === led.id && c.pinKind === 'in')!;
      return useEditorStore.getState().simGraph.nets.get(`n${conn.netId}`)!.value.bits[0];
    };

    // both switches start at 0 -> AND -> 0
    expect(ledInputValue()).toBe(0);

    store.toggleSwitch(1);
    expect(ledInputValue()).toBe(0); // only one switch on

    store.toggleSwitch(2);
    expect(ledInputValue()).toBe(1); // both on

    store.toggleSwitch(1);
    expect(ledInputValue()).toBe(0); // back to one on
  });

  it('rejects wiring a second driver onto an already-connected input (bus-conflict prevention)', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('SWITCH', 0, 100); // 2
    store.addComponent('AND', 200, 50); // 3

    const first = store.connectPins(
      { componentId: 1, pinKind: 'out', pinIndex: 0 },
      { componentId: 3, pinKind: 'in', pinIndex: 0 },
    );
    const second = store.connectPins(
      { componentId: 2, pinKind: 'out', pinIndex: 0 },
      { componentId: 3, pinKind: 'in', pinIndex: 0 }, // same input pin, already driven
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(useEditorStore.getState().wiringError).toMatch(/already has a driver/i);
  });

  it('sets a human-readable wiringError message on rejection, clearing it on the next success', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('SWITCH', 0, 100); // 2
    // Two outputs: an invalid connection kind.
    expect(store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 2, pinKind: 'out', pinIndex: 0 })).toBe(
      false,
    );
    expect(useEditorStore.getState().wiringError).toMatch(/two outputs/i);

    store.addComponent('LED', 200, 0); // 3
    expect(store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 0 })).toBe(true);
    expect(useEditorStore.getState().wiringError).toBeNull();
  });

  it('supports fan-out: one output driving two inputs', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('AND', 200, 0); // 2
    store.addComponent('AND', 200, 100); // 3

    const first = store.connectPins(
      { componentId: 1, pinKind: 'out', pinIndex: 0 },
      { componentId: 2, pinKind: 'in', pinIndex: 0 },
    );
    const second = store.connectPins(
      { componentId: 1, pinKind: 'out', pinIndex: 0 },
      { componentId: 3, pinKind: 'in', pinIndex: 0 },
    );

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(useEditorStore.getState().module.nets).toHaveLength(1);
  });
});

describe('editorStore: Phase 5 bus features', () => {
  beforeEach(reset);

  it('rejects wiring a 4-bit bus output directly into a 1-bit gate input (width-mismatch prevention)', () => {
    const store = useEditorStore.getState();
    store.addComponent('MERGER', 0, 0); // id 1, default width 4
    store.addComponent('AND', 200, 0); // id 2

    const ok = store.connectPins(
      { componentId: 1, pinKind: 'out', pinIndex: 0 }, // 4-bit bus output
      { componentId: 2, pinKind: 'in', pinIndex: 0 }, // 1-bit input
    );

    expect(ok).toBe(false);
    expect(useEditorStore.getState().module.nets).toHaveLength(0);
  });

  it('wires a matching 4-bit merger -> splitter connection and marks the net as a bus', () => {
    const store = useEditorStore.getState();
    store.addComponent('MERGER', 0, 0); // id 1
    store.addComponent('SPLITTER', 200, 0); // id 2

    const ok = store.connectPins(
      { componentId: 1, pinKind: 'out', pinIndex: 0 },
      { componentId: 2, pinKind: 'in', pinIndex: 0 },
    );

    expect(ok).toBe(true);
    const net = useEditorStore.getState().module.nets[0];
    expect(net.bitWidth).toBe(4);
    expect(net.isBus).toBe(true);
  });

  it('four switches -> merger -> splitter -> four LEDs live-propagates each bit correctly', () => {
    const store = useEditorStore.getState();
    const desiredValues = [1, 0, 1, 1];
    desiredValues.forEach((_, i) => store.addComponent('SWITCH', 0, i * 40)); // ids 1-4, default 0
    desiredValues.forEach((v, i) => {
      if (v === 1) store.toggleSwitch(i + 1);
    });
    store.addComponent('MERGER', 200, 0); // id 5
    store.addComponent('SPLITTER', 400, 0); // id 6
    [0, 1, 2, 3].forEach(() => store.addComponent('LED', 600, 0)); // ids 7-10

    [0, 1, 2, 3].forEach((i) => {
      expect(
        store.connectPins({ componentId: i + 1, pinKind: 'out', pinIndex: 0 }, { componentId: 5, pinKind: 'in', pinIndex: i }),
      ).toBe(true);
    });
    expect(store.connectPins({ componentId: 5, pinKind: 'out', pinIndex: 0 }, { componentId: 6, pinKind: 'in', pinIndex: 0 })).toBe(
      true,
    );
    [0, 1, 2, 3].forEach((i) => {
      expect(
        store.connectPins({ componentId: 6, pinKind: 'out', pinIndex: i }, { componentId: 7 + i, pinKind: 'in', pinIndex: 0 }),
      ).toBe(true);
    });

    const ledValue = (ledId: number) => {
      const conn = useEditorStore
        .getState()
        .module.pinConnections.find((c) => c.componentInstanceId === ledId && c.pinKind === 'in')!;
      return useEditorStore.getState().simGraph.nets.get(`n${conn.netId}`)!.value.bits[0];
    };

    expect([ledValue(7), ledValue(8), ledValue(9), ledValue(10)]).toEqual(desiredValues);
  });
});

describe('editorStore: Phase 6 clock-driven toggle flip-flop', () => {
  beforeEach(reset);

  it('a JK_FF wired J=K=1 toggles each time stepClock completes a rising edge', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1: J, default 0
    store.addComponent('SWITCH', 0, 40); // 2: K, default 0
    store.addComponent('SWITCH', 0, 80); // 3: CLR, default 0
    store.addComponent('CLOCK', 200, 0); // 4
    store.addComponent('JK_FF', 400, 0); // 5
    store.addComponent('LED', 600, 0); // 6

    store.toggleSwitch(1); // J = 1
    store.toggleSwitch(2); // K = 1

    expect(store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 5, pinKind: 'in', pinIndex: 0 })).toBe(true);
    expect(store.connectPins({ componentId: 2, pinKind: 'out', pinIndex: 0 }, { componentId: 5, pinKind: 'in', pinIndex: 1 })).toBe(true);
    expect(store.connectPins({ componentId: 4, pinKind: 'out', pinIndex: 0 }, { componentId: 5, pinKind: 'in', pinIndex: 2 })).toBe(true);
    expect(store.connectPins({ componentId: 3, pinKind: 'out', pinIndex: 0 }, { componentId: 5, pinKind: 'in', pinIndex: 3 })).toBe(true);
    expect(store.connectPins({ componentId: 5, pinKind: 'out', pinIndex: 0 }, { componentId: 6, pinKind: 'in', pinIndex: 0 })).toBe(true);

    store.toggleSwitch(3); // assert async CLR=1 to establish a known Q=0 starting state
    store.toggleSwitch(3); // release CLR

    const ledValue = () => {
      const conn = useEditorStore.getState().module.pinConnections.find((c) => c.componentInstanceId === 6 && c.pinKind === 'in')!;
      return useEditorStore.getState().simGraph.nets.get(`n${conn.netId}`)!.value.bits[0];
    };

    const observed: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      useEditorStore.getState().stepClock(); // rising edge (0->1)
      observed.push(ledValue());
      useEditorStore.getState().stepClock(); // falling edge (1->0), must not toggle
    }
    expect(observed).toEqual([1, 0, 1, 0]);
  });
});

describe('editorStore: Phase 7 undo/redo, copy/paste/duplicate, rotate/mirror, delete', () => {
  beforeEach(reset);

  it('undoes and redoes an add, a wire, and a delete in sequence', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('LED', 200, 0); // 2
    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 2, pinKind: 'in', pinIndex: 0 });
    expect(useEditorStore.getState().module.components).toHaveLength(2);
    expect(useEditorStore.getState().module.nets).toHaveLength(1);

    store.deleteComponent(2);
    expect(useEditorStore.getState().module.components).toHaveLength(1);
    expect(useEditorStore.getState().module.nets).toHaveLength(0); // orphaned net cleaned up

    store.undo(); // undoes the delete
    expect(useEditorStore.getState().module.components).toHaveLength(2);
    expect(useEditorStore.getState().module.nets).toHaveLength(1);

    store.undo(); // undoes the wire
    expect(useEditorStore.getState().module.nets).toHaveLength(0);

    store.undo(); // undoes adding the LED
    expect(useEditorStore.getState().module.components).toHaveLength(1);

    store.undo(); // undoes adding the switch
    expect(useEditorStore.getState().module.components).toHaveLength(0);

    store.undo(); // no more history: no-op
    expect(useEditorStore.getState().module.components).toHaveLength(0);

    store.redo();
    store.redo();
    store.redo();
    store.redo();
    expect(useEditorStore.getState().module.components).toHaveLength(1); // LED deleted again by the 4th redo
    expect(useEditorStore.getState().module.nets).toHaveLength(0);
  });

  it('a new edit after undo discards the redo stack', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('LED', 200, 0); // 2
    store.undo();
    expect(useEditorStore.getState().module.components).toHaveLength(1);

    store.addComponent('AND', 400, 0); // a fresh edit branches away from the LED redo
    expect(useEditorStore.getState().module.components.map((c) => c.type)).toEqual(['SWITCH', 'AND']);

    store.redo(); // nothing left to redo
    expect(useEditorStore.getState().module.components.map((c) => c.type)).toEqual(['SWITCH', 'AND']);
  });

  it('rotate cycles 0->90->180->270->0 and is itself undoable', () => {
    const store = useEditorStore.getState();
    store.addComponent('AND', 0, 0); // 1
    store.rotateComponent(1);
    expect(useEditorStore.getState().module.components[0].rotation).toBe(90);
    store.rotateComponent(1);
    store.rotateComponent(1);
    store.rotateComponent(1);
    expect(useEditorStore.getState().module.components[0].rotation).toBe(0);

    store.undo();
    expect(useEditorStore.getState().module.components[0].rotation).toBe(270);
  });

  it('mirror toggles and is undoable', () => {
    const store = useEditorStore.getState();
    store.addComponent('AND', 0, 0); // 1
    store.mirrorComponent(1);
    expect(useEditorStore.getState().module.components[0].mirrored).toBe(true);
    store.undo();
    expect(useEditorStore.getState().module.components[0].mirrored).toBe(false);
  });

  it('a move drag pushes exactly one undo checkpoint regardless of how many intermediate positions it visits', () => {
    const store = useEditorStore.getState();
    store.addComponent('AND', 0, 0); // 1
    const pastLengthBefore = useEditorStore.getState().past.length;

    store.beginMove();
    for (let x = 20; x <= 200; x += 20) {
      store.moveComponentLive(1, x, 0); // simulates many pointermove events in one drag
    }
    expect(useEditorStore.getState().past.length).toBe(pastLengthBefore + 1);
    expect(useEditorStore.getState().module.components[0].x).toBe(200);

    store.undo();
    expect(useEditorStore.getState().module.components[0].x).toBe(0); // back to pre-drag position in one undo
  });

  it('copy + paste creates an unwired clone offset from the original, selected and undoable', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 100, 100); // 1
    store.toggleSwitch(1); // value: 1, to prove properties are cloned
    store.selectComponent(1);
    store.copySelection();
    store.paste();

    const components = useEditorStore.getState().module.components;
    expect(components).toHaveLength(2);
    const pasted = components[1];
    expect(pasted.type).toBe('SWITCH');
    expect(pasted.properties.value).toBe(1); // properties cloned, not reset
    expect(pasted.x).toBeGreaterThan(100); // offset from original
    expect(useEditorStore.getState().selectedComponentId).toBe(pasted.id);

    store.undo();
    expect(useEditorStore.getState().module.components).toHaveLength(1);
  });

  it('duplicateSelection is equivalent to copy immediately followed by paste', () => {
    const store = useEditorStore.getState();
    store.addComponent('AND', 100, 100); // 1
    store.selectComponent(1);
    store.duplicateSelection();
    expect(useEditorStore.getState().module.components).toHaveLength(2);
    expect(useEditorStore.getState().module.components[1].type).toBe('AND');
  });

  it('deleting a component also removes its pin connections and any now-orphaned net, without touching unrelated wiring', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('AND', 200, 0); // 2
    store.addComponent('AND', 200, 100); // 3 (fan-out target, unrelated to the deletion below)
    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 2, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 0 });
    expect(useEditorStore.getState().module.nets).toHaveLength(1); // fan-out: one shared net

    store.deleteComponent(2);
    const state = useEditorStore.getState();
    expect(state.module.components.map((c) => c.id)).toEqual([1, 3]);
    // The net survives because component 3 (unrelated) still uses it.
    expect(state.module.nets).toHaveLength(1);
    expect(state.module.pinConnections.some((c) => c.componentInstanceId === 2)).toBe(false);
    expect(state.module.pinConnections.some((c) => c.componentInstanceId === 3)).toBe(true);
  });
});

describe('editorStore: Phase 8 MSI target circuits', () => {
  beforeEach(reset);

  it('a 4-bit COUNTER wired to a VALUE_DISPLAY counts up live under the clock', () => {
    const store = useEditorStore.getState();
    store.addComponent('CLOCK', 0, 0); // 1
    store.addComponent('SWITCH', 0, 100); // 2: CLR
    store.addComponent('COUNTER', 200, 0); // 3, default width 4
    store.addComponent('VALUE_DISPLAY', 400, 0); // 4, default width 4

    expect(store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 0 })).toBe(true);
    expect(store.connectPins({ componentId: 2, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 1 })).toBe(true);
    expect(store.connectPins({ componentId: 3, pinKind: 'out', pinIndex: 0 }, { componentId: 4, pinKind: 'in', pinIndex: 0 })).toBe(true);

    const displayValue = () => {
      const conn = useEditorStore.getState().module.pinConnections.find((c) => c.componentInstanceId === 4 && c.pinKind === 'in')!;
      const bits = useEditorStore.getState().simGraph.nets.get(`n${conn.netId}`)!.value.bits;
      return bits.reduce<number>((acc, b, i) => acc + (b === 1 ? 1 << i : 0), 0);
    };

    store.toggleSwitch(2); // assert CLR
    store.toggleSwitch(2); // release CLR
    expect(displayValue()).toBe(0);

    store.stepClock(); // rising edge
    expect(displayValue()).toBe(1);
    store.stepClock(); // falling edge, no change
    expect(displayValue()).toBe(1);
    store.stepClock(); // rising edge
    expect(displayValue()).toBe(2);
  });

  it('a BCD_DECODER wired to a SEVEN_SEG accepts the matching 7-bit bus width', () => {
    const store = useEditorStore.getState();
    store.addComponent('BCD_DECODER', 0, 0); // 1: 4-bit in, 7-bit out
    store.addComponent('SEVEN_SEG', 200, 0); // 2: 7-bit in

    const ok = store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 2, pinKind: 'in', pinIndex: 0 });
    expect(ok).toBe(true);
    expect(useEditorStore.getState().module.nets[0].bitWidth).toBe(7);
  });
});

describe('editorStore: Phase 9 sub-circuits + tabs', () => {
  beforeEach(reset);

  it('addModule creates a new tab and switches to it; switchModule returns to the original', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // lives in the original "main" module (id 1)

    const subId = store.addModule('Full Adder');
    expect(useEditorStore.getState().activeModuleId).toBe(subId);
    expect(useEditorStore.getState().module.components).toHaveLength(0); // fresh, empty module
    expect(useEditorStore.getState().modules).toHaveLength(2);

    store.switchModule(1);
    expect(useEditorStore.getState().activeModuleId).toBe(1);
    expect(useEditorStore.getState().module.components).toHaveLength(1); // "main" unaffected
  });

  it('placing an INPUT_PIN/OUTPUT_PIN registers a boundary pin usable by addSubcircuitInstance', () => {
    const store = useEditorStore.getState();
    const subId = store.addModule('Cell');
    store.addComponent('INPUT_PIN', 0, 0); // 1
    store.addComponent('INPUT_PIN', 0, 40); // 2
    store.addComponent('OUTPUT_PIN', 200, 0); // 3

    const subModule = useEditorStore.getState().modules.find((m) => m.id === subId)!;
    expect(subModule.pins.map((p) => p.direction)).toEqual(['in', 'in', 'out']);

    store.switchModule(1);
    const ok = store.addSubcircuitInstance(subId, 0, 0);
    expect(ok).toBe(true);

    const instance = useEditorStore.getState().module.components[0];
    expect(instance.type).toBe('SUBCIRCUIT');
    const layout = instance.properties.pins as { direction: string }[];
    expect(layout.map((p) => p.direction)).toEqual(['in', 'in', 'out']);
  });

  it('rejects placing a sub-circuit instance that would create a circular reference', () => {
    const store = useEditorStore.getState();
    const subId = store.addModule('A');
    store.switchModule(1); // back to main, which will become "B" conceptually
    // Direct self-reference: instantiating the currently-active module inside itself.
    expect(store.addSubcircuitInstance(1, 0, 0)).toBe(false);

    // Indirect: A does not yet contain anything; instantiate main(1) inside A, then
    // try to instantiate A inside main — must be rejected as circular.
    store.switchModule(subId);
    expect(store.addSubcircuitInstance(1, 0, 0)).toBe(true); // A -> main is fine so far
    store.switchModule(1);
    expect(store.addSubcircuitInstance(subId, 0, 0)).toBe(false); // main -> A would close the loop
  });

  it('two sub-circuit instances of the same module compute independent Q from independent D, on one shared clock', () => {
    const store = useEditorStore.getState();
    // INPUT_PIN/OUTPUT_PIN each also register a ModulePin from the same id
    // counter, so ids aren't contiguous — read them back rather than guessing.
    const lastId = () => useEditorStore.getState().module.components.at(-1)!.id;

    const cellId = store.addModule('D Cell');
    store.addComponent('INPUT_PIN', 0, 0);
    const dPin = lastId();
    store.addComponent('INPUT_PIN', 0, 40);
    const clkPin = lastId();
    store.addComponent('INPUT_PIN', 0, 80);
    const clrPin = lastId();
    store.addComponent('D_FF', 200, 0);
    const ff = lastId();
    store.addComponent('OUTPUT_PIN', 400, 0);
    const qPin = lastId();
    store.connectPins({ componentId: dPin, pinKind: 'out', pinIndex: 0 }, { componentId: ff, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: clkPin, pinKind: 'out', pinIndex: 0 }, { componentId: ff, pinKind: 'in', pinIndex: 1 });
    store.connectPins({ componentId: clrPin, pinKind: 'out', pinIndex: 0 }, { componentId: ff, pinKind: 'in', pinIndex: 2 });
    store.connectPins({ componentId: ff, pinKind: 'out', pinIndex: 0 }, { componentId: qPin, pinKind: 'in', pinIndex: 0 });

    store.switchModule(1);
    store.addComponent('SWITCH', 0, 0);
    const d1 = lastId();
    store.toggleSwitch(d1);
    store.addComponent('SWITCH', 0, 40);
    const d2 = lastId(); // stays default 0
    store.addComponent('CLOCK', 0, 80);
    const clk = lastId(); // one shared clock
    store.addComponent('SWITCH', 0, 120);
    const clr = lastId(); // shared, stays 0
    store.addSubcircuitInstance(cellId, 200, 0);
    const instanceA = lastId();
    store.addSubcircuitInstance(cellId, 400, 0);
    const instanceB = lastId();

    store.connectPins({ componentId: d1, pinKind: 'out', pinIndex: 0 }, { componentId: instanceA, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: clk, pinKind: 'out', pinIndex: 0 }, { componentId: instanceA, pinKind: 'in', pinIndex: 1 });
    store.connectPins({ componentId: clr, pinKind: 'out', pinIndex: 0 }, { componentId: instanceA, pinKind: 'in', pinIndex: 2 });
    store.connectPins({ componentId: d2, pinKind: 'out', pinIndex: 0 }, { componentId: instanceB, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: clk, pinKind: 'out', pinIndex: 0 }, { componentId: instanceB, pinKind: 'in', pinIndex: 1 });
    store.connectPins({ componentId: clr, pinKind: 'out', pinIndex: 0 }, { componentId: instanceB, pinKind: 'in', pinIndex: 2 });

    store.addComponent('LED', 200, 100);
    const ledA = lastId();
    store.connectPins({ componentId: instanceA, pinKind: 'out', pinIndex: 0 }, { componentId: ledA, pinKind: 'in', pinIndex: 0 });
    store.addComponent('LED', 400, 100);
    const ledB = lastId();
    store.connectPins({ componentId: instanceB, pinKind: 'out', pinIndex: 0 }, { componentId: ledB, pinKind: 'in', pinIndex: 0 });

    const qValue = (ledComponentId: number) => {
      const conn = useEditorStore
        .getState()
        .module.pinConnections.find((c) => c.componentInstanceId === ledComponentId && c.pinKind === 'in')!;
      return useEditorStore.getState().simGraph.nets.get(`n${conn.netId}`)!.value.bits[0];
    };

    store.stepClock(); // rising edge, shared by both instances
    expect(qValue(ledA)).toBe(1); // instance A latched d1=1
    expect(qValue(ledB)).toBe(0); // instance B latched d2=0 — independently computed, not aliased
  });
});

describe('editorStore: Phase 11 waveform viewer', () => {
  beforeEach(reset);

  it('stepClock appends one waveform sample per call, capturing auto-tracked I/O', () => {
    const store = useEditorStore.getState();
    store.addComponent('CLOCK', 0, 0); // 1
    store.addComponent('SWITCH', 0, 40); // 2
    store.addComponent('LED', 200, 0); // 3
    store.addComponent('LED', 200, 40); // 4: wired to the clock, so it has a real net to sample
    store.connectPins({ componentId: 2, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 4, pinKind: 'in', pinIndex: 0 });
    store.toggleSwitch(2); // switch = 1

    expect(useEditorStore.getState().waveformSamples.get(1)).toBeUndefined(); // nothing sampled yet

    store.stepClock();
    store.stepClock();
    const samples = useEditorStore.getState().waveformSamples.get(1)!;
    expect(samples).toHaveLength(2);
    expect(samples[0].tick).toBe(0);
    expect(samples[1].tick).toBe(1);
    expect(samples[1].values['c2'].bits[0]).toBe(1); // switch
    expect(samples[1].values['c3'].bits[0]).toBe(1); // LED sees the same value
    expect(samples[1].values['c1'].bits[0]).toBe(0); // clock itself is auto-tracked (2 steps = back to 0)
  });

  it('addWaveformTrack/removeWaveformTrack manage a manually-tracked net, reflected in isNetTracked', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('LED', 200, 0); // 2
    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 2, pinKind: 'in', pinIndex: 0 });
    const netId = useEditorStore.getState().module.nets[0].id;

    expect(store.isNetTracked(netId)).toBe(false);
    store.addWaveformTrack(netId);
    expect(store.isNetTracked(netId)).toBe(true);
    expect(useEditorStore.getState().waveformTracks).toHaveLength(1);

    store.addWaveformTrack(netId); // adding again is a no-op, not a duplicate
    expect(useEditorStore.getState().waveformTracks).toHaveLength(1);

    store.removeWaveformTrack(netId);
    expect(store.isNetTracked(netId)).toBe(false);
    expect(useEditorStore.getState().waveformTracks).toHaveLength(0);
  });

  it('a manually-tracked net appears in subsequent stepClock samples', () => {
    const store = useEditorStore.getState();
    store.addComponent('CLOCK', 0, 0); // 1
    store.addComponent('SWITCH', 0, 40); // 2
    store.addComponent('AND', 200, 0); // 3, only one input wired — internal net, not auto-tracked
    store.connectPins({ componentId: 2, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 0 });
    store.toggleSwitch(2);
    const netId = useEditorStore.getState().module.nets[0].id;

    store.addWaveformTrack(netId);
    store.stepClock();
    const sample = useEditorStore.getState().waveformSamples.get(1)![0];
    expect(sample.values[`n${netId}`].bits[0]).toBe(1);
  });
});

describe('editorStore: Phase 12 updateComponentProperties', () => {
  beforeEach(reset);

  it('growing inputCount adds pins without disturbing existing connections', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('SWITCH', 0, 40); // 2
    store.addComponent('AND', 200, 0); // 3, default inputCount 2

    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: 2, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 1 });
    expect(useEditorStore.getState().module.pinConnections).toHaveLength(4);

    store.updateComponentProperties(3, { inputCount: 4 });
    const state = useEditorStore.getState();
    expect(state.module.components.find((c) => c.id === 3)!.properties.inputCount).toBe(4);
    expect(state.module.pinConnections).toHaveLength(4); // both existing wires survive
    // New pins 2 and 3 exist and are wireable.
    expect(
      store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 3, pinKind: 'in', pinIndex: 2 }),
    ).toBe(true);
  });

  it('shrinking inputCount disconnects and prunes wires on the pins that no longer exist', () => {
    const store = useEditorStore.getState();
    store.addComponent('SWITCH', 0, 0); // 1
    store.addComponent('SWITCH', 0, 40); // 2
    store.addComponent('SWITCH', 0, 80); // 3
    store.addComponent('AND', 200, 0); // 4
    store.updateComponentProperties(4, { inputCount: 3 });

    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 4, pinKind: 'in', pinIndex: 0 });
    store.connectPins({ componentId: 2, pinKind: 'out', pinIndex: 0 }, { componentId: 4, pinKind: 'in', pinIndex: 1 });
    store.connectPins({ componentId: 3, pinKind: 'out', pinIndex: 0 }, { componentId: 4, pinKind: 'in', pinIndex: 2 });
    expect(useEditorStore.getState().module.nets).toHaveLength(3);

    store.updateComponentProperties(4, { inputCount: 2 }); // orphans pin index 2 (switch 3's wire)
    const state = useEditorStore.getState();
    expect(state.module.pinConnections.some((c) => c.componentInstanceId === 4 && c.pinIndex === 2)).toBe(false);
    expect(state.module.nets).toHaveLength(2); // switch 3's now-driverless-consumer net was pruned
  });

  it('changing a bus width disconnects existing wires whose width would now mismatch', () => {
    const store = useEditorStore.getState();
    store.addComponent('MERGER', 0, 0); // 1, default width 4
    store.addComponent('SPLITTER', 200, 0); // 2, default width 4
    store.connectPins({ componentId: 1, pinKind: 'out', pinIndex: 0 }, { componentId: 2, pinKind: 'in', pinIndex: 0 });
    expect(useEditorStore.getState().module.nets).toHaveLength(1);

    store.updateComponentProperties(1, { width: 8 });
    const state = useEditorStore.getState();
    expect(state.module.components.find((c) => c.id === 1)!.properties.width).toBe(8);
    expect(state.module.nets).toHaveLength(0); // the now width-mismatched connection was dropped
  });

  it('is a normal undoable structural edit', () => {
    const store = useEditorStore.getState();
    store.addComponent('MUX', 0, 0); // 1, default selectBits 2
    store.updateComponentProperties(1, { selectBits: 3 });
    expect(useEditorStore.getState().module.components[0].properties.selectBits).toBe(3);
    store.undo();
    expect(useEditorStore.getState().module.components[0].properties.selectBits).toBe(2);
  });

  it('updating a boundary marker width keeps the module.pins metadata in sync', () => {
    const store = useEditorStore.getState();
    store.addComponent('INPUT_PIN', 0, 0); // 1
    expect(useEditorStore.getState().module.pins[0].bitWidth).toBe(1);
    store.updateComponentProperties(1, { width: 4 });
    expect(useEditorStore.getState().module.pins[0].bitWidth).toBe(4);
  });
});
