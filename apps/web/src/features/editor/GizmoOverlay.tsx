import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { Entity, GameManifest, PlacementResult, Pose, TargetRef } from '@ogm/contracts';

import { FocusZone } from '../../lib/input';
import { movePose, normalizeFramePoint, placementPose, poseFromProps, stepPose, type GizmoKind } from './canvas';
import { EDITOR_FOCUS_ZONES } from './focus';
import type { GameFrameController } from './frame';
import type { EditorSessionState } from './session';
import type { SnapPrefs } from './SnapPrefs';
import { createEntityIntent, createStableId, updateEntityPoseIntent, type EditorIntent } from './transactions';

type Ghost = { prefab: string; pose: Pose; result?: PlacementResult };
type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  entity: Entity;
  gizmo: GizmoKind;
  intents: EditorIntent[];
  doc: EditorSessionState['doc'];
};

type GizmoOverlayProps = {
  activePrefab?: string;
  frame: GameFrameController;
  manifest: GameManifest;
  session: StoreApi<EditorSessionState>;
  snap: SnapPrefs;
};

const VALIDATION_INTERVAL_MS = 1000 / 15;

export function GizmoOverlay({ activePrefab, frame, manifest, session, snap }: GizmoOverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<Ghost | undefined>(undefined);
  const dragRef = useRef<Drag | undefined>(undefined);
  const validationAtRef = useRef(-Infinity);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingValidationRef = useRef<Ghost | undefined>(undefined);
  const dropRequestedRef = useRef(false);
  const [ghost, setGhost] = useState<Ghost>();
  const [anchor, setAnchor] = useState<{ id: string; x: number; y: number }>();
  const selectedId = session.getState().selection[0];
  const selected = selectedId === undefined ? undefined : session.getState().doc.entities[selectedId];
  const gizmos = selected === undefined ? [] : (manifest.gizmos[selected.prefab] ?? []);

  useEffect(() => {
    const stopPicked = frame.onPicked((targets) => receivePicked(targets, session, frame, setAnchor));
    const stopPlacement = frame.onPlacement((result) => {
      const current = ghostRef.current;
      if (current === undefined) return;
      const next = { ...current, result };
      ghostRef.current = next;
      setGhost(next);
      if (dropRequestedRef.current) {
        dropRequestedRef.current = false;
        if (result.ok) commitPlacement(next, manifest, session, setGhost, ghostRef);
      }
    });
    const stopScreen = frame.onScreen((position) => {
      if ('offscreen' in position) {
        setAnchor((current) => (current?.id === position.id ? undefined : current));
      } else {
        setAnchor(position);
      }
    });
    return () => {
      stopPicked();
      stopPlacement();
      stopScreen();
    };
  }, [frame, manifest, session]);

  useEffect(
    () => () => {
      if (validationTimerRef.current !== undefined) clearTimeout(validationTimerRef.current);
    },
    [],
  );

  const requestValidation = (next: Ghost) => {
    const now = performance.now();
    const remaining = validationAtRef.current + VALIDATION_INTERVAL_MS - now;
    if (remaining <= 0) {
      validationAtRef.current = now;
      frame.validatePlacement(next.prefab, next.pose);
      return;
    }
    pendingValidationRef.current = next;
    if (validationTimerRef.current !== undefined) return;
    validationTimerRef.current = setTimeout(() => {
      validationTimerRef.current = undefined;
      const pending = pendingValidationRef.current;
      pendingValidationRef.current = undefined;
      if (pending === undefined) return;
      validationAtRef.current = performance.now();
      frame.validatePlacement(pending.prefab, pending.pose);
    }, remaining);
  };

  const updateGhost = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (activePrefab === undefined || surface === null) return;
    const point = normalizeFramePoint(clientX, clientY, surface.getBoundingClientRect());
    const next: Ghost = { prefab: activePrefab, pose: placementPose(point, manifest, snap) };
    ghostRef.current = next;
    setGhost(next);
    requestValidation(next);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (session.getState().readOnly) return;
    capturePointer(event.currentTarget, event.pointerId);
    if (activePrefab !== undefined) {
      dropRequestedRef.current = false;
      updateGhost(event.clientX, event.clientY);
      return;
    }
    if (session.getState().tool === 'select') {
      const point = normalizeFramePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
      frame.pick(point.x, point.y);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag !== undefined && event.pointerId === drag.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const pose = movePose(
        poseFromProps(drag.entity.props.pose),
        drag.gizmo,
        { x: (event.clientX - drag.startX) / rect.width, y: (event.clientY - drag.startY) / rect.height },
        manifest,
        snap,
      );
      const intent = updateEntityPoseIntent(drag.doc, drag.entity.id, pose, `Moved ${drag.entity.prefab}`);
      drag.intents.push(intent);
      drag.doc = intent.doc;
      frame.applyDesign(session.getState().headRev, intent.doc, intent.patches);
      return;
    }
    if (activePrefab !== undefined) updateGhost(event.clientX, event.clientY);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag !== undefined && event.pointerId === drag.pointerId) {
      dragRef.current = undefined;
      if (drag.intents.length > 0) void session.getState().commitStroke(drag.intents, `Moved ${drag.entity.prefab}`);
      return;
    }
    if (activePrefab === undefined) return;
    const current = ghostRef.current;
    if (current?.result === undefined) {
      dropRequestedRef.current = current !== undefined;
      return;
    }
    if (current.result.ok) commitPlacement(current, manifest, session, setGhost, ghostRef);
  };

  const beginGizmo = (event: React.PointerEvent<HTMLButtonElement>, entity: Entity, gizmo: GizmoKind) => {
    event.stopPropagation();
    if (session.getState().readOnly) return;
    capturePointer(event.currentTarget, event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      entity,
      gizmo,
      intents: [],
      doc: session.getState().doc,
    };
  };

  const step = (entity: Entity, gizmo: GizmoKind, direction: -1 | 1) => {
    if (session.getState().readOnly) return;
    const pose = stepPose(poseFromProps(entity.props.pose), gizmo, direction, manifest, snap);
    if (pose === undefined) return;
    void session
      .getState()
      .submit(updateEntityPoseIntent(session.getState().doc, entity.id, pose, `Moved ${entity.prefab}`));
  };

  return (
    <FocusZone id={EDITOR_FOCUS_ZONES.canvas} className="editor-canvas-overlay">
      <div
        ref={surfaceRef}
        className="editor-canvas-surface"
        aria-label="Editor canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {ghost ? <GhostView ghost={ghost} manifest={manifest} /> : null}
        {selected
          ? gizmos.map((gizmo) => (
              <div
                className="gizmo-controls"
                key={gizmo}
                style={anchorStyle(anchor?.id === selected.id ? anchor : undefined)}
              >
                <button
                  type="button"
                  className="gizmo-handle tap-secondary"
                  aria-label={`${gizmoLabel(gizmo)} ${selected.prefab}`}
                  onPointerDown={(event) => beginGizmo(event, selected, gizmo)}
                >
                  {gizmoSymbol(gizmo)}
                </button>
                <button
                  type="button"
                  className="gizmo-step tap-secondary"
                  aria-label={`${gizmoLabel(gizmo)} ${selected.prefab} backward`}
                  onClick={() => step(selected, gizmo, -1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="gizmo-step tap-secondary"
                  aria-label={`${gizmoLabel(gizmo)} ${selected.prefab} forward`}
                  onClick={() => step(selected, gizmo, 1)}
                >
                  +
                </button>
              </div>
            ))
          : null}
      </div>
    </FocusZone>
  );
}

function commitPlacement(
  ghost: Ghost,
  manifest: GameManifest,
  session: StoreApi<EditorSessionState>,
  setGhost: (ghost: Ghost | undefined) => void,
  ghostRef: React.RefObject<Ghost | undefined>,
): void {
  const entity: Entity = {
    id: createStableId('e_'),
    prefab: ghost.prefab,
    level: manifest.view,
    origin: 'creator',
    props: { pose: ghost.pose },
  };
  void session.getState().submit(createEntityIntent(session.getState().doc, entity, `Placed ${ghost.prefab}`));
  ghostRef.current = undefined;
  setGhost(undefined);
}

function receivePicked(
  targets: TargetRef[],
  session: StoreApi<EditorSessionState>,
  frame: GameFrameController,
  setAnchor: (anchor: { id: string; x: number; y: number } | undefined) => void,
): void {
  const ids = targets.filter((target) => target.kind === 'entity').map((target) => target.id);
  session.getState().setSelection(ids);
  frame.select(ids);
  const first = targets.find((target) => target.id === ids[0] && target.bounds !== undefined);
  setAnchor(
    first?.bounds === undefined
      ? undefined
      : { id: first.id, x: first.bounds.x + first.bounds.w / 2, y: first.bounds.y + first.bounds.h / 2 },
  );
}

function GhostView({ ghost, manifest }: { ghost: Ghost; manifest: GameManifest }) {
  const position = ghost.pose.position;
  const depth = position[manifest.dimension === '2d' ? 1 : 2];
  const { w, h } = manifest.presentation.minLogical;
  const state = ghost.result?.ok === false ? 'invalid' : ghost.result?.ok === true ? 'valid' : 'checking';
  return (
    <div
      className="placement-ghost"
      data-state={state}
      role="status"
      title={ghost.result?.ok === false ? ghost.result.reason : undefined}
      style={{ left: `${(position[0] / w) * 100}%`, top: `${(depth / h) * 100}%` }}
    >
      {ghost.prefab}
    </div>
  );
}

function anchorStyle(anchor: { x: number; y: number } | undefined): React.CSSProperties {
  return anchor === undefined ? { left: '50%', top: '50%' } : { left: anchor.x, top: anchor.y };
}

function gizmoLabel(gizmo: GizmoKind): string {
  if (gizmo === 'rotateYaw') return 'Rotate';
  if (gizmo === 'elevate') return 'Elevate';
  if (gizmo === 'splinePoints') return 'Move path point';
  return 'Move';
}

function gizmoSymbol(gizmo: GizmoKind): string {
  if (gizmo === 'rotateYaw') return '↻';
  if (gizmo === 'elevate') return '↕';
  if (gizmo === 'splinePoints') return '◆';
  return '✥';
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Pointer capture is optional in embedded and test browsers.
  }
}
