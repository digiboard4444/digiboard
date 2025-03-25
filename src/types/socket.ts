import { Socket } from 'socket.io-client';

export interface WhiteboardUpdate {
  teacherId: string;
  whiteboardData: string;
}

export interface TeacherStatus {
  teacherId: string;
  timestamp?: number; // Added timestamp for event ordering
}

export interface LiveError {
  message: string;
}

export interface AudioData {
  teacherId: string;
  audioData: string; // Base64 encoded audio data
}

export interface SessionEndedData {
  teacherId: string;
  hasAudio: boolean;
}

export interface AudioToggleData {
  teacherId: string;
  enabled: boolean;
}

export interface ServerToClientEvents {
  whiteboardUpdate: (data: WhiteboardUpdate) => void;
  teacherOnline: (data: TeacherStatus) => void;
  teacherOffline: (data: TeacherStatus) => void;
  liveError: (data: LiveError) => void;
  sessionEnded: (data: SessionEndedData) => void;
  audioToggle: (data: AudioToggleData) => void;
  audioAvailable: (data: { teacherId: string }) => void;
}

export interface ClientToServerEvents {
  checkTeacherStatus: () => void;
  startLive: (teacherId: string) => void;
  stopLive: (teacherId: string) => void;
  whiteboardUpdate: (data: WhiteboardUpdate) => void;
  joinTeacherRoom: (teacherId: string) => void;
  leaveTeacherRoom: (teacherId: string) => void;
  audioData: (data: AudioData) => void;
  sessionEnded: (data: SessionEndedData) => void;
  audioToggle: (data: AudioToggleData) => void;
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;