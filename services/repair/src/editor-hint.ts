import type { ControlDecl, EditorHint } from '@ogm/contracts';

const PROPERTY_WORDS: Record<string, readonly string[]> = {
  speed: ['speed', 'fast', 'slow'],
  volume: ['volume', 'loud', 'quiet'],
  size: ['size', 'big', 'small'],
  difficulty: ['difficulty', 'hard', 'easy'],
  count: ['count', 'many', 'few'],
};
const DECREASE = /\b(?:too|very)\s+(?:fast|loud|big|hard|many)\b/;
const INCREASE = /\b(?:too|very)\s+(?:slow|quiet|small|easy|few)\b/;

function matchesControl(text: string, control: ControlDecl): boolean {
  const segments = control.id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const property = segments.at(-1)!;
  const subject = segments[0]!;
  const propertyWords = PROPERTY_WORDS[property] ?? [property];
  return text.includes(subject) && propertyWords.some((word) => text.includes(word));
}

export function editorHint(words: string | undefined, controls: readonly ControlDecl[]): EditorHint | undefined {
  const text = words
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!text) return undefined;
  const control = controls.find((candidate) => matchesControl(text, candidate));
  if (!control) return undefined;
  let suggestion: EditorHint['suggestion'] | undefined;
  if (control.widget.kind === 'toggle') suggestion = 'toggle';
  else if (DECREASE.test(text)) suggestion = 'decrease';
  else if (INCREASE.test(text)) suggestion = 'increase';
  if (!suggestion) return undefined;
  return {
    controlId: control.id,
    suggestion,
    reason: `Complaint matches the declared ${control.id} control.`,
  };
}
