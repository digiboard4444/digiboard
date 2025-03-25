import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Play, X, Eraser, AlertCircle, RotateCcw, RotateCw, Paintbrush, Trash2, Circle, ChevronDown } from 'lucide-react';
import { io } from 'socket.io-client';
import type { TypedSocket } from '../../types/socket';
import { drawCircleBrush, drawDottedCircleBrush, StrokePoint, BrushOptions } from '../../lib/brushUtils';

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

// Simplified brush types - only circle and dotted circle
const BRUSH_TYPES = [
  { name: 'Circle', value: 'circle', icon: Circle, description: 'Round brush tip' },
  { name: 'Dotted Circle', value: 'dotted-circle', icon: Circle, description: 'Dotted circular brush' },
];

interface DrawingState {
  color: string;
  strokeWidth: number;
  opacity: number;
  brushType: string;
  isEraser: boolean;
}

// Define a type for path data with opacity
interface StrokePathWithOpacity {
  drawMode: boolean;
  strokeColor: string;
  strokeWidth: number;
  paths: Array<{ x: number; y: number }>;
  opacity: number; // Added opacity to each stroke
}

const TeacherWhiteboard: React.FC = () => {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const customCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const customCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Store all stroke paths with their individual properties including opacity
  const pathsRef = useRef<StrokePathWithOpacity[]>([]);

  const [isLive, setIsLive] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [forceRender, setForceRender] = useState(0); // To force re-renders when needed

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
  const [strokeHistory, setStrokeHistory] = useState<StrokePathWithOpacity[][]>([]);
  const [redoStack, setRedoStack] = useState<StrokePathWithOpacity[][]>([]);

  // Initialize custom canvas
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

  // Handle window resize
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

  // Handle drawing a new stroke
  const handleStroke = useCallback(async () => {
    if (isLive && canvasRef.current && socket) {
      try {
        // Get the raw paths from the canvas
        const paths = await canvasRef.current.exportPaths();
        const userId = localStorage.getItem('userId');

        // If there are new paths drawn, add them to our paths with opacity
        if (paths.length > pathsRef.current.length) {
          const newPaths = paths.slice(pathsRef.current.length);

          // Add current opacity value to each new path
          const pathsWithOpacity = newPaths.map(path => ({
            ...path,
            opacity: drawingState.opacity
          }));

          // Update our stored paths
          pathsRef.current = [...pathsRef.current, ...pathsWithOpacity];

          // Update stroke history for undo/redo
          setStrokeHistory(prevHistory => [...prevHistory, pathsRef.current]);
          setRedoStack([]);
        }

        if (userId) {
          console.log('Sending whiteboard update');
          // Send the paths with opacity to connected clients
          socket.emit('whiteboardUpdate', {
            teacherId: userId,
            whiteboardData: JSON.stringify(pathsRef.current)
          });
        }
      } catch (error) {
        console.error('Error handling stroke:', error);
      }
    }
  }, [isLive, drawingState.opacity]);

  // Apply the appropriate brush based on the type and opacity
  const applyBrush = useCallback((point: StrokePoint) => {
    if (!customCtxRef.current) return;

    const options: BrushOptions = {
      color: drawingState.isEraser ? '#FFFFFF' : drawingState.color,
      size: drawingState.strokeWidth,
      opacity: drawingState.opacity // Current opacity setting
    };

    switch (drawingState.brushType) {
      case 'dotted-circle':
        drawDottedCircleBrush(customCtxRef.current, point, options);
        break;
      case 'circle':
      default:
        drawCircleBrush(customCtxRef.current, point, options);
        break;
    }
  }, [drawingState]);

  // Socket connection and event handling
  useEffect(() => {
    const socket = initializeSocket();
    const userId = localStorage.getItem('userId');

    const handleConnect = () => {
      console.log('Connected to server');
      setIsConnecting(false);
      if (isLive && userId) {
        socket.emit('startLive', userId);
        handleStroke(); // Send current canvas state
      }
    };

    const handleDisconnect = () => {
      console.log('Disconnected from server');
      setIsLive(false);
      setIsConnecting(true);
    };

    const handleLiveError = (data: { message: string }) => {
      setError(data.message);
      setShowStartModal(false);
      setIsLive(false);
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('liveError', handleLiveError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('liveError', handleLiveError);
      if (userId && isLive) {
        socket.emit('stopLive', userId);
      }
    };
  }, [isLive, handleStroke]);

  // Session management functions
  const handleStartLive = () => {
    setError(null);
    setShowStartModal(true);
  };

  const handleStopLive = () => {
    setShowStopModal(true);
  };

  const confirmStartLive = async () => {
    const userId = localStorage.getItem('userId');
    const socket = initializeSocket();

    if (userId && canvasRef.current) {
      setIsLive(true);
      setShowStartModal(false);
      socket.emit('startLive', userId);

      // Initialize paths with opacity
      const initialPaths = await canvasRef.current.exportPaths();
      pathsRef.current = initialPaths.map(path => ({
        ...path,
        opacity: 1.0 // Default full opacity for initial state
      }));

      // Send initial canvas state
      socket.emit('whiteboardUpdate', {
        teacherId: userId,
        whiteboardData: JSON.stringify(pathsRef.current)
      });
    }
  };

  const confirmStopLive = () => {
    const userId = localStorage.getItem('userId');
    const socket = initializeSocket();

    if (userId) {
      setIsLive(false);
      setShowStopModal(false);
      socket.emit('stopLive', userId);
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
      // Reset all stored paths and history
      pathsRef.current = [];
      setStrokeHistory([]);
      setRedoStack([]);
    }
  };

  const handleClearCanvas = async () => {
    if (canvasRef.current && isLive) {
      await canvasRef.current.clearCanvas();
      const userId = localStorage.getItem('userId');
      const socket = initializeSocket();

      // Clear all paths
      pathsRef.current = [];

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

  // Handle undo with opacity preservation
  const handleUndo = async () => {
    if (canvasRef.current && strokeHistory.length > 0) {
      await canvasRef.current.undo();

      // Update history and paths
      const newHistory = [...strokeHistory];
      const lastPaths = newHistory.pop() || [];
      setStrokeHistory(newHistory);
      setRedoStack(prev => [...prev, pathsRef.current]);

      // Update current paths reference
      pathsRef.current = lastPaths;

      // Send updated canvas state
      const userId = localStorage.getItem('userId');
      if (userId && socket) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify(pathsRef.current)
        });
      }
    }
  };

  // Handle redo with opacity preservation
  const handleRedo = async () => {
    if (canvasRef.current && redoStack.length > 0) {
      await canvasRef.current.redo();

      // Update history and paths
      const newRedoStack = [...redoStack];
      const pathsToRestore = newRedoStack.pop() || [];
      setRedoStack(newRedoStack);
      setStrokeHistory(prev => [...prev, pathsRef.current]);

      // Update current paths reference
      pathsRef.current = pathsToRestore;

      // Send updated canvas state
      const userId = localStorage.getItem('userId');
      if (userId && socket) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify(pathsRef.current)
        });
      }
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
    const handleClickOutside = (e: MouseEvent) => {
      if (openDropdown && !(e.target as Element).closest('.dropdown-container')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openDropdown]);

  // Drawing style handlers
  const handleColorChange = (color: string) => {
    setDrawingState(prev => ({
      ...prev,
      color,
      isEraser: false
    }));
    setOpenDropdown(null);
  };

  const handleSizeChange = (size: number) => {
    setDrawingState(prev => ({
      ...prev,
      strokeWidth: size
    }));
    setOpenDropdown(null);
  };

  const handleOpacityChange = (opacity: number) => {
    setDrawingState(prev => ({
      ...prev,
      opacity
    }));
    setOpenDropdown(null);
    // Force a re-render to update UI
    setForceRender(prev => prev + 1);
  };

  const handleBrushTypeChange = (type: string) => {
    setDrawingState(prev => ({
      ...prev,
      brushType: type,
      isEraser: false
    }));
    setOpenDropdown(null);
  };

  const toggleEraser = () => {
    setDrawingState(prev => ({
      ...prev,
      isEraser: !prev.isEraser
    }));
  };

  // Helper function to manage path rendering (not directly rendered)
  const renderPathsWithOpacity = () => {
    if (!canvasRef.current || !pathsRef.current.length) return;

    // This is a placeholder for custom rendering logic
    // In an actual implementation, we might use a Canvas API approach instead
    console.log(`Rendering ${pathsRef.current.length} paths with individual opacity`);
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

        {/* Drawing Toolbar - Only show when live */}
        {isLive && (
          <div className="mb-4 p-2 bg-white rounded-lg shadow border border-gray-200 flex flex-wrap items-center gap-2">
            {/* Color Selector */}
            <div className="relative dropdown-container" onClick={(e) => e.stopPropagation()}>
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
            <div className="relative dropdown-container" onClick={(e) => e.stopPropagation()}>
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
            <div className="relative dropdown-container" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => toggleDropdown('opacity')}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                <div className="w-4 h-4 bg-black rounded-full" style={{ opacity: drawingState.opacity }}></div>
                <span>Opacity: {Math.round(drawingState.opacity * 100)}%</span>
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

            {/* Brush Type Selector */}
            <div className="relative dropdown-container" onClick={(e) => e.stopPropagation()}>
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

        <div id="whiteboard-container" className="border rounded-lg overflow-hidden bg-white relative">
          {/* Main drawing canvas */}
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
            lineCap="round"
            className="touch-none"
            onStroke={handleStroke}
            onChange={handleStroke}
          />

          {/* Hidden canvas for custom rendering if needed */}
          <canvas
            ref={customCanvasRef}
            className="hidden"
            width={canvasSize.width}
            height={canvasSize.height}
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