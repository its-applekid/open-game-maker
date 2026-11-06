/**
 * The core packages an instance game needs from a registry: the mandatory engine (`@gm/sdk`), the
 * public contracts and bridge it depends on, and the pack adapters `gm new --set` can pin. The publish
 * order is computed from the workspace graph, not from this list.
 */
export const DEFAULT_ROOTS: readonly string[] = [
  '@gm/sdk',
  '@ogm/contracts',
  '@gm/pack-kaykit',
  '@gm/pack-limezu-modern',
  '@gm/pack-smallscaleint',
];
