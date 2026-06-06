import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compresses an image file client-side using the Canvas API.
 * Reduces file size significantly before uploading to Supabase Storage.
 */
export function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'));
        }

        // Draw image into the canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export to Blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas compression failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
  });
}

/**
 * Mask Aadhaar number to display only the last 4 digits.
 * Example: "123456789012" -> "•••• •••• 9012"
 */
export function maskAadhaar(aadhaar: string): string {
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length < 4) return clean;
  const last4 = clean.slice(-4);
  return `•••• •••• ${last4}`;
}

/**
 * Mask PAN number to display only the last 4 digits.
 * Example: "ABCDE1234F" -> "••••••1234"
 */
export function maskPan(pan: string): string {
  const clean = pan.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (clean.length < 4) return clean;
  const last4 = clean.slice(-4);
  return `••••••${last4}`;
}

/**
 * Format Aadhaar input with spaces: "1234-5678-9012"
 */
export function formatAadhaar(val: string): string {
  const clean = val.replace(/\D/g, '').slice(0, 12);
  const parts = [];
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.substring(i, i + 4));
  }
  return parts.join('-');
}

/**
 * Format PAN input as uppercase and alphanumeric: "ABCDE1234F"
 */
export function formatPan(val: string): string {
  return val.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
}
