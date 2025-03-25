import { ReactSketchCanvas } from 'react-sketch-canvas';

export interface SketchCanvas extends ReactSketchCanvas {
  clearCanvas: () => Promise<boolean>;
  loadPaths: (paths: any[]) => Promise<boolean>;
}

export interface RecordingData {
  history: string[];
  startTime: Date;
  endTime: Date;
}