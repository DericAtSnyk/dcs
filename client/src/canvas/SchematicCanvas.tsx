import { useEffect, useRef } from 'react';
import type { ComponentType } from '@dcs/shared';
import { useEditorStore } from '../state/editorStore.js';
import { ComponentSymbol } from './ComponentSymbol.js';
import { WireLayer } from './WireLayer.js';
import { useWiringInteraction } from './WiringInteraction.js';
import { useComponentDragInteraction } from './ComponentDragInteraction.js';
import { GRID, snapToGrid, getPinPosition, type Point } from './symbolGeometry.js';
import { pointsToPolylinePath } from './wireRouting.js';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;

export function SchematicCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const module = useEditorStore((s) => s.module);
  const modules = useEditorStore((s) => s.modules);
  const simGraph = useEditorStore((s) => s.simGraph);
  const addComponent = useEditorStore((s) => s.addComponent);
  const addSubcircuitInstance = useEditorStore((s) => s.addSubcircuitInstance);
  const toggleSwitch = useEditorStore((s) => s.toggleSwitch);
  const pressButton = useEditorStore((s) => s.pressButton);
  const releaseButton = useEditorStore((s) => s.releaseButton);
  const connectPins = useEditorStore((s) => s.connectPins);
  const selectedComponentId = useEditorStore((s) => s.selectedComponentId);
  const selectComponent = useEditorStore((s) => s.selectComponent);
  const beginMove = useEditorStore((s) => s.beginMove);
  const moveComponentLive = useEditorStore((s) => s.moveComponentLive);
  const deleteComponent = useEditorStore((s) => s.deleteComponent);
  const rotateComponent = useEditorStore((s) => s.rotateComponent);
  const mirrorComponent = useEditorStore((s) => s.mirrorComponent);
  const copySelection = useEditorStore((s) => s.copySelection);
  const paste = useEditorStore((s) => s.paste);
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const clearWiringError = useEditorStore((s) => s.clearWiringError);

  const wiring = useWiringInteraction(connectPins);
  const dragging = useComponentDragInteraction(beginMove, moveComponentLive, selectComponent);

  function clientToSvgPoint(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const point = clientToSvgPoint(event.clientX, event.clientY);

    const subcircuitModuleId = event.dataTransfer.getData('application/x-dcs-subcircuit-module-id');
    if (subcircuitModuleId) {
      addSubcircuitInstance(Number(subcircuitModuleId), snapToGrid(point.x), snapToGrid(point.y));
      return;
    }

    const type = event.dataTransfer.getData('application/x-dcs-component-type') as ComponentType;
    if (!type) return;
    addComponent(type, snapToGrid(point.x), snapToGrid(point.y));
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if (meta && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        paste();
      } else if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedComponentId != null) {
        e.preventDefault();
        deleteComponent(selectedComponentId);
      } else if (e.key.toLowerCase() === 'r' && selectedComponentId != null) {
        rotateComponent(selectedComponentId);
      } else if (e.key.toLowerCase() === 'm' && selectedComponentId != null) {
        mirrorComponent(selectedComponentId);
      } else if (e.key === 'Escape') {
        // Cancels an in-progress wire (click-click armed or mid-drag),
        // deselects the current component, and dismisses any error toast —
        // one key to back out of whatever you're in the middle of.
        wiring.handleCanvasPointerUp();
        selectComponent(null);
        clearWiringError();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedComponentId,
    undo,
    redo,
    copySelection,
    paste,
    duplicateSelection,
    deleteComponent,
    rotateComponent,
    mirrorComponent,
    selectComponent,
    clearWiringError,
    wiring.handleCanvasPointerUp,
  ]);

  return (
    <svg
      ref={svgRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ background: '#18181b', touchAction: 'none' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onPointerMove={(e) => {
        const point = clientToSvgPoint(e.clientX, e.clientY);
        wiring.handleCanvasPointerMove(point);
        dragging.handleCanvasPointerMove(point);
      }}
      onPointerUp={() => {
        wiring.handleCanvasPointerUp();
        dragging.handleCanvasPointerUp();
      }}
    >
      <defs>
        <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle cx={0.5} cy={0.5} r={0.5} fill="#3f3f46" />
        </pattern>
      </defs>
      <rect
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        fill="url(#grid)"
        onPointerDown={() => selectComponent(null)}
      />

      <WireLayer module={module} simGraph={simGraph} />

      {module.components.map((component) => (
        <ComponentSymbol
          key={component.id}
          component={component}
          simGraph={simGraph}
          isSelected={component.id === selectedComponentId}
          subcircuitModuleName={
            component.type === 'SUBCIRCUIT'
              ? modules.find((m) => m.id === component.properties.subcircuitModuleId)?.name
              : undefined
          }
          onSwitchToggle={toggleSwitch}
          onButtonPress={(id) => {
            pressButton(id);
            selectComponent(id);
          }}
          onButtonRelease={releaseButton}
          onBodyPointerDown={(componentId, componentPos, pointerPosClient, event) =>
            dragging.handleBodyPointerDown(
              componentId,
              componentPos,
              clientToSvgPoint(pointerPosClient.x, pointerPosClient.y),
              event,
            )
          }
          onPinPointerDown={(pin, event) => {
            const kind = pin.pinKind;
            const componentInstance = module.components.find((c) => c.id === pin.componentId)!;
            const pos = getPinPosition(componentInstance, kind, pin.pinIndex);
            wiring.handlePinPointerDown(pin, pos, event);
          }}
          onPinPointerUp={(pin, event) => wiring.handlePinPointerUp(pin, event)}
        />
      ))}

      {wiring.previewLineFrom && wiring.cursorPos && (
        <polyline
          points={pointsToPolylinePath([wiring.previewLineFrom, wiring.cursorPos])}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth={2}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
