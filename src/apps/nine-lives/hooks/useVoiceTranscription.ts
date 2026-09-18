import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getSpeechRecognitionError(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Microphone access was blocked. Allow microphone access and try again.';
  }

  if (error === 'no-speech') {
    return 'No speech was detected. Try again when you are ready.';
  }

  return 'Voice transcription stopped unexpectedly. Try again.';
}

export interface VoiceTranscription {
  error: string | null;
  isListening: boolean;
  isSupported: boolean;
  start: () => void;
  stop: () => Promise<string>;
  cancel: () => void;
  reset: () => void;
  transcript: string;
}

export function useVoiceTranscription(): VoiceTranscription {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  const resolveStopRef = useRef<((transcript: string) => void) | null>(null);
  const rejectStopRef = useRef<((error: Error) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const isSupported = getSpeechRecognitionConstructor() !== null;

  const finish = useCallback((nextError?: Error) => {
    const resolveStop = resolveStopRef.current;
    const rejectStop = rejectStopRef.current;
    resolveStopRef.current = null;
    rejectStopRef.current = null;

    if (nextError) {
      rejectStop?.(nextError);
    } else {
      resolveStop?.(transcriptRef.current);
    }
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition || recognitionRef.current) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      let nextTranscript = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        nextTranscript += `${result[0].transcript} `;
      }

      const trimmedTranscript = nextTranscript.trim();
      transcriptRef.current = trimmedTranscript;
      setTranscript(trimmedTranscript);
    };
    recognition.onerror = (event) => {
      const nextError = new Error(getSpeechRecognitionError(event.error));
      setError(nextError.message);
      setIsListening(false);
      recognitionRef.current = null;
      finish(nextError);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      finish();
    };

    transcriptRef.current = '';
    setTranscript('');
    setError(null);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [finish]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition) {
      return Promise.resolve(transcriptRef.current);
    }

    const result = new Promise<string>((resolve, reject) => {
      resolveStopRef.current = resolve;
      rejectStopRef.current = reject;
    });
    recognition.stop();

    return result;
  }, []);

  const cancel = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    resolveStopRef.current = null;
    rejectStopRef.current = null;
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setTranscript('');
    transcriptRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    error,
    isListening,
    isSupported,
    start,
    stop,
    cancel,
    reset,
    transcript,
  };
}
