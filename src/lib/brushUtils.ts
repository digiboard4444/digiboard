// Interface for brush strokes
export interface StrokePoint {
    x: number;
    y: number;
  }

  export interface BrushOptions {
    color: string;
    size: number;
    opacity: number;
  }

  /**
   * Draw a circular brush stroke (default)
   */
  export const drawCircleBrush = (
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity;

    // Draw a circle
    ctx.beginPath();
    ctx.arc(point.x, point.y, options.size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  /**
   * Draw a square brush stroke
   */
  export const drawSquareBrush = (
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity;

    // Draw a square
    const halfSize = options.size / 2;
    ctx.fillRect(point.x - halfSize, point.y - halfSize, options.size, options.size);

    ctx.restore();
  };

  /**
   * Draw a triangle brush stroke
   */
  export const drawTriangleBrush = (
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity;

    // Draw a triangle
    const size = options.size;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - size / 2); // Top point
    ctx.lineTo(point.x - size / 2, point.y + size / 2); // Bottom left
    ctx.lineTo(point.x + size / 2, point.y + size / 2); // Bottom right
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };