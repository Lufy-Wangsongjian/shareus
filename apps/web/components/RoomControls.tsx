export function RoomControls({ status }: { status: string }) {
  return (
    <div className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300">
      {status}
    </div>
  );
}
