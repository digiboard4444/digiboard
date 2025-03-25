import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private ffmpeg: FFmpeg | null = null;
  private isRecording = false;
  private isInitialized = false;

  constructor() {}

  private async init() {
    // If already initialized, return early to prevent duplicate initialization
    if (this.isInitialized) return true;

    if (!this.ffmpeg) {
      this.ffmpeg = new FFmpeg();

      try {
        // Host the FFmpeg files locally rather than using unpkg.com
        // This avoids CORS and service unavailability issues
        const baseURL = '/assets/ffmpeg';

        await this.ffmpeg.load({
          coreURL: `${baseURL}/ffmpeg-core.js`,
          wasmURL: `${baseURL}/ffmpeg-core.wasm`,
          workerURL: `${baseURL}/ffmpeg-core.worker.js`,
          logger: () => {}, // Silent logger
        });

        this.isInitialized = true;
        console.log('FFmpeg loaded successfully');
        return true;
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        // Even if FFmpeg fails, don't throw an exception here
        // We'll handle this differently to avoid interrupting the socket connection
        return false;
      }
    }

    return true;
  }

  public async startRecording(): Promise<void> {
    // Try to initialize FFmpeg, but don't throw if it fails
    const ffmpegInitialized = await this.init().catch(err => {
      console.warn('FFmpeg initialization failed, continuing with audio only:', err);
      return false;
    });

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
    return new Promise((resolve, reject) => {
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

  public async mergeAudioAndVideo(audioBlob: Blob, videoBlob: Blob): Promise<Blob> {
    // Try to initialize FFmpeg, but if it fails, just return the video blob
    const ffmpegInitialized = await this.init().catch(err => {
      console.warn('FFmpeg initialization failed, returning video only:', err);
      return false;
    });

    if (!ffmpegInitialized || !this.ffmpeg) {
      console.warn('FFmpeg not available, returning video only');
      return videoBlob;
    }

    try {
      console.log('Starting audio/video merge...');

      // Convert audio blob to arrayBuffer
      const audioData = new Uint8Array(await audioBlob.arrayBuffer());
      // Convert video blob to arrayBuffer
      const videoData = new Uint8Array(await videoBlob.arrayBuffer());

      // Write files to FFmpeg virtual filesystem
      await this.ffmpeg.writeFile('audio.webm', audioData);
      await this.ffmpeg.writeFile('video.mp4', videoData);

      // Execute FFmpeg command to merge audio and video
      // -shortest will end the output when the shortest input stream ends
      await this.ffmpeg.exec([
        '-i', 'video.mp4',
        '-i', 'audio.webm',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        'output.mp4'
      ]);

      // Read the output file
      const data = await this.ffmpeg.readFile('output.mp4');

      // Clean up
      await this.ffmpeg.deleteFile('audio.webm');
      await this.ffmpeg.deleteFile('video.mp4');
      await this.ffmpeg.deleteFile('output.mp4');

      console.log('Audio and video merge complete');
      return new Blob([data], { type: 'video/mp4' });
    } catch (error) {
      console.error('Error merging audio and video:', error);
      // If any error occurs during merging, return the original video
      return videoBlob;
    }
  }
}