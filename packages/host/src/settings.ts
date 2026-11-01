import type { PlayerSettings } from '@ogm/contracts/game';

export type Settings = PlayerSettings;

export class SettingsController {
  private current: Settings | undefined;

  constructor(private readonly send: (settings: Settings) => void) {}

  set(settings: Settings): void {
    this.current = { ...settings };
    this.send(this.current);
  }

  resend(): void {
    if (this.current) this.send(this.current);
  }
}
