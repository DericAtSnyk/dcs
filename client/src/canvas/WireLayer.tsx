import type { ComponentInstance, Module } from '@dcs/shared';
import type { SimGraph } from '../model/types.js';
import { getPinPosition } from './symbolGeometry.js';
import { routeOrthogonal, pointsToPolylinePath } from './wireRouting.js';
import { signalColor } from './bitColor.js';
import { useEditorStore } from '../state/editorStore.js';
import { rootNetId } from '../model/simulation/elaborate.js';

interface WireLayerProps {
  module: Module;
  simGraph: SimGraph;
}

export function WireLayer({ module, simGraph }: WireLayerProps) {
  const isNetTracked = useEditorStore((s) => s.isNetTracked);
  const addWaveformTrack = useEditorStore((s) => s.addWaveformTrack);
  const removeWaveformTrack = useEditorStore((s) => s.removeWaveformTrack);
  const componentById = new Map<number, ComponentInstance>(module.components.map((c) => [c.id, c]));

  const wires = module.nets.flatMap((net) => {
    const connections = module.pinConnections.filter((c) => c.netId === net.id);
    const driver = connections.find((c) => c.pinKind === 'out');
    if (!driver) return [];
    const driverComponent = componentById.get(driver.componentInstanceId);
    if (!driverComponent) return [];
    const from = getPinPosition(driverComponent, 'out', driver.pinIndex);
    const signal = simGraph.nets.get(rootNetId(net.id))?.value;
    const tracked = isNetTracked(net.id);

    return connections
      .filter((c) => c.pinKind === 'in')
      .map((input) => {
        const inputComponent = componentById.get(input.componentInstanceId);
        if (!inputComponent) return null;
        const to = getPinPosition(inputComponent, 'in', input.pinIndex);
        const points = routeOrthogonal(from, to);
        return (
          <polyline
            key={`${net.id}-${input.id}`}
            points={pointsToPolylinePath(points)}
            fill="none"
            stroke={signalColor(signal)}
            strokeWidth={net.isBus ? 4 : 2}
            style={{ cursor: 'context-menu', filter: tracked ? 'drop-shadow(0 0 2px #60a5fa)' : undefined }}
            onContextMenu={(e) => {
              e.preventDefault();
              tracked ? removeWaveformTrack(net.id) : addWaveformTrack(net.id);
            }}
          />
        );
      });
  });

  return <g>{wires}</g>;
}
