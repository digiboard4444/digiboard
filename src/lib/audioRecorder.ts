import { FFmpeg } from '@ffmpeg/ffmpeg';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private ffmpeg: FFmpeg | null = null;
  private isRecording = false;
  private isInitialized = false;

  constructor() {}

  private async init() {
    // Skip FFmpeg initialization entirely - we'll just record audio
    // We'll handle FFmpeg in a separate service if needed
    this.isInitialized = true;
    return true;
  }

  public async startRecording(): Promise<void> {
    // Don't try to initialize FFmpeg - it's causing worker issues
    this.isInitialized = true;

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder with audio stream
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];

      // Listen for data available event
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data in 1-second chunks
      this.isRecording = true;
      console.log('Audio recording started');
    } catch (error) {
      console.error('Error starting audio recording:', error);
      // Don't throw here - instead return without an exception
      // This prevents the socket connection from being affected
    }
  }

  public async stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        // Return an empty blob instead of rejecting
        console.warn('No recording in progress, returning empty blob');
        resolve(new Blob([], { type: 'audio/webm' }));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          // Clean up tracks
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
          }

          // Create audio blob
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.isRecording = false;
          console.log('Audio recording stopped, blob size:', audioBlob.size);
          resolve(audioBlob);
        } catch (error) {
          console.error('Error finalizing audio recording:', error);
          // Return an empty blob instead of rejecting
          resolve(new Blob([], { type: 'audio/webm' }));
        }
      };

      this.mediaRecorder.stop();
    });
  }

  // We'll skip the mergeAudioAndVideo method for now as it's causing FFmpeg issues
  // This will just return the video blob for now
  public async mergeAudioAndVideo(audioBlob: Blob, videoBlob: Blob): Promise<Blob> {
    console.log('Audio/video merge is disabled due to FFmpeg issues');
    return videoBlob;
  }
}