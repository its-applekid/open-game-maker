import type { NotificationTrigger } from '@ogm/contracts';

export type RenderedNotification = { title: string; body: string; url: string };

export function render(trigger: NotificationTrigger, context: { gameTitle?: string }): RenderedNotification {
  switch (trigger.kind) {
    case 'build.done':
      return {
        title: trigger.ok ? 'Your build is ready' : 'A build needs you',
        body: context.gameTitle ?? trigger.gameId,
        url: `/games/${trigger.gameId}`,
      };
    case 'job.started':
      return {
        title: 'Your queued change started',
        body: context.gameTitle ?? trigger.gameId,
        url: `/games/${trigger.gameId}?chat=${trigger.jobId}`,
      };
    case 'scope.agreed':
      return {
        title: 'Your game plan is ready',
        body: context.gameTitle ?? trigger.gameId,
        url: `/games/${trigger.gameId}?chat=${trigger.jobId}`,
      };
    case 'intake.report':
      return {
        title: 'New assets arrived',
        body: `${trigger.dropId}: ${trigger.status}`,
        url: '/admin/intake',
      };
  }
}
