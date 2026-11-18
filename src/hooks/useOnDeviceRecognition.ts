import { useEffect, useState, useSyncExternalStore } from 'react';

import { readOnDeviceBlock } from '@/lib/speech/onDevice/capability';
import {
  isOnDeviceLang,
  ON_DEVICE_CREDITS,
  ON_DEVICE_SIZE_MB,
  ON_DEVICE_TOTAL_BYTES,
} from '@/lib/speech/onDevice/config';
import {
  cancelOnDeviceDownload,
  downloadOnDeviceModel,
  getOnDeviceModelState,
  refreshOnDeviceStored,
  removeOnDeviceModel,
  subscribeOnDeviceModel,
} from '@/lib/speech/onDevice/modelStore';
import {
  getRecognizerStatus,
  loadRecognizer,
  subscribeRecognizer,
  unloadRecognizer,
} from '@/lib/speech/onDevice/recognizer';

let consumerCount = 0;

/**
 * The opt-in for hearing the person with a recognition model that runs on this device, so listening needs no
 * connection and sends nothing anywhere. `download` fetches about `sizeMb` megabytes once from this site, checks every
 * file and keeps them in the browser; `cancel` stops it keeping nothing, `remove` deletes it. While `isOn`, pass it to
 * `useVoiceConversation` as `isOnDeviceReady`. `block` says why this browser can't (draw the reason, never a dead
 * switch). With `isWarm` the model is started ahead of the first listen; it is freed when the last screen using this hook closes.
 */
export function useOnDeviceRecognition({
  lang,
  isWarm = false,
}: {
  lang: string;
  isWarm?: boolean;
}) {
  const [deviceBlock] = useState(readOnDeviceBlock);
  const model = useSyncExternalStore(
    subscribeOnDeviceModel,
    getOnDeviceModelState,
  );
  const status = useSyncExternalStore(subscribeRecognizer, getRecognizerStatus);
  const block =
    deviceBlock ?? (isOnDeviceLang(lang) ? null : ('language' as const));

  useEffect(() => {
    consumerCount += 1;
    return () => {
      consumerCount -= 1;
      if (consumerCount === 0) unloadRecognizer();
    };
  }, []);

  useEffect(() => {
    if (deviceBlock !== null) return;
    void refreshOnDeviceStored();
  }, [deviceBlock]);

  const isOn = block === null && model.isStored === true && status !== 'failed';

  useEffect(() => {
    if (!isOn || !isWarm) return;
    loadRecognizer().catch((error: unknown) =>
      console.error('The on-device recognizer could not start', error),
    );
  }, [isOn, isWarm]);

  const remove = () => {
    unloadRecognizer();
    removeOnDeviceModel().catch((error: unknown) =>
      console.error('The on-device model could not be removed', error),
    );
  };

  return {
    /** Why it can't run here; null when it can. A download that found no room reports `problem: 'space'` instead. */
    block,
    /** Downloaded, checked and usable on this device. */
    isOn,
    /** Started and listening-ready right now (a first listen otherwise waits a moment for it to start). */
    isReady: isOn && status === 'ready',
    /** Whether the download is kept here; null until looked at. */
    isStored: model.isStored,
    isDownloading: model.isDownloading,
    loadedBytes: model.loadedBytes,
    totalBytes: ON_DEVICE_TOTAL_BYTES,
    sizeMb: ON_DEVICE_SIZE_MB,
    problem: status === 'failed' ? ('start' as const) : model.problem,
    credits: ON_DEVICE_CREDITS,
    download: () => void downloadOnDeviceModel(),
    cancel: cancelOnDeviceDownload,
    remove,
  };
}

export type OnDeviceRecognition = ReturnType<typeof useOnDeviceRecognition>;
