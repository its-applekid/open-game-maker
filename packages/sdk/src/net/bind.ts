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

export function bindLocalPlayer(net: GmNet, options: LocalPlayerBindingOptions): () => void {
  const refreshHud = () => options.updateHud(options.hud(net.localPlayerIndex));
  const refreshBinding = () => {
    options.rig.attach(options.target, net.localPlayerIndex);
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
