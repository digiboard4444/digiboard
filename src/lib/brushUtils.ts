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
 * Draws a dotted circle brush at the given point
 */
export const drawDottedCircleBrush = (
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  options: BrushOptions
) => {
  const { x, y } = point;
  const { color, size, opacity } = options;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = Math.max(1, size / 8);  // Adjust line width based on size

  // Create dotted line effect
  ctx.setLineDash([size / 4, size / 3]);  // Set dot and gap sizes relative to brush size

  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};