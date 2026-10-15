import { memo, useEffect, useRef } from 'react';

export const MediaVideo = memo(function MediaVideo({ stream, visible = true, className }: { stream: MediaStream; visible?: boolean; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (visible) void video.play().catch(() => undefined);
    else video.pause();
    return () => { video.pause(); video.srcObject = null; };
  }, [stream, visible]);
  return <video ref={videoRef} muted autoPlay playsInline className={className} />;
});
