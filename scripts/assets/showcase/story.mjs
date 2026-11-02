export const builtInReactions = new Set(["bob", "hold"]);

export function storyState(story, entityId, tau) {
  for (const beat of story ?? []) {
    const [start, contact, end] = beat.timing ?? [];
    if (entityId === beat.actor && tau >= start && tau < contact) {
      return {
        beat,
        role: "actor",
        phase: "action",
        progress: (tau - start) / (contact - start),
      };
    }
    if (entityId === beat.target && tau >= contact && tau < end) {
      return {
        beat,
        role: "target",
        phase: "reaction",
        progress: (tau - contact) / (end - contact),
      };
    }
  }
}

export function storyTransform(state) {
  if (state?.role !== "target" || state.beat.reaction !== "bob") {
    return { offsetY: 0 };
  }
  if (state.progress === 0) return { offsetY: 0 };
  return { offsetY: -6 * Math.sin(Math.PI * state.progress) };
}

function cyclicFrame(tau, fps, frameCount) {
  return Math.floor(tau * fps) % frameCount;
}

export function storyFrameIndex(state, tau, fps, frameCount) {
  if (!state) return cyclicFrame(tau, fps, frameCount);

  const [start, contact] = state.beat.timing;
  if (state.role === "target" && builtInReactions.has(state.beat.reaction)) {
    return cyclicFrame(contact, fps, frameCount);
  }

  const phaseStart = state.role === "actor" ? start : contact;
  return Math.min(frameCount - 1, Math.max(0, Math.floor((tau - phaseStart) * fps)));
}
