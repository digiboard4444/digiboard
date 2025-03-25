import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private ffmpeg: FFmpeg | null = null;
  private isRecording = false;

  constructor() {}

  private async init() {
    if (!this.ffmpeg) {
      this.ffmpeg = new FFmpeg();

      try {
        // Use toBlobURL to avoid CORS issues
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm';

        const coreURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          'text/javascript',
        );

        const wasmURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm',
        );

        // Optional: worker URL if needed
        const workerURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.worker.js`,
          'text/javascript',
        );

        await this.ffmpeg.load({
          coreURL,
          wasmURL,
          workerURL,
          logger: () => {}, // Silent logger
        });

        console.log('FFmpeg loaded successfully');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        throw new Error('Failed to initialize audio processor');
      }
    }
  }

  public async startRecording(): Promise<void> {
    try {
      await this.init();

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
      throw new Error('Failed to start audio recording');
    }
  }

  public async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('No recording in progress'));
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
          reject(error);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  public async mergeAudioAndVideo(audioBlob: Blob, videoBlob: Blob): Promise<Blob> {
    await this.init();

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
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
      throw new Error('Failed to merge audio and video');
    }
  }
}