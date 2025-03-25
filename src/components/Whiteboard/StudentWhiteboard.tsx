import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { io, Socket } from 'socket.io-client';
import { WhiteboardUpdate, TeacherStatus } from '../../types/socket';
import { StrokeRecorder } from '../../lib/strokeRecorder';
import { uploadSessionRecording } from '../../lib/cloudinary';
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

// Default canvas dimensions (same as TeacherWhiteboard)
const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;

// Custom triangle renderer
const drawTriangle = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, opacity: number) => {
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;

  const halfSize = size / 2;

  ctx.beginPath();
  ctx.moveTo(x, y - halfSize); // top point
  ctx.lineTo(x - halfSize, y + halfSize); // bottom left
  ctx.lineTo(x + halfSize, y + halfSize); // bottom right
  ctx.closePath();
  ctx.fill();
};

const StudentWhiteboard: React.FC = () => {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const customCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isTeacherLive, setIsTeacherLive] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT });
  const [containerSize, setContainerSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT });
  const lastUpdateRef = useRef<string>('{}');
  const sessionStartTimeRef = useRef<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentBrushType, setCurrentBrushType] = useState<string>('round');

  // Flag to prevent saving when just switching brush types
  const lastActivityRef = useRef<number>(Date.now());
  const isSavingSessionRef = useRef<boolean>(false);

  // Create custom canvas for triangle brush
  useEffect(() => {
    if (isTeacherLive && containerRef.current && !customCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '10';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      customCanvasRef.current = canvas;
      containerRef.current.appendChild(canvas);
    }

    return () => {
      if (customCanvasRef.current && containerRef.current) {
        containerRef.current.removeChild(customCanvasRef.current);
        customCanvasRef.current = null;
      }
    };
  }, [isTeacherLive, canvasSize]);

  // Modified to handle different brush types including custom triangle
  const handleWhiteboardUpdate = useCallback(async (data: WhiteboardUpdate) => {
    if (!canvasRef.current) return;

    // Update the last activity timestamp
    lastActivityRef.current = Date.now();

    try {
      lastUpdateRef.current = data.whiteboardData;

      // Parse the data
      let parsedData;
      try {
        parsedData = JSON.parse(data.whiteboardData);
      } catch (e) {
        console.error('Error parsing whiteboard data:', e);
        return;
      }

      // Handle the new format with brushType and strokes
      const brushType = parsedData.brushType || 'round';
      const strokes = parsedData.strokes || parsedData; // backwards compatibility

      setCurrentBrushType(brushType);

      // For triangle brush, use the custom canvas
      if (brushType === 'triangle') {
        if (customCanvasRef.current) {
          const ctx = customCanvasRef.current.getContext('2d');
          if (ctx) {
            // Clear previous drawings
            ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

            // Draw all triangles
            if (Array.isArray(strokes)) {
              strokes.forEach((stroke: any) => {
                if (stroke.type === 'triangle') {
                  // Calculate scaling for responsive display
                  const scaleX = containerSize.width / canvasSize.width;
                  const scaleY = containerSize.height / canvasSize.height;

                  // Draw scaled triangle
                  drawTriangle(
                    ctx,
                    stroke.x * scaleX,
                    stroke.y * scaleY,
                    stroke.size * Math.min(scaleX, scaleY),
                    stroke.color,
                    stroke.opacity || 1.0
                  );
                }
              });
            }
          }
        }

        // Clear the standard canvas
        await canvasRef.current.clearCanvas();
      } else {
        // For standard brushes, use the React Sketch Canvas
        await canvasRef.current.clearCanvas();

        // Clear any triangles from custom canvas
        if (customCanvasRef.current) {
          const ctx = customCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
          }
        }

        // Load paths from standard brushes
        if (strokes && strokes.length > 0) {
          await canvasRef.current.loadPaths(strokes);
        }
      }
    } catch (error) {
      console.error('Error updating whiteboard:', error);
    }
  }, [canvasSize, containerSize]);

  const saveSession = useCallback(async () => {
    // Prevent multiple simultaneous save attempts
    if (isSavingSessionRef.current) {
      return;
    }

    // Don't save if we don't have enough data
    if (!currentTeacherId || !lastUpdateRef.current || isSaving) {
      console.log('No session data to save or already saving');
      return;
    }

    isSavingSessionRef.current = true;
    setIsSaving(true);

    try {
      console.log('Creating video from strokes...');
      let parsedData;
      try {
        parsedData = JSON.parse(lastUpdateRef.current);
      } catch (e) {
        console.error('Error parsing data for recording:', e);
        parsedData = { strokes: [] };
      }

      const strokes = parsedData.strokes || parsedData;
      const recorder = new StrokeRecorder(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
      const videoBlob = await recorder.recordStrokes(strokes);

      console.log('Uploading video to Cloudinary...');
      const videoUrl = await uploadSessionRecording(videoBlob);

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
      isSavingSessionRef.current = false;
    }
  }, [currentTeacherId, isSaving]);

  // Modified to maintain aspect ratio and match teacher's canvas
  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById('student-whiteboard-container');
      if (container) {
        const containerWidth = container.clientWidth;

        // Keep the original aspect ratio (4:3)
        const aspectRatio = DEFAULT_CANVAS_HEIGHT / DEFAULT_CANVAS_WIDTH;
        const containerHeight = containerWidth * aspectRatio;

        setContainerSize({
          width: containerWidth,
          height: containerHeight
        });

        // Update custom canvas size if it exists
        if (customCanvasRef.current) {
          customCanvasRef.current.style.width = '100%';
          customCanvasRef.current.style.height = '100%';
        }

        // Keep the logical canvas size the same as teacher's
        setCanvasSize({
          width: DEFAULT_CANVAS_WIDTH,
          height: DEFAULT_CANVAS_HEIGHT
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const socket = initializeSocket();

    const handleTeacherOnline = (data: TeacherStatus) => {
      setConnectionError(null);
      setIsTeacherLive(true);
      setCurrentTeacherId(data.teacherId);
      socket.emit('joinTeacherRoom', data.teacherId);
      sessionStartTimeRef.current = new Date();
      lastActivityRef.current = Date.now();
    };

    const handleTeacherOffline = async () => {
      // Only save if the teacher has been truly offline
      // and not just switching brush types (which might trigger quick disconnect/reconnect)
      // Wait 1 second to see if teacher reconnects quickly (brush change)

      const actuallyOffline = await new Promise(resolve => {
        setTimeout(() => {
          // If we've received any activity in the last 2 seconds, teacher is probably still connected
          const timeSinceLastActivity = Date.now() - lastActivityRef.current;
          resolve(timeSinceLastActivity > 2000);
        }, 1000);
      });

      if (actuallyOffline) {
        console.log('Teacher is offline, saving session...');
        await saveSession();
        setIsTeacherLive(false);
        setCurrentTeacherId(null);
        sessionStartTimeRef.current = null;

        if (canvasRef.current) {
          canvasRef.current.clearCanvas();
        }

        // Clear custom canvas
        if (customCanvasRef.current) {
          const ctx = customCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
          }
        }
      } else {
        console.log('Teacher appears to be changing brush types or temporarily disconnected, not saving session');
      }
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
  }, [handleWhiteboardUpdate, saveSession, currentTeacherId, canvasSize]);

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
        <div
          id="student-whiteboard-container"
          className="border rounded-lg overflow-hidden bg-white"
          style={{ width: '100%', height: `${containerSize.height}px` }}
        >
          <div
            ref={containerRef}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative'
            }}
          >
            <ReactSketchCanvas
              ref={canvasRef}
              strokeWidth={4}
              strokeColor="black"
              width="100%"
              height="100%"
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: currentBrushType === 'triangle' ? 'none' : 'block'
              }}
              canvasColor="white"
              exportWithBackgroundImage={false}
              withTimestamp={false}
              allowOnlyPointerType="all"
              className="touch-none"
              preserveAspectRatio="xMidYMid meet"
            />
          </div>
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

export default StudentWhiteboard;