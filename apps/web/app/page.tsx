import Link from "next/link";

interface PublicRoom {
  id: string;
  videoTitle: string;
  createdAt: string;
}

async function fetchOpenRooms(): Promise<PublicRoom[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
  try {
    const response = await fetch(`${base}/api/rooms`, { next: { revalidate: 15 } });
    if (!response.ok) {
      return [];
    }
    return response.json() as Promise<PublicRoom[]>;
  } catch {
    return [];
  }
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function HomePage() {
  const rooms = await fetchOpenRooms();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-12">
      <p className="text-sm text-slate-400">Shareus</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-normal">私人双人观影房间</h1>
      <p className="mt-3 max-w-2xl text-slate-400">选择下方房间进入，输入密码即可开始观影。</p>
      <div className="mt-8 flex gap-3">
        <Link className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950" href="/admin">进入管理页</Link>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-medium">开放中的房间</h2>
        {rooms.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">暂无开放房间。管理员可在管理页创建房间。</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-600 sm:flex-row sm:items-center sm:justify-between"
                  href={`/room/${room.id}`}
                >
                  <div>
                    <p className="font-medium">{room.videoTitle}</p>
                    <p className="text-sm text-slate-400">创建于 {formatCreatedAt(room.createdAt)}</p>
                  </div>
                  <span className="text-sm text-emerald-300">进入房间 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
