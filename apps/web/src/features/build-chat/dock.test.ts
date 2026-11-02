import { describe, expect, it } from 'vitest';

import { initialDock, reduceDock, visibleJobs, type DockJob } from './dock';

const running: DockJob = { id: 'j_1', state: 'running' };
const done: DockJob = { id: 'j_1', state: 'done' };

describe('build chat dock state', () => {
  it('moves from collapsed to summary, list, and chat', () => {
    const open = reduceDock(initialDock(), { type: 'open' }, [running]);
    const expanded = reduceDock(open, { type: 'toggle-list' }, [running]);
    const chat = reduceDock(expanded, { type: 'open-chat', jobId: running.id }, [running]);

    expect(open.view).toBe('open');
    expect(expanded.view).toBe('expanded');
    expect(chat).toMatchObject({ view: 'chat', openJobId: running.id });
    expect(reduceDock(chat, { type: 'back' }, [running]).view).toBe('expanded');
  });

  it('glows for a newly finished job, marks it seen on open, and prunes it on close', () => {
    const tracked = reduceDock(initialDock(), { type: 'sync', jobs: [running] }, [running]);
    const finished = reduceDock(tracked, { type: 'sync', jobs: [done] }, [done]);
    const opened = reduceDock(finished, { type: 'open' }, [done]);
    const closed = reduceDock(opened, { type: 'close' }, [done]);

    expect(finished.fresh).toBe(true);
    expect(opened.fresh).toBe(false);
    expect(opened.seen).toContain(done.id);
    expect(visibleJobs([done], closed)).toEqual([]);
  });

  it('opens a draft edit chat that keeps its chat key once the edit job is admitted', () => {
    const draft = { gameId: 'g_1', branchId: 'v2', title: 'Goblin Cellar' };
    const started = reduceDock(initialDock(), { type: 'start-edit', draft }, []);
    const admitted = reduceDock(started, { type: 'admitted', jobId: 'j_new', draft }, []);

    expect(started).toMatchObject({ view: 'chat', draft, chatKey: 'edit:g_1:v2' });
    expect(started.openJobId).toBeUndefined();
    // Same key: the chat holding the creator's instruction stays mounted and streams the new job.
    expect(admitted).toMatchObject({ view: 'chat', openJobId: 'j_new', draft, chatKey: 'edit:g_1:v2' });
  });

  it('collapses on back from a draft chat when there is no build to list', () => {
    const draft = { gameId: 'g_1', branchId: 'main', title: 'Goblin Cellar' };
    const started = reduceDock(initialDock(), { type: 'start-edit', draft }, []);

    expect(reduceDock(started, { type: 'back' }, [])).toMatchObject({ view: 'collapsed', draft: undefined });
    expect(reduceDock(started, { type: 'back' }, [running])).toMatchObject({ view: 'expanded', draft: undefined });
  });
});
