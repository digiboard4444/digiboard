import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface SavedLessonPlayerProps {
  videoUrl: string;
  hasAudio?: boolean;
}

const SavedLessonPlayer: React.FC<SavedLessonPlayerProps> = ({ videoUrl, hasAudio = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8); // Default volume 80%
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Audio controls
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  // Initialize video settings
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [videoRef, volume, isMuted]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleRestart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Saved Lesson</h2>
        {hasAudio && (
          <p className="text-sm text-gray-600 mt-1">
            This lesson includes teacher audio
          </p>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="aspect-video w-full relative group">
          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-gray-50"
            src={videoUrl}
            playsInline
            onEnded={handleVideoEnd}
          >
            Your browser does not support the video tag.
          </video>

          {/* Video Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePlayPause}
                  className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                  onClick={handleRestart}
                  className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                  title="Restart"
                >
                  <RotateCcw size={20} />
                </button>
              </div>

              {/* Only show volume controls if the lesson has audio */}
              {hasAudio && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-900 transition-colors"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-24 accent-blue-500"
                    disabled={isMuted}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedLessonPlayer;