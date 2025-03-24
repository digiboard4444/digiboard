import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Play, X, Eraser, AlertCircle, RotateCcw, RotateCw, Paintbrush, Trash2, Circle, ChevronDown } from 'lucide-react';
import { io } from 'socket.io-client';
import type { TypedSocket } from '../../types/socket';
import { StrokePoint, BrushOptions, drawDashedLine, drawCalligraphyStroke } from './brushUtils';

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

// Define just 3 brush types as requested
const BRUSH_TYPES = [
  {
    id: 'normal',
    name: 'Normal',
    description: 'Standard solid brush',
    lineCap: 'round',
    lineDash: []
  },
  {
    id: 'dash',
    name: 'Dashed',
    description: 'Dashed line pattern',
    lineCap: 'butt',
    lineDash: [12, 6]
  },
  {
    id: 'calligraphy',
    name: 'Calligraphy',
    description: 'Angled calligraphy pen',
    lineCap: 'butt',
    lineDash: []
  }
];

interface DrawingState {
  color: string;
  strokeWidth: number;
  opacity: number;
  brushType: string;
  isEraser: boolean;
}

const TeacherWhiteboard: React.FC = () => {
  // Main canvas ref
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  // Custom canvas for special brush types
  const customCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // State
  const [isLive, setIsLive] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Drawing state
  const [drawingState, setDrawingState] = useState<DrawingState>({
    color: COLORS[0].value,
    strokeWidth: STROKE_SIZES[2].value,
    opacity: OPACITY_OPTIONS[4].value,
    brushType: BRUSH_TYPES[0].id,
    isEraser: false,
  });

  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Custom stroke history for undo/redo
  const [strokeHistory, setStrokeHistory] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPointRef = useRef<{x: number, y: number} | null>(null);

  // Initialize and resize the canvas
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

  // Setup custom canvas context
  useEffect(() => {
    if (customCanvasRef.current) {
      const canvas = customCanvasRef.current;
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set initial styles
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = drawingState.opacity;
        ctx.lineWidth = drawingState.strokeWidth;
        ctx.strokeStyle = drawingState.color;

        ctxRef.current = ctx;
      }
    }
  }, [canvasSize.width, canvasSize.height, drawingState, customCanvasRef]);

  // Handle socket connection and events
  useEffect(() => {
    const socket = initializeSocket();
    const userId = localStorage.getItem('userId');

    const handleConnect = () => {
      console.log('Connected to server');
      setIsConnecting(false);
      if (isLive && userId) {
        socket.emit('startLive', userId);
        syncCanvasState(); // Send current canvas state
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
  }, [isLive]);

  // Sync canvas state with server
  const syncCanvasState = useCallback(async () => {
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
        console.error('Error syncing canvas state:', error);
      }
    }
  }, [isLive]);

  // Apply brush style based on the selected brush type
  const applyBrushStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!ctx) return;

    const brush = BRUSH_TYPES.find(b => b.id === drawingState.brushType) || BRUSH_TYPES[0];

    ctx.globalAlpha = drawingState.opacity;
    ctx.strokeStyle = drawingState.isEraser ? '#FFFFFF' : drawingState.color;
    ctx.lineWidth = drawingState.strokeWidth;
    ctx.lineCap = brush.lineCap as CanvasLineCap;
    ctx.lineJoin = 'round';
    ctx.setLineDash(brush.lineDash);
  }, [drawingState]);

  // Custom drawing event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLive || !ctxRef.current) return;

    setIsDrawing(true);

    const rect = customCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Start new path
    const ctx = ctxRef.current;
    applyBrushStyle(ctx);

    ctx.beginPath();
    ctx.moveTo(x, y);

    lastPointRef.current = { x, y };
  }, [isLive, applyBrushStyle]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLive || !isDrawing || !ctxRef.current || !lastPointRef.current) return;

    const rect = customCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Create points and options for brush utilities
    const fromPoint: StrokePoint = { x: lastPointRef.current.x, y: lastPointRef.current.y };
    const toPoint: StrokePoint = { x, y };
    const options: BrushOptions = {
      color: drawingState.isEraser ? '#FFFFFF' : drawingState.color,
      size: drawingState.strokeWidth,
      opacity: drawingState.opacity
    };

    // Use brush utilities based on brush type
    const ctx = ctxRef.current;

      // Use brush utilities based on brush type
      switch (drawingState.brushType) {
        case 'dash':
          drawDashedLine(ctx, fromPoint, toPoint, options);
          break;

        case 'calligraphy':
          drawCalligraphyStroke(ctx, fromPoint, toPoint, options);
          break;

        default:
          // Standard brush
          applyBrushStyle(ctx);
          ctx.beginPath();
          ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
          ctx.lineTo(x, y);
          ctx.stroke();
      }

    lastPointRef.current = { x, y };
  }, [isLive, isDrawing, drawingState, applyBrushStyle]);

  const handleMouseUp = useCallback(() => {
    if (!isLive || !isDrawing) return;

    setIsDrawing(false);
    lastPointRef.current = null;

    // Synchronize with main canvas
    if (canvasRef.current && customCanvasRef.current) {
      // For a full implementation, we would need to merge the canvas contents
      // For this demo, we'll just sync the standard canvas
      syncCanvasState();
    }
  }, [isLive, isDrawing, syncCanvasState]);

  // Handle session start/stop
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

      // Send initial canvas state
      const paths = await canvasRef.current.exportPaths();
      socket.emit('whiteboardUpdate', {
        teacherId: userId,
        whiteboardData: JSON.stringify(paths)
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

      // Clear canvases
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }

      if (ctxRef.current && customCanvasRef.current) {
        ctxRef.current.clearRect(0, 0, customCanvasRef.current.width, customCanvasRef.current.height);
      }

      // Reset history
      setStrokeHistory([]);
      setRedoStack([]);
    }
  };

  const handleClearCanvas = async () => {
    if (!isLive) return;

    // Clear main canvas
    if (canvasRef.current) {
      await canvasRef.current.clearCanvas();
    }

    // Clear custom canvas
    if (ctxRef.current && customCanvasRef.current) {
      ctxRef.current.clearRect(0, 0, customCanvasRef.current.width, customCanvasRef.current.height);
    }

    // Send clear event to students
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
  };

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

      // Clear custom canvas and redraw from main canvas
      if (ctxRef.current && customCanvasRef.current) {
        ctxRef.current.clearRect(0, 0, customCanvasRef.current.width, customCanvasRef.current.height);
      }

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

  // Toggle dropdown menus
  const toggleDropdown = (menu: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => toggleDropdown('color', e)}
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
                onClick={(e) => toggleDropdown('size', e)}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                <Circle size={Math.min(20, drawingState.strokeWidth)} />
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
                        <Circle size={Math.min(20, size.value)} />
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
                onClick={(e) => toggleDropdown('opacity', e)}
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

            {/* Brush Type Selector - Simplified to just 3 types */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => toggleDropdown('brush', e)}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                <Paintbrush size={16} />
                <span>Brush Type</span>
                <ChevronDown size={16} />
              </button>

              {openDropdown === 'brush' && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                  <div className="flex flex-col gap-2 w-60">
                  {BRUSH_TYPES.map((brush) => (
                      <button
                        key={brush.id}
                        onClick={() => handleBrushTypeChange(brush.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 ${
                          drawingState.brushType === brush.id ? 'bg-gray-100' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Paintbrush size={16} />
                          <span>{brush.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">{brush.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div id="whiteboard-container" className="border rounded-lg overflow-hidden bg-white">
          <div className="relative">
            {/* Main ReactSketchCanvas for basic drawing */}
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
              lineCap={
                drawingState.brushType === 'normal'
                  ? 'round'
                  : drawingState.brushType === 'dash' || drawingState.brushType === 'calligraphy'
                    ? 'butt'
                    : 'round'
              }
              style={{
                opacity: drawingState.opacity,
              }}
              className="touch-none"
              onStroke={syncCanvasState}
            />

            {/* Custom canvas overlay for special brush types */}
            <canvas
              ref={customCanvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${canvasSize.width}px`,
                height: `${canvasSize.height}px`,
                pointerEvents: isLive ? 'auto' : 'none',
                opacity: (drawingState.brushType === 'calligraphy' || drawingState.brushType === 'dash') ? 1 : 0,
              }}
              className="touch-none"
            />
          </div>
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