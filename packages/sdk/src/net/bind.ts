import type { CameraRig, HudModel } from '@ogm/contracts';

import type { GmNet } from './index.js';
import { NET_STATE_CHANGES, type NetStateChanges } from './roles.js';

export interface LocalPlayerBindingOptions {
  rig: Pick<CameraRig, 'attach'>;
  target: Parameters<CameraRig['attach']>[0];
  hud(playerIndex: number): HudModel;
  updateHud(model: HudModel): void;
  onFrame(callback: () => void): () => void;
}

/**
 * Bind the camera rig and the HUD to *this* client's seat (netcode §5.1, §8.1).
 *
 * A spectator (`localSeat === null`) holds no seat: it attaches no camera and asks for no HUD, because there is no
 * seat whose private slice it could draw. Both callbacks read the seat at call time, so a client that learns it is
 * spectating when `net.start` arrives stops attaching without being rebound.
 */
export function bindLocalPlayer(net: GmNet, options: LocalPlayerBindingOptions): () => void {
  const refreshHud = () => {
    const seat = net.localSeat;
    if (seat === null) return;
    options.updateHud(options.hud(seat));
  };
  const refreshBinding = () => {
    const seat = net.localSeat;
    if (seat === null) return;
    options.rig.attach(options.target, seat);
    refreshHud();
  };
  const stateChanges = net as GmNet & Partial<NetStateChanges>;
  const stopState = stateChanges[NET_STATE_CHANGES]?.(refreshBinding) ?? (() => undefined);
  const stopFrame = options.onFrame(refreshHud);
  refreshBinding();

  return () => {
    stopState();
    stopFrame();
  };
}
