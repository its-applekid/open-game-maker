import type { CreateReport, ReportFrame, ReportRoute } from '@ogm/contracts';

import { EDITOR_HINT_PATTERNS, PLATFORM_FRAME, SDK_FRAME, WRONG_BEHAVIOUR_REPAIR_AT } from './policy.js';
import { stripOrigin } from './signature.js';

export type Reproduction = 'crash_with_error' | 'wrong_behaviour' | 'not_reproducible';

export type ClassifyInput = {
  report: Pick<CreateReport, 'gameId' | 'text' | 'error'>;
  existing: {
    // The platform-scoped twin of this error was already reported from a different game.
    seenInOtherGame: boolean;
    // Earlier reports with the same no-error text signature (this one excluded).
    wrongBehaviourCount: number;
  };
};

export type Classification = { route: ReportRoute; reproduction: Reproduction; reason: string };

function isInGameFrame(frame: ReportFrame, gameId: string): boolean {
  return stripOrigin(frame.file).startsWith(`/g/${gameId}/`);
}

export function isPlatformFrame(frame: ReportFrame, gameId: string): boolean {
  if (PLATFORM_FRAME.test(frame.file)) return true;
  if (SDK_FRAME.test(frame.file)) return false;
  return !isInGameFrame(frame, gameId);
}

// B8 §6 rule table; first match wins. Pure: every input it needs is passed in.
export function classify({ report, existing }: ClassifyInput): Classification {
  const { error, gameId } = report;
  const text = report.text?.trim() ?? '';

  if (error) {
    const top = error.frames.slice(0, 3);
    if (top.some((frame) => isPlatformFrame(frame, gameId))) {
      return { route: 'platform', reproduction: 'crash_with_error', reason: 'frame_outside_game' };
    }
    if (existing.seenInOtherGame) {
      return { route: 'platform', reproduction: 'crash_with_error', reason: 'repeats_across_games' };
    }
    if (top.length > 0) {
      return { route: 'game_repair', reproduction: 'crash_with_error', reason: 'crash_in_game' };
    }
    return { route: 'stored', reproduction: 'not_reproducible', reason: 'error_without_frames' };
  }

  if (text && EDITOR_HINT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { route: 'editor_hint', reproduction: 'not_reproducible', reason: 'editor_fixable' };
  }
  if (text) {
    return existing.wrongBehaviourCount + 1 >= WRONG_BEHAVIOUR_REPAIR_AT
      ? { route: 'game_repair', reproduction: 'wrong_behaviour', reason: 'wrong_behaviour_threshold' }
      : { route: 'stored', reproduction: 'wrong_behaviour', reason: 'wrong_behaviour' };
  }
  return { route: 'stored', reproduction: 'not_reproducible', reason: 'no_error_no_text' };
}
