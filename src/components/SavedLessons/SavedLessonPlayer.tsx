import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Loader2 } from 'lucide-react';

interface SavedLessonPlayerProps {
  videoUrl: string;
}

const SavedLessonPlayer: React.FC<SavedLessonPlayerProps> = ({ videoUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playAttemptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when video URL changes
  useEffect(() => {
    console.log("Video URL changed, resetting player state");
    setIsPlaying(false);
    setIsReady(false);
    setIsLoading(true);
    setHasError(false);

    // Clear any pending timeouts
    if (playAttemptTimeoutRef.current) {
      clearTimeout(playAttemptTimeoutRef.current);
      playAttemptTimeoutRef.current = null;
    }

    // Automatically set ready state after a timeout as fallback
    const readyTimeout = setTimeout(() => {
      console.log("Video loading timed out, setting ready state manually");
      setIsReady(true);
      setIsLoading(false);
    }, 5000);

    return () => {
      clearTimeout(readyTimeout);
      if (playAttemptTimeoutRef.current) {
        clearTimeout(playAttemptTimeoutRef.current);
      }
    };
  }, [videoUrl]);

  // Handle video events
  const handleCanPlay = () => {
    console.log("Video can play event fired");
    setIsReady(true);
    setIsLoading(false);
  };

  const handleLoadedData = () => {
    console.log("Video loaded data event fired");
    setIsReady(true);
    setIsLoading(false);
  };

  const handleError = () => {
    console.error("Video error event fired");
    if (videoRef.current?.error) {
      console.error("Video error code:", videoRef.current.error.code);
    }
    setHasError(true);
    setIsLoading(false);

    // Still set ready so user can try manual play
    setIsReady(true);
  };

  const handleVideoEnd = () => {
    console.log("Video ended");
    setIsPlaying(false);
  };

  // Play/pause handling
  const handlePlayPause = () => {
    if (!videoRef.current || !isReady) return;

    if (isPlaying) {
      console.log("Pausing video");
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      console.log("Attempting to play video");

      // If there's an error, try reloading first
      if (hasError || videoRef.current.error) {
        console.log("Video had error, reloading before play");
        videoRef.current.load();

        // Add a delay before trying to play
        if (playAttemptTimeoutRef.current) {
          clearTimeout(playAttemptTimeoutRef.current);
        }

        playAttemptTimeoutRef.current = setTimeout(() => {
          if (!videoRef.current) return;

          console.log("Playing after reload");
          try {
            const playPromise = videoRef.current.play();
            if (playPromise) {
              playPromise
                .then(() => {
                  console.log("Play successful after reload");
                  setIsPlaying(true);
                  setHasError(false);
                })
                .catch((err) => {
                  console.error("Play failed after reload:", err);
                  // One more attempt with muted (autoplay restrictions workaround)
                  if (err.name === "NotAllowedError") {
                    console.log("Trying muted playback");
                    videoRef.current!.muted = true;
                    videoRef.current!.play()
                      .then(() => {
                        console.log("Muted play successful");
                        setIsPlaying(true);
                        // Immediately unmute
                        setTimeout(() => {
                          if (videoRef.current) videoRef.current.muted = false;
                        }, 100);
                      })
                      .catch(e => console.error("Even muted play failed:", e));
                  }
                });
            }
          } catch (e) {
            console.error("Error during play attempt:", e);
          }
        }, 1000);

        return;
      }

      // Normal play attempt
      try {
        const playPromise = videoRef.current.play();
        if (playPromise) {
          playPromise
            .then(() => {
              console.log("Play successful");
              setIsPlaying(true);
            })
            .catch((err) => {
              console.error("Play failed:", err);

              // Handle AbortError specifically
              if (err.name === "AbortError") {
                console.log("Handling AbortError");
                videoRef.current!.load();

                if (playAttemptTimeoutRef.current) {
                  clearTimeout(playAttemptTimeoutRef.current);
                }

                playAttemptTimeoutRef.current = setTimeout(() => {
                  console.log("Retrying play after AbortError");
                  if (videoRef.current) {
                    videoRef.current.play()
                      .then(() => {
                        console.log("Play successful after AbortError handling");
                        setIsPlaying(true);
                      })
                      .catch(e => console.error("Play failed after AbortError handling:", e));
                  }
                }, 1000);
              }

              // Try muted playback for autoplay restrictions
              if (err.name === "NotAllowedError") {
                console.log("Trying muted playback");
                videoRef.current!.muted = true;
                videoRef.current!.play()
                  .then(() => {
                    console.log("Muted play successful");
                    setIsPlaying(true);
                    // Immediately unmute
                    setTimeout(() => {
                      if (videoRef.current) videoRef.current.muted = false;
                    }, 100);
                  })
                  .catch(e => console.error("Even muted play failed:", e));
              }
            });
        }
      } catch (e) {
        console.error("Error during play attempt:", e);
      }
    }
  };

  // Handle restart
  const handleRestart = () => {
    if (!videoRef.current || !isReady) return;

    console.log("Restarting video");
    videoRef.current.pause();
    videoRef.current.currentTime = 0;

    setTimeout(() => {
      if (!videoRef.current) return;

      try {
        const playPromise = videoRef.current.play();
        if (playPromise) {
          playPromise
            .then(() => {
              console.log("Restart play successful");
              setIsPlaying(true);
            })
            .catch(err => {
              console.error("Restart play failed:", err);
            });
        }
      } catch (e) {
        console.error("Error during restart play attempt:", e);
      }
    }, 100);
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Saved Lesson</h2>
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="aspect-video w-full relative group">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="flex flex-col items-center text-gray-500">
                <Loader2 className="w-10 h-10 mb-2 animate-spin text-indigo-600" />
                <div>Loading video...</div>
              </div>
            </div>
          )}

          {hasError && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-70">
              <div className="text-center text-red-600 p-4">
                <p className="font-semibold mb-2">Error loading video</p>
                <p className="text-sm">Click play to try again</p>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-gray-50"
            src={videoUrl}
            playsInline
            preload="auto"
            onCanPlay={handleCanPlay}
            onLoadedData={handleLoadedData}
            onError={handleError}
            onEnded={handleVideoEnd}
            crossOrigin="anonymous"
          >
            Your browser does not support the video tag.
          </video>

          {/* Video Controls - always visible */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handlePlayPause}
                className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                title={isPlaying ? "Pause" : "Play"}
                disabled={isLoading && !isReady}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                onClick={handleRestart}
                className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                title="Restart"
                disabled={isLoading && !isReady}
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