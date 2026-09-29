import { useCallback, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { PinRef } from '../state/editorStore.js';
import type { Point } from './symbolGeometry.js';

const DRAG_THRESHOLD_PX = 4;

interface DragState {
  pin: PinRef;
  pinPosition: Point;
  isDragging: boolean;
}

function samePin(a: PinRef, b: PinRef): boolean {
  return a.componentId === b.componentId && a.pinKind === b.pinKind && a.pinIndex === b.pinIndex;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface WiringInteraction {
  /** the pin waiting for a second click (click-click mode); used to render a rubber-band line */
  pendingStart: PinRef | null;
  previewLineFrom: Point | null;
  cursorPos: Point | null;
  handlePinPointerDown: (pin: PinRef, pinPosition: Point, event: PointerEvent) => void;
  handlePinPointerUp: (pin: PinRef, event: PointerEvent) => void;
  handleCanvasPointerMove: (svgPos: Point) => void;
  handleCanvasPointerUp: () => void;
}

/**
 * Unifies click-click and drag-to-connect wiring into one state machine:
 * - Pointer down on a pin, then up on a *different* pin with no movement in
 *   between beyond the threshold: click-to-start, waits for a second click.
 * - Pointer down, drag past the threshold, up on a different pin: drag-to-connect.
 * - Release on empty canvas: cancels whatever was pending.
 */
export function useWiringInteraction(connectPins: (a: PinRef, b: PinRef) => boolean): WiringInteraction {
  const [pendingStart, setPendingStart] = useState<PinRef | null>(null);
  const [previewLineFrom, setPreviewLineFrom] = useState<Point | null>(null);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const handlePinPointerDown = useCallback(
    (pin: PinRef, pinPosition: Point, event: PointerEvent) => {
      event.stopPropagation();

      if (pendingStart) {
        if (!samePin(pendingStart, pin)) {
          connectPins(pendingStart, pin);
        }
        setPendingStart(null);
        setPreviewLineFrom(null);
        return;
      }

      dragRef.current = { pin, pinPosition, isDragging: false };
      setPreviewLineFrom(pinPosition);
      setCursorPos(pinPosition);
    },
    [pendingStart, connectPins],
  );

  const handlePinPointerUp = useCallback(
    (pin: PinRef, event: PointerEvent) => {
      event.stopPropagation();
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      if (drag.isDragging) {
        if (!samePin(drag.pin, pin)) connectPins(drag.pin, pin);
        setPreviewLineFrom(null);
      } else {
        // A plain click with no drag: arm click-click mode, wait for the next click.
        setPendingStart(drag.pin);
      }
    },
    [connectPins],
  );

  const handleCanvasPointerMove = useCallback((svgPos: Point) => {
    setCursorPos(svgPos);
    const drag = dragRef.current;
    if (drag && !drag.isDragging && distance(drag.pinPosition, svgPos) > DRAG_THRESHOLD_PX) {
      drag.isDragging = true;
    }
  }, []);

  const handleCanvasPointerUp = useCallback(() => {
    // Release landed on empty canvas (pin handlers stop propagation before this fires).
    dragRef.current = null;
    setPendingStart(null);
    setPreviewLineFrom(null);
  }, []);

  return {
    pendingStart,
    previewLineFrom,
    cursorPos,
    handlePinPointerDown,
    handlePinPointerUp,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
  };
}
