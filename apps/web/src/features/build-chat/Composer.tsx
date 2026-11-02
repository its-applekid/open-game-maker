import { useEffect, useRef, useState } from 'react';

import {
  captionsReducer,
  Dictation,
  VoiceClient,
  type Captions,
  type DictationError,
  type DictationTranscript,
  type VoiceClientOptions,
} from '@ogm/voice-client';
import type { VoiceTarget } from '@ogm/contracts';

import { Icon } from '../../components/Icon';
import { ApiError } from '../../lib/api/client';
import {
  addAttachments,
  ATTACH_ACCEPT,
  uploadAll,
  uploadChatAttachment,
  type PendingAttachment,
  type UploadAttachment,
} from './attachments';
import type { StreamedChatMessage } from './stream';
import { probeVoice as defaultProbeVoice, type VoiceAvailability } from './voice';

export type DictationPort = {
  pressStart(): void;
  pressEnd(): void;
  on(event: 'transcript', listener: (value: DictationTranscript) => void): () => void;
  on(event: 'error', listener: (value: DictationError) => void): () => void;
};

// `attachmentIds` is passed only when the message carries files.
type PostText = (jobId: string, text: string, attachmentIds?: string[]) => Promise<unknown>;

export function Composer({
  jobId,
  voiceTarget,
  dictation: providedDictation,
  postText,
  uploadAttachment = uploadChatAttachment,
  probeVoice = defaultProbeVoice,
  createVoiceClient = (options) => new VoiceClient(options),
  onOptimistic,
  onPosted,
  onFailed,
}: {
  jobId: string;
  voiceTarget?: VoiceTarget;
  dictation?: DictationPort;
  postText: PostText;
  uploadAttachment?: UploadAttachment;
  probeVoice?: (target: VoiceTarget) => Promise<VoiceAvailability>;
  createVoiceClient?: (options: VoiceClientOptions) => VoiceClient;
  onOptimistic?: (message: StreamedChatMessage) => void;
  onPosted?: (message: StreamedChatMessage) => void;
  onFailed?: (messageId: string) => void;
}) {
  const [dictation] = useState<DictationPort | undefined>(
    () => providedDictation ?? (Dictation.isSupported() ? new Dictation() : undefined),
  );
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [partial, setPartial] = useState('');
  const [notice, setNotice] = useState('');
  const [voice, setVoice] = useState<VoiceAvailability>({ available: false });
  const [voiceClient, setVoiceClient] = useState<VoiceClient>();
  const [captions, setCaptions] = useState<Captions>({ you: [], builder: [] });
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const voiceStartingRef = useRef(false);
  const [voiceStarting, setVoiceStarting] = useState(false);

  useEffect(() => {
    if (!dictation) return;
    const offTranscript = dictation.on('transcript', (transcript) => {
      if (transcript.kind === 'partial') {
        setPartial(transcript.text);
        return;
      }
      setPartial('');
      setText(transcript.text);
    });
    const offError = dictation.on('error', (error) => setNotice(error.message));
    return () => {
      dictation.pressEnd();
      offTranscript();
      offError();
    };
  }, [dictation]);

  useEffect(() => {
    if (!voiceTarget) return;
    let current = true;
    void probeVoice(voiceTarget)
      .then((result) => {
        if (current) setVoice(result);
      })
      .catch(() => {
        if (current) setVoice({ available: false });
      });
    return () => {
      current = false;
    };
  }, [probeVoice, voiceTarget]);

  useEffect(() => () => voiceClient?.end(), [voiceClient]);

  const submit = async () => {
    const value = text.trim();
    const files = attachments;
    if ((!value && files.length === 0) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const optimistic: StreamedChatMessage = {
      id: `optimistic-${Date.now()}`,
      job_id: jobId,
      at: new Date().toISOString(),
      actor: 'creator',
      kind: 'text',
      ...(value ? { text: value } : {}),
      ...(files.length === 0
        ? {}
        : {
            attachments: files.map(({ key, file, type }) => ({
              id: key,
              kind: type.startsWith('image/') ? ('image' as const) : ('text' as const),
              name: file.name,
              mime: type.startsWith('image/') ? ('image/webp' as const) : (type as 'text/plain'),
              bytes: file.size,
            })),
          }),
      optimistic: true,
    };
    onOptimistic?.(optimistic);
    setText('');
    setAttachments([]);
    try {
      const posted = await (files.length === 0
        ? postText(jobId, value)
        : postText(
            jobId,
            value,
            (await uploadAll(jobId, files, uploadAttachment)).map(({ id }) => id),
          ));
      if (posted && typeof posted === 'object' && 'id' in posted) onPosted?.(posted as StreamedChatMessage);
    } catch (error) {
      // 422 means the uploads were refused or already used (a post whose reply was lost); upload them again next time.
      if (error instanceof ApiError && error.status === 422) for (const item of files) delete item.uploaded;
      onFailed?.(optimistic.id);
      setText(value);
      setAttachments(files);
      setNotice('Message not sent. Try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const startVoice = async () => {
    if (!voice.available || !voiceTarget || voiceStartingRef.current) return;
    voiceStartingRef.current = true;
    setVoiceStarting(true);
    const client = createVoiceClient({ url: voice.url, token: voice.token, target: voiceTarget });
    for (const type of ['transcript', 'agent_text', 'interrupted'] as const) {
      client.on(type, (frame) => setCaptions((current) => captionsReducer(current, frame)));
    }
    client.on('error', (frame) => setNotice(frame.message));
    try {
      await client.startFromGesture();
      setVoiceClient(client);
    } catch {
      client.end();
    } finally {
      voiceStartingRef.current = false;
      setVoiceStarting(false);
    }
  };

  if (voiceClient) {
    return (
      <section className="build-chat-voice" aria-label="Voice chat">
        <VoiceSide label="You" lines={captions.you.map(({ text: line }) => line)} />
        <VoiceSide label="Builder" lines={captions.builder.map(({ text: line }) => line)} />
        <button
          className="build-chat-type tap-secondary"
          type="button"
          onClick={() => {
            voiceClient.end();
            setVoiceClient(undefined);
          }}
        >
          Type instead
        </button>
      </section>
    );
  }

  const startDictation = () => {
    setNotice('');
    dictation?.pressStart();
  };
  const endDictation = () => dictation?.pressEnd();

  return (
    <div className="build-chat-composer">
      {partial ? <p className="build-chat-partial">{partial}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <label className="sr" htmlFor={`build-chat-text-${jobId}`}>
        Message the builder
      </label>
      {attachments.length > 0 ? (
        <ul className="build-chat-attachments">
          {attachments.map(({ key, file }) => (
            <li key={key}>
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setAttachments((current) => current.filter((item) => item.key !== key))}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        id={`build-chat-text-${jobId}`}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={(event) => {
          const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
          if (images.length === 0) return;
          if (!event.clipboardData.types.includes('text/plain')) event.preventDefault();
          setAttachments((current) => addAttachments(current, images));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="build-chat-composer-actions">
        <button
          className="build-chat-attach tap-secondary"
          type="button"
          aria-label="Attach files"
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="paperclip" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ATTACH_ACCEPT}
          hidden
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = '';
            setAttachments((current) => addAttachments(current, picked));
          }}
        />
        {dictation ? (
          <button
            className="build-chat-dictate tap-secondary"
            type="button"
            aria-label="Hold to talk"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              startDictation();
            }}
            onPointerUp={endDictation}
            onPointerCancel={endDictation}
            onKeyDown={(event) => {
              if (event.code === 'Space' && !event.repeat) startDictation();
            }}
            onKeyUp={(event) => {
              if (event.code === 'Space') endDictation();
            }}
          >
            <Icon name="mic" />
          </button>
        ) : null}
        {voice.available ? (
          <button
            className="build-chat-voice-button tap-secondary"
            type="button"
            disabled={voiceStarting}
            onClick={() => void startVoice()}
          >
            Start voice chat
          </button>
        ) : null}
        <button
          className="build-chat-send tap-primary"
          type="button"
          disabled={submitting || (!text.trim() && attachments.length === 0)}
          onClick={() => void submit()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function VoiceSide({ label, lines }: { label: string; lines: string[] }) {
  return (
    <section className="build-chat-voice-side" aria-label={label}>
      <header>{label}</header>
      <div className={label === 'You' ? 'build-chat-seismograph' : 'build-chat-orb'} aria-hidden="true" />
      <div className="build-chat-captions" aria-live="polite">
        {lines.map((line, index) => (
          <p key={`${index}-${line}`}>{line}</p>
        ))}
      </div>
    </section>
  );
}
