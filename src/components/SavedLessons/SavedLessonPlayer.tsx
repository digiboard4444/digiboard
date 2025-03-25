import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface SavedLessonPlayerProps {
  videoUrl: string;
}

const SavedLessonPlayer: React.FC<SavedLessonPlayerProps> = ({ videoUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Reset player state when video URL changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsReady(false);
    }
  }, [videoUrl]);

  const handlePlayPause = () => {
    if (!videoRef.current || !isReady) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      // Wrap in try/catch to handle potential play() failures
      try {
        const playPromise = videoRef.current.play();

        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error("Error playing video:", error);
            setIsPlaying(false);
          });
        }
      } catch (error) {
        console.error("Error playing video:", error);
        setIsPlaying(false);
        return;
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    if (!videoRef.current || !isReady) return;

    videoRef.current.currentTime = 0;

    try {
      const playPromise = videoRef.current.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Error playing video:", error);
          setIsPlaying(false);
        });
      }

      setIsPlaying(true);
    } catch (error) {
      console.error("Error restarting video:", error);
      setIsPlaying(false);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const handleCanPlay = () => {
    setIsReady(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error("Video error:", e);
    setIsReady(false);
    setIsPlaying(false);
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Saved Lesson</h2>
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="aspect-video w-full relative group">
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-gray-500">Loading video...</div>
            </div>
          )}

          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-gray-50"
            src={videoUrl}
            playsInline
            onCanPlay={handleCanPlay}
            onEnded={handleVideoEnd}
            onError={handleError}
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>

          {/* Video Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handlePlayPause}
                className={`p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isPlaying ? "Pause" : "Play"}
                disabled={!isReady}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                onClick={handleRestart}
                className={`p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Restart"
                disabled={!isReady}
              >
                <RotateCcw size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedLessonPlayer;