/**
 * QR-Code mit der Kamera lesen
 */

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  onResult: (text: string) => void;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onResult }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && context && video.readyState >= 2 && video.videoWidth > 0) {
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (result?.data) {
          onResultRef.current(result.data);
        }
      }
      frame = requestAnimationFrame(scan);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Dieses Gerät erlaubt hier keinen Zugriff auf die Kamera. Tippe den Code stattdessen ein.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        frame = requestAnimationFrame(scan);
      } catch (cause) {
        const name = (cause as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Die Kamera ist für diese App gesperrt. Erlaube den Zugriff in den Einstellungen des Browsers oder tippe den Code ein.'
            : 'Die Kamera konnte nicht gestartet werden. Tippe den Code stattdessen ein.'
        );
      }
    };

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) {
    return (
      <div className="note" role="alert">
        <p className="small">{error}</p>
      </div>
    );
  }

  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted aria-label="Kamerabild zum Scannen des Codes" />
    </div>
  );
};
