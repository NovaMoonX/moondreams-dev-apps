import { useEffect, useState } from 'react';

const REVEAL_ZONE_PX = 80;
const MIN_SCROLL_DELTA_PX = 8;

/** True while the page is being scrolled down away from the top, false as soon as it scrolls back up. */
export function useHideOnScroll() {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const state = { lastY: window.scrollY };
    const handleScroll = () => {
      const { scrollY } = window;
      const delta = scrollY - state.lastY;
      if (scrollY < REVEAL_ZONE_PX) {
        setIsHidden(false);
      } else if (delta > MIN_SCROLL_DELTA_PX) {
        setIsHidden(true);
      } else if (delta < -MIN_SCROLL_DELTA_PX) {
        setIsHidden(false);
      }
      if (Math.abs(delta) > MIN_SCROLL_DELTA_PX) {
        state.lastY = scrollY;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return isHidden;
}
