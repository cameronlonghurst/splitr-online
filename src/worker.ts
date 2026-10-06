import { DurableObject } from 'cloudflare:workers';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS?: Fetcher;
}

interface PlayerSession {
  id: string;
  ws: WebSocket;
  name: string;
  color: string;
  x: number;
  y: number;
  lastMsgTime: number;
  msgCount: number;
}

const MAP_SIZE = 10000;
const MAX_PLAYERS = 64;
const TICK_INTERVAL_MS = 100; // 10 Hz broadcast
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_SEC = 40;
const MAX_PAYLOAD_BYTES = 1024;

export class GameRoom extends DurableObject {
  private players: Map<string, PlayerSession> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // If not a WebSocket upgrade, return room health info
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          room: 'public',
          connectedPlayers: this.players.size,
          maxPlayers: MAX_PLAYERS,
          protocol: 'Splitr-WebSocket-v1'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    if (this.players.size >= MAX_PLAYERS) {
      return new Response('Room is at maximum capacity', { status: 503 });
    }

    // Set up WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(webSocketPair);

    serverWs.accept();

    const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
    const initialSpawnX = Math.round(Math.random() * (MAP_SIZE - 2000) + 1000);
    const initialSpawnY = Math.round(Math.random() * (MAP_SIZE - 2000) + 1000);

    const session: PlayerSession = {
      id: playerId,
      ws: serverWs,
      name: 'Player',
      color: '#111111',
      x: initialSpawnX,
      y: initialSpawnY,
      lastMsgTime: Date.now(),
      msgCount: 0
    };

    this.players.set(playerId, session);

    // Send connection acknowledgement
    try {
      serverWs.send(
        JSON.stringify({
          type: 'connected',
          playerId,
          mapSize: MAP_SIZE,
          spawn: { x: initialSpawnX, y: initialSpawnY }
        })
      );
    } catch (_) {}

    // Ensure tick loop is running
    this.ensureTickLoop();

    // Broadcast immediately so others see this player joined
    this.broadcastState();

    // Listen to messages from this player
    serverWs.addEventListener('message', (event) => {
      this.handlePlayerMessage(playerId, event.data);
    });

    const cleanup = () => {
      if (this.players.has(playerId)) {
        this.players.delete(playerId);
        this.broadcastState();
        if (this.players.size === 0 && this.tickInterval) {
          clearInterval(this.tickInterval);
          this.tickInterval = null;
        }
      }
    };

    serverWs.addEventListener('close', cleanup);
    serverWs.addEventListener('error', cleanup);

    return new Response(null, {
      status: 101,
      webSocket: clientWs
    });
  }

  private handlePlayerMessage(playerId: string, rawData: unknown): void {
    const session = this.players.get(playerId);
    if (!session) return;

    if (typeof rawData !== 'string') return;
    if (rawData.length > MAX_PAYLOAD_BYTES) return;

    // Basic rate-limiting per connection
    const now = Date.now();
    if (now - session.lastMsgTime > RATE_LIMIT_WINDOW_MS) {
      session.lastMsgTime = now;
      session.msgCount = 1;
    } else {
      session.msgCount++;
      if (session.msgCount > MAX_MESSAGES_PER_SEC) {
        return; // Dropped by rate limiter
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawData);
    } catch (_) {
      return; // Malformed JSON ignored
    }

    if (!parsed || typeof parsed.type !== 'string') return;

    if (parsed.type === 'join') {
      if (typeof parsed.name === 'string') {
        const cleanName = parsed.name.trim().substring(0, 16);
        session.name = cleanName.length > 0 ? cleanName : 'Player';
      }
      if (typeof parsed.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.color)) {
        session.color = parsed.color;
      }
      this.broadcastState();
    } else if (parsed.type === 'input') {
      const x = Number(parsed.x);
      const y = Number(parsed.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        session.x = Math.max(0, Math.min(MAP_SIZE, Math.round(x)));
        session.y = Math.max(0, Math.min(MAP_SIZE, Math.round(y)));
      }
    } else if (parsed.type === 'ping') {
      try {
        session.ws.send(JSON.stringify({ type: 'pong', t: parsed.t }));
      } catch (_) {}
    }
  }

  private ensureTickLoop(): void {
    if (!this.tickInterval) {
      this.tickInterval = setInterval(() => {
        if (this.players.size === 0) {
          if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
          }
          return;
        }
        this.broadcastState();
      }, TICK_INTERVAL_MS);
    }
  }

  private broadcastState(): void {
    if (this.players.size === 0) return;

    const payload = JSON.stringify({
      type: 'state',
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y
      }))
    });

    for (const [id, session] of this.players.entries()) {
      try {
        session.ws.send(payload);
      } catch (_) {
        this.players.delete(id);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route multiplayer room WebSocket requests
    if (url.pathname.startsWith('/api/room/') || url.pathname.startsWith('/room/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      // /api/room/:roomId -> parts[2] or /room/:roomId -> parts[1]
      const roomId = (parts.length >= 3 && parts[0] === 'api' ? parts[2] : parts[1]) || 'public';
      const cleanRoomId = roomId.toLowerCase().trim();

      const doId = env.GAME_ROOM.idFromName(cleanRoomId);
      const stub = env.GAME_ROOM.get(doId);
      return stub.fetch(request);
    }

    // Default static assets fallback if env.ASSETS is provided
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Splitr Multiplayer Backend', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
