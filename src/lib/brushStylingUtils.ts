import React from 'react';

// Brush style configuration
export const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Green', value: '#008000' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Purple', value: '#800080' },
  { name: 'Orange', value: '#FFA500' },
];

export const STROKE_SIZES = [
  { name: 'Tiny', value: 2 },
  { name: 'Small', value: 4 },
  { name: 'Medium', value: 6 },
  { name: 'Large', value: 8 },
  { name: 'X-Large', value: 12 },
  { name: 'XX-Large', value: 16 },
  { name: 'Huge', value: 24 },
];

export const OPACITY_OPTIONS = [
  { name: '10%', value: 0.1 },
  { name: '25%', value: 0.25 },
  { name: '50%', value: 0.5 },
  { name: '75%', value: 0.75 },
  { name: '100%', value: 1.0 },
];

// Available drawing tools
export const DRAWING_TOOLS = [
  { name: 'Brush', value: 'brush', icon: 'Paintbrush', description: 'Free-form brush' },
  { name: 'Eraser', value: 'eraser', icon: 'Eraser', description: 'Erase content' }
];

// Available shapes
export const SHAPES = [
  { name: 'Rectangle', value: 'rectangle', icon: 'Square', description: 'Draw rectangle' },
  { name: 'Triangle', value: 'triangle', icon: 'Triangle', description: 'Draw triangle' }
];

export interface DrawingState {
  color: string;
  strokeWidth: number;
  opacity: number;
  tool: string;      // Current selected tool (brush, eraser, shape)
  shape: string;     // Current selected shape (rectangle, triangle, etc.)
  isDrawingShape: boolean; // Whether currently drawing a shape
}

// Default drawing state
export const DEFAULT_DRAWING_STATE: DrawingState = {
  color: COLORS[0].value,
  strokeWidth: STROKE_SIZES[2].value,
  opacity: OPACITY_OPTIONS[4].value,
  tool: 'brush',
  shape: 'rectangle',
  isDrawingShape: false
};

// Function to handle color change
export const handleColorChange = (
  color: string,
  setDrawingState: React.Dispatch<React.SetStateAction<DrawingState>>,
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setDrawingState(prev => ({
    ...prev,
    color,
    isEraser: false
  }));
  setOpenDropdown(null);
};

// Function to handle stroke size change
export const handleSizeChange = (
  size: number,
  setDrawingState: React.Dispatch<React.SetStateAction<DrawingState>>,
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setDrawingState(prev => ({
    ...prev,
    strokeWidth: size
  }));
  setOpenDropdown(null);
};

// Function to handle opacity change
export const handleOpacityChange = (
  opacity: number,
  setDrawingState: React.Dispatch<React.SetStateAction<DrawingState>>,
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setDrawingState(prev => ({
    ...prev,
    opacity
  }));
  setOpenDropdown(null);
};

// Function to handle drawing tool change
export const handleToolChange = (
  tool: string,
  setDrawingState: React.Dispatch<React.SetStateAction<DrawingState>>,
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setDrawingState(prev => ({
    ...prev,
    tool
  }));
  setOpenDropdown(null);
};

// Function to handle shape change
export const handleShapeChange = (
  shape: string,
  setDrawingState: React.Dispatch<React.SetStateAction<DrawingState>>,
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setDrawingState(prev => ({
    ...prev,
    shape,
    tool: 'shape' // Automatically switch to shape drawing mode
  }));
  setOpenDropdown(null);
};

// Function to toggle dropdown
export const toggleDropdown = (
  menu: string,
  openDropdown: string | null,
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  if (openDropdown === menu) {
    setOpenDropdown(null);
  } else {
    setOpenDropdown(menu);
  }
};

// Helper to setup the close dropdown when clicking outside handler
export const setupClickOutsideHandler = (
  setOpenDropdown: React.Dispatch<React.SetStateAction<string | null>>
) => {
  const handleClickOutside = () => {
    setOpenDropdown(null);
  };

  document.addEventListener('click', handleClickOutside);
  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
};