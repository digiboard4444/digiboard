import React, { useRef, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WhiteboardUpdate, TeacherStatus } from '../../types/socket';
import { Loader2, AlertCircle } from 'lucide-react';
import { uploadSessionRecording as cloudinaryUpload } from '../../utils/cloudinary';

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

// Custom StrokeRecorder that works with our modified stroke format
class CustomStrokeRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private frameRate: number = 30;
  private startTime: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    this.ctx = ctx;
  }

  private drawPath(path: any, timestamp: number): void {
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

  private createFrame(paths: any[]): void {
    // Clear canvas for this frame
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw each path for this frame
    if (Array.isArray(paths)) {
      paths.forEach(path => {
        try {
          this.drawPath(path, 0);
        } catch (error) {
          console.error('Error drawing path:', error);
        }
      });
    }
  }

  public async recordStrokes(paths: any[]): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        // Draw all paths to the canvas first
        this.createFrame(paths);

        // Set up canvas stream
        const stream = this.canvas.captureStream(this.frameRate);

        // Try different mimeTypes based on browser support
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = '';  // Use browser default
            }
          }
        }

        // Use better MediaRecorder options
        const options = mimeType ? {
          mimeType,
          videoBitsPerSecond: 2500000 // 2.5 Mbps
        } : {};

        console.log('Using MediaRecorder with mimeType:', mimeType || 'browser default');

        // Set up media recorder
        this.mediaRecorder = new MediaRecorder(stream, options);
        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          try {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            console.log(`Recording complete: ${blob.size} bytes`);
            resolve(blob);
          } catch (error) {
            console.error('Error creating blob:', error);
            reject(error);
          }
        };

        // Start recording
        this.mediaRecorder.start();
        this.startTime = Date.now();

        // Record for a bit longer to ensure we get good quality frames
        setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
          } else {
            reject(new Error('MediaRecorder is not active'));
          }
        }, 3000); // 3 seconds to ensure we have a valid video
      } catch (error) {
        console.error('Error setting up recording:', error);
        reject(error);
      }
    });
  }
}

// Actual implementation of uploadSessionRecording that uses Cloudinary
const uploadSessionRecording = async (blob: Blob): Promise<string> => {
  try {
    console.log('Starting actual Cloudinary upload...');
    console.log(`Blob size: ${blob.size} bytes, type: ${blob.type}`);

    // Use the real Cloudinary upload function
    const videoUrl = await cloudinaryUpload(blob);
    console.log('Upload successful, URL:', videoUrl);
    return videoUrl;
  } catch (error) {
    console.error('Error in uploadSessionRecording:', error);
    throw error; // Re-throw to be handled by the caller
  }
};

const StudentWhiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isTeacherLive, setIsTeacherLive] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const lastUpdateRef = useRef<string>('[]');
  const sessionStartTimeRef = useRef<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleWhiteboardUpdate = useCallback(async (data: WhiteboardUpdate) => {
    if (!data.whiteboardData) return;

    try {
      lastUpdateRef.current = data.whiteboardData;
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
    if (!currentTeacherId || !lastUpdateRef.current || isSaving || lastUpdateRef.current === '[]') {
      console.log('No session data to save or already saving');
      return;
    }

    setSaveError(null);
    setIsSaving(true);
    try {
      console.log('Creating video from strokes...');
      let paths;
      try {
        paths = JSON.parse(lastUpdateRef.current);
        if (!Array.isArray(paths)) {
          throw new Error('Invalid paths data');
        }
      } catch (error) {
        console.error('Error parsing paths data:', error);
        throw new Error('Invalid paths data');
      }

      const recorder = new CustomStrokeRecorder(canvasSize.width, canvasSize.height);
      const videoBlob = await recorder.recordStrokes(paths);

      if (!videoBlob || videoBlob.size === 0) {
        throw new Error('Failed to create video: Empty blob');
      }

      console.log(`Video blob created: ${videoBlob.size} bytes, type: ${videoBlob.type}`);

      console.log('Uploading video to Cloudinary...');
      const videoUrl = await uploadSessionRecording(videoBlob);

      if (!videoUrl) {
        throw new Error('Failed to get video URL after upload');
      }

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
        const errorData = await response.json();
        throw new Error(`Failed to save session: ${errorData.message || 'Unknown error'}`);
      }

      console.log('Session saved successfully');
    } catch (error) {
      console.error('Error saving session:', error);
      setSaveError(error instanceof Error ? error.message : 'Unknown error saving session');
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

      {/* Error Modal */}
      {saveError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <div className="flex flex-col items-center">
              <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error Saving Session</h3>
              <p className="text-red-600 text-center mb-4">
                {saveError}
              </p>
              <button
                onClick={() => setSaveError(null)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StudentWhiteboard;