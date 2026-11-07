import { useState } from 'react';

import type { GameCommand } from '@ogm/contracts';

import { Icon } from '../../components/Icon';
import { AiurCommands, gameScope, type AiurCommandAnswer } from '../aiur/embed';
import { answerCommand, useGameCommands } from './commands';
import { isReviewDeck, ReviewDeck } from './ReviewDeck';
import './commands-inbox.css';

// One game's open Commands (M3): the same list the embeddable `<aiur-commands>` component renders when aiur ships it.
// Answering goes through the job's checkpoint route, so the answer lands in aiur's canonical Decision API either way.
// A Command whose options carry media (A3) opens as a review deck in its row, so the creator judges the cards here;
// the deck's deep link (review-route.ts) opens the same deck on its own screen.
export function CommandsInbox({ gameId, onOpenJob }: { gameId: string; onOpenJob(jobId: string): void }) {
  const { commands } = useGameCommands(gameId);
  const [answering, setAnswering] = useState<string>();

  if (commands.length === 0) return null;

  const answer = async (command: GameCommand, optionId: string) => {
    setAnswering(command.checkpoint_id);
    try {
      await answerCommand(gameId, command, optionId);
    } catch {
      // The Command stays in the inbox; the route's status (409 for a Command another writer answered) is final.
    } finally {
      setAnswering(undefined);
    }
  };
  const fromComponent = (detail: AiurCommandAnswer) => {
    const command = commands.find(
      (candidate) => candidate.job_id === detail.job_id && candidate.checkpoint_id === detail.checkpoint_id,
    );
    if (command) void answer(command, detail.option_id);
  };

  return (
    <AiurCommands
      scope={gameScope(
        gameId,
        commands.flatMap((command) => (command.ticket === null ? [] : [command.ticket])),
      )}
      commands={commands}
      onAnswer={fromComponent}
    >
      <ul className="commands-inbox" aria-label="Requests">
        {commands.map((command) => (
          <li className="commands-inbox-item" key={`${command.job_id}:${command.checkpoint_id}`}>
            <p className="commands-inbox-question">{command.question}</p>
            {isReviewDeck(command) ? (
              <ReviewDeck gameId={gameId} command={command} />
            ) : (
              <div className="build-chat-options">
                {command.options.map((option) => (
                  <button
                    aria-label={option.label}
                    className="build-chat-option"
                    disabled={answering !== undefined}
                    key={option.id}
                    onClick={() => void answer(command, option.id)}
                    type="button"
                  >
                    {option.media && (
                      <span className="checkpoint-option-media" aria-hidden="true">
                        {option.media.duration_ms === undefined ? (
                          <img alt="" src={option.media.url} />
                        ) : (
                          <video
                            muted
                            playsInline
                            poster={option.media.poster}
                            preload="metadata"
                            src={option.media.url}
                          />
                        )}
                      </span>
                    )}
                    <span className="checkpoint-option-label">{option.label}</span>
                    {option.id === command.recommend && (
                      <span className="checkpoint-recommended">Builder&apos;s pick</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              aria-label={`Open ${command.title}`}
              className="commands-inbox-open tap-secondary"
              onClick={() => onOpenJob(command.job_id)}
              type="button"
            >
              <Icon name="speak" />
            </button>
          </li>
        ))}
      </ul>
    </AiurCommands>
  );
}
