import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { io, Socket } from 'socket.io-client';
import { WhiteboardUpdate, TeacherStatus, SessionEndedData, AudioToggleData } from '../../types/socket';
import { StrokeRecorder } from '../../lib/strokeRecorder';
import { AudioRecorder } from '../../lib/audioRecorder';
import { uploadSessionRecording } from '../../lib/cloudinary';
import { Loader2, AlertCircle, Mic } from 'lucide-react';

let socket: Socket | null = null;

const initializeSocket = () => {
  if (!socket) {
    console.log('Initializing socket connection...');
    socket = io(import.meta.env.VITE_API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10, // Increased from 5
      reconnectionDelay: 1000,
      timeout: 60000,
      withCredentials: true
    });

    // Debug socket connection events
    socket.on('connect', () => console.log('Socket connected'));
    socket.on('disconnect', (reason) => console.log('Socket disconnected:', reason));
    socket.on('reconnect', (attemptNumber) => console.log('Socket reconnected after', attemptNumber, 'attempts'));
    socket.on('reconnect_attempt', (attemptNumber) => console.log('Socket reconnection attempt:', attemptNumber));
    socket.on('reconnect_error', (error) => console.log('Socket reconnection error:', error));
    socket.on('reconnect_failed', () => console.log('Socket reconnection failed'));
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
  const [hasSessionAudio, setHasSessionAudio] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // New refs for handling event ordering and preventing duplicate processing
  const lastStatusTimestamp = useRef<number>(Date.now());
  const isProcessingOffline = useRef<boolean>(false);

  const handleWhiteboardUpdate = useCallback(async (data: WhiteboardUpdate) => {
    if (!canvasRef.current) return;

    try {
      console.log('Received whiteboard update');
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
    // Prevent saving if:
    // 1. No teacher ID
    // 2. No whiteboard data
    // 3. Already saving
    // 4. Already saved for this session
    if (!currentTeacherId || !lastUpdateRef.current || isSaving || sessionSaved) {
      console.log('No session data to save, already saving, or already saved');
      return;
    }

    // Also don't save if the whiteboard data is empty
    if (lastUpdateRef.current === '[]') {
      console.log('No whiteboard content to save');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Creating video from strokes...');
      const paths = JSON.parse(lastUpdateRef.current);
      const recorder = new StrokeRecorder(canvasSize.width, canvasSize.height);
      const videoBlob = await recorder.recordStrokes(paths);
      let videoUrl;

      // If audio is available, try to merge it with the video
      if (hasSessionAudio) {
        try {
          // Get audio blob from the server
          const audioResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/audio/${currentTeacherId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });

          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            console.log('Received audio blob, merging with video...');

            // Create an AudioRecorder instance to merge audio and video
            const audioRecorder = new AudioRecorder();
            const mergedBlob = await audioRecorder.mergeAudioAndVideo(audioBlob, videoBlob);

            // Upload the merged video
            videoUrl = await uploadSessionRecording(mergedBlob);
          } else {
            console.warn('Failed to get audio recording, proceeding with video only');
            videoUrl = await uploadSessionRecording(videoBlob);
          }
        } catch (error) {
          console.error('Error processing audio, falling back to video only:', error);
          videoUrl = await uploadSessionRecording(videoBlob);
        }
      } else {
        // No audio, just upload the video
        videoUrl = await uploadSessionRecording(videoBlob);
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
          whiteboardData: lastUpdateRef.current,
          hasAudio: hasSessionAudio
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save session');
      }

      console.log('Session saved successfully');
      setSessionSaved(true);
    } catch (error) {
      console.error('Error saving session:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentTeacherId, canvasSize.width, canvasSize.height, isSaving, hasSessionAudio, sessionSaved]);

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
      console.log('Teacher online event received:', data.teacherId);

      // Store the timestamp of this event
      if (data.timestamp) {
        lastStatusTimestamp.current = data.timestamp;
      } else {
        lastStatusTimestamp.current = Date.now();
      }

      setConnectionError(null);
      setIsTeacherLive(true);
      setCurrentTeacherId(data.teacherId);
      socket.emit('joinTeacherRoom', data.teacherId);
      sessionStartTimeRef.current = new Date();
      // Important: Reset the sessionSaved flag when a new session starts
      setSessionSaved(false);
    };

    const handleSessionEnded = async (data: SessionEndedData) => {
      if (currentTeacherId === data.teacherId) {
        console.log('Session ended event received, hasAudio:', data.hasAudio);
        setHasSessionAudio(data.hasAudio);
        // Don't save here - wait for the teacherOffline event
      }
    };

    const handleTeacherOffline = async (data: TeacherStatus) => {
      console.log('Teacher offline event received:', data.teacherId, 'Current:', currentTeacherId);

      // If we're already processing an offline event, don't start another one
      if (isProcessingOffline.current) {
        console.log('Already processing an offline event, skipping');
        return;
      }

      // Skip if we're not viewing this teacher
      if (currentTeacherId !== data.teacherId) {
        console.log('Not the current teacher, skipping offline handling');
        return;
      }

      // Skip if no whiteboard data or already saved
      if (lastUpdateRef.current === '[]' || sessionSaved || !currentTeacherId) {
        console.log('No data to save, already saved, or no current teacher');

        // Still update the UI state
        setIsTeacherLive(false);
        setCurrentTeacherId(null);
        setIsRecording(false);
        sessionStartTimeRef.current = null;
        if (canvasRef.current) {
          canvasRef.current.clearCanvas();
        }
        return;
      }

      // Proceed with saving
      console.log('Processing offline event and saving session');
      isProcessingOffline.current = true;

      try {
        await saveSession();
      } catch (error) {
        console.error('Error saving session:', error);
      } finally {
        // Update UI state
        setIsTeacherLive(false);
        setCurrentTeacherId(null);
        setIsRecording(false);
        sessionStartTimeRef.current = null;

        if (canvasRef.current) {
          canvasRef.current.clearCanvas();
        }

        // Mark as no longer processing
        isProcessingOffline.current = false;
      }
    };

    const handleAudioToggle = (data: AudioToggleData) => {
      console.log('Audio toggle event received:', data);

      if (currentTeacherId === data.teacherId) {
        setIsRecording(data.enabled);
        console.log('Teacher audio recording status changed to:', data.enabled);
      }
    };

    const handleAudioAvailable = (data: { teacherId: string }) => {
      if (currentTeacherId === data.teacherId) {
        console.log('Audio available for teacher:', data.teacherId);
        setHasSessionAudio(true);
      }
    };

    const handleConnect = () => {
      console.log('Student socket connected');
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
    socket.on('sessionEnded', handleSessionEnded);
    socket.on('audioAvailable', handleAudioAvailable);
    socket.on('audioToggle', handleAudioToggle);
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);

    console.log('Checking teacher status on mount...');
    socket.emit('checkTeacherStatus');

    return () => {
      console.log('Cleaning up socket listeners');
      socket.off('whiteboardUpdate', handleWhiteboardUpdate);
      socket.off('teacherOnline', handleTeacherOnline);
      socket.off('teacherOffline', handleTeacherOffline);
      socket.off('sessionEnded', handleSessionEnded);
      socket.off('audioAvailable', handleAudioAvailable);
      socket.off('audioToggle', handleAudioToggle);
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);

      if (currentTeacherId) {
        console.log('Leaving teacher room:', currentTeacherId);
        socket.emit('leaveTeacherRoom', currentTeacherId);
      }
    };
  }, [handleWhiteboardUpdate, saveSession, currentTeacherId, sessionSaved]);

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

        {isRecording && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-700">
            <Mic size={20} className="animate-pulse" />
            <p>Teacher's microphone is active</p>
          </div>
        )}

        <div id="student-whiteboard-container" className="border rounded-lg overflow-hidden bg-white">
          <ReactSketchCanvas
            ref={canvasRef}
            strokeWidth={4}
            strokeColor="black"
            width={`${canvasSize.width}px`}
            height={`${canvasSize.height}px`}
            style={{ pointerEvents: 'none' }}
            canvasColor="white"
            exportWithBackgroundImage={false}
            withTimestamp={false}
            allowOnlyPointerType="all"
            className="touch-none"
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

export default StudentWhiteboard;