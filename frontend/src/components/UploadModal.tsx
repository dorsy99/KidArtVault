import React, { useEffect, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { api } from '../api/client';
import type { Artwork, Kid } from '../types';
import { PerspectiveCropper } from './PerspectiveCropper';
import { TagLocationPicker } from './TagLocationPicker';
import { CameraCapture } from './CameraCapture';
import { KidRadioSelector } from './KidRadioSelector';

interface UploadModalProps {
  kids: Kid[];
  defaultKidId?: number | null;
  onClose: () => void;
  onUploaded: (artwork: Artwork, options?: { keepOpen?: boolean }) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  kids,
  defaultKidId,
  onClose,
  onUploaded,
}) => {
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [step, setStep] = useState<'pick' | 'camera' | 'crop' | 'details'>('pick');
  const [lastCaptureSource, setLastCaptureSource] = useState<'pick' | 'camera'>('pick');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const [kidId, setKidId] = useState<number>(defaultKidId ?? kids[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [artworkDate, setArtworkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tags, setTags] = useState<string[]>([]);
  const [suggestedLocations, setSuggestedLocations] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.options.get().catch(() => ({ locations: [], tags: [] })),
      api.artworks.facets().catch(() => ({ locations: [], tags: [] })),
    ]).then(([opts, facets]) => {
      setSuggestedLocations(Array.from(new Set([...opts.locations, ...facets.locations])));
      setSuggestedTags(Array.from(new Set([...opts.tags, ...facets.tags])));
    });
  }, []);

  useEffect(() => {
    const target = croppedBlob ?? rawFile;
    if (!target) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(target);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [croppedBlob, rawFile]);

  const handleFileSelected = (file: File | undefined, source: 'pick' | 'camera' = 'pick') => {
    if (!file) return;
    setLastCaptureSource(source);
    setRawFile(file);
    setCroppedBlob(null);
    setStep('crop');
    setError('');
  };

  const saveArtwork = async (keepOpen: boolean) => {
    const uploadBlob = croppedBlob ?? rawFile;
    if (!uploadBlob) return;
    if (!kidId) {
      setError('Please add a child profile first.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      const filename = croppedBlob ? 'artwork-cropped.jpg' : rawFile?.name || 'artwork.jpg';
      fd.append('file', uploadBlob, filename);
      fd.append('kid_id', String(kidId));
      fd.append('title', title.trim());
      fd.append('location', location);
      fd.append('artwork_date', artworkDate);
      fd.append('tags', JSON.stringify(tags));
      fd.append('notes', notes);
      fd.append('is_favorite', String(isFavorite));

      const created = await api.artworks.upload(fd);
      onUploaded(created, { keepOpen });

      if (keepOpen) {
        setSavedCount((c) => c + 1);
        setRawFile(null);
        setCroppedBlob(null);
        setTitle('');
        setTags([]);
        setNotes('');
        setIsFavorite(false);
        setStep(lastCaptureSource);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveArtwork(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
            {step === 'pick' && 'Capture Artwork'}
            {step === 'camera' && 'Take Photo'}
            {step === 'crop' && 'Straighten & Crop'}
            {step === 'details' && 'Artwork Details'}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        {savedCount > 0 && (step === 'pick' || step === 'camera') && (
          <div className="success-banner" style={{ marginBottom: 12 }}>
            Saved {savedCount} {savedCount === 1 ? 'artwork' : 'artworks'}! Ready to capture the next one.
          </div>
        )}

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <button
              type="button"
              className="card"
              onClick={() => {
                setLastCaptureSource('camera');
                setStep('camera');
              }}
              style={{ padding: 28, textAlign: 'center', cursor: 'pointer', display: 'grid', gap: 10, placeItems: 'center' }}
            >
              <Camera size={34} color="var(--accent)" />
              <strong>Take Photo</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Open live camera for A4 sheets or easel paintings
              </span>
            </button>

            <label className="card" style={{ padding: 28, textAlign: 'center', cursor: 'pointer', display: 'grid', gap: 10, placeItems: 'center' }}>
              <Upload size={34} color="var(--sage)" />
              <strong>Choose from Device</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Pick an existing photo from your gallery or computer
              </span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFileSelected(e.target.files?.[0], 'pick');
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        {step === 'camera' && (
          <CameraCapture
            onCapture={(f) => handleFileSelected(f, 'camera')}
            onCancel={() => setStep('pick')}
            onFallbackFile={(f) => handleFileSelected(f, 'pick')}
          />
        )}

        {step === 'crop' && rawFile && (
          <PerspectiveCropper
            file={rawFile}
            onComplete={(blob) => {
              setCroppedBlob(blob);
              setStep('details');
            }}
            onUseOriginal={() => {
              setCroppedBlob(null);
              setStep('details');
            }}
          />
        )}

        {step === 'details' && (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            {previewUrl && (
              <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
                <img src={previewUrl} alt="Preview" style={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>Artist</label>
              <KidRadioSelector kids={kids} value={kidId} onChange={setKidId} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Date Created</label>
              <input
                type="date"
                className="input"
                value={artworkDate}
                onChange={(e) => setArtworkDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Title (optional)
              </label>
              <input
                className="input"
                placeholder="e.g. Rainbow Dinosaur (or leave blank)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <TagLocationPicker
              location={location}
              onLocationChange={setLocation}
              tags={tags}
              onTagsChange={setTags}
              suggestedLocations={suggestedLocations}
              suggestedTags={suggestedTags}
            />

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Story / Memory</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="What did they say about this picture?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={isFavorite} onChange={(e) => setIsFavorite(e.target.checked)} />
              Mark as favorite
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep('crop')} disabled={submitting}>
                Back to Crop
              </button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => saveArtwork(true)}
                  disabled={submitting || kids.length === 0}
                >
                  {submitting ? 'Saving...' : 'Save & Capture Next'}
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || kids.length === 0}>
                  {submitting ? 'Saving...' : 'Save to Vault'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
