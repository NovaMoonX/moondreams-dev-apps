import { useEffect, useRef, useState } from 'react';

import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import { clipAtWord } from '@/utils/stringUtils';
import { readInputLevel } from '@/lib/speech/voice/inputLevel';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import type { VoiceTokenSource } from '@/lib/speech/voice/voiceToken';

// The words are normally in within a second of the last one; past this the wait is given up.
const FORMATTING_LIMIT_MS = 10_000;

export type DictationPhase = 'idle' | 'listening' | 'formatting';

interface UseDictationOptions {
  lang: string;
  identity: VoiceIdentity;
  /** The cloud listener (smart formatting, the names in `getNameHints`) while allowed and online; the device's own recognition otherwise. */
  cloudListening: { tokenSource: VoiceTokenSource; isAllowed: boolean } | null;
  /** Names the recognizer should expect, asked at each listen. */
  getNameHints?: () => string[];
  /** The finished, formatted words; the caller puts them in its box and says whether some did not fit. Nothing is sent. */
  onWords: (words: string) => boolean;
}

type DictationNote = 'nothing' | 'failed' | 'cut';

/** Puts spoken words after what is already typed, cut at the last word that fits `maxLength`; `isCut` is true when anything was left out. */
export const appendDictated = (
  current: string,
  spoken: string,
  maxLength: number,
) => {
  const joined = `${current.trim()} ${spoken.trim()}`.trim();
  return joined.length <= maxLength
    ? { text: joined, isCut: false }
    : { text: clipAtWord(joined, maxLength), isCut: true };
};

/** Speaking into a text box: nothing is shown while the person talks but the level, the words arrive once, formatted, and the caller puts them in the box to read, fix and send. */
export function useDictation({
  lang,
  identity,
  cloudListening,
  getNameHints,
  onWords,
}: UseDictationOptions) {
  const [isAwaiting, setIsAwaiting] = useState(false);
  const [landed, setLanded] = useState(0);
  const [note, setNote] = useState<DictationNote | null>(null);
  const [needsMicrophone, setNeedsMicrophone] = useState(false);

  const end = (nextNote: DictationNote | null) => {
    setIsAwaiting(false);
    setNote(nextNote);
  };

  const voice = useVoiceConversation({
    lang,
    identity,
    endPhrases: [],
    cloudListening,
    getNameHints,
    onUtterance: (spoken) => {
      voice.settle();
      setIsAwaiting(false);
      setNote(onWords(spoken) ? 'cut' : null);
      setLanded((count) => count + 1);
    },
    onNothingHeard: (isAsked) => end(isAsked ? 'nothing' : null),
    onDeviceListenFailed: (isAsked) => end(isAsked ? 'failed' : null),
    onUnavailable: (reason) => {
      setNeedsMicrophone(reason === 'no-permission');
      end(null);
    },
  });

  const isListening = voice.state === 'listening' || voice.isStarting;
  const phase: DictationPhase = !isAwaiting
    ? 'idle'
    : isListening
      ? 'listening'
      : 'formatting';

  const cancelRef = useRef(voice.cancel);
  useEffect(() => {
    cancelRef.current = voice.cancel;
  });
  useEffect(() => {
    if (phase !== 'formatting') return;
    const timer = window.setTimeout(() => {
      cancelRef.current();
      setIsAwaiting(false);
      setNote('failed');
    }, FORMATTING_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return {
    phase,
    /** Counts each time words landed, so a box can move focus to its end. */
    landed,
    note,
    needsMicrophone,
    clearNeedsMicrophone: () => setNeedsMicrophone(false),
    canListen: voice.unavailableReason !== 'no-recognition',
    /** Where the words are listened to ('cloud' or the device), null when not listening. */
    route: voice.listeningRoute,
    getLevel: readInputLevel,
    start: () => {
      setNote(null);
      setIsAwaiting(true);
      voice.listen();
    },
    /** Ends the listen and keeps what was said; a listen that has not started yet is dropped at once. */
    stop: () => {
      if (!voice.isStarting) {
        voice.stop();
        return;
      }
      voice.cancel();
      end(null);
    },
    cancel: () => {
      voice.cancel();
      end(null);
    },
  };
}

export type Dictation = ReturnType<typeof useDictation>;
