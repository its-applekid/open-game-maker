import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Fab } from './Fab';
import { buildChatJob } from './test-fixtures';

afterEach(() => cleanup());

describe('Fab', () => {
  it('weights the progress ring by each active reservation', () => {
    const jobs = [buildChatJob({ id: 'j_1', progressPercent: 25 }), buildChatJob({ id: 'j_2', progressPercent: 75 })];
    const { container } = render(<Fab jobs={jobs} fresh={false} onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: '2 builds running, 50% done. Show progress' })).toBeInTheDocument();
    expect(container.querySelector('.build-chat-ring-progress')).toHaveAttribute('stroke-dashoffset', '56.5');
  });

  it('announces a newly completed build', () => {
    render(<Fab jobs={[buildChatJob({ state: 'done' })]} fresh onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'A build finished. Show it' })).toBeInTheDocument();
  });
});
