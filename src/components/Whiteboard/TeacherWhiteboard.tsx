import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { Play, X, Eraser, AlertCircle, RotateCcw, RotateCw, Paintbrush, Trash2, Circle, Square, Triangle, ChevronDown } from 'lucide-react';
import { io } from 'socket.io-client';
import type { TypedSocket } from '../../types/socket';
import { drawCircleBrush, StrokePoint, BrushOptions } from '../../lib/brushUtils';
import {
COLORS,
STROKE_SIZES,
OPACITY_OPTIONS,
DRAWING_TOOLS,
SHAPES,
DEFAULT_DRAWING_STATE,
DrawingState,
handleColorChange,
handleSizeChange,
handleOpacityChange,
handleToolChange,
handleShapeChange,
toggleDropdown,
setupClickOutsideHandler
} from '../../lib/brushStylingUtils';
import {
ShapePoints,
ShapeOptions,
drawShape
} from '../../lib/shapeUtils';

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

const TeacherWhiteboard: React.FC = () => {
const canvasRef = useRef<ReactSketchCanvasRef | null>(null);
const customCanvasRef = useRef<HTMLCanvasElement | null>(null);
const customCtxRef = useRef<CanvasRenderingContext2D | null>(null);

// For shape drawing
const shapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
const shapeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
const [shapePoints, setShapePoints] = useState<ShapePoints | null>(null);
const [isDrawing, setIsDrawing] = useState(false);

const [isLive, setIsLive] = useState(false);
const [showStartModal, setShowStartModal] = useState(false);
const [showStopModal, setShowStopModal] = useState(false);
const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
const [error, setError] = useState<string | null>(null);
const [isConnecting, setIsConnecting] = useState(false);

// Drawing state
const [drawingState, setDrawingState] = useState<DrawingState>(DEFAULT_DRAWING_STATE);

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

// Initialize shape canvas
useEffect(() => {
const canvas = document.createElement('canvas');
canvas.width = canvasSize.width;
canvas.height = canvasSize.height;
canvas.style.position = 'absolute';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.pointerEvents = 'none'; // Allow events to pass through

const ctx = canvas.getContext('2d');
if (ctx) {
shapeCanvasRef.current = canvas;
shapeCtxRef.current = ctx;

// Add the shape canvas to the DOM if it's not already there
const container = document.getElementById('whiteboard-container');
if (container && !container.querySelector('#shape-canvas')) {
canvas.id = 'shape-canvas';
container.appendChild(canvas);
}
}
}, [canvasSize]);

// Handle mouse events for shape drawing
const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
if (drawingState.tool !== 'shape' || !isLive) return;

const container = document.getElementById('whiteboard-container');
if (!container) return;

const rect = container.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;

setShapePoints({
startX: x,
startY: y,
endX: x,
endY: y
});

setIsDrawing(true);
};

const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
if (!isDrawing || !shapePoints || !shapeCtxRef.current) return;

const container = document.getElementById('whiteboard-container');
if (!container) return;

const rect = container.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;

// Update end point
setShapePoints(prev => ({
...prev!,
endX: x,
endY: y
}));

// Clear previous preview
shapeCtxRef.current.clearRect(0, 0, canvasSize.width, canvasSize.height);

// Draw shape preview
drawShape(
shapeCtxRef.current,
drawingState.shape,
{ ...shapePoints, endX: x, endY: y },
{
color: drawingState.color,
strokeWidth: drawingState.strokeWidth,
opacity: drawingState.opacity
}
);
};

const handleMouseUp = async () => {
if (!isDrawing || !shapePoints || !shapeCtxRef.current || !canvasRef.current) return;

// Clear preview shape
shapeCtxRef.current.clearRect(0, 0, canvasSize.width, canvasSize.height);

// Draw the final shape on the main canvas
await canvasRef.current.eraseMode(false);
await canvasRef.current.clearCanvas();

// We need to programmatically draw the shape on the canvas
// This would normally use the canvas API directly, but for this example
// we'll simulate drawing via the ReactSketchCanvas API

// Create points along the shape path
const pointsToDraw = generateShapePoints(drawingState.shape, shapePoints);

// Draw the shape point by point
for (const point of pointsToDraw) {
await canvasRef.current.simulateDrawingPoints([point]);
}

// Handle stroke recording
handleStroke();

// Reset state
setIsDrawing(false);
setShapePoints(null);
};

// Generate points along a shape path for the canvas
const generateShapePoints = (shape: string, points: ShapePoints) => {
const { startX, startY, endX, endY } = points;
const pointsArray = [];

switch (shape) {
case 'rectangle': {
// Top line
for (let x = startX; x <= endX; x += 2) {
pointsArray.push({ x, y: startY });
}
// Right line
for (let y = startY; y <= endY; y += 2) {
pointsArray.push({ x: endX, y });
}
// Bottom line
for (let x = endX; x >= startX; x -= 2) {
pointsArray.push({ x, y: endY });
}
// Left line
for (let y = endY; y >= startY; y -= 2) {
pointsArray.push({ x: startX, y });
}
break;
}
case 'triangle': {
const topX = startX + (endX - startX) / 2;
const topY = startY;
const leftX = startX;
const leftY = endY;
const rightX = endX;
const rightY = endY;

// Left side
const leftPoints = interpolatePoints({ x: topX, y: topY }, { x: leftX, y: leftY }, 30);
pointsArray.push(...leftPoints);

// Bottom
const bottomPoints = interpolatePoints({ x: leftX, y: leftY }, { x: rightX, y: rightY }, 30);
pointsArray.push(...bottomPoints);

// Right side
const rightPoints = interpolatePoints({ x: rightX, y: rightY }, { x: topX, y: topY }, 30);
pointsArray.push(...rightPoints);
break;
}
default:
return [];
}

return pointsArray;
};

// Helper to interpolate points between two coordinates
const interpolatePoints = (
start: { x: number, y: number },
end: { x: number, y: number },
steps: number
) => {
const points = [];
for (let i = 0; i <= steps; i++) {
const ratio = i / steps;
const x = start.x + (end.x - start.x) * ratio;
const y = start.y + (end.y - start.y) * ratio;
points.push({ x, y });
}
return points;
};

// Close dropdown when clicking outside
useEffect(() => {
return setupClickOutsideHandler(setOpenDropdown);
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
color: drawingState.tool === 'eraser' ? '#FFFFFF' : drawingState.color,
size: drawingState.strokeWidth,
opacity: drawingState.opacity
};

// Only use brush for brush tool, not for shapes
if (drawingState.tool === 'brush') {
drawCircleBrush(customCtxRef.current, point, options);
}
}, [drawingState]);

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

{isLive && (
<div className="mb-4 p-2 bg-white rounded-lg shadow border border-gray-200 flex flex-wrap items-center gap-2">
{/* Drawing Tools */}
<div className="relative dropdown-container" onClick={(e) => e.stopPropagation()}>
<button
  onClick={() => toggleDropdown('tool', openDropdown, setOpenDropdown)}
  className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 ${
    drawingState.tool === 'shape' ? 'bg-blue-100' : ''
  }`}
>
  {drawingState.tool === 'brush' && <Paintbrush size={16} />}
  {drawingState.tool === 'eraser' && <Eraser size={16} />}
  {drawingState.tool === 'shape' && (
    drawingState.shape === 'rectangle' ? <Square size={16} /> :
    drawingState.shape === 'triangle' ? <Triangle size={16} /> : <Square size={16} />
  )}
  <span>Tool: {drawingState.tool === 'shape' ? drawingState.shape : drawingState.tool}</span>
  <ChevronDown size={16} />
</button>

{openDropdown === 'tool' && (
  <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
    <div className="flex flex-col gap-2 w-48">
      {/* Drawing Tools */}
      <div className="text-xs text-gray-500 font-semibold px-2 py-1">TOOLS</div>
      {DRAWING_TOOLS.map((tool) => {
        const Icon = tool.value === 'brush' ? Paintbrush : Eraser;
        return (
          <button
            key={tool.value}
            onClick={() => handleToolChange(tool.value, setDrawingState, setOpenDropdown)}
            className={`flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 ${
              drawingState.tool === tool.value ? 'bg-gray-100' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon size={16} />
              <span>{tool.name}</span>
            </div>
          </button>
        );
      })}

      {/* Shapes */}
      <div className="text-xs text-gray-500 font-semibold px-2 py-1 mt-2">SHAPES</div>
      {SHAPES.map((shape) => {
        const Icon = shape.value === 'rectangle' ? Square : Triangle;
        return (
          <button
            key={shape.value}
            onClick={() => handleShapeChange(shape.value, setDrawingState, setOpenDropdown)}
            className={`flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 ${
              drawingState.tool === 'shape' && drawingState.shape === shape.value ? 'bg-gray-100' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon size={16} />
              <span>{shape.name}</span>
            </div>
            <span className="text-xs text-gray-500">{shape.description}</span>
          </button>
        );
      })}
    </div>
  </div>
)}
</div>
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
</div>            {/* Size Selector */}
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
</div>
)}>
<button
  onClick={() => toggleDropdown('brush', openDropdown, setOpenDropdown)}
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
        // Use Circle for all brush types since they're both circles
        return (
          <button
            key={brush.value}
            onClick={() => handleBrushTypeChange(brush.value, setDrawingState, setOpenDropdown)}
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
lineCap="round"
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