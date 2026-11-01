# Changes from phaserjs/phaser@f84916099a9fac952679fc71a978fea2e60eafcb

Every file gains `license`, `source` and `modified` front-matter keys. Files with `modified: true`:

- v4-new-features/SKILL.md: noise factory calls corrected to the registered lowercase names (`this.add.noisecell2d()`, `noisecell3d`, `noisecell4d`, `noisesimplex2d`, `noisesimplex3d`); the camelCase names do not exist in Phaser 4.2.1.
- loading-assets/SKILL.md: remote `https://` base URLs in code replaced with a relative `static/` base; the absolute-URL example became a `// reference:` comment.
