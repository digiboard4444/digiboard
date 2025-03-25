export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface BrushOptions {
  color: string;
  size: number;
  opacity: number;
}

/**
 * Draws a regular circle brush at the given point
 */
export const drawCircleBrush = (
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  options: BrushOptions
) => {
  const { x, y } = point;
  const { color, size, opacity } = options;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/**
 * Draws a dotted line brush at the given point
 * Creates a pattern that alternates between the selected color and white
 */
export const drawDottedLineBrush = (
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  options: BrushOptions
) => {
  const { x, y } = point;
  const { color, size, opacity } = options;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = size;  // Use the selected size as line width

  // Create dotted line effect - 2px selected color, 2px white
  ctx.setLineDash([2, 2]);  // 2px dash, 2px gap

  // Draw a short line segment centered at the point
  const lineLength = size * 2;
  ctx.beginPath();
  ctx.moveTo(x - lineLength/2, y);
  ctx.lineTo(x + lineLength/2, y);
  ctx.stroke();

  ctx.restore();
}