const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const uploadSessionRecording = async (videoBlob: Blob): Promise<string> => {
  try {
    console.log('Starting Cloudinary upload...');

    const formData = new FormData();
    formData.append('file', videoBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('resource_type', 'video');
    formData.append('folder', 'session_recordings');

    console.log('Uploading to Cloudinary...');

    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Cloudinary error details:', errorData);
      throw new Error(`Upload failed: ${errorData.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();
    console.log('Upload successful:', result);
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Failed to upload recording');
  }
};