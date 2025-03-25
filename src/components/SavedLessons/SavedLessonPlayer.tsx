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
    let timeoutId: NodeJS.Timeout;

    if (videoRef.current) {
      // Reset state
      videoRef.current.pause();
      setIsPlaying(false);
      setIsReady(false);

      // For videos that might have CORS issues, add a fallback timeout
      // But only once per URL change
      timeoutId = setTimeout(() => {
        console.log("Video loading timed out, setting ready state manually");
        setIsReady(true);
      }, 3000);
    }

    // Clean up timeout when component unmounts or URL changes
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [videoUrl]);

  // Prevent multiple play attempts at once
  const isAttemptingPlayRef = useRef(false);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current || !isReady || isAttemptingPlayRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      isAttemptingPlayRef.current = true;

      // Wrap in try/catch to handle potential play() failures
      try {
        console.log("Attempting to play video");

        // Force a reload if the video has failed previously
        if (videoRef.current.error) {
          console.log("Video has error, reloading before play");
          videoRef.current.load();

          setTimeout(() => {
            if (!videoRef.current) {
              isAttemptingPlayRef.current = false;
              return;
            }

            console.log("Playing after reload");
            const playPromise = videoRef.current.play();

            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  setIsPlaying(true);
                  isAttemptingPlayRef.current = false;
                })
                .catch(error => {
                  console.error("Error playing video after reload:", error);
                  setIsPlaying(false);
                  isAttemptingPlayRef.current = false;
                });
            } else {
              isAttemptingPlayRef.current = false;
            }
          }, 500);
          return;
        }

        // Normal play attempt
        const playPromise = videoRef.current.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Video playback started successfully");
              setIsPlaying(true);
              isAttemptingPlayRef.current = false;
            })
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
                      console.log("Playing after AbortError");
                      videoRef.current.play()
                        .then(() => {
                          setIsPlaying(true);
                          isAttemptingPlayRef.current = false;
                        })
                        .catch(e => {
                          console.error("Failed to play after reload:", e);
                          isAttemptingPlayRef.current = false;
                        });
                    } else {
                      isAttemptingPlayRef.current = false;
                    }
                  }, 500);
                } else {
                  isAttemptingPlayRef.current = false;
                }
              } else {
                isAttemptingPlayRef.current = false;
              }
            });
        } else {
          isAttemptingPlayRef.current = false;
        }
      } catch (error) {
        console.error("Error playing video:", error);
        setIsPlaying(false);
        isAttemptingPlayRef.current = false;
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

  // Use a ref to track if canPlay has fired already
  const canPlayFiredRef = useRef(false);

  const handleCanPlay = useCallback(() => {
    console.log("Video can play now");
    canPlayFiredRef.current = true;
    setIsReady(true);
  }, []);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoElement = e.target as HTMLVideoElement;
    console.error("Video error:", videoElement.error);

    setIsPlaying(false);

    // If canPlay event never fired, set to not ready
    if (!canPlayFiredRef.current) {
      setIsReady(false);
    }

    // Try to recover from media errors
    if (videoElement.error) {
      console.log(`Media error code: ${videoElement.error.code}, trying to recover...`);

      // Force reload for network errors
      if (videoElement.error.code === MediaError.MEDIA_ERR_NETWORK ||
          videoElement.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {

        // Try to reload the video after a short delay
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.load();
            // Force ready state after reload to allow UI interaction
            setTimeout(() => setIsReady(true), 1000);
          }
        }, 500);
      } else {
        // For other errors, just enable the UI
        setTimeout(() => setIsReady(true), 1000);
      }
    }
  }, []);

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
            onLoadedData={handleCanPlay}
            onCanPlay={handleCanPlay}
            onEnded={handleVideoEnd}
            onError={handleError}
            preload="auto"
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