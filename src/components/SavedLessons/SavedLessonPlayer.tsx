import React, { useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface SavedLessonPlayerProps {
  videoUrl: string;
}

const SavedLessonPlayer: React.FC<SavedLessonPlayerProps> = ({ videoUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

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
            <div className="flex items-center justify-center gap-4">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedLessonPlayer;