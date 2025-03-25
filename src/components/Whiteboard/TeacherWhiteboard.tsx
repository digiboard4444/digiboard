import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Play, X, Eraser, AlertCircle, RotateCcw, RotateCw, Paintbrush, Trash2, Circle, ChevronDown, Square, Triangle } from 'lucide-react';
import { io } from 'socket.io-client';
import type { TypedSocket } from '../../types/socket';
import { AudioRecorder } from '../../lib/audioRecorder';

// Define brush utility interfaces and functions inline
interface StrokePoint {
  x: number;
  y: number;
}

interface BrushOptions {
  color: string;
  size: number;
  opacity: number;
}

// Draw a circular brush stroke
const drawCircleBrush = (
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  options: BrushOptions
) => {
  ctx.save();
  ctx.fillStyle = options.color;
  ctx.globalAlpha = options.opacity;
  ctx.beginPath();
  ctx.arc(point.x, point.y, options.size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

// Draw a square brush stroke
const drawSquareBrush = (
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  options: BrushOptions
) => {
  ctx.save();
  ctx.fillStyle = options.color;
  ctx.globalAlpha = options.opacity;
  const halfSize = options.size / 2;
  ctx.fillRect(point.x - halfSize, point.y - halfSize, options.size, options.size);
  ctx.restore();
};

// Draw a triangle brush stroke
const drawTriangleBrush = (
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  options: BrushOptions
) => {
  ctx.save();
  ctx.fillStyle = options.color;
  ctx.globalAlpha = options.opacity;
  const size = options.size;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - size / 2); // Top point
  ctx.lineTo(point.x - size / 2, point.y + size / 2); // Bottom left
  ctx.lineTo(point.x + size / 2, point.y + size / 2); // Bottom right
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

let socket: TypedSocket | null = null;

const initializeSocket = () => {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 60000,
      withCredentials: true
    }) as TypedSocket;
  }
  return socket;
};

// Stroke styles configuration
const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Green', value: '#008000' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Purple', value: '#800080' },
  { name: 'Orange', value: '#FFA500' },
];

const STROKE_SIZES = [
  { name: 'Tiny', value: 2 },
  { name: 'Small', value: 4 },
  { name: 'Medium', value: 6 },
  { name: 'Large', value: 8 },
  { name: 'X-Large', value: 12 },
  { name: 'XX-Large', value: 16 },
  { name: 'Huge', value: 24 },
];

const OPACITY_OPTIONS = [
  { name: '10%', value: 0.1 },
  { name: '25%', value: 0.25 },
  { name: '50%', value: 0.5 },
  { name: '75%', value: 0.75 },
  { name: '100%', value: 1.0 },
];

// Simplified brush types - only circle, square, and triangle
const BRUSH_TYPES = [
  { name: 'Circle', value: 'circle', icon: Circle, description: 'Round brush tip' },
  { name: 'Square', value: 'square', icon: Square, description: 'Square brush tip' },
  { name: 'Triangle', value: 'triangle', icon: Triangle, description: 'Triangle brush tip' },
];

interface DrawingState {
  color: string;
  strokeWidth: number;
  opacity: number;
  brushType: string;
  isEraser: boolean;
}

const TeacherWhiteboard: React.FC = () => {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const customCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const customCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);

  const [isLive, setIsLive] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAudioRecording, setIsAudioRecording] = useState(false);

  // Drawing state
  const [drawingState, setDrawingState] = useState<DrawingState>({
    color: COLORS[0].value,
    strokeWidth: STROKE_SIZES[2].value,
    opacity: OPACITY_OPTIONS[4].value,
    brushType: 'circle', // Default to circle brush
    isEraser: false,
  });

  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Custom stroke history for undo/redo
  const [strokeHistory, setStrokeHistory] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById('whiteboard-container');
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

  // Initialize custom canvas for specialized brushes
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      customCanvasRef.current = canvas;
      customCtxRef.current = ctx;
    }
  }, [canvasSize]);

  // Initialize audio recorder
  useEffect(() => {
    if (!audioRecorderRef.current) {
      audioRecorderRef.current = new AudioRecorder();
    }
  }, []);

  const handleStroke = useCallback(async () => {
    if (isLive && canvasRef.current && socket) {
      try {
        const paths = await canvasRef.current.exportPaths();
        const userId = localStorage.getItem('userId');

        // Update stroke history for undo/redo
        setStrokeHistory(prevHistory => [...prevHistory, paths]);
        setRedoStack([]);

        if (userId) {
          console.log('Sending whiteboard update');
          socket.emit('whiteboardUpdate', {
            teacherId: userId,
            whiteboardData: JSON.stringify(paths)
          });
        }
      } catch (error) {
        console.error('Error handling stroke:', error);
      }
    }
  }, [isLive]);

  // Apply the appropriate brush based on the type
  const applyBrush = useCallback((point: StrokePoint) => {
    if (!customCtxRef.current) return;

    const options: BrushOptions = {
      color: drawingState.isEraser ? '#FFFFFF' : drawingState.color,
      size: drawingState.strokeWidth,
      opacity: drawingState.opacity
    };

    switch (drawingState.brushType) {
      case 'square':
        drawSquareBrush(customCtxRef.current, point, options);
        break;
      case 'triangle':
        drawTriangleBrush(customCtxRef.current, point, options);
        break;
      case 'circle':
      default:
        drawCircleBrush(customCtxRef.current, point, options);
        break;
    }
  }, [drawingState]);

  // Start audio recording - Non-blocking implementation
  const startAudioRecording = () => {
    if (!audioRecorderRef.current) {
      audioRecorderRef.current = new AudioRecorder();
    }

    // Avoid using setTimeout and use a more direct approach
    try {
      audioRecorderRef.current.startRecording()
        .then(() => {
          setIsAudioRecording(true);
          console.log('Audio recording started successfully');
        })
        .catch((err) => {
          console.error('Error in audio recording:', err);
          // Don't set any error state to avoid disrupting the session
        });
    } catch (error) {
      console.error('Error initiating audio recording:', error);
      // Don't propagate the error
    }
  };

  // Updated confirmation for starting live session
  const confirmStartLive = async () => {
    const userId = localStorage.getItem('userId');
    const socket = initializeSocket();

    if (userId && canvasRef.current) {
      setIsLive(true);
      setShowStartModal(false);

      // First, notify the server that the session is starting
      socket.emit('startLive', userId);

      // Short delay to ensure the socket event is processed first
      setTimeout(() => {
        // Then start audio recording
        startAudioRecording();

        // Send initial canvas state
        canvasRef.current?.exportPaths().then(paths => {
          socket.emit('whiteboardUpdate', {
            teacherId: userId,
            whiteboardData: JSON.stringify(paths)
          });
        }).catch(console.error);
      }, 500);
    }
  };

  const stopAudioRecording = async (): Promise<Blob | null> => {
    if (!audioRecorderRef.current) {
      return null;
    }

    try {
      const audioBlob = await audioRecorderRef.current.stopRecording();
      setIsAudioRecording(false);
      console.log('Stopped audio recording, blob size:', audioBlob.size);
      return audioBlob;
    } catch (error) {
      console.error('Error stopping audio recording:', error);
      setIsAudioRecording(false);
      return null;
    }
  };

  // Updated confirmation for stopping live session
  const confirmStopLive = async () => {
    const userId = localStorage.getItem('userId');
    const socket = initializeSocket();

    if (userId) {
      // First, notify that session is ending
      socket.emit('sessionEnded', {
        teacherId: userId,
        hasAudio: isAudioRecording
      });

      // Then, stop audio recording
      let audioBlob = null;
      if (isAudioRecording) {
        try {
          audioBlob = await stopAudioRecording();
        } catch (error) {
          console.error('Error stopping recording:', error);
          // Continue without audio
        }
      }

      // If audio was recorded, send it to server
      if (audioBlob && audioBlob.size > 0) {
        try {
          // Convert to base64 for transmission
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);

          reader.onloadend = () => {
            const base64data = reader.result as string;

            // Send audio data to server
            socket.emit('audioData', {
              teacherId: userId,
              audioData: base64data
            });

            // Finally, after all other events, stop the live session
            setTimeout(() => {
              socket.emit('stopLive', userId);
            }, 500);
          };
        } catch (error) {
          console.error('Error processing audio:', error);
          // Just stop the session if audio processing fails
          socket.emit('stopLive', userId);
        }
      } else {
        // No audio blob available, just end the session
        // Add a short delay to ensure other events are processed first
        setTimeout(() => {
          socket.emit('stopLive', userId);
        }, 500);
      }

      // Clear all local states
      setIsLive(false);
      setShowStopModal(false);
      setIsAudioRecording(false);

      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }

      // Reset history
      setStrokeHistory([]);
      setRedoStack([]);
    }
  };

  const handleClearCanvas = async () => {
    if (canvasRef.current && isLive) {
      await canvasRef.current.clearCanvas();
      const userId = localStorage.getItem('userId');
      const socket = initializeSocket();

      if (userId) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify([])
        });
      }

      // Reset history
      setStrokeHistory([]);
      setRedoStack([]);
    }
  };

  // Toggle dropdown menus
  const toggleDropdown = (menu: string) => {
    if (openDropdown === menu) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(menu);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdown(null);
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Handle color change
  const handleColorChange = (color: string) => {
    setDrawingState(prev => ({
      ...prev,
      color,
      isEraser: false
    }));
    setOpenDropdown(null);
  };

  // Handle stroke size change
  const handleSizeChange = (size: number) => {
    setDrawingState(prev => ({
      ...prev,
      strokeWidth: size
    }));
    setOpenDropdown(null);
  };

  // Handle opacity change
  const handleOpacityChange = (opacity: number) => {
    setDrawingState(prev => ({
      ...prev,
      opacity
    }));
    setOpenDropdown(null);
  };

  // Handle brush type change
  const handleBrushTypeChange = (type: string) => {
    setDrawingState(prev => ({
      ...prev,
      brushType: type,
      isEraser: false
    }));
    setOpenDropdown(null);
  };

  // Toggle eraser
  const toggleEraser = () => {
    setDrawingState(prev => ({
      ...prev,
      isEraser: !prev.isEraser
    }));
  };

  // Handle undo
  const handleUndo = async () => {
    if (canvasRef.current && strokeHistory.length > 0) {
      await canvasRef.current.undo();

      // Update history
      const newHistory = [...strokeHistory];
      const lastPath = newHistory.pop();
      setStrokeHistory(newHistory);
      setRedoStack(prev => [...prev, lastPath]);

      // Send updated canvas state
      const paths = await canvasRef.current.exportPaths();
      const userId = localStorage.getItem('userId');
      if (userId && socket) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify(paths)
        });
      }
    }
  };

  // Handle redo
  const handleRedo = async () => {
    if (canvasRef.current && redoStack.length > 0) {
      await canvasRef.current.redo();

      // Update history
      const newRedoStack = [...redoStack];
      const pathToRestore = newRedoStack.pop();
      setRedoStack(newRedoStack);
      setStrokeHistory(prev => [...prev, pathToRestore]);

      // Send updated canvas state
      const paths = await canvasRef.current.exportPaths();
      const userId = localStorage.getItem('userId');
      if (userId && socket) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify(paths)
        });
      }
    }
  };

  return (
    <>
      <div className="p-4">
        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">Whiteboard</h2>
          <div className="flex flex-wrap gap-2">
            {isLive && (
              <>
                <button
                  onClick={handleClearCanvas}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                  <Trash2 size={20} /> Clear
                </button>
                <button
                  onClick={toggleEraser}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                    drawingState.isEraser
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  <Eraser size={20} /> Eraser
                </button>
                <button
                  onClick={handleUndo}
                  disabled={strokeHistory.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                    strokeHistory.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  <RotateCcw size={20} />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                    redoStack.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  <RotateCw size={20} />
                </button>
              </>
            )}
            <button
              onClick={isLive ? handleStopLive : handleStartLive}
              disabled={isConnecting}
              className={`flex items-center gap-2 px-4 py-2 rounded-md ${
                isConnecting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isLive
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-green-500 hover:bg-green-600'
              } text-white`}
            >
              {isLive ? (
                <>
                  <X size={20} /> Stop Live
                </>
              ) : (
                <>
                  <Play size={20} /> {isConnecting ? 'Connecting...' : 'Start Live'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        )}

        {/* Audio Recording Indicator */}
        {isAudioRecording && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-700">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
            <p>Live session recording in progress (audio + whiteboard)</p>
          </div>
        )}

        {/* Drawing Toolbar - Only show when live */}
        {isLive && (
          <div className="mb-4 p-2 bg-white rounded-lg shadow border border-gray-200 flex flex-wrap items-center gap-2">
            {/* Color Selector */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => toggleDropdown('color')}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
                style={{ backgroundColor: drawingState.isEraser ? 'white' : drawingState.color,
                         color: drawingState.isEraser || drawingState.color === '#FFFFFF' || drawingState.color === '#FFFF00' ? 'black' : 'white' }}
              >
                <div className="w-4 h-4 rounded-full" style={{
                  backgroundColor: drawingState.isEraser ? 'white' : drawingState.color,
                  border: '1px solid #ccc'
                }}></div>
                <span>Color</span>
                <ChevronDown size={16} />
              </button>

              {openDropdown === 'color' && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                  <div className="grid grid-cols-4 gap-2 w-48">
                    {COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => handleColorChange(color.value)}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: color.value, border: '1px solid #ccc' }}
                        title={color.name}
                      >
                        {drawingState.color === color.value && !drawingState.isEraser && (
                          <div className="w-2 h-2 rounded-full bg-white border border-gray-600"></div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Size Selector */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => toggleDropdown('size')}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                <Circle size={drawingState.strokeWidth} />
                <span>Size</span>
                <ChevronDown size={16} />
              </button>

              {openDropdown === 'size' && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                  <div className="flex flex-col gap-2 w-48">
                    {STROKE_SIZES.map((size) => (
                      <button
                        key={size.value}
                        onClick={() => handleSizeChange(size.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 ${
                          drawingState.strokeWidth === size.value ? 'bg-gray-100' : ''
                        }`}
                      >
                        <Circle size={size.value} />
                        <span>{size.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Opacity Selector */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => toggleDropdown('opacity')}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                <div className="w-4 h-4 bg-gray-400 rounded-full opacity-75"></div>
                <span>Opacity</span>
                <ChevronDown size={16} />
              </button>

              {openDropdown === 'opacity' && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                  <div className="flex flex-col gap-2 w-48">
                    {OPACITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleOpacityChange(option.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 ${
                          drawingState.opacity === option.value ? 'bg-gray-100' : ''
                        }`}
                      >
                        <div className="w-4 h-4 bg-gray-900 rounded-full" style={{ opacity: option.value }}></div>
                        <span>{option.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Brush Type Selector - Simplified to just 3 options */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => toggleDropdown('brush')}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                <Paintbrush size={16} />
                <span>Brush</span>
                <ChevronDown size={16} />
              </button>

              {openDropdown === 'brush' && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                  <div className="flex flex-col gap-2 w-48">
                    {BRUSH_TYPES.map((brush) => {
                      const IconComponent = brush.icon;
                      return (
                        <button
                          key={brush.value}
                          onClick={() => handleBrushTypeChange(brush.value)}
                          className={`flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 ${
                            drawingState.brushType === brush.value ? 'bg-gray-100' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <IconComponent size={16} />
                            <span>{brush.name}</span>
                          </div>
                          <span className="text-xs text-gray-500">{brush.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div id="whiteboard-container" className="border rounded-lg overflow-hidden bg-white">
          <ReactSketchCanvas
            ref={canvasRef}
            strokeWidth={drawingState.strokeWidth}
            strokeColor={drawingState.isEraser ? "#FFFFFF" : drawingState.color}
            canvasColor="white"
            width={`${canvasSize.width}px`}
            height={`${canvasSize.height}px`}
            exportWithBackgroundImage={false}
            withTimestamp={false}
            allowOnlyPointerType="all"
            lineCap={drawingState.brushType === 'square' ? 'square' : 'round'}
            style={{
              opacity: drawingState.opacity,
            }}
            className="touch-none"
            onStroke={handleStroke}
            onChange={handleStroke}
          />
        </div>
      </div>

      {/* Start Session Modal */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Start Live Session</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to start a live whiteboard session? Students will be able to join and view your whiteboard.
            </p>
            <p className="text-gray-800 mb-6 p-3 bg-blue-50 border border-blue-200 rounded">
              <strong>Note:</strong> Your microphone will be automatically recorded during the entire session to provide audio for students.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setShowStartModal(false)}
                className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmStartLive}
                className="px-4 py-2 rounded-md bg-green-500 hover:bg-green-600 text-white"
              >
                Start Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Session Modal */}
      {showStopModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Stop Live Session</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to end the live session? All connected students will be disconnected and their sessions will be saved.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setShowStopModal(false)}
                className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmStopLive}
                className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TeacherWhiteboard;