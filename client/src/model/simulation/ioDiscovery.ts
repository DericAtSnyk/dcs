import type { ComponentInstance, ComponentType, Module } from '@dcs/shared';
import { getComponentDefinition } from '../components/registry.js';

export const SOURCE_TYPES: ComponentType[] = ['SWITCH', 'BUTTON', 'INPUT_PIN'];
export const SINK_TYPES: ComponentType[] = ['LED', 'VALUE_DISPLAY', 'SEVEN_SEG', 'OUTPUT_PIN'];

export function findSourceComponents(module: Module): ComponentInstance[] {
  return module.components.filter((c) => SOURCE_TYPES.includes(c.type)).sort((a, b) => a.id - b.id);
}

export function findSinkComponents(module: Module): ComponentInstance[] {
  return module.components.filter((c) => SINK_TYPES.includes(c.type)).sort((a, b) => a.id - b.id);
}

export function findClockComponents(module: Module): ComponentInstance[] {
  return module.components.filter((c) => c.type === 'CLOCK').sort((a, b) => a.id - b.id);
}

export function labelFor(module: Module, component: ComponentInstance): string {
  const modulePin = module.pins.find((p) => p.sourceComponentId === component.id);
  return modulePin ? modulePin.name : `${component.type}${component.id}`;
}

/** A source/clock component's single output pin width, or a sink's single input pin width. */
export function pinWidth(component: ComponentInstance, kind: 'in' | 'out'): number {
  const layout = getComponentDefinition(component.type).getPinLayout(component.properties);
  return (kind === 'in' ? layout.inputs : layout.outputs)[0].width;
}
