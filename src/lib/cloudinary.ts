// src/lib/cloudinary.ts

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const uploadSessionRecording = async (videoBlob: Blob): Promise<string> => {
  try {
    console.log('Starting Cloudinary upload...');
    console.log(`Blob size: ${videoBlob.size} bytes, type: ${videoBlob.type}`);

    // Check if we have valid credentials
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      console.error('Missing Cloudinary credentials', {
        cloudName: CLOUDINARY_CLOUD_NAME ? 'set' : 'missing',
        uploadPreset: CLOUDINARY_UPLOAD_PRESET ? 'set' : 'missing'
      });
      throw new Error('Cloudinary configuration is incomplete');
    }

    const formData = new FormData();
    formData.append('file', videoBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('resource_type', 'video');
    formData.append('folder', 'session_recordings');

    // Add a timestamp to avoid caching issues
    const timestamp = new Date().getTime();
    formData.append('timestamp', (timestamp / 1000).toString());

    // Add a unique identifier to prevent collisions
    const uniqueId = `session_${timestamp}_${Math.floor(Math.random() * 1000)}`;
    formData.append('public_id', uniqueId);

    // Add video optimization parameters
    formData.append('eager', 'sp_auto/quality_auto'); // Smart processing and auto quality
    formData.append('eager_async', 'true');

    // Add transformation options to ensure compatibility
    formData.append('transformation', 'video_with_pad');

    console.log('Uploading to Cloudinary...');

    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { status: response.status, statusText: response.statusText };
      }

      console.error('Cloudinary error details:', errorData);
      throw new Error(`Upload failed: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('Upload successful:', result);

    // Make sure we're returning a valid URL
    if (!result.secure_url) {
      throw new Error('No secure URL returned from Cloudinary');
    }

    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error(`Failed to upload recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};