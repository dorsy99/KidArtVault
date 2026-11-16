import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, X } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onFallbackFile: (file: File) => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  onFallbackFile,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API is not available in this browser or context (HTTPS/localhost required).');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? `Unable to access camera: ${err.message}`
            : 'Unable to access camera. Check browser permissions.',
        );
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode]);

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        const file = new File([blob], `artwork-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      },
      'image/jpeg',
      0.94,
    );
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="error-banner">{error}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Back
            </button>
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              <Upload size={16} />
              Choose Image File
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFallbackFile(f);
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              position: 'relative',
              background: '#1a1b26',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              maxHeight: '56dvh',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{ width: '100%', maxHeight: '56dvh', objectFit: 'contain', display: 'block' }}
            />
            {!ready && (
              <div style={{ position: 'absolute', color: '#fff', fontSize: '0.9rem' }}>
                Starting camera...
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            >
              <RefreshCw size={16} />
              Switch Camera
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  stopStream();
                  onCancel();
                }}
              >
                <X size={16} />
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSnap} disabled={!ready}>
                <Camera size={16} />
                Capture Photo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
