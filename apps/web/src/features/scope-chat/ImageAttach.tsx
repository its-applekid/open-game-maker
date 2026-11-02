import { useRef, useState } from 'react';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2048;

export function ImageAttach({
  onReady,
  resize = resizeImage,
}: {
  onReady(image: Blob): Promise<void> | void;
  resize?: (file: File) => Promise<Blob>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('Choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice('Choose an image smaller than 10 MB.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await onReady(await resize(file));
    } catch {
      setNotice('The image could not be attached.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={input}
        className="sr"
        type="file"
        accept="image/*"
        aria-label="Choose a drawing"
        onChange={(event) => void attach(event.target.files?.[0])}
      />
      <button className="scope-attach tap-secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Attaching…' : 'Attach drawing'}
      </button>
      {notice ? <span role="status">{notice}</span> : null}
    </>
  );
}

export function fitImageWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function resizeImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const size = fitImageWithin(image.naturalWidth, image.naturalHeight);
    if (size.width === image.naturalWidth && size.height === image.naturalHeight) return file;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image conversion failed'))), 'image/webp', 0.9),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = url;
  });
}
