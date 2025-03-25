import { FFmpeg } from '@ffmpeg/ffmpeg';

interface StrokePath {
  paths: Array<{
    drawMode: boolean;
    strokeColor: string;
    strokeWidth: number;
    paths: Array<{ x: number; y: number }>;
  }>;
}

export class StrokeRecorder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ffmpeg = new FFmpeg();
  private frameRate = 30;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = ctx;
  }

  private async init() {
    if (!this.ffmpeg.loaded) {
      await this.ffmpeg.load();
    }
  }

  private drawPath(path: StrokePath['paths'][0], progress: number) {
    if (!path.paths.length) return;

    this.ctx.beginPath();
    this.ctx.strokeStyle = path.strokeColor;
    this.ctx.lineWidth = path.strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const pointCount = Math.floor(path.paths.length * progress);

    for (let i = 0; i < pointCount; i++) {
      const point = path.paths[i];
      if (i === 0) {
        this.ctx.moveTo(point.x, point.y);
      } else {
        this.ctx.lineTo(point.x, point.y);
      }
    }

    this.ctx.stroke();
  }

  private async createFrame(paths: StrokePath['paths'], progress: number): Promise<Uint8Array> {
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.width, this.height);

    paths.forEach((path, index) => {
      const pathProgress = progress > (index + 1) / paths.length ? 1 :
                          progress < index / paths.length ? 0 :
                          (progress * paths.length) - index;
      this.drawPath(path, pathProgress);
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve) => {
      this.canvas.toBlob((b) => resolve(b!), 'image/png');
    });

    // Convert blob to Uint8Array
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  public async recordStrokes(paths: StrokePath['paths']): Promise<Blob> {
    await this.init();

    const totalFrames = this.frameRate * 5; // 5 seconds video
    const frames: Uint8Array[] = [];

    // Generate frames
    for (let i = 0; i <= totalFrames; i++) {
      const progress = i / totalFrames;
      const frameData = await this.createFrame(paths, progress);
      frames.push(frameData);
    }

    // Write frames to FFmpeg
    for (let i = 0; i < frames.length; i++) {
      await this.ffmpeg.writeFile(`frame${i}.png`, frames[i]);
    }

    // Generate video from frames
    await this.ffmpeg.exec([
      '-framerate', `${this.frameRate}`,
      '-i', 'frame%d.png',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      'output.mp4'
    ]);

    // Get the output video
    const data = await this.ffmpeg.readFile('output.mp4');

    // Cleanup
    for (let i = 0; i < frames.length; i++) {
      await this.ffmpeg.deleteFile(`frame${i}.png`);
    }
    await this.ffmpeg.deleteFile('output.mp4');

    return new Blob([data], { type: 'video/mp4' });
  }
}