import { Socket } from 'socket.io-client';

export interface WhiteboardUpdate {
  teacherId: string;
  whiteboardData: string;
}

export interface TeacherStatus {
  teacherId: string;
}

export interface LiveError {
  message: string;
}

export interface ServerToClientEvents {
  whiteboardUpdate: (data: WhiteboardUpdate) => void;
  teacherOnline: (data: TeacherStatus) => void;
  teacherOffline: (data: TeacherStatus) => void;
  liveError: (data: LiveError) => void;
}

export interface ClientToServerEvents {
  checkTeacherStatus: () => void;
  startLive: (teacherId: string) => void;
  stopLive: (teacherId: string) => void;
  whiteboardUpdate: (data: WhiteboardUpdate) => void;
  joinTeacherRoom: (teacherId: string) => void;
  leaveTeacherRoom: (teacherId: string) => void;
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;