export function designKey(ref) {
  return String(ref ?? "")
    .split(/[/|]/u)
    .at(-1)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/u, "")
    .replace(/[^a-z0-9_-]/gu, "")
    .replace(/^\d+/u, "")
    .replace(/(?:[-_/](?:idle|walk|run|attack|down|left|right|up|n|ne|e|se|s|sw|w|nw|\d+))+$/u, "");
}

export function placementKey(sprite) {
  return JSON.stringify([
    designKey(sprite?.ref),
    sprite?.at,
    sprite?.walk?.to,
    sprite?.scale ?? 1,
    sprite?.z ?? 0,
  ]);
}

export function globalPlacementKey(sprite, origin) {
  return placementKey({
    ...sprite,
    at: [origin[0] + sprite.at[0], origin[1] + sprite.at[1]],
    ...(sprite.walk?.to
      ? { walk: { ...sprite.walk, to: [origin[0] + sprite.walk.to[0], origin[1] + sprite.walk.to[1]] } }
      : {}),
  });
}
