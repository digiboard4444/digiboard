// brushUtils.ts - Simple utility functions for brush types

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
   * Draw a dashed line
   */
  export const drawDashedLine = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.size;
    ctx.globalAlpha = options.opacity;
    ctx.lineCap = 'butt';
    ctx.setLineDash([options.size * 2, options.size]);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.restore();
  };

  /**
   * Draw calligraphy stroke
   */
  export const drawCalligraphyStroke = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity;

    // Use 45 degrees angle for calligraphy effect
    const angle = Math.PI / 4;
    const width = options.size;

    // Calculate the four corners of the quadrilateral
    const x1 = from.x + Math.cos(angle) * width/2;
    const y1 = from.y + Math.sin(angle) * width/2;
    const x2 = from.x - Math.cos(angle) * width/2;
    const y2 = from.y - Math.sin(angle) * width/2;
    const x3 = to.x - Math.cos(angle) * width/2;
    const y3 = to.y - Math.sin(angle) * width/2;
    const x4 = to.x + Math.cos(angle) * width/2;
    const y4 = to.y + Math.sin(angle) * width/2;

    // Draw filled polygon
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };