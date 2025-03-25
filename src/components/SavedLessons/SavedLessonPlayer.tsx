import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Loader2 } from 'lucide-react';

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

      // For videos that might have CORS issues, add a fallback timeout
      const timeoutId = setTimeout(() => {
        if (!isReady) {
          console.log("Video loading timed out, setting ready state manually");
          setIsReady(true);
        }
      }, 3000);

      return () => clearTimeout(timeoutId);
    }
  }, [videoUrl, isReady]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current || !isReady) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // Wrap in try/catch to handle potential play() failures
      try {
        // Force a reload if the video has failed previously
        if (videoRef.current.error) {
          videoRef.current.load();
          setTimeout(() => {
            if (videoRef.current) {
              const playPromise = videoRef.current.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => setIsPlaying(true))
                  .catch(error => {
                    console.error("Error playing video after reload:", error);
                    setIsPlaying(false);
                  });
              }
            }
          }, 500);
          return;
        }

        const playPromise = videoRef.current.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(error => {
              console.error("Error playing video:", error);
              setIsPlaying(false);

              // If AbortError, try reloading the video and playing again
              if (error.name === 'AbortError') {
                console.log("Handling AbortError by reloading video");
                if (videoRef.current) {
                  videoRef.current.load();
                  setTimeout(() => {
                    if (videoRef.current) {
                      videoRef.current.play()
                        .then(() => setIsPlaying(true))
                        .catch(e => console.error("Failed to play after reload:", e));
                    }
                  }, 500);
                }
              }
            });
        }
      } catch (error) {
        console.error("Error playing video:", error);
        setIsPlaying(false);
      }
    }
  }, [isPlaying, isReady]);

  const handleRestart = useCallback(() => {
    if (!videoRef.current || !isReady) return;

    // Pause first to avoid race conditions
    videoRef.current.pause();
    videoRef.current.currentTime = 0;

    // Short timeout to allow the browser to process the seek operation
    setTimeout(() => {
      if (!videoRef.current) return;

      try {
        const playPromise = videoRef.current.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(error => {
              console.error("Error playing video after restart:", error);
              setIsPlaying(false);

              // If AbortError, try reloading the video and playing again
              if (error.name === 'AbortError') {
                console.log("Handling AbortError by reloading video");
                if (videoRef.current) {
                  videoRef.current.load();
                  setTimeout(() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      videoRef.current.play()
                        .then(() => setIsPlaying(true))
                        .catch(e => console.error("Failed to play after reload:", e));
                    }
                  }, 500);
                }
              }
            });
        }

        setIsPlaying(true);
      } catch (error) {
        console.error("Error restarting video:", error);
        setIsPlaying(false);
      }
    }, 50);
  }, [isReady]);

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const handleCanPlay = useCallback(() => {
    console.log("Video can play now");
    setIsReady(true);
  }, []);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoElement = e.target as HTMLVideoElement;
    console.error("Video error:", videoElement.error);

    // Don't set isReady to false if it was previously true - we'll try to recover
    if (!isReady) {
      setIsReady(false);
    }
    setIsPlaying(false);

    // Try to recover by switching to a different source format if available
    if (videoElement.error && videoElement.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      console.log("Media source not supported, trying to recover...");
      // Force ready state after a delay to allow at least UI interaction
      setTimeout(() => setIsReady(true), 2000);
    }
  }, [isReady]);

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Saved Lesson</h2>
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="aspect-video w-full relative group">
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="flex flex-col items-center text-gray-500">
                <Loader2 className="w-10 h-10 mb-2 animate-spin text-indigo-600" />
                <div>Loading video...</div>
              </div>
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
            crossOrigin="anonymous"
          >
            Your browser does not support the video tag.
          </video>

          {/* Video Controls - Always visible for better UX */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent transition-opacity">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handlePlayPause}
                className={`p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors ${!isReady ? 'opacity-50' : ''}`}
                title={isPlaying ? "Pause" : "Play"}
                disabled={!isReady}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                onClick={handleRestart}
                className={`p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors ${!isReady ? 'opacity-50' : ''}`}
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