import type { ActionFrame, CameraRig } from '@ogm/contracts';

export type RigFactory = (playerIndex: number) => CameraRig;

export class RigSet {
  private readonly rigs = new Map<number, CameraRig>();
  private viewedPlayer: number | null = null;

  constructor(
    private readonly create: RigFactory,
    private readonly editor?: CameraRig,
  ) {}

  for(playerIndex: number): CameraRig {
    const existing = this.rigs.get(playerIndex);
    if (existing) return existing;
    const rig = this.create(playerIndex);
    this.rigs.set(playerIndex, rig);
    return rig;
  }

  attach(playerIndex: number, target: Parameters<CameraRig['attach']>[0]): CameraRig {
    const rig = this.for(playerIndex);
    rig.attach(target, playerIndex);
    return rig;
  }

  update(dt: number, frames: ActionFrame[]): void {
    for (const frame of frames) this.for(frame.playerIndex).update(dt, frame);
  }

  viewAsPlayer(playerIndex: number | null): void {
    this.viewedPlayer = playerIndex;
  }

  get active(): CameraRig {
    if (this.viewedPlayer !== null) return this.for(this.viewedPlayer);
    return this.editor ?? this.for(0);
  }
}
