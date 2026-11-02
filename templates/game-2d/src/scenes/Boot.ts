import Phaser from 'phaser';

export class Boot extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.scene.start('level');
  }
}
