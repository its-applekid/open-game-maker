# Changes from CloudAI-X/threejs-skills@0e181866f095b5f06d005133876e926515390d95

Every file gains `license`, `source` and `modified` front-matter keys. `threejs-react-three-fiber` and
`threejs-asset-pipeline` (needs the gltf-transform CLI, operator-side, see OGM-063) are not vendored. Files with
`modified: true`:

- threejs-fundamentals/SKILL.md: the two jsDelivr import maps replaced with Vite imports (`npm i three`, bundled, offline).
- threejs-loaders/SKILL.md: the `setURLModifier` example rewrites to a relative `static/` path instead of a remote host.
