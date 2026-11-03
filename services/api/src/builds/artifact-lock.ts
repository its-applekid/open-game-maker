let tail = Promise.resolve();

/** Serialize shared-blob, build-directory, and branch-predecessor mutations inside this API process. */
export async function withArtifactMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tail = previous.then(() => current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}
