// brushUtils.ts - Utility functions for advanced brush types

// Interface for brush strokes
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
   * Draw a dotted line
   */
  export const drawDottedLine = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.size;
    ctx.globalAlpha = options.opacity;
    ctx.lineCap = 'round';
    ctx.setLineDash([options.size / 2, options.size * 1.5]);

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
    options: BrushOptions,
    angle: number = Math.PI / 4 // 45 degrees default
  ) => {
    ctx.save();

    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity;

    const width = options.size;

    // Calculate stroke segment corners based on angle
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

  /**
   * Draw marker stroke
   */
  export const drawMarkerStroke = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    // Markers are usually semi-transparent
    const markerOpacity = Math.min(0.7, options.opacity);
    ctx.globalAlpha = markerOpacity;
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.size * 1.5; // Markers are typically wider
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.restore();
  };

  /**
   * Draw pencil stroke with texture
   */
  export const drawPencilStroke = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.strokeStyle = options.color;
    ctx.lineWidth = Math.max(1, options.size * 0.8); // Pencils are slightly thinner
    ctx.globalAlpha = options.opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The main stroke
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Add some "graininess" to simulate pencil texture
    const jitter = options.size * 0.15;
    const distance = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
    const steps = Math.max(1, Math.floor(distance / 2));

    ctx.globalAlpha = options.opacity * 0.4; // Lighter for the texture

    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      const x = from.x + (to.x - from.x) * ratio;
      const y = from.y + (to.y - from.y) * ratio;

      ctx.beginPath();
      ctx.arc(
        x + (Math.random() - 0.5) * jitter,
        y + (Math.random() - 0.5) * jitter,
        Math.random() * options.size * 0.2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  };

  /**
   * Draw airbrush / spray effect
   */
  export const drawSprayStroke = (
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    ctx.fillStyle = options.color;
    ctx.globalAlpha = options.opacity * 0.05; // Very light for spray particles

    const radius = options.size * 2;
    const density = Math.floor(options.size * 5); // Number of particles

    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;

      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance;

      const particleSize = Math.random() * options.size * 0.2;

      ctx.beginPath();
      ctx.arc(x, y, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  /**
   * Draw watercolor effect with overlapping transparent areas
   */
  export const drawWatercolorStroke = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    // Parse the color to RGB components
    let r = 0, g = 0, b = 0;
    if (options.color.startsWith('#')) {
      r = parseInt(options.color.substring(1, 3), 16);
      g = parseInt(options.color.substring(3, 5), 16);
      b = parseInt(options.color.substring(5, 7), 16);
    }

    const distance = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
    const steps = Math.max(3, Math.floor(distance / (options.size * 0.5)));

    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const x = from.x + (to.x - from.x) * ratio;
      const y = from.y + (to.y - from.y) * ratio;

      // Draw multiple overlapping transparent circles for watercolor effect
      for (let j = 0; j < 3; j++) {
        const radius = options.size * (0.7 + Math.random() * 0.6);
        const offsetX = (Math.random() - 0.5) * options.size * 0.5;
        const offsetY = (Math.random() - 0.5) * options.size * 0.5;

        // Vary the color slightly for more realistic effect
        const colorVar = 15;
        const rVar = Math.min(255, Math.max(0, r + (Math.random() - 0.5) * colorVar));
        const gVar = Math.min(255, Math.max(0, g + (Math.random() - 0.5) * colorVar));
        const bVar = Math.min(255, Math.max(0, b + (Math.random() - 0.5) * colorVar));

        ctx.fillStyle = `rgba(${rVar}, ${gVar}, ${bVar}, ${options.opacity * 0.1})`;
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  };

  /**
   * Draw highlighter stroke with semi-transparent layer
   */
  export const drawHighlighterStroke = (
    ctx: CanvasRenderingContext2D,
    from: StrokePoint,
    to: StrokePoint,
    options: BrushOptions
  ) => {
    ctx.save();

    // Highlighters are very transparent
    ctx.globalAlpha = Math.min(0.3, options.opacity);
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.size * 2;
    ctx.lineCap = 'square';

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.restore();
  };