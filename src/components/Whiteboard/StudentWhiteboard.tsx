import React, { useRef, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WhiteboardUpdate, TeacherStatus } from '../../types/socket';
import { Loader2, AlertCircle } from 'lucide-react';

let socket: Socket | null = null;

const initializeSocket = () => {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 60000,
      withCredentials: true
    });
  }
  return socket;
};

// Enhanced CustomStrokeRecorder for better video capture
class CustomStrokeRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private frameRate: number = 30;
  private animationFrameId: number | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get canvas context');
    this.ctx = ctx;

    // Set white background initially
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, width, height);
  }

  private drawPath(path: any): void {
    // Skip if path doesn't have valid points
    if (!path || !path.points || !Array.isArray(path.points) || path.points.length === 0) {
      return;
    }

    const isEraser = path.isEraser || false;
    const brushType = path.brushType || 'round';
    const strokeWidth = path.strokeWidth || 4;
    const strokeColor = isEraser ? '#FFFFFF' : (path.strokeColor || '#000000');

    // Set drawing styles
    this.ctx.lineWidth = strokeWidth;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.fillStyle = strokeColor;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (brushType === 'dotted') {
      // Render dotted path
      path.points.forEach((point: {x: number, y: number}) => {
        // Make sure point has valid coordinates
        if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
          return;
        }

        // Draw dotted circle at point
        const radius = strokeWidth / 2;
        const dotCount = Math.max(8, Math.floor(radius * 2));
        const dotSize = Math.max(1, strokeWidth / 8);

        // Draw dots in a circle pattern
        for (let i = 0; i < dotCount; i++) {
          const angle = (i / dotCount) * Math.PI * 2;
          const dotX = point.x + Math.cos(angle) * radius;
          const dotY = point.y + Math.sin(angle) * radius;

          this.ctx.beginPath();
          this.ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Draw a dot in the center
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
        this.ctx.fill();
      });
    } else {
      // Render regular path
      if (path.points.length > 1) {
        this.ctx.beginPath();

        // Make sure first point has valid coordinates
        if (typeof path.points[0].x === 'number' && typeof path.points[0].y === 'number') {
          this.ctx.moveTo(path.points[0].x, path.points[0].y);

          for (let i = 1; i < path.points.length; i++) {
            // Make sure point has valid coordinates
            if (typeof path.points[i].x === 'number' && typeof path.points[i].y === 'number') {
              this.ctx.lineTo(path.points[i].x, path.points[i].y);
            }
          }

          this.ctx.stroke();
        }
      } else if (path.points.length === 1) {
        // Draw a single point as a circle
        const point = path.points[0];
        if (typeof point.x === 'number' && typeof point.y === 'number') {
          this.ctx.beginPath();
          this.ctx.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
  }

  private renderPaths(paths: any[]): void {
    // Clear canvas with white background
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw each path
    if (Array.isArray(paths)) {
      paths.forEach(path => {
        try {
          this.drawPath(path);
        } catch (error) {
          console.error('Error drawing path:', error);
        }
      });
    }
  }

  // Helper function to create a static image from the paths
  public async createStaticImage(paths: any[]): Promise<Blob> {
    // Render all paths to the canvas
    this.renderPaths(paths);

    // Convert canvas to PNG blob
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create image blob from canvas"));
        }
      }, 'image/png', 0.95); // High quality PNG
    });
  }

  public async recordStrokes(paths: any[]): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Recording ${paths.length} paths on canvas: ${this.width}x${this.height}`);

        // FALLBACK APPROACH: If we have less than 2 paths, just create a static image
        if (paths.length < 2) {
          console.log("Using static image fallback for simple drawing");
          this.createStaticImage(paths).then(resolve).catch(reject);
          return;
        }

        // Pre-render the content to ensure it's visible
        this.renderPaths(paths);

        // Display canvas content for debugging
        console.log("Canvas data URL:", this.canvas.toDataURL().substring(0, 100) + "...");

        // Set up canvas stream with optimal settings
        const stream = this.canvas.captureStream(60); // Higher framerate for quality

        // Check if we actually have video tracks
        if (stream.getVideoTracks().length === 0) {
          console.error("No video tracks in stream! Falling back to static image");
          this.createStaticImage(paths).then(resolve).catch(reject);
          return;
        }

        // Log stream details for debugging
        console.log("Stream has video tracks:", stream.getVideoTracks().length);
        console.log("Video track settings:", stream.getVideoTracks()[0].getSettings());

        // Try different MIME types for better compatibility
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = '';
            }
          }
        }

        console.log("Using MIME type:", mimeType || "browser default");

        // Create MediaRecorder with best available settings
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: 3000000 // Higher bitrate
        });

        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          console.log("Got data chunk of size:", event.data.size);
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          if (this.recordedChunks.length === 0 || this.recordedChunks.every(chunk => chunk.size === 0)) {
            console.error("No data recorded! Falling back to static image");
            this.createStaticImage(paths).then(resolve).catch(reject);
            return;
          }

          const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
          console.log("Created final blob of size:", blob.size);

          // For debugging: create a temporary element to check the video
          const tempVideo = document.createElement('video');
          tempVideo.src = URL.createObjectURL(blob);
          tempVideo.onloadedmetadata = () => {
            console.log("Video metadata:", {
              duration: tempVideo.duration,
              videoWidth: tempVideo.videoWidth,
              videoHeight: tempVideo.videoHeight
            });
            URL.revokeObjectURL(tempVideo.src);
          };

          resolve(blob);
        };

        this.mediaRecorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          console.log("MediaRecorder error - falling back to static image");
          this.createStaticImage(paths).then(resolve).catch(reject);
        };

        // Start recording
        this.mediaRecorder.start();
        console.log("MediaRecorder started with state:", this.mediaRecorder.state);

        // Animate drawing for better recording - this creates a dynamic sequence
        let frameCount = 0;
        const maxFrames = 180; // 3 seconds at 60fps

        const animate = () => {
          if (frameCount <= maxFrames) {
            // Ensure content is visible throughout recording
            if (frameCount % 30 === 0) {
              this.renderPaths(paths); // Re-render every 30 frames
            }

            frameCount++;
            this.animationFrameId = requestAnimationFrame(animate);
          } else {
            // Stop animation and recording
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
              console.log("Stopping MediaRecorder after animation");
              this.mediaRecorder.stop();
            } else {
              reject(new Error('MediaRecorder is not active'));
            }
          }
        };

        // Start animation
        this.animationFrameId = requestAnimationFrame(animate);

        // Safety timeout as backup
        setTimeout(() => {
          if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
          }

          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            console.log("Stopping MediaRecorder via timeout");
            this.mediaRecorder.stop();
          }
        }, 5000); // 5 second timeout
      } catch (error) {
        console.error("Fatal error in recordStrokes:", error);
        // Attempt to create a static image as a last resort
        try {
          console.log("Attempting to create static image after error");
          const blob = await this.createStaticImage(paths);
          resolve(blob);
        } catch (imgError) {
          reject(error); // If even this fails, reject with the original error
        }
      }
    });
  }
}

// Function to upload session recording to backend/cloud storage
const uploadSessionRecording = async (blob: Blob): Promise<string> => {
  try {
    // Check if we're using the real Cloudinary upload or mock
    if (typeof window.cloudinaryUpload === 'function') {
      // Use the real Cloudinary upload function
      return await window.cloudinaryUpload(blob);
    } else {
      // Mock implementation for development/testing
      console.log('Using mock upload service (real Cloudinary upload not available)');
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve('https://example.com/mock-video-url');
        }, 1000);
      });
    }
  } catch (error) {
    console.error('Error in uploadSessionRecording:', error);
    throw new Error('Failed to upload recording');
  }
};

const StudentWhiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isTeacherLive, setIsTeacherLive] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const lastUpdateRef = useRef<string>('[]');
  const pathsRef = useRef<any[]>([]);  // Store actual paths object for better recording
  const sessionStartTimeRef = useRef<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleWhiteboardUpdate = useCallback(async (data: WhiteboardUpdate) => {
    if (!data.whiteboardData) return;

    try {
      lastUpdateRef.current = data.whiteboardData;

      // Parse and store the actual paths object for recording
      try {
        const paths = JSON.parse(data.whiteboardData);
        if (Array.isArray(paths)) {
          pathsRef.current = paths;
        }
      } catch (e) {
        console.error('Error parsing paths data:', e);
      }

      renderCanvas();
    } catch (error) {
      console.error('Error updating whiteboard:', error);
    }
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Parse and render paths
    try {
      const paths = JSON.parse(lastUpdateRef.current);
      if (!Array.isArray(paths)) return;

      // Render each path
      paths.forEach(path => {
        // Skip if path doesn't have valid points
        if (!path || !path.points || !Array.isArray(path.points) || path.points.length === 0) {
          return;
        }

        const isEraser = path.isEraser || false;
        const brushType = path.brushType || 'round';
        const strokeWidth = path.strokeWidth || 4;
        const strokeColor = isEraser ? '#FFFFFF' : (path.strokeColor || '#000000');

        // Set drawing styles
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = strokeColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (brushType === 'dotted') {
          // Render dotted path
          path.points.forEach((point: {x: number, y: number}) => {
            // Make sure point has valid coordinates
            if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
              return;
            }

            // Draw dotted circle at point
            const radius = strokeWidth / 2;
            const dotCount = Math.max(8, Math.floor(radius * 2));
            const dotSize = Math.max(1, strokeWidth / 8);

            // Draw dots in a circle pattern
            for (let i = 0; i < dotCount; i++) {
              const angle = (i / dotCount) * Math.PI * 2;
              const dotX = point.x + Math.cos(angle) * radius;
              const dotY = point.y + Math.sin(angle) * radius;

              ctx.beginPath();
              ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
              ctx.fill();
            }

            // Draw a dot in the center
            ctx.beginPath();
            ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
            ctx.fill();
          });
        } else {
          // Render regular path
          if (path.points.length > 1) {
            ctx.beginPath();

            // Make sure first point has valid coordinates
            if (typeof path.points[0].x === 'number' && typeof path.points[0].y === 'number') {
              ctx.moveTo(path.points[0].x, path.points[0].y);

              for (let i = 1; i < path.points.length; i++) {
                // Make sure point has valid coordinates
                if (typeof path.points[i].x === 'number' && typeof path.points[i].y === 'number') {
                  ctx.lineTo(path.points[i].x, path.points[i].y);
                }
              }

              ctx.stroke();
            }
          } else if (path.points.length === 1) {
            // Draw a single point as a circle
            const point = path.points[0];
            if (typeof point.x === 'number' && typeof point.y === 'number') {
              ctx.beginPath();
              ctx.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });
    } catch (error) {
      console.error('Error rendering canvas:', error);
    }
  }, []);

  const saveSession = useCallback(async () => {
    if (!currentTeacherId || !lastUpdateRef.current || isSaving) {
      console.log('No session data to save or already saving');
      return;
    }

    // Skip saving if there's no drawing data
    if (lastUpdateRef.current === '[]' || pathsRef.current.length === 0) {
      console.log('No drawing data to save');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Creating video from strokes...');
      console.log('Paths data:', pathsRef.current);

      // Take a snapshot of the current canvas as a fallback
      let fallbackImage: Blob | null = null;
      if (canvasRef.current) {
        fallbackImage = await new Promise<Blob | null>((resolve) => {
          canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png', 0.95);
        });
      }

      const recorder = new CustomStrokeRecorder(canvasSize.width, canvasSize.height);
      let mediaBlob: Blob;

      try {
        // Try to create a video recording
        mediaBlob = await recorder.recordStrokes(pathsRef.current);
        console.log('Successfully created video blob:', mediaBlob.size);
      } catch (error) {
        console.error('Error creating video, using fallback image:', error);
        if (fallbackImage) {
          mediaBlob = fallbackImage;
        } else {
          throw new Error('Failed to create recording and no fallback available');
        }
      }

      console.log('Uploading media to Cloudinary...');
      const videoUrl = await uploadSessionRecording(mediaBlob);

      console.log('Saving session to backend...');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          teacherId: currentTeacherId,
          videoUrl,
          whiteboardData: lastUpdateRef.current
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save session');
      }

      console.log('Session saved successfully');
    } catch (error) {
      console.error('Error saving session:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentTeacherId, canvasSize.width, canvasSize.height, isSaving]);

  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById('student-whiteboard-container');
      if (container) {
        const width = container.clientWidth;
        const height = Math.min(window.innerHeight - 200, width * 0.75);
        setCanvasSize({ width, height });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      // Initial render
      renderCanvas();
    }
  }, [renderCanvas, canvasSize.width, canvasSize.height]);

  useEffect(() => {
    const socket = initializeSocket();

    const handleTeacherOnline = (data: TeacherStatus) => {
      setConnectionError(null);
      setIsTeacherLive(true);
      setCurrentTeacherId(data.teacherId);
      socket.emit('joinTeacherRoom', data.teacherId);
      sessionStartTimeRef.current = new Date();
    };

    const handleTeacherOffline = async () => {
      await saveSession();
      setIsTeacherLive(false);
      setCurrentTeacherId(null);
      sessionStartTimeRef.current = null;
      // Clear canvas
      lastUpdateRef.current = '[]';
      pathsRef.current = [];
      renderCanvas();
    };

    const handleConnect = () => {
      setConnectionError(null);
      socket.emit('checkTeacherStatus');
    };

    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
      setConnectionError('Unable to connect to the server. Please check your internet connection.');
    };

    const handleDisconnect = (reason: string) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        socket.connect(); // Automatically try to reconnect
      }
      setConnectionError('Connection lost. Attempting to reconnect...');
    };

    socket.on('whiteboardUpdate', handleWhiteboardUpdate);
    socket.on('teacherOnline', handleTeacherOnline);
    socket.on('teacherOffline', handleTeacherOffline);
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);

    socket.emit('checkTeacherStatus');

    return () => {
      socket.off('whiteboardUpdate', handleWhiteboardUpdate);
      socket.off('teacherOnline', handleTeacherOnline);
      socket.off('teacherOffline', handleTeacherOffline);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);

      if (currentTeacherId) {
        socket.emit('leaveTeacherRoom', currentTeacherId);
      }
    };
  }, [handleWhiteboardUpdate, saveSession, currentTeacherId, renderCanvas]);

  if (connectionError) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Live Whiteboard</h2>
        </div>
        <div className="border rounded-lg overflow-hidden bg-white p-8">
          <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px] md:min-h-[500px]">
            <div className="text-center text-red-600">
              <AlertCircle className="w-12 h-12 mx-auto mb-4" />
              <p className="text-xl font-semibold mb-2">Connection Error</p>
              <p>{connectionError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isTeacherLive) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Live Whiteboard</h2>
        </div>
        <div className="border rounded-lg overflow-hidden bg-white p-8 flex items-center justify-center min-h-[300px] sm:min-h-[400px] md:min-h-[500px]">
          <div className="text-center text-gray-500">
            <p className="text-xl font-semibold mb-2">Waiting for teacher...</p>
            <p>The session will begin when the teacher starts the whiteboard</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Live Whiteboard Session</h2>
          <p className="text-sm text-gray-600 mt-1">Session in progress</p>
        </div>
        <div id="student-whiteboard-container" className="border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              touchAction: 'none',
              pointerEvents: 'none',
              background: 'white'
            }}
          />
        </div>
      </div>

      {/* Saving Modal */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
              <h3 className="text-lg font-semibold mb-2">Saving Session</h3>
              <p className="text-gray-600 text-center">
                Please wait while we save your session recording...
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Add a typing declaration for the cloudinary upload function
declare global {
  interface Window {
    cloudinaryUpload?: (blob: Blob) => Promise<string>;
    fs: any;
  }
}

export default StudentWhiteboard;