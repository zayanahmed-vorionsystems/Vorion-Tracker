'use client';
// app/(dashboard)/live/components/LiveWatchModal.tsx
import { RefObject } from 'react';

interface LiveWatchModalProps {
  videoRef: RefObject<HTMLVideoElement>;
  isConnecting: boolean;
  isStreaming: boolean;
  employeeName: string;
  connectionState: string;
  error: string | null;
  isEnlarged: boolean;
  isRecording: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onFullscreen: () => void;
}

const COLORS = {
  bg: '#0B0F1A',
  panel: 'rgba(11,15,26,.95)',
  border: 'rgba(248,250,252,.10)',
  text: '#F8FAFC',
  textMuted: 'rgba(248,250,252,.5)',
  gold: '#F8D000',
  green: '#4ADE80',
  red: '#FF5C7A',
};

export function LiveWatchModal({
  videoRef,
  isConnecting,
  isStreaming,
  employeeName,
  connectionState,
  error,
  isEnlarged,
  isRecording,
  onClose,
  onRefresh,
  onStartRecording,
  onStopRecording,
  onFullscreen,
}: LiveWatchModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isEnlarged ? '50vw' : 460,
          height: isEnlarged ? '50vh' : 300,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width .25s ease, height .25s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: `1px solid ${COLORS.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isStreaming ? COLORS.green : COLORS.gold,
                boxShadow: isStreaming ? `0 0 6px ${COLORS.green}` : `0 0 6px ${COLORS.gold}`,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{employeeName}</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>· {connectionState}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: COLORS.textMuted,
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Video area — click to enlarge/shrink */}
        <div
          onClick={onFullscreen}
          title={isEnlarged ? 'Click to shrink' : 'Click to enlarge'}
          style={{
            flex: 1,
            position: 'relative',
            background: '#000',
            cursor: 'pointer',
            minHeight: 0,
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />

          {!isStreaming && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: COLORS.textMuted,
                fontSize: 12,
                background: 'rgba(0,0,0,.3)',
              }}
            >
              {isConnecting ? 'Connecting to live screen…' : (error || 'Waiting for stream…')}
            </div>
          )}

          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 10,
              fontSize: 10,
              color: 'rgba(255,255,255,.6)',
              background: 'rgba(0,0,0,.5)',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            {isEnlarged ? 'Click to shrink' : 'Click to enlarge'}
          </div>
        </div>

        {/* Footer controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 14px',
            borderTop: `1px solid ${COLORS.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11, color: error ? COLORS.red : COLORS.textMuted }}>
            {error || ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: 'transparent',
                color: COLORS.text,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ↻ Refresh
            </button>
            {isRecording ? (
              <button
                onClick={(e) => { e.stopPropagation(); onStopRecording(); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,92,122,.4)',
                  background: 'rgba(255,92,122,.15)',
                  color: COLORS.red,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⏹ Stop Recording
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onStartRecording(); }}
                disabled={!isStreaming}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: 'transparent',
                  color: COLORS.text,
                  fontSize: 12,
                  cursor: isStreaming ? 'pointer' : 'not-allowed',
                  opacity: isStreaming ? 1 : 0.5,
                }}
              >
                ● Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}