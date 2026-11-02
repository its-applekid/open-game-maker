import { useEffect } from 'react';

import type { BuildTimeline } from '../types';
import { adminTestState } from '../test-state';
import { ActivityBars } from './ActivityBars';
import { layoutTimeline } from './layout';

const WIDTH = 1_000;

export function Timeline({ timeline }: { timeline: BuildTimeline }) {
  const phases = [...timeline.aiur.phases, { phase: 'done', at: timeline.generatedAt }];
  const layout = layoutTimeline({ phases, activities: timeline.activities, generatedAt: timeline.generatedAt }, WIDTH);

  useEffect(() => {
    adminTestState.lastTimeline = timeline;
  }, [timeline]);

  return (
    <section className="admin-timeline-section">
      <h3>Timeline</h3>
      <div className="admin-timeline-scroll">
        <svg aria-label="Build timeline" className="admin-timeline" role="img" viewBox={`0 0 ${WIDTH} 150`}>
          <line x1="0" x2={WIDTH} y1="48" y2="48" />
          {layout.phases.map((segment, index) => (
            <g key={segment.id}>
              <rect
                className={`phase phase-${index % 4}`}
                height="34"
                rx="8"
                width={segment.width}
                x={segment.x}
                y="30"
              >
                <title>{segment.label}</title>
              </rect>
              {segment.width >= 70 ? (
                <text x={segment.x + 8} y="52">
                  {segment.label}
                </text>
              ) : null}
            </g>
          ))}
          {layout.activities.map((segment, index) => (
            <rect
              className={`activity activity-${index % 5}`}
              height="28"
              rx="6"
              width={segment.width}
              x={segment.x}
              y="88"
              key={segment.id}
            >
              <title>
                {segment.label}
                {segment.open ? ' (open)' : ''}
              </title>
            </rect>
          ))}
          <text x="0" y="18">
            Aiur phases
          </text>
          <text x="0" y="140">
            OGM activities inside work
          </text>
        </svg>
      </div>
      <ActivityBars minutesByActivity={layout.minutesByActivity} />
    </section>
  );
}
