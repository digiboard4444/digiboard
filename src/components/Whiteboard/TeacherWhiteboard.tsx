import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Play, X, Eraser, AlertCircle, RotateCcw, RotateCw, Paintbrush, Trash2, Circle, ChevronDown, Minus } from 'lucide-react';
import { io } from 'socket.io-client';
import type { TypedSocket } from '../../types/socket';
import {
  COLORS,
  STROKE_SIZES,
  OPACITY_OPTIONS,
  BRUSH_TYPES,
  DEFAULT_DRAWING_STATE,
  DrawingState,
  handleColorChange,
  handleSizeChange,
  handleOpacityChange,
  handleBrushTypeChange,
  toggleEraser,
  toggleDropdown,
  setupClickOutsideHandler
} from '../../lib/brushStylingUtils';

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

// Custom canvas component that works with dotted lines
const CanvasWrapper = ({
  children,
  activeBrush,
  strokeWidth
}: {
  children: React.ReactNode,
  activeBrush: string,
  strokeWidth: number
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Apply the dotted line style to specific paths
  useEffect(() => {
    const applyDottedLineStyle = () => {
      if (wrapperRef.current) {
        const svgElement = wrapperRef.current.querySelector('svg');
        if (svgElement) {
          const pathElements = svgElement.querySelectorAll('path');

          // Apply to any path with data-brush-type="dotted-line"
          pathElements.forEach(path => {
            if (path.getAttribute('data-brush-type') === 'dotted-line') {
              const width = path.getAttribute('data-stroke-width') || strokeWidth.toString();
              path.style.strokeDasharray = `${width}px, ${width}px`;
            }
          });
        }
      }
    };

    // Use a small timeout to ensure the DOM has updated
    const timeoutId = setTimeout(applyDottedLineStyle, 10);
    return () => clearTimeout(timeoutId);
  }, [activeBrush, strokeWidth]);

  return (
    <div ref={wrapperRef}>
      {children}
    </div>
  );
};

// Custom function to create dotted line paths - this is key to making it work
const createDottedPath = (path: any, strokeWidth: number) => {
  // Create a modified path with SVG stroke-dasharray attribute
  if (!path.svg) {
    path.svg = {};
  }

  // Add the SVG stroke-dasharray attribute
  path.svg.strokeDasharray = `${strokeWidth},${strokeWidth}`;

  // Add data attributes to help with teacher-side styling
  path.data = {
    ...path.data,
    brushType: 'dotted-line',
    strokeWidth: strokeWidth
  };

  return path;
};

const TeacherWhiteboard: React.FC = () => {
  const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Drawing state
  const [drawingState, setDrawingState] = useState<DrawingState>(DEFAULT_DRAWING_STATE);
  const [currentPaths, setCurrentPaths] = useState<any[]>([]);
  const lastPathsRef = useRef<any[]>([]);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    return setupClickOutsideHandler(setOpenDropdown);
  }, []);

  // This function marks paths with their brush type after creation
  const updatePathsWithBrushType = useCallback(async () => {
    if (!canvasRef.current) return;

    try {
      // Get the current paths
      const paths = await canvasRef.current.exportPaths();

      // Find new paths that were added since last update
      if (paths.length > lastPathsRef.current.length) {
        const newPaths = [...paths];

        // Process only the newest path
        const latestPathIndex = newPaths.length - 1;
        const latestPath = newPaths[latestPathIndex];

        // Apply dotted line styling if needed
        if (drawingState.brushType === 'dotted-line' && !drawingState.isEraser) {
          newPaths[latestPathIndex] = createDottedPath(latestPath, drawingState.strokeWidth);
        } else {
          // For regular paths, still add the brush type data
          if (!latestPath.data) {
            latestPath.data = {};
          }
          latestPath.data.brushType = drawingState.brushType;
          latestPath.data.strokeWidth = drawingState.strokeWidth;
        }

        // Store the modified paths
        lastPathsRef.current = newPaths;
        setCurrentPaths(newPaths);

        // If it's a dotted line path, we need to redraw to apply the styling
        if (drawingState.brushType === 'dotted-line' && !drawingState.isEraser) {
          // Clear the canvas and redraw with our modified paths
          await canvasRef.current.clearCanvas();
          await canvasRef.current.loadPaths(newPaths);
        }

        return newPaths;
      }

      return paths;
    } catch (error) {
      console.error('Error updating paths:', error);
      return [];
    }
  }, [drawingState.brushType, drawingState.isEraser, drawingState.strokeWidth]);

  const handleStroke = useCallback(async () => {
    if (isLive && canvasRef.current && socket) {
      try {
        // Get paths with updated brush types
        const paths = await updatePathsWithBrushType();

        // Update history
        setStrokeHistory(prevHistory => [...prevHistory, paths]);
        setRedoStack([]);

        const userId = localStorage.getItem('userId');
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
  }, [isLive, updatePathsWithBrushType]);

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

      // Reset paths and history
      lastPathsRef.current = [];
      setCurrentPaths([]);

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
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
      // Reset history
      setStrokeHistory([]);
      setRedoStack([]);
      lastPathsRef.current = [];
      setCurrentPaths([]);
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
      lastPathsRef.current = [];
      setCurrentPaths([]);
    }
  };

  // Modified undo to maintain dotted line information
  const handleUndo = async () => {
    if (canvasRef.current && strokeHistory.length > 0) {
      await canvasRef.current.undo();

      // Update history
      const newHistory = [...strokeHistory];
      const lastPaths = newHistory.pop();
      setStrokeHistory(newHistory);
      setRedoStack(prev => [...prev, lastPaths]);

      // Get current paths after undo
      const currentPaths = await canvasRef.current.exportPaths();
      lastPathsRef.current = currentPaths;
      setCurrentPaths(currentPaths);

      // Send updated canvas state
      const userId = localStorage.getItem('userId');
      if (userId && socket) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify(currentPaths)
        });
      }
    }
  };

  // Modified redo to maintain dotted line information
  const handleRedo = async () => {
    if (canvasRef.current && redoStack.length > 0) {
      await canvasRef.current.redo();

      // Update history
      const newRedoStack = [...redoStack];
      const pathsToRestore = newRedoStack.pop();
      setRedoStack(newRedoStack);
      setStrokeHistory(prev => [...prev, pathsToRestore]);

      // Get current paths after redo
      const currentPaths = await canvasRef.current.exportPaths();
      lastPathsRef.current = currentPaths;
      setCurrentPaths(currentPaths);

      // Send updated canvas state
      const userId = localStorage.getItem('userId');
      if (userId && socket) {
        socket.emit('whiteboardUpdate', {
          teacherId: userId,
          whiteboardData: JSON.stringify(currentPaths)
        });
      }
    }
  };

  // Get the appropriate icon based on brush type
  const getBrushIcon = (brushType: string) => {
    switch (brushType) {
      case 'dotted-line':
        return <Minus size={16} />;
      case 'circle':
      default:
        return <Circle size={16} />;
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
                  onClick={() => toggleEraser(setDrawingState)}
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
                onClick={() => toggleDropdown('color', openDropdown, setOpenDropdown)}
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
                        onClick={() => handleColorChange(color.value, setDrawingState, setOpenDropdown)}
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
                onClick={() => toggleDropdown('size', openDropdown, setOpenDropdown)}
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
                        onClick={() => handleSizeChange(size.value, setDrawingState, setOpenDropdown)}
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
                onClick={() => toggleDropdown('opacity', openDropdown, setOpenDropdown)}
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
                        onClick={() => handleOpacityChange(option.value, setDrawingState, setOpenDropdown)}
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
                onClick={() => toggleDropdown('brush', openDropdown, setOpenDropdown)}
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100"
              >
                {getBrushIcon(drawingState.brushType)}
                <span>Brush</span>
                <ChevronDown size={16} />
              </button>

              {openDropdown === 'brush' && (
                <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                  <div className="flex flex-col gap-2 w-48">
                    {BRUSH_TYPES.map((brush) => {
                      return (
                        <button
                          key={brush.value}
                          onClick={() => handleBrushTypeChange(brush.value, setDrawingState, setOpenDropdown)}
                          className={`flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 ${
                            drawingState.brushType === brush.value ? 'bg-gray-100' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {brush.value === 'dotted-line' ? <Minus size={16} /> : <Circle size={16} />}
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
          <CanvasWrapper
            activeBrush={drawingState.brushType}
            strokeWidth={drawingState.strokeWidth}
          >
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
              style={{
                opacity: drawingState.opacity,
              }}
              className="touch-none"
              onStroke={handleStroke}
              onChange={handleStroke}
            />
          </CanvasWrapper>
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