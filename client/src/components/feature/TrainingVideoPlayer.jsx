import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

/**
 * Free open-source player (Plyr, MIT) for training streams.
 * Supports play/pause, seek, volume, speed, fullscreen, and picture-in-picture.
 */
export default function TrainingVideoPlayer({
  src,
  title = 'Training video',
  className = '',
  autoPlay = false
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return undefined;

    const player = new Plyr(el, {
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'pip',
        'fullscreen'
      ],
      settings: ['speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      ratio: '16:9',
      autoplay: Boolean(autoPlay),
      invertTime: false,
      keyboard: { focused: true, global: false },
      tooltips: { controls: true, seek: true },
      storage: { enabled: false }
    });
    playerRef.current = player;

    if (autoPlay) {
      const tryPlay = () => {
        player.play()?.catch(() => { /* browser may block unmuted autoplay */ });
      };
      if (player.ready) tryPlay();
      else player.on('ready', tryPlay);
    }

    return () => {
      try { player.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [src, autoPlay]);

  if (!src) return null;

  return (
    <div className={`training-plyr overflow-hidden rounded-lg bg-black ${className}`}>
      <video
        ref={videoRef}
        className="plyr-react plyr"
        src={src}
        playsInline
        controls
        preload="metadata"
        crossOrigin="use-credentials"
        title={title}
      >
        Your browser does not support embedded video playback.
      </video>
    </div>
  );
}
