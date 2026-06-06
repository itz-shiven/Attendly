'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, X } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose?: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    setIsLoading(true);
    setError(null);

    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: unknown) {
        console.error('Camera access error:', err);
        setError('Could not access camera. Please allow permissions or upload a file.');
      } finally {
        setIsLoading(false);
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Toggle camera face (front vs back)
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Capture the photo
  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw the video frame to the canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setCapturedImage(dataUrl);

        // Turn off camera stream to save power
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          setStream(null);
        }
      }
    }
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedImage(null);
    setFacingMode('environment'); // Reset to default back camera
  };

  // Approve and submit photo
  const acceptPhoto = async () => {
    if (capturedImage) {
      try {
        const response = await fetch(capturedImage);
        const blob = await response.blob();
        onCapture(blob);
      } catch (err) {
        console.error('Failed to process image blob:', err);
        setError('Failed to process photo. Please try again.');
      }
    }
  };

  return (
    <div className="flex flex-col items-center bg-zinc-900 text-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-md mx-auto border border-zinc-800">
      {/* Video View or Capture Preview */}
      <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center">
        {capturedImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={capturedImage}
            alt="Captured labor"
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
          />
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-emerald-500"></div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center">
            <p className="text-red-400 text-sm mb-4 font-semibold">{error}</p>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="w-full p-4 bg-zinc-950 flex flex-col gap-4 border-t border-zinc-800">
        {capturedImage ? (
          <div className="flex justify-around items-center w-full">
            <button
              type="button"
              onClick={retakePhoto}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-colors text-zinc-300 font-semibold min-h-[48px]"
            >
              <X className="w-5 h-5 text-red-400" />
              Retake
            </button>
            <button
              type="button"
              onClick={acceptPhoto}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 rounded-xl hover:bg-emerald-500 transition-colors text-white font-semibold min-h-[48px]"
            >
              <Check className="w-5 h-5 text-emerald-100" />
              Use Photo
            </button>
          </div>
        ) : (
          <div className="flex justify-between items-center w-full px-2">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="p-3 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                title="Cancel"
              >
                <X className="w-5 h-5 text-zinc-300" />
              </button>
            ) : (
              <div className="w-12" />
            )}

            <button
              type="button"
              disabled={isLoading || !!error}
              onClick={capturePhoto}
              className="flex items-center justify-center p-5 bg-white text-zinc-950 rounded-full hover:scale-105 active:scale-95 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:scale-100 transition-all shadow-lg min-h-[60px] min-w-[60px]"
              title="Capture Photo"
            >
              <Camera className="w-8 h-8" />
            </button>

            <button
              type="button"
              disabled={isLoading || !!error}
              onClick={toggleFacingMode}
              className="p-3 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center disabled:bg-zinc-850 disabled:text-zinc-600"
              title="Switch Camera"
            >
              <RefreshCw className="w-5 h-5 text-zinc-300" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
