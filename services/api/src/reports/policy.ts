// Repair policy (B8 §6, D5: constants until measured).
// The one-third reservation is applied through OGM-013's `repair` size-class rows, not here.
export const REPAIR_RESERVATION_FRACTION = 1 / 3;
export const REPAIR_ATTEMPTS = 2;
export const WRONG_BEHAVIOUR_REPAIR_AT = 3;
export const REPAIR_COMPLEXITY = 2;

export const REPORTS_PER_USER_PER_HOUR = 20;
export const PLATFORM_ISSUE_LABELS = ['bug', 'source:report'];

// Frames from the host shell or platform origin are never the game's own code.
export const PLATFORM_FRAME = /^(https?:\/\/ogm2000\.netlify\.app|@ogm\/host|@gm\/host)/;
// SDK-only frames are ambiguous: B8 sends ambiguous crashes to game repair first.
export const SDK_FRAME = /^@gm\/sdk/;

const NUMBER_WORD = String.raw`(\d+|one|two|three|four|five|six|seven|eight|nine|ten|half|double|twice|triple)`;
export const EDITOR_HINT_PATTERNS: readonly RegExp[] = [
  /\btoo (fast|slow|hard|easy|big|small|loud|quiet)\b/i,
  /\b(more|less|fewer) \w+/i,
  new RegExp(
    String.raw`\b(speed|volume|size|count)\b.*\b${NUMBER_WORD}\b|\b${NUMBER_WORD}\b.*\b(speed|volume|size|count)\b`,
    'i',
  ),
];
