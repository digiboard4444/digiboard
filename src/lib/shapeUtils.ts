// Shape drawing utilities

// Interface for shape points
export interface ShapePoints {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }

  // Interface for shape drawing options
  export interface ShapeOptions {
    color: string;
    strokeWidth: number;
    opacity: number;
    fill?: boolean;
  }

  // Draw a rectangle on the canvas context
  export const drawRectangle = (
    ctx: CanvasRenderingContext2D,
    points: ShapePoints,
    options: ShapeOptions
  ) => {
    const { startX, startY, endX, endY } = points;
    const width = endX - startX;
    const height = endY - startY;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.strokeWidth;
    ctx.globalAlpha = options.opacity;

    ctx.rect(startX, startY, width, height);

    if (options.fill) {
      ctx.fillStyle = options.color;
      ctx.fill();
    }

    ctx.stroke();
    ctx.restore();
  };

  // Draw a triangle on the canvas context
  export const drawTriangle = (
    ctx: CanvasRenderingContext2D,
    points: ShapePoints,
    options: ShapeOptions
  ) => {
    const { startX, startY, endX, endY } = points;

    // Calculate triangle points
    // Using the start point as top vertex, and creating a base along the bottom
    const topX = startX + (endX - startX) / 2;
    const topY = startY;
    const leftX = startX;
    const leftY = endY;
    const rightX = endX;
    const rightY = endY;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.strokeWidth;
    ctx.globalAlpha = options.opacity;

    // Draw the triangle path
    ctx.moveTo(topX, topY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.lineTo(topX, topY);

    if (options.fill) {
      ctx.fillStyle = options.color;
      ctx.fill();
    }

    ctx.stroke();
    ctx.restore();
  };

  // Draw a selected shape on the canvas
  export const drawShape = (
    ctx: CanvasRenderingContext2D,
    shapeType: string,
    points: ShapePoints,
    options: ShapeOptions
  ) => {
    switch (shapeType) {
      case 'rectangle':
        drawRectangle(ctx, points, options);
        break;
      case 'triangle':
        drawTriangle(ctx, points, options);
        break;
      default:
        // Default to rectangle if shape type is not recognized
        drawRectangle(ctx, points, options);
    }
  };

  // Create an SVG representation of a shape (useful for exporting or rendering)
  export const createShapeSVG = (
    shapeType: string,
    points: ShapePoints,
    options: ShapeOptions
  ): string => {
    const { startX, startY, endX, endY } = points;
    const { color, strokeWidth, opacity, fill } = options;

    switch (shapeType) {
      case 'rectangle': {
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);

        return `<rect x="${x}" y="${y}" width="${width}" height="${height}"
          stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}"
          fill="${fill ? color : 'none'}" fill-opacity="${fill ? opacity : 0}" />`;
      }
      case 'triangle': {
        const topX = startX + (endX - startX) / 2;
        const topY = Math.min(startY, endY);
        const leftX = Math.min(startX, endX);
        const leftY = Math.max(startY, endY);
        const rightX = Math.max(startX, endX);
        const rightY = Math.max(startY, endY);

        return `<polygon points="${topX},${topY} ${leftX},${leftY} ${rightX},${rightY}"
          stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}"
          fill="${fill ? color : 'none'}" fill-opacity="${fill ? opacity : 0}" />`;
      }
      default:
        return '';
    }
  };