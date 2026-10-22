import { lazy, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { canPlay } from 'react-player/patterns';
import type { PlayerEntry } from 'react-player/players';
import { createReactPlayer } from 'react-player/ReactPlayer';

import FallbackImage from '@/components/FallbackImage';
import type { InlineVideo } from '@apps/pinch/utils/recipeLinks';

const PLAYERS: PlayerEntry[] = [
  {
    key: 'youtube',
    name: 'YouTube',
    canPlay: canPlay.youtube,
    player: lazy(
      () => import('youtube-video-element/react'),
    ) as PlayerEntry['player'],
  },
  {
    key: 'vimeo',
    name: 'Vimeo',
    canPlay: canPlay.vimeo,
    player: lazy(
      () => import('vimeo-video-element/react'),
    ) as PlayerEntry['player'],
  },
];

const VideoPlayer = createReactPlayer(PLAYERS, PLAYERS[0]);

const TILE = <div className='bg-accent absolute inset-0' aria-hidden='true' />;

const PLAY_ICON = (
  <span className='bg-background/90 text-foreground relative grid size-12 place-items-center rounded-full shadow-sm'>
    <Play className='size-5 fill-current' aria-hidden='true' />
  </span>
);

interface HowToVideoProps {
  video: InlineVideo;
  ariaLabel: string;
}

/** The thumbnail with a play button; the host's player (and its scripts) load only after the tap. `playing` follows the player's own play and pause, so a re-render never restarts a video the person paused. */
function HowToVideo({ video, ariaLabel }: HowToVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const poster = useMemo(
    () =>
      video.thumbnailUrl === null ? (
        TILE
      ) : (
        <FallbackImage
          src={video.thumbnailUrl}
          alt=''
          fallback={TILE}
          className='absolute inset-0 size-full object-cover object-center'
        />
      ),
    [video.thumbnailUrl],
  );

  return (
    <div className='bg-accent border-border relative aspect-video overflow-hidden rounded-2xl border'>
      <VideoPlayer
        src={video.src}
        light={poster}
        playIcon={PLAY_ICON}
        previewAriaLabel={ariaLabel}
        playing={isPlaying}
        controls
        playsInline
        width='100%'
        height='100%'
        fallback={TILE}
        onClickPreview={() => setIsPlaying(true)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}

export default HowToVideo;
