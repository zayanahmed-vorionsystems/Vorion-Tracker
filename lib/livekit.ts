import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_TOKEN_TTL = '5m';

function getLiveKitEnv(name: 'LIVEKIT_URL' | 'LIVEKIT_API_KEY' | 'LIVEKIT_API_SECRET') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getLiveKitUrl() {
  return getLiveKitEnv('LIVEKIT_URL');
}

export function getLiveKitRoomName(employeeId: string, sessionId: string) {
  return `employee-${employeeId}-${sessionId}`;
}

export function getLiveKitRoomService() {
  return new RoomServiceClient(
    getLiveKitUrl(),
    getLiveKitEnv('LIVEKIT_API_KEY'),
    getLiveKitEnv('LIVEKIT_API_SECRET'),
  );
}async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs);
  }
}

export async function ensureLiveKitRoom(roomName: string) {
  const roomService = getLiveKitRoomService();
  return withRetry(async () => {
    const existingRooms = await roomService.listRooms([roomName]);
    if (existingRooms.length > 0) return existingRooms[0];
    return roomService.createRoom({
      name: roomName,
      emptyTimeout: 60,
      departureTimeout: 120,
    });
  });
}

export async function createLiveKitToken(options: {
  identity: string;
  roomName: string;
  canPublish: boolean;
  canSubscribe: boolean;
  metadata?: string;
  name?: string;
}) {
  const token = new AccessToken(
    getLiveKitEnv('LIVEKIT_API_KEY'),
    getLiveKitEnv('LIVEKIT_API_SECRET'),
    {
      identity: options.identity,
      ttl: LIVEKIT_TOKEN_TTL,
      metadata: options.metadata,
      name: options.name,
    },
  );

  token.addGrant({
    room: options.roomName,
    roomJoin: true,
    canPublish: options.canPublish,
    canSubscribe: options.canSubscribe,
    canPublishData: false,
  });

  return {
    token: await token.toJwt(),
    livekitUrl: getLiveKitUrl(),
    roomName: options.roomName,
    expiresIn: LIVEKIT_TOKEN_TTL,
  };
}
