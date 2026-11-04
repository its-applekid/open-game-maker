import { useState, type FormEvent } from 'react';

import { Icon } from '../../components/Icon';
import { sendReport } from './send';
import './bug.css';

export function BugButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      await sendReport({ text: text.trim() || undefined });
      setText('');
      setState('idle');
      setOpen(false);
    } catch {
      setState('failed');
    }
  };

  return (
    <>
      <button
        type="button"
        className="studio-menu-action"
        aria-label="Report a problem"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="bug" />
      </button>
      {open && (
        <form className="bug-sheet" aria-label="Report a problem" onSubmit={submit}>
          <textarea
            aria-label="What went wrong?"
            aria-invalid={state === 'failed'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="bug-actions">
            <button type="button" className="bug-close" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
            <button type="submit" className="bug-send" disabled={state === 'sending'}>
              Send
            </button>
          </div>
        </form>
      )}
    </>
  );
}
