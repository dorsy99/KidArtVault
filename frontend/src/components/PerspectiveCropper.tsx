import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, Sparkles, Check, Maximize2 } from 'lucide-react';
import { rotateToCanvas, warpPerspective, type Point } from '../utils/perspective';

interface PerspectiveCropperProps {
  file: File;
  onComplete: (processedBlob: Blob) => void;
  onUseOriginal: () => void;
}

const DEFAULT_CORNERS: [Point, Point, Point, Point] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

export const PerspectiveCropper: React.FC<PerspectiveCropperProps> = ({
  file,
  onComplete,
  onUseOriginal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [rotation, setRotation] = useState(0);
  const [corners, setCorners] = useState<[Point, Point, Point, Point]>(DEFAULT_CORNERS);
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  // Load image once
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Redraw rotated preview whenever image or rotation changes
  useEffect(() => {
    if (!ready || !imgRef.current || !canvasRef.current) return;
    const rotated = rotateToCanvas(imgRef.current, rotation);
    sourceCanvasRef.current = rotated;

    const preview = canvasRef.current;
    preview.width = rotated.width;
    preview.height = rotated.height;
    const ctx = preview.getContext('2d')!;
    ctx.drawImage(rotated, 0, 0);
  }, [ready, rotation]);

  const updateCornerFromPointer = (idx: number, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.max(0.01, Math.min(0.99, (clientX - rect.left) / rect.width));
    const ny = Math.max(0.01, Math.min(0.99, (clientY - rect.top) / rect.height));
    setCorners((prev) => {
      const next = [...prev] as [Point, Point, Point, Point];
      next[idx] = { x: nx, y: ny };
      return next;
    });
  };

  const handleApply = async () => {
    if (!sourceCanvasRef.current) return;
    setProcessing(true);
    try {
      const blob = await warpPerspective(sourceCanvasRef.current, corners, autoEnhance);
      onComplete(blob);
    } finally {
      setProcessing(false);
    }
  };

  const pointsAttr = corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        Drag the 4 corners to match the edges of the paper or painting, then tap <strong>Crop &amp; Flatten</strong>.
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#1a1b26',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            display: 'inline-block',
            lineHeight: 0,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '55dvh',
              width: 'auto',
              height: 'auto',
            }}
          />

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <polygon
              points={pointsAttr}
              fill="rgba(224, 122, 95, 0.16)"
              stroke="#e07a5f"
              strokeWidth="0.7"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {corners.map((pt, idx) => (
            <div
              key={idx}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setActiveIdx(idx);
              }}
              onPointerMove={(e) => {
                if (activeIdx === idx) {
                  updateCornerFromPointer(idx, e.clientX, e.clientY);
                }
              }}
              onPointerUp={() => setActiveIdx(null)}
              onPointerCancel={() => setActiveIdx(null)}
              style={{
                position: 'absolute',
                left: `${pt.x * 100}%`,
                top: `${pt.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: activeIdx === idx ? '#e07a5f' : 'rgba(255,255,255,0.92)',
                border: '3px solid #e07a5f',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                cursor: 'grab',
                touchAction: 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <RotateCw size={16} />
            Rotate 90°
          </button>
          <button
            type="button"
            className={`btn ${autoEnhance ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAutoEnhance((v) => !v)}
          >
            <Sparkles size={16} />
            Paper Enhance
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setCorners(DEFAULT_CORNERS)}
          >
            Reset
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onUseOriginal} disabled={processing}>
            <Maximize2 size={16} />
            Use Full Image
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply} disabled={processing || !ready}>
            <Check size={16} />
            {processing ? 'Flattening...' : 'Crop & Flatten'}
          </button>
        </div>
      </div>
    </div>
  );
};
