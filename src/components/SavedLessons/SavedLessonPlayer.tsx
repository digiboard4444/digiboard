import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, AlertCircle } from 'lucide-react';

interface SavedLessonPlayerProps {
  videoUrl: string;
}

const SavedLessonPlayer: React.FC<SavedLessonPlayerProps> = ({ videoUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Reset state when videoUrl changes
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setVideoMetadata(null);
  }, [videoUrl]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // Promise-based play to handle autoplay restrictions
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error("Error playing video:", error);
            setError("Could not play video. Check your browser's autoplay settings.");
          });
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleRestart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Error playing video:", error);
        });
      }
      setIsPlaying(true);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
    if (videoRef.current) {
      setVideoMetadata({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
        duration: videoRef.current.duration
      });

      console.log("Video is ready to play:", {
        url: videoUrl,
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
        duration: videoRef.current.duration
      });
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error("Video error:", e);
    setError("Error loading video. The file may be corrupted or inaccessible.");
    setIsLoading(false);
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Saved Lesson</h2>
        {videoMetadata && (
          <p className="text-sm text-gray-600 mt-1">
            Duration: {videoMetadata.duration.toFixed(1)}s • Resolution: {videoMetadata.width}×{videoMetadata.height}
          </p>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="aspect-video w-full relative group">
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="animate-pulse flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-gray-600">Loading video...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-50 p-6">
              <div className="flex flex-col items-center text-red-600">
                <AlertCircle className="w-12 h-12 mb-3" />
                <p className="text-center">{error}</p>
                <p className="text-center text-sm mt-2">
                  URL: {videoUrl ? videoUrl.substring(0, 50) + '...' : 'No URL provided'}
                </p>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-gray-50"
            src={videoUrl}
            playsInline
            onEnded={handleVideoEnd}
            onCanPlay={handleCanPlay}
            onError={handleError}
            poster="/placeholder-video.png" // Optional: add a placeholder image
          >
            Your browser does not support the video tag.
          </video>

          {/* Video Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handlePlayPause}
                className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                title={isPlaying ? "Pause" : "Play"}
                disabled={isLoading || !!error}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                onClick={handleRestart}
                className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                title="Restart"
                disabled={isLoading || !!error}
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