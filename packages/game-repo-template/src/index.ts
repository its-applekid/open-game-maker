import { renderRepoTemplate, type RepoTemplate, type TemplateCtx } from './repo.js';

export { renderDaemonFiles, type DaemonFiles } from './daemon-files.js';
export { renderInstanceTemplate, type InstanceTemplate } from './instance.js';
export { LABELS, type TemplateLabel } from './labels.js';
export {
  parseTemplateRef,
  renderRepoTemplate,
  REQUIRED_CHECKS,
  type Engine,
  type FileMode,
  type RepoTemplate,
  type TemplateCtx,
  type TemplateFile,
} from './repo.js';
export { skillPack, type SkillPack } from './skills.js';

// OGM-035's `TemplateSource` for `game-<engine>@1` refs.
export class GameRepoTemplateSource {
  constructor(private readonly root?: string) {}

  async render(templateRef: string, context: TemplateCtx): Promise<RepoTemplate> {
    return renderRepoTemplate(templateRef, context, this.root);
  }
}
