"use client";

import { useEffect, useState } from "react";
import { createRoom, importVideo, listVideos, startTranscode } from "../lib/apiClient";

interface VideoRecord {
  id: string;
  title: string;
  sourceObjectPath: string;
  status: string;
}

export function VideoLibrary({ token }: { token: string }) {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [title, setTitle] = useState("");
  const [sourceObjectPath, setSourceObjectPath] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    setVideos(await listVideos(token));
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  async function submitImport() {
    await importVideo(token, { title, sourceObjectPath });
    setTitle("");
    setSourceObjectPath("");
    setNotice("视频已导入");
    await refresh();
  }

  async function submitRoom(videoId: string) {
    const room = await createRoom(token, { videoId, password: roomPassword });
    setNotice(`房间已创建：/room/${room.id}`);
  }

  async function submitTranscode(videoId: string) {
    try {
      await startTranscode(token, videoId);
      setNotice("转码已启动");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "转码启动失败");
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="grid gap-3 rounded-md border border-slate-800 bg-slate-950 p-4">
        <h1 className="text-2xl font-semibold">片库</h1>
        <input className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="片名" />
        <input className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={sourceObjectPath} onChange={(event) => setSourceObjectPath(event.target.value)} placeholder="uploads/movie.mp4" />
        <button className="rounded-md bg-white px-4 py-2 text-slate-950" onClick={submitImport}>导入 GCS 视频</button>
        {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      </div>
      <div className="mt-6 grid gap-3">
        {videos.map((video) => (
          <article className="rounded-md border border-slate-800 p-4" key={video.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-medium">{video.title}</h2>
                <p className="text-sm text-slate-400">{video.sourceObjectPath} · {video.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => submitTranscode(video.id)}>转码</button>
                <input className="w-36 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="房间密码" />
                <button className="rounded-md bg-white px-3 py-2 text-sm text-slate-950" disabled={video.status !== "ready"} onClick={() => submitRoom(video.id)}>创建房间</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
