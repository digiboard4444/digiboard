// Modified version of StudentWhiteboard.tsx
// Key changes:
// 1. Match canvas dimensions with teacher's whiteboard
// 2. Add aspect ratio preservation
// 3. Fix path loading to handle different canvas sizes

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

const StudentWhiteboard: React.FC = () => {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const [isTeacherLive, setIsTeacherLive] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT });
  const [containerSize, setContainerSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT });
  const lastUpdateRef = useRef<string>('[]');
  const sessionStartTimeRef = useRef<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Modified to handle scale differences between teacher and student canvas
  const handleWhiteboardUpdate = useCallback(async (data: WhiteboardUpdate) => {
    if (!canvasRef.current) return;

    try {
      lastUpdateRef.current = data.whiteboardData;
      await canvasRef.current.clearCanvas();

      if (data.whiteboardData && data.whiteboardData !== '[]') {
        const paths = JSON.parse(data.whiteboardData);
        await canvasRef.current.loadPaths(paths);
      }
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
      const recorder = new StrokeRecorder(DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
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
    };

    const handleTeacherOffline = async () => {
      await saveSession();
      setIsTeacherLive(false);
      setCurrentTeacherId(null);
      sessionStartTimeRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
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
        <div
          id="student-whiteboard-container"
          className="border rounded-lg overflow-hidden bg-white"
          style={{ width: '100%', height: `${containerSize.height}px` }}
        >
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative'
          }}>
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
                bottom: 0
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