/*
 * A game's label in the instance repository. Every game shares one repository, so intake and maintainers tell whose
 * issue or change it is by this label; it is derived from the game's current URL slug.
 */
export function gameIssueLabel(slug: string): string {
  return `game:${slug}`;
}
