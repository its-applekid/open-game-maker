import type { RigInputMapping, ViewId } from '@ogm/contracts';

const movementKeys: Readonly<Record<string, string>> = {
  KeyW: 'move.up',
  ArrowUp: 'move.up',
  KeyA: 'move.left',
  ArrowLeft: 'move.left',
  KeyS: 'move.down',
  ArrowDown: 'move.down',
  KeyD: 'move.right',
  ArrowRight: 'move.right',
  Space: 'jump',
  KeyE: 'use',
  Enter: 'use',
  Escape: 'host.pause',
};

const gamepad: Readonly<Record<string, string>> = {
  leftStick: 'move',
  rightStick: 'look',
  south: 'jump',
  west: 'attack',
  east: 'use',
};

const touchByView: Record<ViewId, RigInputMapping['touch']> = {
  iso: 'stick',
  topdown: 'stick',
  side: 'stick',
  follow: 'two-stick',
  fps: 'two-stick',
  orbit: 'two-stick',
  fixed: 'tap',
};

export function defaultInputMapping(view: ViewId): RigInputMapping {
  return {
    keyboard: { ...movementKeys },
    touch: touchByView[view],
    gamepad: { ...gamepad },
    pointerLock: view === 'fps',
  };
}
