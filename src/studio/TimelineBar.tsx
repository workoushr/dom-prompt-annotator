import React from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, CircleDot } from 'lucide-react';
import { AnnotationItem, UserActionLogEntry } from '../types/annotation';
import { formatTimestampOffset } from '../utils/promptFormatter';

export interface TimelineBarProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (targetMs: number) => void;
  onStepTime: (deltaMs: number) => void;
  actionLogs?: UserActionLogEntry[];
  annotations?: AnnotationItem[];
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  currentTimeMs,
  durationMs,
  isPlaying,
  onTogglePlay,
  onSeek,
  onStepTime,
  actionLogs = [],
  annotations = [],
}) => {
  const safeDuration = Math.max(100, durationMs);
  const clampedCurrent = Math.max(0, Math.min(currentTimeMs, safeDuration));
  const progressPercent = (clampedCurrent / safeDuration) * 100;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * safeDuration);
  };

  return (
    <footer
      className="absolute bottom-4 left-1/2 -translate-x-1/2 h-12 bg-[#2c2c2c] border border-white/10 rounded-[14px] px-3 flex items-center gap-3 z-40 shadow-2xl backdrop-blur-md select-none text-white"
      data-testid="studio-timeline-bar"
    >
      {/* 1. Step Backward (-1s) */}
      <button
        type="button"
        className="w-7 h-7 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition"
        data-testid="timeline-step-back"
        title="1秒戻る (-1s)"
        onClick={() => onStepTime(-1000)}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* 2. Play / Pause Button */}
      <button
        type="button"
        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shadow-sm active:scale-95"
        data-testid="timeline-play-pause-btn"
        title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
        onClick={onTogglePlay}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-white text-white" />
        ) : (
          <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />
        )}
      </button>

      {/* 3. Step Forward (+1s) */}
      <button
        type="button"
        className="w-7 h-7 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition"
        data-testid="timeline-step-forward"
        title="1秒進む (+1s)"
        onClick={() => onStepTime(1000)}
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="h-4 w-px bg-white/10" />

      {/* 4. Time Display & Scrubber Track */}
      <div className="flex items-center gap-2.5 w-72 sm:w-80 md:w-96">
        <span
          className="font-mono text-[11px] text-white w-32 shrink-0 text-center"
          data-testid="timeline-time-display"
        >
          {formatTimestampOffset(clampedCurrent)} / {formatTimestampOffset(safeDuration)}
        </span>

        {/* Track container */}
        <div
          className="flex-1 h-2 bg-zinc-700/60 hover:bg-zinc-700/80 rounded-full relative cursor-pointer group"
          onClick={handleTrackClick}
          data-testid="timeline-track"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={clampedCurrent}
        >
          {/* Progress fill */}
          <div
            className="h-full bg-[#0d99ff] rounded-full relative transition-all duration-75"
            style={{ width: `${progressPercent}%` }}
            data-testid="timeline-progress-fill"
          >
            {/* Scrubber thumb */}
            <div className="absolute -right-2 -top-1 w-4 h-4 rounded-full bg-white shadow-md border-2 border-[#0d99ff] scale-90 group-hover:scale-110 transition-transform" />
          </div>

          {/* Event Pins: User Actions (Indigo for click/input, Amber for mutation) */}
          {actionLogs.map((log) => {
            const leftPct = Math.max(0, Math.min(100, (log.offsetMs / safeDuration) * 100));
            const isMutation = log.kind === 'mutation_add' || log.kind === 'mutation_remove';
            const pinColor = isMutation ? 'bg-amber-400' : 'bg-indigo-400';

            return (
              <button
                key={log.id}
                type="button"
                className={`absolute top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 rounded-full ${pinColor} hover:scale-150 transition-transform cursor-pointer shadow-sm z-10`}
                style={{ left: `${leftPct}%` }}
                title={`[${formatTimestampOffset(log.offsetMs)}] ${log.kind}: ${log.summary}`}
                data-testid={`timeline-pin-action-${log.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(log.offsetMs);
                }}
              />
            );
          })}

          {/* Event Pins: Annotations (Figma Blue dot with white ring) */}
          {annotations.map((ann) => {
            if (typeof ann.timestampMs !== 'number') return null;
            const leftPct = Math.max(0, Math.min(100, (ann.timestampMs / safeDuration) * 100));

            return (
              <button
                key={ann.id}
                type="button"
                className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 rounded-full bg-[#0d99ff] ring-2 ring-white hover:scale-150 transition-transform cursor-pointer shadow-md z-20"
                style={{ left: `${leftPct}%` }}
                title={`#${ann.id} (${formatTimestampOffset(ann.timestampMs)}): ${ann.instruction || ann.element.selector}`}
                data-testid={`timeline-pin-annotation-${ann.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(ann.timestampMs!);
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="h-4 w-px bg-white/10" />

      {/* 5. Total Duration Pill */}
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 text-[10px] font-semibold font-mono"
        data-testid="timeline-duration-badge"
      >
        <CircleDot className="w-2.5 h-2.5 text-rose-500" />
        <span>{(safeDuration / 1000).toFixed(1)}s</span>
      </div>
    </footer>
  );
};
