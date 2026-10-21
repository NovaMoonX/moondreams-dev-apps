/** The Piper voice the natural voice speaks with (English, 22 kHz) and where its two files are fetched from. */
export const NATURAL_VOICE_ID = 'en_US-ljspeech-medium';
const MODEL_PATH = `en/en_US/ljspeech/medium/${NATURAL_VOICE_ID}`;

const DEFAULT_MODEL_BASE =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main';

/** Where the voice files come from; `VITE_NATURAL_VOICE_BASE_URL` points it at a copy on our own host. */
export const NATURAL_VOICE_BASE_URL = (
  (import.meta.env?.VITE_NATURAL_VOICE_BASE_URL as string | undefined) ??
  DEFAULT_MODEL_BASE
).replace(/\/+$/, '');

export const NATURAL_VOICE_MODEL_URL = `${NATURAL_VOICE_BASE_URL}/${MODEL_PATH}.onnx`;
export const NATURAL_VOICE_CONFIG_URL = `${NATURAL_VOICE_MODEL_URL}.json`;

/** The voice file is about this many bytes; the real length from the server wins once a download starts. */
export const NATURAL_VOICE_MODEL_BYTES = 63_201_294;
/** What turning the voice on downloads in all (the voice file and the speech engine files from this site), in megabytes, as shown. */
export const NATURAL_VOICE_SIZE_MB = 90;

export const NATURAL_VOICE_CACHE_NAME = 'natural-voice-v1';

/** The host the voice file comes from, as shown before it is downloaded. */
export const getNaturalVoiceHost = () => new URL(NATURAL_VOICE_BASE_URL).host;

/** The page language this voice can read. */
export const isNaturalVoiceLang = (lang: string) =>
  lang.toLowerCase().startsWith('en');

/** A reading with no sound by then is read by the usual voice instead. */
export const NATURAL_START_TIMEOUT_MS = 7000;
/** A voice that was too slow this many readings in a row is set aside for the session. */
export const NATURAL_MAX_SLOW_READINGS = 2;
