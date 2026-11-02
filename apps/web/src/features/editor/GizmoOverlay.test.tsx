import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';

import type { DesignDoc, GameManifest, PlacementResult, TargetRef } from '@ogm/contracts';

import type { GameFrameController } from './frame';
import { GizmoOverlay } from './GizmoOverlay';
import type { EditorSessionState } from './session';

const entityId = 'e_01BX5ZZKBKACTAV9WEVGEMMVRZ';
const doc: DesignDoc = {
  schemaVersion: 1,
  globals: {},
  entities: {
    [entityId]: {
      id: entityId,
      prefab: 'skeleton',
      level: 'crypt',
      origin: 'creator',
      props: { pose: { position: [10, 10, 0] } },
    },
  },
};
const manifest = {
  dimension: '2d',
  view: 'main',
  presentation: { minLogical: { w: 100, h: 60 } },
  gizmos: { skeleton: ['translate'] },
} as unknown as GameManifest;

function harness(selection: string[] = []) {
  let picked: ((targets: TargetRef[]) => void) | undefined;
  let placement: ((result: PlacementResult) => void) | undefined;
  const submit = vi.fn().mockResolvedValue(undefined);
  const commitStroke = vi.fn().mockResolvedValue(undefined);
  const setSelection = vi.fn();
  const state = {
    doc,
    headRev: 4,
    selection,
    tool: 'select',
    readOnly: false,
    submit,
    commitStroke,
    setSelection,
  } as unknown as EditorSessionState;
  const session = { getState: () => state } as StoreApi<EditorSessionState>;
  const frame = {
    applyDesign: vi.fn(),
    pick: vi.fn(),
    select: vi.fn(),
    validatePlacement: vi.fn(),
    onPicked: vi.fn((callback) => {
      picked = callback;
      return vi.fn();
    }),
    onPlacement: vi.fn((callback) => {
      placement = callback;
      return vi.fn();
    }),
    onScreen: vi.fn(() => vi.fn()),
  } as unknown as GameFrameController;
  return {
    commitStroke,
    frame,
    placement: (result: PlacementResult) => placement?.(result),
    picked: (targets: TargetRef[]) => picked?.(targets),
    session,
    setSelection,
    submit,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GizmoOverlay', () => {
  it('echoes a picked target as the session selection and editor.select acknowledgement', () => {
    const test = harness();
    render(
      <GizmoOverlay
        frame={test.frame}
        manifest={manifest}
        session={test.session}
        snap={{ version: 1, enabled: true, grid: 1 }}
      />,
    );
    const canvas = screen.getByLabelText('Editor canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 80 } as DOMRect);

    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
    test.picked([{ id: entityId, kind: 'entity' }]);

    expect(test.frame.pick).toHaveBeenCalledWith(0.5, 0.5);
    expect(test.setSelection).toHaveBeenCalledWith([entityId]);
    expect(test.frame.select).toHaveBeenCalledWith([entityId]);
  });

  it('does not place an invalid ghost and submits exactly once after valid revalidation', () => {
    vi.useFakeTimers();
    const test = harness();
    render(
      <GizmoOverlay
        activePrefab="skeleton"
        frame={test.frame}
        manifest={manifest}
        session={test.session}
        snap={{ version: 1, enabled: true, grid: 1 }}
      />,
    );
    const canvas = screen.getByLabelText('Editor canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 60 } as DOMRect);

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    test.placement({ ok: false, reason: 'blocked' });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(test.submit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(70);
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 2 });
    test.placement({ ok: true });
    fireEvent.pointerUp(canvas, { clientX: 20, clientY: 20, pointerId: 2 });

    expect(test.submit).toHaveBeenCalledOnce();
  });

  it('coalesces forty translate pointer events and exposes a matching bounded stepper', () => {
    const test = harness([entityId]);
    render(
      <GizmoOverlay
        frame={test.frame}
        manifest={manifest}
        session={test.session}
        snap={{ version: 1, enabled: false, grid: 1 }}
      />,
    );
    const canvas = screen.getByLabelText('Editor canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 60 } as DOMRect);
    const handle = screen.getByRole('button', { name: 'Move skeleton' });

    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, pointerId: 3 });
    for (let index = 1; index <= 40; index += 1) {
      fireEvent.pointerMove(canvas, { clientX: 10 + index, clientY: 10, pointerId: 3 });
    }
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 10, pointerId: 3 });

    expect(test.commitStroke).toHaveBeenCalledOnce();
    expect(test.commitStroke.mock.calls[0]?.[0]).toHaveLength(40);
    fireEvent.click(screen.getByRole('button', { name: 'Move skeleton backward' }));
    expect(test.submit).toHaveBeenCalledOnce();
  });
});
