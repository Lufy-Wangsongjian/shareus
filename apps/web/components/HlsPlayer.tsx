"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export function HlsPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    setError(null);

    function onVideoError() {
      setError("视频加载失败，请刷新页面重试");
    }

    video.addEventListener("error", onVideoError);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return () => video.removeEventListener("error", onVideoError);
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError("视频加载失败，请刷新页面重试");
        }
      });
      return () => {
        hls.destroy();
        video.removeEventListener("error", onVideoError);
      };
    }

    setError("当前浏览器不支持 HLS 播放");
    return () => video.removeEventListener("error", onVideoError);
  }, [src]);

  return (
    <div className="space-y-2">
      <video ref={ref} className="aspect-video w-full bg-black" controls playsInline />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
