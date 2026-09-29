import type { Module } from '@dcs/shared';
import type { NetId, SimGraph, SimNode } from '../types.js';
import { getComponentDefinition } from '../components/registry.js';
import { allX } from '../components/bitLogic.js';

/**
 * The id scheme elaborate() uses for a component/net that belongs directly
 * to the ELABORATION ROOT module (pathPrefix ''): `c<id>` / `n<id>` — never
 * the bare design-model id. Anything reading a live SimGraph by a
 * component/net id from the design model (rendering, waveform sampling,
 * truth tables) must go through these rather than re-deriving the prefix
 * inline, so the convention can't drift out of sync in just one call site.
 * Nested sub-circuit instances get a further instance-path prefix on top of
 * this (see inlineModule below) — these two helpers only cover the root.
 */
export function rootNodeId(componentId: number): string {
  return `c${componentId}`;
}
export function rootNetId(netId: number): NetId {
  return `n${netId}`;
}

export class CircularSubcircuitError extends Error {
  constructor(moduleName: string) {
    super(`Circular sub-circuit reference: module "${moduleName}" (in)directly instantiates itself`);
    this.name = 'CircularSubcircuitError';
  }
}

/**
 * Flattens `rootModuleId` into a single SimGraph, recursively inlining every
 * SUBCIRCUIT instance's referenced module. Two instances of the same
 * sub-circuit get independent component/net ids (path-qualified by
 * instance), so they get independent simulation state (e.g. two separate
 * flip-flops), despite sharing one edited module definition.
 *
 * This is the sole simulation entry point for both the live top-level
 * circuit and (later) truth-table generation rooted at any module — same
 * code, different root.
 */
export function elaborate(modules: Module[], rootModuleId: number, previousGraph?: SimGraph): SimGraph {
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const nodes: SimNode[] = [];
  const netWidths = new Map<NetId, number>();

  function inlineModule(
    module: Module,
    pathPrefix: string,
    ancestorModuleIds: ReadonlySet<number>,
    netOverrides: ReadonlyMap<number, NetId>,
  ): void {
    if (ancestorModuleIds.has(module.id)) {
      throw new CircularSubcircuitError(module.name);
    }
    const childAncestors = new Set(ancestorModuleIds).add(module.id);

    const netIdMap = new Map<number, NetId>();
    for (const net of module.nets) {
      const qualifiedId: NetId = netOverrides.get(net.id) ?? pathPrefix + rootNetId(net.id);
      netIdMap.set(net.id, qualifiedId);
      if (!netWidths.has(qualifiedId)) {
        netWidths.set(qualifiedId, net.bitWidth);
      }
    }

    const findLocalNet = (pinKind: 'in' | 'out', componentId: number, pinIndex: number): NetId | null => {
      const connection = module.pinConnections.find(
        (c) => c.componentInstanceId === componentId && c.pinKind === pinKind && c.pinIndex === pinIndex,
      );
      return connection ? netIdMap.get(connection.netId)! : null;
    };

    for (const component of module.components) {
      if (component.type === 'INPUT_PIN') {
        // An INPUT_PIN's own evaluate() acts as a standalone test source
        // (falls back to properties.value) when this module is elaborated
        // as the root. But when it's bridged to a parent's net (this module
        // is being inlined as someone's sub-circuit), the parent's real
        // driver already supplies that net's value — including this marker
        // as an ordinary SimNode too would make it a SECOND driver on the
        // same net, and since node evaluation order would let its default-0
        // test value silently overwrite the real one. So: skip creating a
        // node for it whenever its net was overridden (i.e., bridged).
        const localNetId = module.pinConnections.find(
          (c) => c.componentInstanceId === component.id && c.pinKind === 'out' && c.pinIndex === 0,
        )?.netId;
        if (localNetId != null && netOverrides.has(localNetId)) continue;
      }

      if (component.type === 'SUBCIRCUIT') {
        const childModuleId = component.properties.subcircuitModuleId as number | undefined;
        const childModule = childModuleId != null ? moduleById.get(childModuleId) : undefined;
        if (!childModule) continue; // dangling/unset reference — nothing to inline

        const sortedPins = [...childModule.pins].sort((a, b) => a.orderIndex - b.orderIndex);
        const inputPins = sortedPins.filter((p) => p.direction === 'in');
        const outputPins = sortedPins.filter((p) => p.direction === 'out');

        const childOverrides = new Map<number, NetId>();
        inputPins.forEach((pin, i) => {
          const parentNetId = findLocalNet('in', component.id, i);
          const marker = childModule.components.find((c) => c.id === pin.sourceComponentId);
          const markerConn =
            marker && childModule.pinConnections.find((c) => c.componentInstanceId === marker.id && c.pinKind === 'out' && c.pinIndex === 0);
          if (parentNetId != null && markerConn) childOverrides.set(markerConn.netId, parentNetId);
        });
        outputPins.forEach((pin, i) => {
          const parentNetId = findLocalNet('out', component.id, i);
          const marker = childModule.components.find((c) => c.id === pin.sourceComponentId);
          const markerConn =
            marker && childModule.pinConnections.find((c) => c.componentInstanceId === marker.id && c.pinKind === 'in' && c.pinIndex === 0);
          if (parentNetId != null && markerConn) childOverrides.set(markerConn.netId, parentNetId);
        });

        inlineModule(childModule, `${pathPrefix}${rootNodeId(component.id)}_`, childAncestors, childOverrides);
        continue;
      }

      const definition = getComponentDefinition(component.type);
      const layout = definition.getPinLayout(component.properties);
      const nodeId = pathPrefix + rootNodeId(component.id);
      const previousNode = previousGraph?.nodes.find((n) => n.id === nodeId);

      nodes.push({
        id: nodeId,
        type: component.type,
        properties: component.properties,
        inputNets: layout.inputs.map((_, i) => findLocalNet('in', component.id, i)),
        outputNets: layout.outputs.map((_, i) => findLocalNet('out', component.id, i)),
        state: previousNode?.state,
        lastClockValue: previousNode?.lastClockValue,
      });
    }
  }

  const root = moduleById.get(rootModuleId);
  if (!root) throw new Error(`elaborate(): no module with id ${rootModuleId}`);
  inlineModule(root, '', new Set(), new Map());

  return {
    nodes,
    nets: new Map(
      [...netWidths].map(([id, bitWidth]) => {
        const previousValue = previousGraph?.nets.get(id)?.value;
        return [id, { id, bitWidth, value: previousValue ?? allX(bitWidth) }];
      }),
    ),
  };
}

/** True if instantiating `targetModuleId` inside `hostModuleId` would create
 * a cycle (directly or through further nested sub-circuits) — used to block
 * the placement at wiring/placement time, before elaborate()'s runtime guard
 * would ever need to fire. */
export function wouldCreateCycle(modules: Module[], hostModuleId: number, targetModuleId: number): boolean {
  if (hostModuleId === targetModuleId) return true;
  const moduleById = new Map(modules.map((m) => [m.id, m]));

  function referencesHost(moduleId: number, visited: Set<number>): boolean {
    if (moduleId === hostModuleId) return true;
    if (visited.has(moduleId)) return false;
    visited.add(moduleId);
    const module = moduleById.get(moduleId);
    if (!module) return false;
    return module.components.some((c) => {
      if (c.type !== 'SUBCIRCUIT') return false;
      const childId = c.properties.subcircuitModuleId as number | undefined;
      return childId != null && referencesHost(childId, visited);
    });
  }

  return referencesHost(targetModuleId, new Set());
}
