/*
 * PresendImageOps — reusable, chainable client-side image operations.
 * Every function takes a Blob/File in and returns a Promise<Blob> out,
 * so operations can be composed into workflows. Nothing ever leaves
 * the browser: all processing happens via <canvas>.
 */
(function (global) {

  function loadImage(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => { resolve({ img, objectUrl }); };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This file could not be read as an image.')); };
      img.src = objectUrl;
    });
  }

  // Strips ALL metadata (EXIF, GPS, XMP, thumbnails) by redrawing onto a
  // blank canvas — the canvas only ever holds raw pixel data.
  async function stripMetadata(fileOrBlob, opts = {}) {
    const { img, objectUrl } = await loadImage(fileOrBlob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const sourceType = fileOrBlob.type || 'image/jpeg';
      const outputType = opts.outputType || (sourceType === 'image/png' ? 'image/png' : 'image/jpeg');
      const quality = outputType === 'image/jpeg' ? (opts.quality || 0.92) : undefined;
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Could not process this image.')); return; }
          resolve(blob);
        }, outputType, quality);
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // Re-encodes at a given quality/format. quality is 0-100 (matches the
  // existing image-compressor.html slider convention).
  async function compressImage(fileOrBlob, quality, outputType) {
    const { img, objectUrl } = await loadImage(fileOrBlob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const type = outputType || (fileOrBlob.type === 'image/png' ? 'image/png' : fileOrBlob.type) || 'image/jpeg';
      const q = type === 'image/png' ? undefined : (Number(quality) || 80) / 100;
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Could not compress this image.')); return; }
          resolve(blob);
        }, type, q);
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // Converts a HEIC/HEIF blob to JPEG using heic2any (must be loaded first,
  // via /vendor/heic2any.min.js).
  async function convertHeicToJpg(fileOrBlob, quality) {
    const result = await heic2any({
      blob: fileOrBlob,
      toType: 'image/jpeg',
      quality: (quality != null ? quality : 92) / 100
    });
    // heic2any can return an array of blobs for multi-image HEIC files;
    // only the first frame is handled here, matching heic-converter.html.
    return Array.isArray(result) ? result[0] : result;
  }

  global.PresendImageOps = { stripMetadata, compressImage, convertHeicToJpg };
})(window);
