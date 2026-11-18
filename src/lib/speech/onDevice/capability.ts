import { ON_DEVICE_TOTAL_BYTES } from '@/lib/speech/onDevice/config';

/** Why this browser can't run the recognizer: not a secure page, no WebAssembly SIMD, no audio worklet, too little memory, too little room to keep it, or a language the model doesn't hear. */
export type OnDeviceBlock =
  'browser' | 'simd' | 'audio' | 'memory' | 'space' | 'language';

const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);
const MIN_MEMORY_GB = 2;
// Room for the files plus what the browser needs around them while they are written.
const SPACE_MARGIN = 1.5;

const hasSimd = () => {
  try {
    return WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
};

/** What this page can't do that the recognizer needs, without asking anything of the person; null when nothing is missing. */
export const readOnDeviceBlock = (): Exclude<
  OnDeviceBlock,
  'space' | 'language'
> | null => {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return 'browser';
  }
  if (
    typeof Worker === 'undefined' ||
    typeof caches === 'undefined' ||
    typeof WebAssembly === 'undefined' ||
    typeof crypto === 'undefined' ||
    crypto.subtle === undefined
  ) {
    return 'browser';
  }
  if (!hasSimd()) return 'simd';
  if (
    typeof AudioContext === 'undefined' ||
    typeof AudioWorkletNode === 'undefined' ||
    navigator.mediaDevices?.getUserMedia === undefined
  ) {
    return 'audio';
  }
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (memory !== undefined && memory < MIN_MEMORY_GB) return 'memory';
  return null;
};

/** Whether the browser says there is room to keep the download; true when it can't tell. */
export const hasRoomForOnDevice = async () => {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota === undefined) return true;
    return (
      estimate.quota - (estimate.usage ?? 0) >=
      ON_DEVICE_TOTAL_BYTES * SPACE_MARGIN
    );
  } catch {
    return true;
  }
};
