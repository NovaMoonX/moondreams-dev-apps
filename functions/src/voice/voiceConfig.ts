export type TtsProviderId = 'googleTts' | 'geminiTts' | 'deepgramAura';

export const VOICE_PROVIDER_DEFAULT: TtsProviderId = 'googleTts';

/** The most characters one reading may carry. */
export const TTS_MAX_CHARS = 600;

interface TtsPrice {
  per: 'character' | 'audioSecond';
  micros: number;
  readOn: '2026-11-09';
}

/** Millionths of a dollar per character or per second of audio, read from the providers' docs (search results) and unverified until the first real run. Google's first million characters a month are free; Gemini's audio price is said to double to $12 per million tokens on 2027-01-01. */
export const TTS_PRICES: Record<TtsProviderId, TtsPrice> = {
  deepgramAura: { per: 'character', micros: 30, readOn: '2026-11-09' },
  googleTts: { per: 'character', micros: 30, readOn: '2026-11-09' },
  geminiTts: { per: 'audioSecond', micros: 150, readOn: '2026-11-09' },
};

/** The candidates the benchmark plays for each provider. */
export const TTS_VOICES: Record<
  TtsProviderId,
  readonly { id: string; label: string }[]
> = {
  deepgramAura: [
    { id: 'aura-2-hera-en', label: 'Hera (warm)' },
    { id: 'aura-2-odysseus-en', label: 'Odysseus (calm)' },
    { id: 'aura-2-thalia-en', label: 'Thalia (clear)' },
  ],
  geminiTts: [
    { id: 'Sulafat', label: 'Sulafat (warm)' },
    { id: 'Achird', label: 'Achird (friendly)' },
    { id: 'Schedar', label: 'Schedar (even)' },
  ],
  googleTts: [
    { id: 'en-US-Chirp3-HD-Aoede', label: 'Aoede' },
    { id: 'en-US-Chirp3-HD-Achernar', label: 'Achernar' },
    { id: 'en-US-Chirp3-HD-Charon', label: 'Charon' },
  ],
};

/** The cost in millionths of a dollar of one reading; a price per audio second needs `audioSeconds`. */
export const costMicros = (
  provider: TtsProviderId,
  { characters, audioSeconds }: { characters: number; audioSeconds: number },
) => {
  const price = TTS_PRICES[provider];
  return price.micros * (price.per === 'character' ? characters : audioSeconds);
};
