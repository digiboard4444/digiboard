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

const StudentWhiteboard: React.FC = () => {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const [isTeacherLive, setIsTeacherLive] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const lastUpdateRef = useRef<string>('[]');
  const sessionStartTimeRef = useRef<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Custom canvas component to render the drawing
  const CustomCanvasRenderer = useCallback(() => {
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

    // Function to render the paths data onto the canvas
    const renderPaths = useCallback((pathsData: any[]) => {
      const canvas = canvasElementRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Render each path
      pathsData.forEach(path => {
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
          if (path.points && Array.isArray(path.points)) {
            path.points.forEach((point: {x: number, y: number}, index: number) => {
              // Draw dotted circle at each point
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
          }
        } else {
          // Render regular path
          if (path.points && Array.isArray(path.points) && path.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(path.points[0].x, path.points[0].y);

            for (let i = 1; i < path.points.length; i++) {
              if (path.points[i] && typeof path.points[i].x === 'number' && typeof path.points[i].y === 'number') {
                ctx.lineTo(path.points[i].x, path.points[i].y);
              }
            }

            ctx.stroke();
          } else if (path.points && Array.isArray(path.points) && path.points.length === 1) {
            // Draw a single point as a circle
            const point = path.points[0];
            if (point && typeof point.x === 'number' && typeof point.y === 'number') {
              ctx.beginPath();
              ctx.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });
    }, []);

    // Update the canvas when new data is received
    useEffect(() => {
      const handleUpdate = () => {
        if (lastUpdateRef.current && lastUpdateRef.current !== '[]') {
          try {
            const paths = JSON.parse(lastUpdateRef.current);
            if (Array.isArray(paths)) {
              renderPaths(paths);
            }
          } catch (error) {
            console.error('Error parsing or rendering paths:', error);
          }
        } else {
          // Clear canvas if no data
          const canvas = canvasElementRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
        }
      };

      handleUpdate();

      // Set up a listener for whiteboard updates
      const socket = initializeSocket();
      socket.on('whiteboardUpdate', () => {
        handleUpdate();
      });

      return () => {
        socket.off('whiteboardUpdate', handleUpdate);
      };
    }, [renderPaths, canvasSize.width, canvasSize.height]);

    return (
      <canvas
        ref={canvasElementRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          touchAction: 'none',
          pointerEvents: 'none',
          background: 'white'
        }}
      />
    );
  }, [canvasSize.width, canvasSize.height]);

  const handleWhiteboardUpdate = useCallback(async (data: WhiteboardUpdate) => {
    if (!data.whiteboardData) return;

    try {
      lastUpdateRef.current = data.whiteboardData;

      // No need to directly update ReactSketchCanvas since we're using our custom renderer
      // This data will be used by CustomCanvasRenderer
    } catch (error) {
      console.error('Error updating whiteboard:', error);
    }
  }, []);

  const saveSession = useCallback(async () => {
    if (!currentTeacherId || !lastUpdateRef.current || isSaving) {
      console.log('No session data to save or already saving');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Creating video from strokes...');
      const paths = JSON.parse(lastUpdateRef.current);
      const recorder = new StrokeRecorder(canvasSize.width, canvasSize.height);
      const videoBlob = await recorder.recordStrokes(paths);

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
      // We'll clear the canvas through the CustomCanvasRenderer
      lastUpdateRef.current = '[]';
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
  }, [handleWhiteboardUpdate, saveSession, currentTeacherId]);

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
          <CustomCanvasRenderer />
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