import { useCallback, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Point } from './symbolGeometry.js';
import { snapToGrid } from './symbolGeometry.js';

const DRAG_THRESHOLD_PX = 4;

interface DragState {
  componentId: number;
  startComponentPos: Point;
  startPointerPos: Point;
  isDragging: boolean;
}

export interface ComponentDragInteraction {
  handleBodyPointerDown: (componentId: number, componentPos: Point, pointerPos: Point, event: PointerEvent) => void;
  handleCanvasPointerMove: (pointerPos: Point) => void;
  handleCanvasPointerUp: () => void;
}

/**
 * Distinguishes a plain click (select, or toggle for a SWITCH — handled by
 * the caller) from a drag-to-reposition, using the same threshold-based
 * approach as wiring's click-vs-drag detection. `onBeginDrag` fires exactly
 * once per gesture, right when the threshold is crossed, so the caller can
 * push a single undo checkpoint for the whole drag rather than one per
 * pointermove.
 */
export function useComponentDragInteraction(
  onBeginDrag: () => void,
  onDragTo: (componentId: number, x: number, y: number) => void,
  onClick: (componentId: number) => void,
): ComponentDragInteraction {
  const dragRef = useRef<DragState | null>(null);

  const handleBodyPointerDown = useCallback(
    (componentId: number, componentPos: Point, pointerPos: Point, event: PointerEvent) => {
      event.stopPropagation();
      dragRef.current = { componentId, startComponentPos: componentPos, startPointerPos: pointerPos, isDragging: false };
    },
    [],
  );

  const handleCanvasPointerMove = useCallback(
    (pointerPos: Point) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = pointerPos.x - drag.startPointerPos.x;
      const dy = pointerPos.y - drag.startPointerPos.y;
      if (!drag.isDragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.isDragging = true;
        onBeginDrag();
      }
      onDragTo(drag.componentId, snapToGrid(drag.startComponentPos.x + dx), snapToGrid(drag.startComponentPos.y + dy));
    },
    [onBeginDrag, onDragTo],
  );

  const handleCanvasPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.isDragging) onClick(drag.componentId);
  }, [onClick]);

  return { handleBodyPointerDown, handleCanvasPointerMove, handleCanvasPointerUp };
}
