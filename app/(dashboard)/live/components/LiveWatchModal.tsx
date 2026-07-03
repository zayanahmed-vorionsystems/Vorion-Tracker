'use client';

import { RefObject } from 'react';

type LiveWatchModalProps = {
  videoRef: RefObject<HTMLVideoElement>;
  isConnecting: boolean;
  isStreaming: boolean;
  employeeName?: string;
  connectionState?: string;
  error?: string | null;
  isEnlarged?: boolean;
  isRecording?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onFullscreen: () => void;
};

export function LiveWatchModal({
  videoRef,
  isConnecting,
  isStreaming,
  employeeName,
  connectionState = 'Idle',
  error,
  isEnlarged = false,
  isRecording = false,
  onClose,
  onRefresh,
  onStartRecording,
  onStopRecording,
  onFullscreen,
}: LiveWatchModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-3 sm:p-6">
      <div className="flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-sm text-slate-100">
          <div>
            <div className="font-semibold">{employeeName || 'Employee'} • Live Monitor</div>
            <div className="text-xs text-slate-400">{connectionState}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onStartRecording} className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/25">
              {isRecording ? 'Recording…' : 'Start Recording'}
            </button>
            <button onClick={onStopRecording} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              Stop Recording
            </button>
            <button onClick={onRefresh} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              Refresh
            </button>
            <button onClick={onFullscreen} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              {isEnlarged ? 'Shrink' : 'Expand'}
            </button>
            <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-black p-2 sm:p-3">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain"
            />

            {(isConnecting || !isStreaming) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 text-center text-slate-100">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
                <div className="text-lg font-semibold">{isConnecting ? 'Connecting live stream…' : 'Waiting for stream'}</div>
                <div className="text-sm text-slate-400">{error || 'The agent is preparing the desktop stream.'}</div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 px-4 py-3 text-sm text-slate-400">
          Status: <span className="font-semibold text-slate-100">{isStreaming ? 'Connected' : connectionState}</span>
        </div>
      </div>
    </div>
  );
}