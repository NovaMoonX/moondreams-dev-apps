export interface RecognizerFile {
  url: string;
  /** Where the file sits inside the recognizer's own file system. */
  name: string;
}

export type ToRecognizerWorker =
  | {
      type: 'init';
      cacheName: string;
      runtimeUrl: string;
      binaryUrl: string;
      models: RecognizerFile[];
    }
  | { type: 'open'; id: number }
  | { type: 'audio'; id: number; pcm: ArrayBuffer }
  | { type: 'finish'; id: number }
  | { type: 'close'; id: number };

export type FromRecognizerWorker =
  | { type: 'ready' }
  | { type: 'partial'; id: number; text: string }
  | { type: 'segment'; id: number; text: string }
  | { type: 'finished'; id: number; text: string }
  | { type: 'failed'; id: number | null; message: string };
