'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore, canSendAlerts } from '@/store/auth';
import { supabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { LiveWatchModal } from './components/LiveWatchModal';

interface Employee {
  id: string;
  name: string;
}

interface AgentCard {
  agentId: string;
  name: string;
  status: string;
  online: boolean;
  lastUrl?: string;
  activeApp?: string;
  activityPct?: number;
  lastSeen?: string;
}

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';
const STREAM_CONNECT_TIMEOUT_MS = 15000;

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.22), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.12), transparent 55%), #0B0F1A',
    color: '#F8FAFC',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: 600,
    margin: 0,
    color: '#F8FAFC',
  },
  subtext: {
    fontSize: 13,
    color: 'rgba(248,250,252,.55)',
    marginTop: 4,
  },
  livePill: {
    fontSize: 12,
    color: '#4ADE80',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  onlinePill: {
    fontSize: 12,
    color: 'rgba(248,250,252,.6)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(248,250,252,.04)',
    border: '1px solid rgba(248,250,252,.08)',
    borderRadius: 999,
    padding: '5px 12px',
  },
  card: {
    border: '1px solid rgba(248,250,252,.10)',
    background: 'rgba(11,15,26,.72)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(248,250,252,.45)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(248,250,252,.12)',
    background: 'rgba(248,250,252,.05)',
    color: '#F8FAFC',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    colorScheme: 'dark',
  },
  emptyState: {
    padding: 32,
    textAlign: 'center',
    color: 'rgba(248,250,252,.3)',
    fontSize: 12,
  },
};

export default function LiveMonitorPage() {
  const { token, user } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertTo, setAlertTo] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnectingStream, setIsConnectingStream] = useState(false);
  const [streamState, setStreamState] = useState('Idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const activeEmployeeRef = useRef<string | null>(null);
  const selectedEmployeeRef = useRef<Employee | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectAttemptsRef = useRef(0);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  function normalizeStatus(value?: string | null) {
    const raw = String(value || '').toLowerCase();
    if (raw === 'active' || raw === 'working') return 'working';
    if (raw === 'break' || raw === 'on_break') return 'on_break';
    if (raw === 'checked_out' || raw === 'checkout' || raw === 'check_out') return 'checked_out';
    if (raw === 'idle' || raw === 'offline') return 'offline';
    return raw || 'offline';
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) {
          console.error('/api/users failed', r.status, await r.text());
          return;
        }
        const users = await r.json();
        setEmployees(users.filter((u: any) => u.role === 'employee').map((u: any) => ({ id: u.id, name: u.name })));
      } catch (e) {
        console.error('Failed to load users', e);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !user?.id) return;

    const runtimeUrl = (typeof window !== 'undefined')
      ? (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:4000`)
      : SOCKET_SERVER_URL;

    const socket = io(runtimeUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    socket.emit('register', { role: user?.role || 'admin', employeeId: user?.id || null, token });

    socket.on('connect', () => {
      console.log('Dashboard socket connected', socket.id, 'to', runtimeUrl);
      socket.emit('register', { role: user?.role || 'admin', employeeId: user?.id || null, token });
      if (activeEmployeeRef.current && selectedEmployeeRef.current) {
        console.log('[live-monitor] socket reconnected; restarting stream for', activeEmployeeRef.current);
        requestStream(activeEmployeeRef.current, selectedEmployeeRef.current.name);
      }
    });
    socket.on('connect_error', (err: any) => console.error('Socket connect_error', err));
    socket.on('error', (err: any) => console.error('Socket error', err));
    socket.on('reconnect_attempt', (n: number) => console.log('Socket reconnect attempt', n));
    socket.on('reconnect_failed', () => console.warn('Socket reconnect failed'));

    socket.on('employee-status', (data: any) => {
      const agentKey = String(data.employeeId ?? data.agentId ?? 'unknown-agent');
      setAgents(prev => {
        const existing = prev.find(item => item.agentId === agentKey);
        const normalized = normalizeStatus(data.status);
        const updated = {
          agentId: agentKey,
          name: data.employeeName || data.userName || existing?.name || 'Employee',
          status: normalized,
          online: normalized !== 'offline',
          activeApp: data.activeApp,
          activityPct: data.activityPct,
          lastUrl: data.screenshotBase64 ? `data:image/png;base64,${data.screenshotBase64}` : existing?.lastUrl,
          lastSeen: data.heartbeat || data.lastActivity || data.capturedAt || existing?.lastSeen,
        };
        const exists = Boolean(existing);
        return exists ? prev.map(item => item.agentId === agentKey ? { ...item, ...updated } : item) : [updated, ...prev];
      });
    });
    socket.on('security-event', (data: any) => {
      setSecurityEvents(prev => [data, ...prev].slice(0, 8));
    });
    socket.on('stream-offer', async ({ employeeId, sdp }: { employeeId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('[live-monitor] stream-offer received', { employeeId, hasSdp: Boolean(sdp) });
      if (activeEmployeeRef.current !== employeeId) return;
      try {
        clearConnectTimeout();
        clearReconnectTimer();
        connectAttemptsRef.current = 0;
        const pc = peerRef.current ?? createPeerConnection(employeeId);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('[live-monitor] remote description set');
        const answer = await pc.createAnswer();
        console.log('[live-monitor] createAnswer');
        await pc.setLocalDescription(answer);
        console.log('[live-monitor] answer sent');
        console.log('[live-monitor] emitting stream-answer', { employeeId, adminId: socket.id, hasSdp: Boolean(answer) });
        socket.emit('stream-answer', { employeeId, adminId: socket.id, sdp: answer });
        console.log('[live-monitor] stream-answer emitted');
        setStreamState('Connected');
        setIsConnectingStream(false);
        setIsStreaming(true);
        setStreamError(null);
      } catch (err: any) {
        console.error('Failed to answer stream offer', err);
        setStreamError(err.message || 'Failed to answer stream offer');
      }
    });
    socket.on('ice-candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      console.log('[live-monitor] ICE candidate received');
      if (!peerRef.current || !candidate) return;
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Ignored ICE candidate error', err);
      }
    });
    socket.on('stop-stream', ({ employeeId }: { employeeId?: string }) => {
      if (!employeeId || employeeId !== activeEmployeeRef.current) return;
      stopStream();
    });

    return () => {
      stopStream();
      socket.disconnect();
    };
  }, [token, user?.id, user?.role]);

  useEffect(() => {
    const channel = supabaseClient
      .channel('employee-status-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_status' }, (payload) => {
        const record = (payload as any).new ?? (payload as any).record;
        if (!record) return;
        const agentKey = String(record.employee_id);
        setAgents(prev => {
        const updated = {
          agentId: agentKey,
          name: prev.find(item => item.agentId === agentKey)?.name || record.employee_id,
          status: normalizeStatus(record.current_status),
          online: normalizeStatus(record.current_status) !== 'offline',
          activeApp: record.current_app ?? undefined,
          activityPct: undefined,
          lastUrl: prev.find(item => item.agentId === agentKey)?.lastUrl,
          lastSeen: record.last_activity,
        };
          const exists = prev.some(item => item.agentId === agentKey);
          return exists ? prev.map(item => item.agentId === agentKey ? { ...item, ...updated } : item) : [updated, ...prev];
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'screenshots' }, (payload) => {
        const record = (payload as any).new ?? (payload as any).record;
        if (!record) return;
        const agentKey = String(record.employee_id ?? record.user_id);
        setAgents(prev => prev.map(item => {
          if (item.agentId !== agentKey) return item;
          return {
            ...item,
            lastUrl: record.file_url,
            lastSeen: record.captured_at,
          };
        }));
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  function clearConnectTimeout() {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }

  function hasLiveRemoteStream() {
    const stream = remoteStreamRef.current;
    if (!stream) return false;
    return stream.getTracks().some(track => track.readyState === 'live');
  }

  function hasActivePeerConnection() {
    const pc = peerRef.current;
    return Boolean(pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed');
  }

  function markStreamActive() {
    setStreamState('Connected');
    setIsConnectingStream(false);
    setIsStreaming(true);
    setStreamError(null);
  }

  function attachRemoteStream(stream: MediaStream | null) {
    if (!stream || !videoRef.current) return;
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
    void videoRef.current.play().catch((err) => console.warn('[live-monitor] autoplay failed', err));
  }

  useEffect(() => {
    if (!selectedEmployee?.id || !hasLiveRemoteStream()) return;
    attachRemoteStream(remoteStreamRef.current);
    markStreamActive();
  }, [selectedEmployee?.id, isEnlarged]);

  function scheduleReconnect(reason: string) {
    if (!selectedEmployeeRef.current || !socketRef.current || !activeEmployeeRef.current) return;
    if (reconnectTimeoutRef.current) return;
    console.log('[live-monitor] scheduling reconnect', { reason, employeeId: activeEmployeeRef.current });
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (activeEmployeeRef.current && selectedEmployeeRef.current) {
        requestStream(activeEmployeeRef.current, selectedEmployeeRef.current.name);
      }
    }, 1800);
  }

  function createPeerConnection(employeeId: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.ontrack = (event) => {
      console.log('[live-monitor] ontrack fired', { streamCount: event.streams.length, trackKind: event.track.kind });
      const stream = event.streams[0];
      remoteStreamRef.current = stream;
      attachRemoteStream(stream);
      markStreamActive();
      if (isRecording) {
        stopRecording();
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[live-monitor] connectionState', state);
      if (state === 'connected') {
        clearConnectTimeout();
        clearReconnectTimer();
        connectAttemptsRef.current = 0;
        setStreamState('Connected');
        setIsConnectingStream(false);
        setIsStreaming(true);
      } else if (state === 'connecting') {
        setStreamState('Connecting');
        setIsConnectingStream(true);
      } else if (state === 'disconnected' || state === 'failed') {
        setStreamState('Reconnecting');
        setIsConnectingStream(true);
        scheduleReconnect(`connection state ${state}`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[live-monitor] iceConnectionState', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        scheduleReconnect(`ice ${pc.iceConnectionState}`);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log('[live-monitor] signalingState', pc.signalingState);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log('[live-monitor] ICE candidate sent');
        console.log('[live-monitor] emitting ice-candidate', { employeeId, adminId: socketRef.current.id, from: 'admin' });
        socketRef.current.emit('ice-candidate', {
          employeeId,
          adminId: socketRef.current.id,
          candidate: event.candidate.toJSON(),
          from: 'admin',
        });
      }
    };

    peerRef.current = pc;
    return pc;
  }

  function stopStream() {
    clearConnectTimeout();
    clearReconnectTimer();
    if (socketRef.current && activeEmployeeRef.current) {
      socketRef.current.emit('stop-stream', { employeeId: activeEmployeeRef.current, adminId: socketRef.current.id });
    }
    peerRef.current?.close();
    peerRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
    activeEmployeeRef.current = null;
    selectedEmployeeRef.current = null;
    setIsStreaming(false);
    setIsConnectingStream(false);
    setStreamState('Idle');
    setStreamError(null);
  }

  async function requestStream(employeeId: string, employeeName: string) {
    if (!socketRef.current) return;

    clearReconnectTimer();
    if (activeEmployeeRef.current === employeeId && hasLiveRemoteStream() && hasActivePeerConnection()) {
      setSelectedEmployee({ id: employeeId, name: employeeName });
      selectedEmployeeRef.current = { id: employeeId, name: employeeName };
      activeEmployeeRef.current = employeeId;
      attachRemoteStream(remoteStreamRef.current);
      markStreamActive();
      return;
    }

    if (peerRef.current && hasActivePeerConnection()) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setSelectedEmployee({ id: employeeId, name: employeeName });
    selectedEmployeeRef.current = { id: employeeId, name: employeeName };
    activeEmployeeRef.current = employeeId;
    setStreamState('Connecting');
    setIsConnectingStream(true);
    setIsStreaming(false);
    setStreamError(null);

    const pc = createPeerConnection(employeeId);
    peerRef.current = pc;
    console.log('[live-monitor] emitting stream-request', { employeeId, adminId: socketRef.current.id, attempt: connectAttemptsRef.current + 1 });
    socketRef.current.emit('stream-request', { employeeId, adminId: socketRef.current.id });
    console.log('[live-monitor] stream-request emitted');

    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (activeEmployeeRef.current === employeeId && !isStreaming) {
        if (connectAttemptsRef.current < 1) {
          connectAttemptsRef.current += 1;
          console.log('[live-monitor] retrying stream-request automatically', { employeeId });
          socketRef.current?.emit('stream-request', { employeeId, adminId: socketRef.current.id });
          return;
        }
        setStreamError('No response from agent. It may be offline or unreachable.');
        setStreamState('Timed out');
        setIsConnectingStream(false);
      }
    }, STREAM_CONNECT_TIMEOUT_MS);
  }

  async function startRecording() {
    if (!remoteStreamRef.current || !selectedEmployeeRef.current || !socketRef.current) return;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      recordedChunksRef.current = [];
      recordingStartRef.current = Date.now();
      setRecordingError(null);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
      const recorder = mimeType ? new MediaRecorder(remoteStreamRef.current, { mimeType }) : new MediaRecorder(remoteStreamRef.current);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error('[live-monitor] recording error', event.error);
        setRecordingError(event.error?.message || 'Recording failed');
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const durationMs = Date.now() - (recordingStartRef.current || Date.now());
        const formData = new FormData();
        formData.append('employeeId', selectedEmployeeRef.current?.id || '');
        formData.append('adminId', socketRef.current?.id || '');
        formData.append('startTime', new Date(recordingStartRef.current || Date.now()).toISOString());
        formData.append('endTime', new Date().toISOString());
        formData.append('duration', String(Math.max(1, Math.round(durationMs / 1000))));
        formData.append('file', blob, `live-${Date.now()}.webm`);
        try {
          const response = await fetch('/api/live-recordings', { method: 'POST', body: formData });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Recording upload failed');
          console.log('[live-monitor] recording uploaded', data);
        } catch (err: any) {
          console.error('[live-monitor] failed to upload recording', err?.stack || err);
          setRecordingError(err?.message || 'Recording upload failed');
        }
      };
      recorder.start();
      setIsRecording(true);
      setRecordingError(null);
    } catch (err: any) {
      console.error('[live-monitor] failed to start recording', err?.stack || err);
      setRecordingError(err?.message || 'Failed to start recording');
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  }

  async function sendAlert() {
    if (!alertTo || !alertMsg) {
      alert('Select an employee and enter a message.');
      return;
    }

    const payload = {
      employee_id: alertTo,
      alert_type: 'live_alert',
      title: 'Live monitor alert',
      description: alertMsg,
      severity: 'medium',
      metadata: {},
    };

    setSending(true);

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(JSON.stringify(data));
        return;
      }

      alert('Alert sent successfully!');
      setAlertMsg('');
    } catch (err) {
      console.error(err);
      alert('Request failed');
    } finally {
      setSending(false);
    }
  }

  function toggleEnlarge() {
    if (hasLiveRemoteStream()) {
      attachRemoteStream(remoteStreamRef.current);
      markStreamActive();
    }
    setIsEnlarged(prev => !prev);
  }

  const role = user?.role as any;
  const onlineCount = agents.filter(a => a.online).length;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid rgba(248,208,0,.35)',
              background: 'linear-gradient(180deg, rgba(248,208,0,.5), rgba(248,208,0,.3))',
              color: '#0B0F1A',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <div>
            <h1 style={styles.heading}>Live Monitor</h1>
            <p style={styles.subtext}>Real-time employee screen streaming with WebRTC</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={styles.onlinePill}>
            <strong style={{ color: '#4ADE80' }}>{onlineCount}</strong> online
          </span>
          <span style={styles.livePill}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block', boxShadow: '0 0 6px #22C55E' }} />
            WebRTC live view
          </span>
        </div>
      </div>

      {canSendAlerts(role) && (
        <div style={{
          ...styles.card, padding: '14px 16px', marginBottom: 20,
          display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ ...styles.sectionLabel, display: 'block', marginBottom: 6 }}>Send alert to</label>
            <select value={alertTo} onChange={e => setAlertTo(e.target.value)} style={{ ...styles.input, cursor: 'pointer' }}>
              <option value="" style={{ background: '#0B0F1A', color: '#F8FAFC' }}>Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id} style={{ background: '#0B0F1A', color: '#F8FAFC' }}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 240px' }}>
            <label style={{ ...styles.sectionLabel, display: 'block', marginBottom: 6 }}>Message</label>
            <input value={alertMsg} onChange={e => setAlertMsg(e.target.value)} placeholder="e.g. Please focus on your current task" style={styles.input} />
          </div>
          <button onClick={sendAlert} disabled={sending || !alertTo || !alertMsg} style={{
            padding: '9px 18px', borderRadius: 10,
            background: 'linear-gradient(180deg, rgba(248,208,0,.5), rgba(248,208,0,.3))',
            border: '1px solid rgba(248,208,0,.5)', color: '#0B0F1A',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            opacity: sending || !alertTo || !alertMsg ? 0.5 : 1,
          }}>
            {sending ? 'Sending…' : 'Send Alert'}
          </button>
        </div>
      )}

      <div style={{ ...styles.card, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#F8FAFC' }}>Security Events</div>
        {securityEvents.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(248,250,252,.35)' }}>No blocked app or website events yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {securityEvents.map((event, i) => (
              <div key={event.id ?? i} style={{ border: '1px solid rgba(248,250,252,.08)', borderRadius: 10, padding: '8px 10px', background: 'rgba(248,250,252,.04)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#F8FAFC' }}>{event.employeeName || event.employeeId || 'Employee'}</div>
                <div style={{ fontSize: 11, color: 'rgba(248,250,252,.35)', marginTop: 2 }}>{new Date(event.createdAt).toLocaleString()}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: 'rgba(248,250,252,.7)' }}>{event.eventType}: {event.value}</div>
                <div style={{ fontSize: 11, color: '#F8D000', marginTop: 3 }}>Action: {event.actionTaken || 'Logged'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {agents.length === 0 ? (
        <div style={{ ...styles.card, ...styles.emptyState }}>
          No agents connected yet — cards will appear here once an employee's agent comes online.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
          {agents.map(agent => (
            <button
              key={agent.agentId}
              onClick={() => {
                if (!agent.online) return;
                setSelectedEmployee({ id: agent.agentId, name: agent.name });
                requestStream(agent.agentId, agent.name);
              }}
              style={{
                border: `1px solid ${agent.online ? 'rgba(34,197,94,.3)' : 'rgba(248,250,252,.08)'}`,
                background: 'rgba(11,15,26,.72)', backdropFilter: 'blur(10px)',
                borderRadius: 14, overflow: 'hidden',
                boxShadow: agent.online ? '0 0 18px rgba(34,197,94,.08)' : '0 8px 20px rgba(0,0,0,.2)',
                transition: 'box-shadow .3s',
                textAlign: 'left',
                cursor: agent.online ? 'pointer' : 'default',
              }}
            >
              <div style={{ aspectRatio: '16/9', background: 'rgba(248,250,252,.03)', position: 'relative', overflow: 'hidden' }}>
                {agent.lastUrl ? (
                  <img src={agent.lastUrl} alt="screen" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(248,250,252,.2)', fontSize: 12 }}>
                    {agent.online ? 'Tap to view live screen' : 'Offline'}
                  </div>
                )}
                {agent.online && (
                  <div style={{
                    position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(0,0,0,.6)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: '#fff',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 4px #ef4444' }} />
                    Live
                  </div>
                )}
              </div>

              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>{agent.name}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                    background: agent.online ? 'rgba(34,197,94,.1)' : 'rgba(248,250,252,.05)',
                    color: agent.online ? '#4ADE80' : 'rgba(248,250,252,.3)',
                    border: `1px solid ${agent.online ? 'rgba(34,197,94,.2)' : 'rgba(248,250,252,.08)'}`,
                  }}>
                    {agent.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(248,250,252,.35)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.activeApp || '—'}</span>
                  <span>{agent.activityPct != null ? `${agent.activityPct}% active` : ''}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedEmployee && (
        <LiveWatchModal
          videoRef={videoRef}
          isConnecting={isConnectingStream}
          isStreaming={isStreaming}
          employeeName={selectedEmployee.name}
          connectionState={streamState}
          error={streamError || recordingError}
          isEnlarged={isEnlarged}
          isRecording={isRecording}
          onClose={() => {
            stopStream();
            stopRecording();
            setSelectedEmployee(null);
            setIsEnlarged(false);
          }}
          onRefresh={() => selectedEmployee && requestStream(selectedEmployee.id, selectedEmployee.name)}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onFullscreen={toggleEnlarge}
        />
      )}
    </div>
  );
}
