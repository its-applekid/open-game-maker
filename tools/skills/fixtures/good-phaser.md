# Good Phaser fixture

```ts
import Phaser from 'phaser';

class Play extends Phaser.Scene {
  create(): void {
    const hero = this.physics.add.sprite(100, 100, 'hero');
    hero.setCollideWorldBounds(true);
    this.cameras.main.startFollow(hero);
    this.onHit();
  }

  onHit(): void {
    this.cameras.main.shake(100, 0.01);
  }
}

new Phaser.Game({ type: Phaser.AUTO, scene: Play });
```
