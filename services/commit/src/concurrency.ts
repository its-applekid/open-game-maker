export async function mapConcurrent<T, U>(
  items: readonly T[],
  limit: number,
  transform: (item: T) => Promise<U>,
): Promise<U[]> {
  const output = new Array<U>(items.length);
  let next = 0;
  async function work(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) output[index] = await transform(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return output;
}
