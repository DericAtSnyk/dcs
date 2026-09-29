import type { ComponentInstance } from '@dcs/shared';
import type { SimGraph } from '../model/types.js';
import type { PinRef } from '../state/editorStore.js';
import { getSymbolGeometry, getComponentCenter, type Point } from './symbolGeometry.js';
import { signalColor } from './bitColor.js';
import { formatHex } from './valueFormat.js';
import { SevenSegmentGlyph } from './SevenSegmentGlyph.js';
import { rootNodeId } from '../model/simulation/elaborate.js';

interface ComponentSymbolProps {
  component: ComponentInstance;
  simGraph: SimGraph;
  isSelected: boolean;
  /** For a SUBCIRCUIT instance: the referenced module's name (looked up by
   * the caller, which has access to the full modules list). */
  subcircuitModuleName?: string;
  onPinPointerDown: (pin: PinRef, event: React.PointerEvent) => void;
  onPinPointerUp: (pin: PinRef, event: React.PointerEvent) => void;
  onSwitchToggle: (componentId: number) => void;
  onButtonPress: (componentId: number) => void;
  onButtonRelease: (componentId: number) => void;
  onBodyPointerDown: (componentId: number, componentPos: Point, pointerPos: Point, event: React.PointerEvent) => void;
}

const LABELS: Record<string, string> = {
  AND: 'AND',
  OR: 'OR',
  NOT: '1',
  NAND: 'NAND',
  NOR: 'NOR',
  XOR: 'XOR',
  XNOR: 'XNOR',
  SWITCH: 'SW',
  CLOCK: 'CLK',
  BUTTON: 'BTN',
  LED: 'LED',
  MERGER: 'MRG',
  SPLITTER: 'SPL',
  D_FF: 'D',
  JK_FF: 'JK',
  SR_FF: 'SR',
  D_LATCH: 'D▷',
  SR_LATCH: 'SR▷',
  MUX: 'MUX',
  DEMUX: 'DMX',
  ENCODER: 'ENC',
  DECODER: 'DEC',
  ADDER: '+',
  REGISTER: 'REG',
  COUNTER: 'CNT',
  BCD_DECODER: 'BCD',
  INPUT_PIN: 'IN',
  OUTPUT_PIN: 'OUT',
};

export function ComponentSymbol({
  component,
  simGraph,
  isSelected,
  subcircuitModuleName,
  onPinPointerDown,
  onPinPointerUp,
  onSwitchToggle,
  onButtonPress,
  onButtonRelease,
  onBodyPointerDown,
}: ComponentSymbolProps) {
  const geometry = getSymbolGeometry(component.type, component.properties);
  const center = getComponentCenter(component);
  const node = simGraph.nodes.find((n) => n.id === rootNodeId(component.id));

  const netSignal = (netId: string | null | undefined) =>
    netId != null ? simGraph.nets.get(netId)?.value : undefined;

  const isSevenSeg = component.type === 'SEVEN_SEG';
  const isButton = component.type === 'BUTTON';
  // An INPUT_PIN acts like a settable test source (click to toggle) the same
  // way a SWITCH does, when this module is being viewed standalone.
  const isSwitch = component.type === 'SWITCH' || component.type === 'INPUT_PIN';
  const isSubcircuit = component.type === 'SUBCIRCUIT';

  const label = isSevenSeg
    ? ''
    : component.type === 'VALUE_DISPLAY'
      ? formatHex(netSignal(node?.inputNets[0]) ?? { width: 1, bits: ['X'] })
      : isSubcircuit
        ? (subcircuitModuleName ?? 'IC')
        : (LABELS[component.type] ?? component.type);

  return (
    <g
      transform={`translate(${center.x}, ${center.y}) rotate(${component.rotation}) scale(${component.mirrored ? -1 : 1}, 1)`}
    >
      <rect
        x={-geometry.width / 2}
        y={-geometry.height / 2}
        width={geometry.width}
        height={geometry.height}
        rx={6}
        fill={
          isSwitch
            ? '#1e3a8a'
            : isButton
              ? '#7c2d12'
              : component.type === 'CLOCK'
                ? '#581c87'
                : isSubcircuit
                  ? '#134e4a'
                  : '#27272a'
        }
        stroke={isSelected ? '#60a5fa' : '#a1a1aa'}
        strokeWidth={isSelected ? 2 : 1}
        onClick={() => isSwitch && onSwitchToggle(component.id)}
        onPointerDown={(e) => {
          if (isButton) {
            e.stopPropagation();
            onButtonPress(component.id);
          } else {
            onBodyPointerDown(component.id, { x: component.x, y: component.y }, { x: e.clientX, y: e.clientY }, e);
          }
        }}
        onPointerUp={() => isButton && onButtonRelease(component.id)}
        onPointerLeave={() => isButton && onButtonRelease(component.id)}
        style={{ cursor: isSwitch || isButton ? 'pointer' : 'move' }}
      />

      {isSevenSeg && <SevenSegmentGlyph bits={netSignal(node?.inputNets[0])?.bits} />}

      {/* Label text isn't mirrored/rotated with the symbol — it stays upright and readable. */}
      {!isSevenSeg && (
        <text
          transform={`scale(${component.mirrored ? -1 : 1}, 1) rotate(${-component.rotation})`}
          fill="#e4e4e7"
          fontSize={12}
          fontFamily={component.type === 'VALUE_DISPLAY' ? 'monospace' : undefined}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {label}
        </text>
      )}

      {geometry.inputPositions.map((pos, i) => {
        const netId = node?.inputNets[i];
        return (
          <circle
            key={`in-${i}`}
            cx={pos.x}
            cy={pos.y}
            r={5}
            fill={signalColor(netSignal(netId))}
            stroke="#e4e4e7"
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => onPinPointerDown({ componentId: component.id, pinKind: 'in', pinIndex: i }, e)}
            onPointerUp={(e) => onPinPointerUp({ componentId: component.id, pinKind: 'in', pinIndex: i }, e)}
          />
        );
      })}

      {geometry.outputPositions.map((pos, i) => {
        const netId = node?.outputNets[i];
        return (
          <circle
            key={`out-${i}`}
            cx={pos.x}
            cy={pos.y}
            r={5}
            fill={signalColor(netSignal(netId))}
            stroke="#e4e4e7"
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => onPinPointerDown({ componentId: component.id, pinKind: 'out', pinIndex: i }, e)}
            onPointerUp={(e) => onPinPointerUp({ componentId: component.id, pinKind: 'out', pinIndex: i }, e)}
          />
        );
      })}
    </g>
  );
}
