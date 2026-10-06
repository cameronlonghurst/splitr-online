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
  mass: number;
  lastMsgTime: number;
  msgCount: number;
}

interface FoodPellet {
  id: number;
  x: number;
  y: number;
  color: string;
}

const MAP_SIZE = 4000;
const FOOD_COUNT = 500;
const BASE_PLAYER_MASS = 25;
const MAX_PLAYERS = 64;
const TICK_INTERVAL_MS = 50; // ~20 Hz server tick
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_SEC = 50;
const MAX_PAYLOAD_BYTES = 1024;

const FOOD_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#14B8A6', '#6366F1', '#F97316'
];

export class GameRoom extends DurableObject {
  private players: Map<string, PlayerSession> = new Map();
  private foods: Map<number, FoodPellet> = new Map();
  private nextFoodId: number = 1;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initFoods();
  }

  private initFoods(): void {
    this.foods.clear();
    for (let i = 1; i <= FOOD_COUNT; i++) {
      this.foods.set(i, {
        id: i,
        x: Math.round(Math.random() * (MAP_SIZE - 120) + 60),
        y: Math.round(Math.random() * (MAP_SIZE - 120) + 60),
        color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)]
      });
    }
    this.nextFoodId = FOOD_COUNT + 1;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Non-WebSocket requests receive room health information
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          room: 'public',
          mapSize: MAP_SIZE,
          foodCount: this.foods.size,
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
    const initialSpawnX = Math.round(Math.random() * (MAP_SIZE - 400) + 200);
    const initialSpawnY = Math.round(Math.random() * (MAP_SIZE - 400) + 200);

    const session: PlayerSession = {
      id: playerId,
      ws: serverWs,
      name: 'Player',
      color: '#111111',
      x: initialSpawnX,
      y: initialSpawnY,
      mass: BASE_PLAYER_MASS,
      lastMsgTime: Date.now(),
      msgCount: 0
    };

    this.players.set(playerId, session);

    // Send full initial state: map size, player id, all food pellets, existing players
    try {
      serverWs.send(
        JSON.stringify({
          type: 'init',
          playerId,
          mapSize: MAP_SIZE,
          spawn: { x: initialSpawnX, y: initialSpawnY },
          foods: Array.from(this.foods.values()),
          players: Array.from(this.players.values()).map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            x: p.x,
            y: p.y,
            mass: p.mass
          }))
        })
      );
    } catch (_) {}

    // Ensure 20 Hz tick loop is running
    this.ensureTickLoop();

    // Listen to incoming messages
    serverWs.addEventListener('message', (event) => {
      this.handlePlayerMessage(playerId, event.data);
    });

    const cleanup = () => {
      if (this.players.has(playerId)) {
        this.players.delete(playerId);
        this.broadcastState([], []);
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

    // Rate-limiting per connection
    const now = Date.now();
    if (now - session.lastMsgTime > RATE_LIMIT_WINDOW_MS) {
      session.lastMsgTime = now;
      session.msgCount = 1;
    } else {
      session.msgCount++;
      if (session.msgCount > MAX_MESSAGES_PER_SEC) {
        return;
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawData);
    } catch (_) {
      return;
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
      this.broadcastState([], []);
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
        this.tick();
      }, TICK_INTERVAL_MS);
    }
  }

  private tick(): void {
    if (this.players.size === 0) {
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
      return;
    }

    const eatenFoodIds: number[] = [];
    const newFoods: FoodPellet[] = [];

    // Collision detection: player circle covering food pellet
    // Radius formula: radius = Math.sqrt(mass * 100)
    for (const player of this.players.values()) {
      const playerRadius = Math.sqrt(player.mass * 100);
      const playerRadiusSq = playerRadius * playerRadius;

      for (const [foodId, food] of this.foods.entries()) {
        if (!this.foods.has(foodId)) continue;
        const dx = player.x - food.x;
        const dy = player.y - food.y;
        if (dx * dx + dy * dy < playerRadiusSq) {
          this.foods.delete(foodId);
          eatenFoodIds.push(foodId);
          player.mass += 1;

          // Respawn new food pellet at random position
          const newId = this.nextFoodId++;
          if (this.nextFoodId > 1000000000) this.nextFoodId = 1;
          const newFood: FoodPellet = {
            id: newId,
            x: Math.round(Math.random() * (MAP_SIZE - 120) + 60),
            y: Math.round(Math.random() * (MAP_SIZE - 120) + 60),
            color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)]
          };
          this.foods.set(newId, newFood);
          newFoods.push(newFood);
        }
      }
    }

    this.broadcastState(eatenFoodIds, newFoods);
  }

  private broadcastState(eatenFoodIds: number[], newFoods: FoodPellet[]): void {
    if (this.players.size === 0) return;

    const payloadObj: any = {
      type: 'state',
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        mass: p.mass
      }))
    };

    if (eatenFoodIds.length > 0) {
      payloadObj.eaten = eatenFoodIds;
      payloadObj.newFoods = newFoods;
    }

    const payload = JSON.stringify(payloadObj);

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
