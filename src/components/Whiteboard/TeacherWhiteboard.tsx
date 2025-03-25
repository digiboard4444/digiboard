import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, X, Eraser, AlertCircle, RotateCcw, RotateCw, Paintbrush, Trash2, Circle, ChevronDown } from 'lucide-react';
import { io } from 'socket.io-client';
import type { TypedSocket } from '../../types/socket';

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

// Modified brush types - Circle and Dotted Circle
const BRUSH_TYPES = [
  { name: 'Circle', value: 'round', description: 'Solid circle brush' },
  { name: 'Dotted Circle', value: 'dotted', description: 'Dotted circle brush' },
];

interface DrawingState {
  color: string;
  strokeWidth: number;
  opacity: number;
  brushType: string;
  isEraser: boolean;
}

// Interface for CustomCanvasRef
interface CustomCanvasRef {
  clearCanvas: () => void;
  exportPaths: () => any[];
  undo: () => void;
  redo: () => void;
  getPaths: () => any[];
}

// This is our custom canvas component that supports dotted brush
const CustomCanvas = React.forwardRef((props: any, ref: any) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{x: number, y: number} | null>(null);
  const [paths, setPaths] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // Initialize the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = props.strokeWidth || 6;
        ctx.strokeStyle = props.strokeColor || '#000000';
        ctx.globalAlpha = props.opacity || 1.0;
      }
    }
  }, [props.strokeWidth, props.strokeColor, props.opacity]);

  // Clear the canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setPaths([]);
        setRedoStack([]);
      }
    }
  };

  // Draw a circle at position
  const drawCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI * 2);
    ctx.fill();
  };

  // Draw a dotted circle at position
  const drawDottedCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
    const radius = size / 2;
    const dotCount = Math.max(8, Math.floor(radius * 2)); // Number of dots scales with size
    const dotSize = Math.max(1, size / 8); // Dot size scales with brush size

    ctx.fillStyle = color;

    // Draw dots in a circle pattern
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const dotX = x + Math.cos(angle) * radius;
      const dotY = y + Math.sin(angle) * radius;

      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw a dot in the center
    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  };

  // Handle start drawing
  const handleMouseDown = (e: any) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setIsDrawing(true);
      setLastPoint({ x, y });

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set drawing styles
        ctx.lineWidth = props.strokeWidth || 6;
        ctx.strokeStyle = props.strokeColor || '#000000';
        ctx.globalAlpha = props.opacity || 1.0;

        const color = props.isEraser ? "#FFFFFF" : props.strokeColor;

        // For dotted brush, draw a dotted circle at the starting point
        if (props.brushType === 'dotted') {
          drawDottedCircle(ctx, x, y, props.strokeWidth, color);
        } else {
          // For regular brush, draw a circle or start a line
          if (props.strokeWidth > 4) {
            drawCircle(ctx, x, y, props.strokeWidth, color);
          } else {
            ctx.beginPath();
            ctx.arc(x, y, props.strokeWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Add current path to paths for undo/redo
        setPaths([...paths, {
          points: [{ x, y }],
          brushType: props.brushType,
          strokeWidth: props.strokeWidth,
          strokeColor: props.strokeColor,
          isEraser: props.isEraser
        }]);

        // Clear redo stack after a new drawing
        setRedoStack([]);
      }
    }
  };

  // Handle drawing
  const handleMouseMove = (e: any) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (canvas && lastPoint) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const color = props.isEraser ? "#FFFFFF" : props.strokeColor;

        if (props.brushType === 'dotted') {
          // For dotted brush, draw dotted circles along the path
          const dx = Math.abs(x - lastPoint.x);
          const dy = Math.abs(y - lastPoint.y);
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Determine spacing between dots
          const dotSpacing = props.strokeWidth * 0.8;

          // If points are far apart, draw intermediate dotted circles
          if (distance > dotSpacing) {
            const steps = Math.floor(distance / dotSpacing);
            for (let i = 1; i <= steps; i++) {
              const ratio = i / (steps + 1);
              const intermediateX = lastPoint.x + (x - lastPoint.x) * ratio;
              const intermediateY = lastPoint.y + (y - lastPoint.y) * ratio;
              drawDottedCircle(ctx, intermediateX, intermediateY, props.strokeWidth, color);
            }
          }

          // Draw dotted circle at current point
          drawDottedCircle(ctx, x, y, props.strokeWidth, color);
        } else {
          // For round brush, draw normal line
          ctx.beginPath();
          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        // Update last point
        setLastPoint({ x, y });

        // Update current path
        setPaths(prevPaths => {
          const newPaths = [...prevPaths];
          const currentPath = {...newPaths[newPaths.length - 1]};
          currentPath.points = [...currentPath.points, { x, y }];
          return [...newPaths.slice(0, -1), currentPath];
        });
      }
    }
  };

  // Handle end drawing
  const handleMouseUp = () => {
    setIsDrawing(false);
    if (props.onStroke) {
      props.onStroke(paths);
    }
  };

  // Export paths for saving and undo/redo
  const exportPaths = () => {
    return paths;
  };

  // Handle undo
  const undo = () => {
    if (paths.length > 0) {
      const newPaths = [...paths];
      const removedPath = newPaths.pop();
      setPaths(newPaths);
      setRedoStack(prevRedoStack => [...prevRedoStack, removedPath]);

      // Redraw everything
      redrawCanvas(newPaths);

      if (props.onStroke) {
        props.onStroke(newPaths);
      }
    }
  };

  // Handle redo
  const redo = () => {
    if (redoStack.length > 0) {
      const newRedoStack = [...redoStack];
      const pathToRestore = newRedoStack.pop();
      setPaths(prevPaths => [...prevPaths, pathToRestore]);
      setRedoStack(newRedoStack);

      // Redraw everything
      redrawCanvas([...paths, pathToRestore]);

      if (props.onStroke) {
        props.onStroke([...paths, pathToRestore]);
      }
    }
  };

  // Redraw the entire canvas from paths
  const redrawCanvas = (pathsToRender: any[]) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        pathsToRender.forEach(path => {
          ctx.lineWidth = path.strokeWidth;
          ctx.strokeStyle = path.isEraser ? "#FFFFFF" : path.strokeColor;
          ctx.globalAlpha = props.opacity || 1.0;

          if (path.brushType === 'dotted') {
            // Redraw dotted path
            path.points.forEach((point: {x: number, y: number}, index: number) => {
              drawDottedCircle(ctx, point.x, point.y, path.strokeWidth, path.isEraser ? "#FFFFFF" : path.strokeColor);
            });
          } else {
            // Redraw regular path
            if (path.points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(path.points[0].x, path.points[0].y);
              for (let i = 1; i < path.points.length; i++) {
                ctx.lineTo(path.points[i].x, path.points[i].y);
              }
              ctx.stroke();
            } else if (path.points.length === 1) {
              // Draw a single point
              const point = path.points[0];
              drawCircle(ctx, point.x, point.y, path.strokeWidth, path.isEraser ? "#FFFFFF" : path.strokeColor);
            }
          }
        });
      }
    }
  };

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    clearCanvas,
    exportPaths,
    undo,
    redo,
    getPaths: () => paths
  }));

  return (
    <canvas
      ref={canvasRef}
      width={props.width}
      height={props.height}
      style={{
        ...props.style,
        touchAction: 'none'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={(e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
      }}
      onTouchMove={(e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
      }}
      onTouchEnd={handleMouseUp}
    />
  );
});

const TeacherWhiteboard: React.FC = () => {
  const canvasRef = useRef<CustomCanvasRef | null>(null);

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
    brushType: BRUSH_TYPES[0].value,
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

  const handleStroke = useCallback(async (paths: any) => {
    if (isLive && canvasRef.current && socket) {
      try {
        const userId = localStorage.getItem('userId');

        // Update stroke history for undo/redo
        setStrokeHistory(paths);

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

  useEffect(() => {
    const socket = initializeSocket();
    const userId = localStorage.getItem('userId');

    const handleConnect = () => {
      console.log('Connected to server');
      setIsConnecting(false);
      if (isLive && userId) {
        socket.emit('startLive', userId);
        if (canvasRef.current) {
          const paths = canvasRef.current.getPaths();
          handleStroke(paths); // Send current canvas state
        }
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
      const paths = canvasRef.current.getPaths();
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
      canvasRef.current.clearCanvas();
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
    if (canvasRef.current) {
      canvasRef.current.undo();
    }
  };

  // Handle redo
  const handleRedo = async () => {
    if (canvasRef.current) {
      canvasRef.current.redo();
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

            {/* Brush Type Selector - Just 2 options: Circle and Dotted Circle */}
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
                    {BRUSH_TYPES.map((brush) => (
                      <button
                        key={brush.value}
                        onClick={() => handleBrushTypeChange(brush.value)}
                        className={`flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 ${
                          drawingState.brushType === brush.value ? 'bg-gray-100' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Circle size={16} />
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
          <CustomCanvas
            ref={canvasRef}
            strokeWidth={drawingState.strokeWidth}
            strokeColor={drawingState.color}
            brushType={drawingState.brushType}
            opacity={drawingState.opacity}
            isEraser={drawingState.isEraser}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              width: '100%',
              height: '100%',
              background: 'white',
            }}
            onStroke={handleStroke}
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