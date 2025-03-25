const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const uploadSessionRecording = async (fileBlob: Blob): Promise<string> => {
  try {
    console.log('Starting Cloudinary upload...');
    console.log(`Blob size: ${fileBlob.size} bytes, type: ${fileBlob.type}`);

    // Check if we have valid Cloudinary credentials
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      console.error('Missing Cloudinary credentials', {
        cloudName: CLOUDINARY_CLOUD_NAME ? 'set' : 'missing',
        uploadPreset: CLOUDINARY_UPLOAD_PRESET ? 'set' : 'missing'
      });
      throw new Error('Cloudinary configuration is incomplete');
    }

    const formData = new FormData();
    formData.append('file', fileBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Determine if it's an image or video based on the blob type
    const isImage = fileBlob.type.startsWith('image/');
    formData.append('resource_type', isImage ? 'image' : 'video');

    // Set the folder based on content type
    formData.append('folder', isImage ? 'whiteboard_images' : 'session_recordings');

    // Add a unique public_id to avoid collisions
    const timestamp = new Date().getTime();
    const uniqueId = `${isImage ? 'whiteboard' : 'session'}_${timestamp}_${Math.floor(Math.random() * 1000)}`;
    formData.append('public_id', uniqueId);

    // Add a timestamp to avoid caching issues
    formData.append('timestamp', (timestamp / 1000).toString());

    // Add specific parameters for video processing if applicable
    if (!isImage) {
      // Set video optimization parameters
      formData.append('eager', 'sp_auto/quality_auto'); // Smart processing and auto quality
      formData.append('eager_async', 'true');
      formData.append('eager_notification_url', window.location.origin || 'https://example.com');
    }

    console.log('Uploading to Cloudinary URL:', CLOUDINARY_UPLOAD_URL);
    console.log('Resource type:', isImage ? 'image' : 'video');

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
    console.log('Upload successful, response:', result);

    // Make sure we're returning a valid URL
    if (!result.secure_url) {
      console.error('No secure_url in Cloudinary response', result);
      throw new Error('No secure URL returned from Cloudinary');
    }

    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error(`Failed to upload recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};