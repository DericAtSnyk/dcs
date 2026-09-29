import type { SignalValue } from '@dcs/shared';
import type { SimGraph, SimNode, SettleResult } from '../types.js';
import { getComponentDefinition } from '../components/registry.js';
import { settle } from './evaluate.js';
import { allX } from '../components/bitLogic.js';

/**
 * Runs an ordinary combinational settle, then repeatedly checks every
 * edge-clocked node's clock pin for a 0->1 transition, applying any that
 * fired and re-settling, until no more transitions appear. Looping (rather
 * than a single pass) is what makes an asynchronous ripple counter work
 * correctly under zero-delay semantics: stage 0 firing changes its Q, which
 * is stage 1's clock input, so stage 1's edge only becomes visible after
 * stage 0's new state has propagated — and that should still happen within
 * one tick() call, since we model zero propagation delay.
 *
 * Multiple flip-flops sharing the literal same clock net still update
 * correctly and atomically: they're detected together in the same inner
 * iteration (all reading one pre-edge settle), so none of them ever sees
 * another's already-updated output as if it were an old input.
 *
 * Call this instead of settle() for every simulated edit — an edit that
 * doesn't touch any clock simply finds no transitions and behaves exactly
 * like settle().
 */
export function tick(graph: SimGraph): SettleResult {
  let result = settle(graph);

  for (;;) {
    const firing: { node: SimNode; newState: SignalValue[] }[] = [];

    for (const node of graph.nodes) {
      const definition = getComponentDefinition(node.type);
      if (definition.clocking !== 'edge') continue;

      const clockPinIndex = definition.clockPinIndex!;
      const clockNetId = node.inputNets[clockPinIndex];
      const clockValue = clockNetId != null ? graph.nets.get(clockNetId)!.value.bits[0] : 'X';
      const previousClockValue = node.lastClockValue;

      if (previousClockValue === 0 && clockValue === 1) {
        const layout = definition.getPinLayout(node.properties);
        const inputValues = node.inputNets.map((netId, i) =>
          netId != null ? graph.nets.get(netId)!.value : allX(layout.inputs[i]?.width ?? 1),
        );
        const clearAsserted =
          definition.clearPinIndex != null && inputValues[definition.clearPinIndex].bits[0] === 1;
        if (!clearAsserted) {
          const priorState = node.state ?? layout.outputs.map((o) => allX(o.width));
          firing.push({ node, newState: definition.computeNextState!(inputValues, node.properties, priorState) });
        }
      }
      // Record regardless of whether it fired, so a held-high level doesn't re-trigger next iteration.
      node.lastClockValue = clockValue;
    }

    if (firing.length === 0) break;
    for (const { node, newState } of firing) node.state = newState;
    result = settle(graph);
  }

  return result;
}
