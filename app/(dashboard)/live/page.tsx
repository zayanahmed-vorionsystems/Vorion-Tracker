'use client';

import { useEffect, useRef, useState } from 'react';
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

const STREAM_CONNECT_TIMEOUT_MS = 15000;
const CHANNEL_SUBSCRIBE_TIMEOUT_MS = 10000;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: '339635db329dc7164bf05f8f', credential: 'e9nkJFUYjEXW7lkq' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '339635db329dc7164bf05f8f', credential: 'e9nkJFUYjEXW7lkq' },
  { urls: 'turn:global.relay.metered.ca:443', username: '339635db329dc7164bf05f8f', credential: 'e9nkJFUYjEXW7lkq' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '339635db329dc7164bf05f8f', credential: 'e9nkJFUYjEXW7lkq' },
];

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
  const channelRef = useRef<any>(null);
  // Tracks the promise that resolves once the current channel is SUBSCRIBED.
  // We must await this before calling channel.send(), otherwise realtime-js
  // silently falls back to REST delivery, which the agent never receives.
  const channelReadyRef = useRef<Promise<void> | null>(null);
  // Explicit employeeId the current channelRef/channelReadyRef belong to.
  // We deliberately do NOT parse channel.topic strings to figure this out —
  // that was fragile and caused a real bug where .on() got called on an
  // already-subscribed channel object ("cannot add presence callbacks ...
  // after subscribe()"). Tracking this ourselves is exact and race-free.
  const channelEmployeeIdRef = useRef<string | null>(null);
  // Prevents two concurrent calls to ensureChannel() (e.g. a fast double
  // click, or a manual refresh firing while a reconnect is already in
  // flight) from both racing to tear down / recreate the channel.
  const channelSetupInFlightRef = useRef<Promise<{ channel: any; ready: Promise<void> }> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const adminIdRef = useRef<string>('');
  const activeEmployeeRef = useRef<string | null>(null);
  const selectedEmployeeRef = useRef<Employee | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectAttemptsRef = useRef(0);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const isStreamingRef = useRef(false);
  // Tracks agent online/offline status per employeeId based on presence sync.
  // Used to stop endless reconnect/retry loops once we know for certain the
  // agent's process has gone away (e.g. tracking stopped, app closed),
  // instead of blindly retrying forever with no feedback to the admin.
  const agentOnlineRef = useRef<Map<string, boolean>>(new Map());
  // Only contains employeeIds where we've confirmed a genuine online -> offline
  // transition (not just "haven't heard from them yet"). Used to gate
  // reconnect attempts so we don't retry forever once truly confirmed
  // offline, without being tripped up by the first-sync race condition.
  const confirmedOfflineRef = useRef<Set<string>>(new Set());
  // Prevents rapid duplicate requestStream() calls for the same employee
  // (fast double-click, refresh mashed, reconnect racing a manual click)
  // from running concurrently. Force-cleared by handleAgentWentOffline() if
  // an in-flight call never reaches its own cleanup (e.g. pc closed mid-flight).
  const requestStreamInFlightRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

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
    adminIdRef.current = user?.id || `admin-${Math.random().toString(36).slice(2, 10)}`;
  }, [user?.id]);

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
            status: record.current_status || 'offline',
            online: record.current_status === 'active',
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
        const agentKey = String(record.user_id);
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

  // ─────────────────────────────────────────────────────────────────────────
  // FIX: real-unmount cleanup for the WebRTC/signaling channel refs.
  // Previously only the employee-status-channel effect above had a cleanup;
  // channelRef/channelReadyRef/channelEmployeeIdRef were never torn down on
  // unmount. On a genuine navigation away (and, in dev, on Fast Refresh
  // remounts) the Supabase channel object stayed subscribed in the
  // background even though our refs pointed at nothing. Combined with the
  // orphan-channel guard in ensureChannel() below, this makes sure we don't
  // leak a live, listener-attached channel every time this component goes
  // away or gets remounted.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabaseClient.removeChannel(channelRef.current);
        channelRef.current = null;
        channelReadyRef.current = null;
        channelEmployeeIdRef.current = null;
      }
    };
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

  function hasStreamConnected() {
    return hasLiveRemoteStream() || Boolean(peerRef.current && (peerRef.current.connectionState === 'connected' || peerRef.current.remoteDescription));
  }

  function hasActivePeerConnection() {
    const pc = peerRef.current;
    return Boolean(pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed');
  }

  function serializeSessionDescription(description: RTCSessionDescriptionInit | null | undefined) {
    if (!description) return undefined;
    return {
      type: description.type,
      sdp: description.sdp,
    };
  }

  function markStreamActive() {
    setStreamState('Connected');
    setIsConnectingStream(false);
    setIsStreaming(true);
    isStreamingRef.current = true;
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

  useEffect(() => {
    if (employees.length === 0) return;
    (async () => {
      try {
        const { data, error } = await supabaseClient
          .from('employee_status')
          .select('*');

        if (error) {
          console.error('[live-monitor] failed to load initial employee_status', error);
          return;
        }

        const statusByEmployeeId = new Map(
          (data || []).map((row: any) => [String(row.employee_id), row])
        );

        // Har employee ke liye card banao — chahe employee_status me row ho ya na ho
        // (agar row nahi hai, to matlab wo employee kabhi online hi nahi hua — offline dikhao)
        const initialAgents: AgentCard[] = employees.map((emp) => {
          const row = statusByEmployeeId.get(emp.id);
          return {
            agentId: emp.id,
            name: emp.name,
            status: row?.current_status || 'offline',
            online: row ? row.current_status === 'active' : false,
            activeApp: row?.current_app ?? undefined,
            lastSeen: row?.last_activity,
          };
        });

        setAgents(initialAgents);
      } catch (err) {
        console.error('[live-monitor] error loading initial agent status', err);
      }
    })();
  }, [employees]);

  function handleAgentWentOffline(employeeId: string) {
    console.log('[live-monitor] agent went offline, stopping reconnect attempts', { employeeId });
    clearConnectTimeout();
    clearReconnectTimer();
    connectAttemptsRef.current = 0;
    peerRef.current?.close();
    peerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    setIsStreaming(false);
    isStreamingRef.current = false;
    setIsConnectingStream(false);
    setStreamState('Offline');
    setStreamError("This employee's agent went offline. Reconnect automatically once it's back online.");
    // A requestStream() call that was still in flight when this offline
    // event arrived (e.g. its pc got closed mid-createOffer) may never
    // reach its own `finally` cleanup. Force-clear the guard here so future
    // clicks/retries for this employee aren't blocked forever.
    if (requestStreamInFlightRef.current === employeeId) {
      requestStreamInFlightRef.current = null;
    }
  }

  function scheduleReconnect(reason: string) {
    if (!selectedEmployeeRef.current || !channelRef.current || !activeEmployeeRef.current) return;
    if (reconnectTimeoutRef.current) return;
    // Don't blindly retry forever if we already know the agent is offline —
    // wait for a presence sync event to tell us it's back instead.
    if (agentOnlineRef.current.get(activeEmployeeRef.current) === false) {
      console.log('[live-monitor] skipping reconnect — agent known to be offline', { employeeId: activeEmployeeRef.current });
      return;
    }
    console.log('[live-monitor] scheduling reconnect', { reason, employeeId: activeEmployeeRef.current });
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (activeEmployeeRef.current && selectedEmployeeRef.current) {
        void requestStream(activeEmployeeRef.current, selectedEmployeeRef.current.name);
      }
    }, 1800);
  }

  function createPeerConnection(employeeId: string) {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });
    pc.addTransceiver('video', { direction: 'recvonly' });

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
      if (event.candidate && channelRef.current) {
        console.log('[live-monitor] ICE candidate sent');
        void channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            employeeId,
            adminId: adminIdRef.current,
            candidate: event.candidate.toJSON(),
            from: 'admin',
          },
        });
      }
    };

    peerRef.current = pc;
    return pc;
  }

  function stopStream() {
    clearConnectTimeout();
    clearReconnectTimer();
    if (channelRef.current && activeEmployeeRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'stop-stream',
        payload: { employeeId: activeEmployeeRef.current, adminId: adminIdRef.current },
      });
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
    isStreamingRef.current = false;
    setIsConnectingStream(false);
    setStreamState('Idle');
    setStreamError(null);
  }
  /**
   * Returns the channel for this employee, plus a `ready` promise that
   * resolves once the channel has finished SUBSCRIBED. Callers MUST await
   * `ready` before calling channel.send() — sending before SUBSCRIBED causes
   * realtime-js to silently fall back to REST delivery, which the Electron
   * agent's websocket listener never sees.
   *
   * This function is safe to call multiple times in quick succession (fast
   * double clicks, a manual refresh racing a reconnect, etc). Identity is
   * tracked explicitly via channelEmployeeIdRef rather than by parsing
   * channel.topic strings, and concurrent setup calls are serialized via
   * channelSetupInFlightRef so we never call .on() on a channel object that
   * has already had .subscribe() called on it.
   */
  async function ensureChannel(employeeId: string): Promise<{ channel: any; ready: Promise<void> }> {
    // If another ensureChannel() call for this employeeId is already in
    // flight, just wait for it instead of racing to create a second channel.
    if (channelSetupInFlightRef.current && channelEmployeeIdRef.current === employeeId) {
      return channelSetupInFlightRef.current;
    }

    // Already have a live/ready channel for this exact employee — reuse it.
    if (channelRef.current && channelEmployeeIdRef.current === employeeId && channelReadyRef.current) {
      return { channel: channelRef.current, ready: channelReadyRef.current };
    }

    // If a previous channel exists but is no longer usable, tear it down before creating a new one.
    if (channelRef.current && channelEmployeeIdRef.current !== employeeId) {
      try {
        await supabaseClient.removeChannel(channelRef.current);
      } catch (err) {
        console.warn('[live-monitor] error removing previous channel before reuse', err);
      }
      channelRef.current = null;
      channelReadyRef.current = null;
      channelEmployeeIdRef.current = null;
    }

    const setupPromise = (async () => {
      // Tear down any previous channel (different employee, or a stale one).
      if (channelRef.current) {
        try {
          await supabaseClient.removeChannel(channelRef.current);
        } catch (err) {
          console.warn('[live-monitor] error removing previous channel', err);
        }
        channelRef.current = null;
        channelReadyRef.current = null;
        channelEmployeeIdRef.current = null;
      }

      // ───────────────────────────────────────────────────────────────────
      // FIX: orphaned-channel guard. Fast Refresh (or any remount that
      // reset our refs without calling removeChannel — e.g. this component
      // getting torn down and rebuilt by React without our unmount effect
      // running for some reason) can leave the *actual* Supabase channel
      // object still registered under this topic even though our refs
      // think it's gone. supabaseClient.channel(topic, ...) will then
      // silently hand back that orphaned, already-subscribed object instead
      // of a fresh one — and its listeners are wired to dead closures from
      // the previous mount, so offers/answers/ICE candidates go nowhere.
      // Find and remove any such orphan by topic before creating anew.
      // ───────────────────────────────────────────────────────────────────
      const topic = `live-${employeeId}`;
      const orphan = supabaseClient.getChannels().find((ch: any) =>
        ch.topic === `realtime:${topic}` || ch.topic === topic
      );
      if (orphan) {
        console.warn('[live-monitor] removing orphaned channel before recreating', topic);
        try {
          await supabaseClient.removeChannel(orphan);
        } catch (err) {
          console.warn('[live-monitor] error removing orphaned channel', err);
        }
      }

      // NOTE: `private: true` and `broadcast.ack: true` MUST match the
      // Electron agent's channel config exactly, or the two sides will not
      // see each other's broadcasts despite sharing a topic name.
      const channel = supabaseClient.channel(topic, {
        config: {
          broadcast: { self: false, ack: true },
          presence: { key: adminIdRef.current || 'admin' },
          private: true,
        },
      });

      // Register listeners before subscribing so the channel is fully wired up.
      // Re-adding listeners after subscribe() throws the error shown in the logs.
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const presentAgents = Object.values(state as Record<string, any[]>).flat();
        const online = presentAgents.some((entry: any) => entry?.online);
        // The FIRST presence sync right after subscribing can legitimately
        // come back empty even though the agent is online — there's a race
        // between our subscribe completing and the agent's own .track()
        // call reaching the server. Treat that as "not yet known" rather
        // than "confirmed offline", and only fire handleAgentWentOffline()
        // on a genuine online -> offline transition.
        const previouslyKnownOnline = agentOnlineRef.current.get(employeeId);
        agentOnlineRef.current.set(employeeId, online);
        setAgents(prev => prev.map((item) => item.agentId === employeeId ? { ...item, online } : item));
        if (!online && previouslyKnownOnline === true && activeEmployeeRef.current === employeeId) {
          handleAgentWentOffline(employeeId);
        }
      });

      channel.on('broadcast', { event: 'offer' }, async ({ payload }: { payload: any }) => {
        if (payload?.from !== 'agent' || payload?.employeeId !== employeeId) return;
        console.log('[live-monitor] stream-offer received', { employeeId, hasSdp: Boolean(payload?.sdp) });
        try {
          clearConnectTimeout();
          clearReconnectTimer();
          connectAttemptsRef.current = 0;
          const pc = peerRef.current ?? createPeerConnection(employeeId);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          const localDescription = pc.localDescription;
          const result = await channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { employeeId, adminId: adminIdRef.current, from: 'admin', sdp: serializeSessionDescription(localDescription) ?? serializeSessionDescription(answer) },
          });
          console.log('[live-monitor] send answer result:', result);
          if (result !== 'ok') {
            setStreamError(`Failed to send answer: ${result}`);
          }
          setStreamState('Connected');
          setIsConnectingStream(false);
          setIsStreaming(true);
          setStreamError(null);
        } catch (err: any) {
          console.error('Failed to answer stream offer', err);
          setStreamError(err.message || 'Failed to answer stream offer');
        }
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload }: { payload: any }) => {
        if (payload?.from !== 'agent' || payload?.employeeId !== employeeId) return;
        console.log('[live-monitor] answer received from agent', { employeeId, hasSdp: Boolean(payload?.sdp) });
        const pc = peerRef.current;
        if (!pc) {
          console.warn('[live-monitor] received answer but no active peer connection exists');
          return;
        }
        if (pc.signalingState !== 'have-local-offer') {
          console.warn('[live-monitor] ignoring answer — unexpected signalingState', pc.signalingState);
          return;
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          console.log('[live-monitor] remote description (answer) applied successfully');
          clearConnectTimeout();
          clearReconnectTimer();
          connectAttemptsRef.current = 0;
          if (peerRef.current?.remoteDescription) {
            markStreamActive();
          }
        } catch (err: any) {
          console.error('[live-monitor] failed to apply remote answer', err);
          setStreamError(err?.message || 'Failed to apply remote answer');
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }: { payload: any }) => {
        if (payload?.from !== 'agent' || payload?.employeeId !== employeeId) return;
        if (!peerRef.current || !payload?.candidate) return;
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.warn('Ignored ICE candidate error', err);
        }
      });

      channel.on('broadcast', { event: 'stop-stream' }, ({ payload }: { payload: any }) => {
        if (payload?.employeeId !== employeeId) return;
        stopStream();
      });

      const ready = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Channel subscribe timed out'));
        }, CHANNEL_SUBSCRIBE_TIMEOUT_MS);

        channel.subscribe((status: string, err?: Error) => {
          console.log('[live-monitor] channel status:', status, err ? `error: ${err.message}` : '');
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            void channel.track({ online: true, adminId: adminIdRef.current, role: user?.role || 'admin' });
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timeout);
            reject(new Error(`Channel subscribe failed: ${status}${err ? ` (${err.message})` : ''}`));
          }
        });
      });

      channelRef.current = channel;
      channelReadyRef.current = ready;
      channelEmployeeIdRef.current = employeeId;

      // Don't let an unhandled rejection from `ready` crash anything —
      // callers of ensureChannel await it themselves and handle errors.
      ready.catch(() => {});

      return { channel, ready };
    })();

    channelSetupInFlightRef.current = setupPromise;
    try {
      return await setupPromise;
    } finally {
      // Only clear the in-flight marker if it's still ours (a newer call
      // may have already replaced it).
      if (channelSetupInFlightRef.current === setupPromise) {
        channelSetupInFlightRef.current = null;
      }
    }
  }

  async function requestStream(employeeId: string, employeeName: string) {
    // Guard against rapid duplicate calls for the same employee (fast
    // double-click, refresh button mashed, reconnect racing a manual click).
    if (requestStreamInFlightRef.current === employeeId) {
      console.log('[live-monitor] requestStream already in flight for', employeeId, '— ignoring duplicate call');
      return;
    }
    requestStreamInFlightRef.current = employeeId;

    let channel: any;
    let ready: Promise<void>;
    try {
      ({ channel, ready } = await ensureChannel(employeeId));
    } catch (err: any) {
      console.error('[live-monitor] failed to set up channel', err);
      requestStreamInFlightRef.current = null;
      setSelectedEmployee({ id: employeeId, name: employeeName });
      selectedEmployeeRef.current = { id: employeeId, name: employeeName };
      setStreamError('Could not connect to the signaling channel. Check RLS policies / connector permissions.');
      setStreamState('Error');
      return;
    }

    // Critical fix: wait for the channel to finish SUBSCRIBED before sending
    // anything. Sending too early causes realtime-js to silently fall back
    // to REST delivery ("Realtime send() is automatically falling back to
    // REST API...") which the agent's websocket listener never receives.
    try {
      await ready;
    } catch (err: any) {
      requestStreamInFlightRef.current = null;
      console.error('[live-monitor] channel not ready, cannot request stream', err);
      setSelectedEmployee({ id: employeeId, name: employeeName });
      selectedEmployeeRef.current = { id: employeeId, name: employeeName };
      setStreamError('Could not connect to the signaling channel. Check RLS policies / connector permissions.');
      setStreamState('Error');
      return;
    }

    clearReconnectTimer();
    if (activeEmployeeRef.current === employeeId && hasLiveRemoteStream() && hasActivePeerConnection()) {
      setSelectedEmployee({ id: employeeId, name: employeeName });
      selectedEmployeeRef.current = { id: employeeId, name: employeeName };
      activeEmployeeRef.current = employeeId;
      attachRemoteStream(remoteStreamRef.current);
      markStreamActive();
      console.log('[live-monitor] stream already in progress, skipping duplicate request', { employeeId });
      requestStreamInFlightRef.current = null;
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

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const localDescription = pc.localDescription;
      const result = await channel.send({
        type: 'broadcast',
        event: 'offer',
        payload: { employeeId, adminId: adminIdRef.current, from: 'admin', sdp: serializeSessionDescription(localDescription) ?? serializeSessionDescription(offer) },
      });
      console.log('[live-monitor] send offer result:', result);
      if (result !== 'ok') {
        console.error('[live-monitor] ❌ Offer broadcast failed — likely RLS policy or channel mismatch:', result);
        setStreamError(`Offer send failed: ${result}`);
      }
    } catch (err) {
      console.error('Failed to create stream offer', err);
      setStreamError('Unable to start the live stream.');
      setStreamState('Error');
      setIsConnectingStream(false);
    } finally {
      requestStreamInFlightRef.current = null;
    }

    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (activeEmployeeRef.current !== employeeId) return;
      if (hasStreamConnected() || isStreamingRef.current) {
        console.log('[live-monitor] stopping retry loop — stream already connected', { employeeId });
        clearConnectTimeout();
        return;
      }
      if (agentOnlineRef.current.get(employeeId) === false) {
        console.log('[live-monitor] not retrying — agent known to be offline', { employeeId });
        handleAgentWentOffline(employeeId);
        return;
      }
      if (connectAttemptsRef.current < 1) {
        connectAttemptsRef.current += 1;
        console.log('[live-monitor] retrying stream-request automatically', { employeeId });
        void channel.send({
          type: 'broadcast',
          event: 'offer',
          payload: { employeeId, adminId: adminIdRef.current, from: 'admin', sdp: serializeSessionDescription(pc.localDescription) },
        }).then((result: string) => {
          console.log('[live-monitor] retry send offer result:', result);
        });
        return;
      }
      setStreamError('No response from agent. It may be offline or unreachable.');
      setStreamState('Timed out');
      setIsConnectingStream(false);
    }, STREAM_CONNECT_TIMEOUT_MS);
  }

  async function startRecording() {
    if (!remoteStreamRef.current || !selectedEmployeeRef.current) return;
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
        formData.append('adminId', adminIdRef.current || '');
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
                void requestStream(agent.agentId, agent.name);
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
          onRefresh={() => selectedEmployee && void requestStream(selectedEmployee.id, selectedEmployee.name)}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onFullscreen={toggleEnlarge}
        />
      )}
    </div>
  );
}