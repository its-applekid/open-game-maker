export class AssetNotFound extends Error {
  constructor(readonly id: string) {
    super(`Asset not found: ${id}`);
    this.name = 'AssetNotFound';
  }
}

export class AssetUnavailable extends Error {
  constructor(
    readonly id: string,
    readonly tried: readonly string[],
  ) {
    super(`Asset ${id} has no file for tier chain ${tried.join(' → ')}`);
    this.name = 'AssetUnavailable';
  }
}
