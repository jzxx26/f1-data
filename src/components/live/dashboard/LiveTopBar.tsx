"use client";

import { useLiveControls, useLiveRecordings } from "@/hooks/useLive";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { PRESETS, WIDGETS, type Layout, type WidgetId } from "./layouts";
import { useLiveData } from "./LiveData";

const FLAG_STYLES: Record<string, string> = {
  GREEN: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  YELLOW: "bg-yellow-400/15 text-yellow-200 ring-yellow-300/30",
  "SAFETY CAR": "bg-amber-500/20 text-amber-200 ring-amber-400/40",
  VSC: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
  RED: "bg-red-500/20 text-red-200 ring-red-400/40",
};
const FLAG_LABEL: Record<string, string> = { "SAFETY CAR": "SC" };
const SPEEDS = [1, 5, 20, 60];
const STALE_AFTER_S = 30;

interface LiveTopBarProps {
  layout: Layout;
  saved: Record<string, Layout>;
  editing: boolean;
  notice: string | null;
  onEditing: (editing: boolean) => void;
  onApply: (layout: Layout) => void;
  onAdd: (id: WidgetId) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
}

const control =
  "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/[0.08]";

export function LiveTopBar({ layout, saved, editing, notice, onEditing, onApply, onAdd, onSave, onDelete }: LiveTopBarProps) {
  const { status, snapshot, order, focus, setFocus } = useLiveData();
  const { start, stop, pause, resume, speed: setReplaySpeed, seek } = useLiveControls();
  const recordings = useLiveRecordings(Boolean(status?.enabled));
  const [speed, setSpeed] = useState(5);
  const [file, setFile] = useState("");
  const replay = status?.mode === "replay" ? status.replay : undefined;
  const lapOptions = replay?.laps
    ? Array.from({ length: replay.laps[1] - replay.laps[0] + 1 }, (_, i) => replay.laps![0] + i)
    : [];
  const failure = [start, stop, pause, resume, setReplaySpeed, seek].find((m) => m.error)?.error as Error | undefined;
  const [name, setName] = useState("");
  const session = snapshot?.session;
  const stale = session?.data_age_s != null && session.data_age_s > STALE_AFTER_S;
  const missing = (Object.keys(WIDGETS) as WidgetId[]).filter((id) => !layout.some((item) => item.i === id));
  const token = status?.token;
  const days = token?.expires ? Math.floor((new Date(token.expires).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-white/5 bg-black/40 px-3 py-1.5">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
          status?.mode === "live" ? "bg-red-500/20 text-red-200" : "bg-white/5 text-white/60"
        )}
        title={status?.text}
      >
        {status?.mode === "live" ? "Live" : status?.mode === "replay" ? "Replay" : "Off"}
      </span>
      {status?.mode === "live" && status.recording ? (
        <span
          className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-200"
          title={`Recording to backend/recordings/${status.recording.folder} (${status.recording.messages} messages)`}
        >
          REC
        </span>
      ) : null}
      {status?.recording_error ? <span className="text-[10px] text-red-300">{status.recording_error}</span> : null}
      {session ? (
        <>
          <span className="text-sm font-semibold text-white">{session.gp}</span>
          <span className="text-[11px] text-white/45">{session.session_name}</span>
          {session.current_lap ? (
            <span className="tabular-nums text-sm text-white">
              L{session.current_lap}
              {session.total_laps ? <span className="text-white/40">/{session.total_laps}</span> : null}
            </span>
          ) : null}
          {session.clock_remaining ? <span className="tabular-nums text-sm text-white/80">{session.clock_remaining}</span> : null}
          <span
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", FLAG_STYLES[session.flag] ?? "bg-white/5 text-white/70 ring-white/10")}
            title={session.track_message ?? undefined}
          >
            {FLAG_LABEL[session.flag] ?? session.flag}
          </span>
          <span className={cn("text-[10px]", stale ? "text-amber-200" : "text-white/40")}>
            {session.data_age_s == null ? "no update yet" : stale ? `no update for ${Math.round(session.data_age_s)} s` : `${Math.round(session.data_age_s)} s ago`}
          </span>
        </>
      ) : (
        <span className="text-[11px] text-white/50">{status?.text ?? "Connecting to the backend…"}</span>
      )}

      {order.length ? (
        <label className="ml-2 flex items-center gap-1.5 text-[11px] text-white/50">
          Focus
          <select value={focus ?? ""} onChange={(e) => setFocus(e.target.value)} className={control}>
            {order.map((code, index) => (
              <option key={code} value={code} className="bg-[#0a0a0c]">
                P{index + 1} {code}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {notice ? <span className="text-[11px] text-amber-200">{notice}</span> : null}
        <select
          aria-label="Layout"
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (value.startsWith("preset:")) onApply(PRESETS[value.slice(7)]);
            if (value.startsWith("saved:")) onApply(saved[value.slice(6)]);
            if (value.startsWith("delete:")) onDelete(value.slice(7));
          }}
          className={control}
        >
          <option value="" className="bg-[#0a0a0c]">Layouts</option>
          {Object.keys(PRESETS).map((preset) => (
            <option key={preset} value={`preset:${preset}`} className="bg-[#0a0a0c]">{preset}</option>
          ))}
          {Object.keys(saved).map((saveName) => (
            <option key={saveName} value={`saved:${saveName}`} className="bg-[#0a0a0c]">Mine: {saveName}</option>
          ))}
          {editing
            ? Object.keys(saved).map((saveName) => (
                <option key={`d-${saveName}`} value={`delete:${saveName}`} className="bg-[#0a0a0c]">Delete: {saveName}</option>
              ))
            : null}
        </select>
        {editing ? (
          <>
            <select aria-label="Add panel" value="" onChange={(e) => e.target.value && onAdd(e.target.value as WidgetId)} className={control}>
              <option value="" className="bg-[#0a0a0c]">Add panel</option>
              {missing.map((id) => (
                <option key={id} value={id} className="bg-[#0a0a0c]">{WIDGETS[id].title}</option>
              ))}
            </select>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onSave(name.trim());
                setName("");
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Layout name"
                className="w-28 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white placeholder:text-white/30"
              />
              <button type="submit" className={control}>Save</button>
            </form>
          </>
        ) : null}
        <button type="button" onClick={() => onEditing(!editing)} className={cn(control, editing && "border-red-400/50 bg-red-500/15 text-white")}>
          {editing ? "Done" : "Edit"}
        </button>

        <span className="mx-1 h-4 w-px bg-white/10" />
        {replay ? (
          <>
            <button
              type="button"
              onClick={() => (replay.paused ? resume.mutate() : pause.mutate())}
              className={cn(control, "min-w-14")}
            >
              {replay.paused ? "Play" : "Pause"}
            </button>
            <select
              value={replay.speed}
              onChange={(e) => setReplaySpeed.mutate(Number(e.target.value))}
              aria-label="Replay speed"
              className={control}
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value} className="bg-[#0a0a0c]">{value}x</option>
              ))}
            </select>
            {lapOptions.length ? (
              <select
                value={replay.lap ?? ""}
                onChange={(e) => seek.mutate(Number(e.target.value))}
                aria-label="Jump to lap"
                className={control}
                title="Jump to lap"
              >
                {replay.lap == null ? <option value="" className="bg-[#0a0a0c]">Lap</option> : null}
                {lapOptions.map((lap) => (
                  <option key={lap} value={lap} className="bg-[#0a0a0c]">Lap {lap}</option>
                ))}
              </select>
            ) : null}
            {replay.done ? <span className="text-[10px] text-white/45">end of recording</span> : null}
          </>
        ) : (
          <>
            <button type="button" onClick={() => start.mutate({ mode: "live" })} className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-400">
              Go live
            </button>
            <select value={file} onChange={(e) => setFile(e.target.value)} aria-label="Recording" className={cn(control, "max-w-48")}>
              <option value="" className="bg-[#0a0a0c]">São Paulo 2026 (sample)</option>
              {(recordings.data?.recordings ?? [])
                .filter((r) => r.name !== recordings.data?.default)
                .map((r) => (
                  <option key={r.name} value={r.name} className="bg-[#0a0a0c]">
                    {r.label} · {r.size_mb} MB
                  </option>
                ))}
            </select>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Replay speed" className={control}>
              {SPEEDS.map((value) => (
                <option key={value} value={value} className="bg-[#0a0a0c]">{value}x</option>
              ))}
            </select>
            <button type="button" onClick={() => start.mutate({ mode: "replay", speed, file: file || undefined })} className={control}>
              Replay
            </button>
          </>
        )}
        <button type="button" onClick={() => stop.mutate()} className={control}>
          Stop
        </button>
        {token ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px]",
              !token.set || token.expired ? "bg-red-500/15 text-red-200" : days !== null && days < 3 ? "bg-amber-400/10 text-amber-200" : "bg-white/5 text-white/50"
            )}
            title="F1TV token: needed for car data, positions and the timing archive"
          >
            {!token.set ? "No token" : token.expired ? "Token expired" : days === null ? "Token set" : `Token ${days < 1 ? "<1" : days}d`}
          </span>
        ) : null}
      </div>
      {failure ? <span className="w-full text-[11px] text-red-300">{failure.message}</span> : null}
    </div>
  );
}
