import { useEffect, useRef } from 'react';

const JOLT_DELTA = 15;
const JOLTS_NEEDED = 3;
const WINDOW_MS = 800;
const JOLT_GAP_MS = 100;
const COOLDOWN_MS = 1500;

interface UseShakeOptions {
  isEnabled: boolean;
}

/** Calls `onShake` when the device is shaken: three sharp jolts within 800ms, then a 1.5s pause. Needs motion access, which iPhones grant only from a tap (`@/lib/motion/motionPermission`). */
export function useShake(onShake: () => void, { isEnabled }: UseShakeOptions) {
  const onShakeRef = useRef(onShake);

  useEffect(() => {
    onShakeRef.current = onShake;
  });

  useEffect(() => {
    if (!isEnabled) return;
    const run = {
      last: null as { x: number; y: number; z: number } | null,
      jolts: [] as number[],
      lastShakeAt: 0,
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      const { x, y, z } = event.accelerationIncludingGravity ?? {};
      if (x == null || y == null || z == null) return;
      const previous = run.last;
      run.last = { x, y, z };
      if (!previous) return;
      const now = Date.now();
      const delta = Math.hypot(x - previous.x, y - previous.y, z - previous.z);
      const newest = run.jolts[run.jolts.length - 1] ?? 0;
      if (delta < JOLT_DELTA || now - newest < JOLT_GAP_MS) return;
      run.jolts = [...run.jolts.filter((at) => now - at < WINDOW_MS), now];
      if (
        run.jolts.length >= JOLTS_NEEDED &&
        now - run.lastShakeAt > COOLDOWN_MS
      ) {
        run.jolts = [];
        run.lastShakeAt = now;
        onShakeRef.current();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isEnabled]);
}
