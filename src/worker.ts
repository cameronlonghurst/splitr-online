import { DurableObject } from 'cloudflare:workers';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS?: Fetcher;
}

interface ServerCell {
  id: string;
  x: number;
  y: number;
  mass: number;
  vx: number;
  vy: number;
  boostVx: number;
  boostVy: number;
  recombineTimer: number; // countdown in seconds
}

interface PlayerSession {
  id: string;
  ws: WebSocket;
  name: string;
  color: string;
  targetX: number;
  targetY: number;
  cells: ServerCell[];
  isDead: boolean;
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
const MAX_CELLS_PER_PLAYER = 16;
const MIN_SPLIT_MASS = 36;
const SPLIT_IMPULSE = 820; // px/s boost velocity conforming to PHYSICS_SPEC.md
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

    const firstCell: ServerCell = {
      id: 'c_' + Math.random().toString(36).substring(2, 9),
      x: initialSpawnX,
      y: initialSpawnY,
      mass: BASE_PLAYER_MASS,
      vx: 0,
      vy: 0,
      boostVx: 0,
      boostVy: 0,
      recombineTimer: 0
    };

    const session: PlayerSession = {
      id: playerId,
      ws: serverWs,
      name: 'Player',
      color: '#111111',
      targetX: initialSpawnX,
      targetY: initialSpawnY,
      cells: [firstCell],
      isDead: false,
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
          players: this.serializePlayers()
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

  private serializePlayers() {
    return Array.from(this.players.values())
      .filter((p) => !p.isDead && p.cells.length > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        cells: p.cells.map((c) => ({
          id: c.id,
          x: Math.round(c.x),
          y: Math.round(c.y),
          mass: c.mass,
          vx: Math.round(c.vx + c.boostVx),
          vy: Math.round(c.vy + c.boostVy)
        })),
        totalMass: p.cells.reduce((sum, c) => sum + c.mass, 0)
      }));
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
        session.targetX = Math.max(0, Math.min(MAP_SIZE, x));
        session.targetY = Math.max(0, Math.min(MAP_SIZE, y));
      }
    } else if (parsed.type === 'split') {
      this.handleSplit(session);
    } else if (parsed.type === 'respawn') {
      this.handleRespawn(session);
    } else if (parsed.type === 'ping') {
      try {
        session.ws.send(JSON.stringify({ type: 'pong', t: parsed.t }));
      } catch (_) {}
    }
  }

  private handleRespawn(session: PlayerSession): void {
    if (!session.isDead && session.cells.length > 0) return;

    const spawnX = Math.round(Math.random() * (MAP_SIZE - 400) + 200);
    const spawnY = Math.round(Math.random() * (MAP_SIZE - 400) + 200);

    session.isDead = false;
    session.targetX = spawnX;
    session.targetY = spawnY;
    session.cells = [
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        x: spawnX,
        y: spawnY,
        mass: BASE_PLAYER_MASS,
        vx: 0,
        vy: 0,
        boostVx: 0,
        boostVy: 0,
        recombineTimer: 0
      }
    ];

    try {
      session.ws.send(
        JSON.stringify({
          type: 'respawned',
          spawn: { x: spawnX, y: spawnY }
        })
      );
    } catch (_) {}
  }

  private handleSplit(session: PlayerSession): void {
    if (session.isDead || session.cells.length === 0) return;
    if (session.cells.length >= MAX_CELLS_PER_PLAYER) return;

    const canAdd = MAX_CELLS_PER_PLAYER - session.cells.length;
    let added = 0;
    const initialLen = session.cells.length;
    const newCells: ServerCell[] = [];

    for (let i = 0; i < initialLen; i++) {
      const cell = session.cells[i];
      if (cell.mass >= MIN_SPLIT_MASS && added < canAdd) {
        const splitMass = Math.floor(cell.mass / 2);
        cell.mass = splitMass;
        const r = Math.sqrt(splitMass * 100);
        // Recombination delay timer: scaling with mass, e.g. 15–35s
        const recombineTimer = Math.min(35, Math.max(15, 15 + splitMass * 0.025));
        cell.recombineTimer = recombineTimer;

        const dx = session.targetX - cell.x;
        const dy = session.targetY - cell.y;
        const dist = Math.hypot(dx, dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;

        const childId = 'c_' + Math.random().toString(36).substring(2, 8);
        const child: ServerCell = {
          id: childId,
          x: Math.max(r, Math.min(MAP_SIZE - r, cell.x + dirX * (r + 8))),
          y: Math.max(r, Math.min(MAP_SIZE - r, cell.y + dirY * (r + 8))),
          mass: splitMass,
          vx: cell.vx,
          vy: cell.vy,
          boostVx: dirX * SPLIT_IMPULSE,
          boostVy: dirY * SPLIT_IMPULSE,
          recombineTimer: recombineTimer
        };

        newCells.push(child);
        added++;
      }
    }

    if (newCells.length > 0) {
      session.cells.push(...newCells);
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

    const dt = TICK_INTERVAL_MS / 1000; // 0.05 seconds per tick

    // 1. Move cells, decay boost impulse velocities, count down recombine timers
    for (const session of this.players.values()) {
      if (session.isDead || session.cells.length === 0) continue;

      for (const cell of session.cells) {
        // Boost velocity decay over ~0.5–1s (exponential friction)
        if (Math.abs(cell.boostVx) > 2 || Math.abs(cell.boostVy) > 2) {
          cell.x += cell.boostVx * dt;
          cell.y += cell.boostVy * dt;
          const decay = Math.exp(-3.5 * dt);
          cell.boostVx *= decay;
          cell.boostVy *= decay;
        } else {
          cell.boostVx = 0;
          cell.boostVy = 0;
        }

        // Recombine cooldown timer
        if (cell.recombineTimer > 0) {
          cell.recombineTimer = Math.max(0, cell.recombineTimer - dt);
        }

        // Steer toward cursor target
        const dx = session.targetX - cell.x;
        const dy = session.targetY - cell.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          const speed = Math.max(70, 960 / Math.pow(cell.mass, 0.38));
          const targetVx = (dx / dist) * speed;
          const targetVy = (dy / dist) * speed;
          const lerpRate = Math.min(1, dt * 5.0);
          cell.vx += (targetVx - cell.vx) * lerpRate;
          cell.vy += (targetVy - cell.vy) * lerpRate;
        } else {
          cell.vx *= Math.exp(-4 * dt);
          cell.vy *= Math.exp(-4 * dt);
        }

        cell.x += cell.vx * dt;
        cell.y += cell.vy * dt;

        // Map boundaries clamping
        const radius = Math.sqrt(cell.mass * 100);
        cell.x = Math.max(radius, Math.min(MAP_SIZE - radius, cell.x));
        cell.y = Math.max(radius, Math.min(MAP_SIZE - radius, cell.y));
      }
    }

    // 2. Sibling cell interaction (gentle elastic separation & recombining)
    for (const session of this.players.values()) {
      if (session.isDead || session.cells.length < 2) continue;
      const cells = session.cells;

      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const c1 = cells[i];
          const c2 = cells[j];
          const r1 = Math.sqrt(c1.mass * 100);
          const r2 = Math.sqrt(c2.mass * 100);
          const dx = c2.x - c1.x;
          const dy = c2.y - c1.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = r1 + r2;

          // Recombination allowed if both cooldown timers expired
          if (c1.recombineTimer <= 0 && c2.recombineTimer <= 0) {
            if (dist < Math.max(r1, r2)) {
              if (c1.mass >= c2.mass) {
                c1.mass += c2.mass;
                cells.splice(j, 1);
                j--;
              } else {
                c2.mass += c1.mass;
                cells.splice(i, 1);
                i--;
                break;
              }
            }
          } else if (dist < minDist) {
            // Elastic separation to push overlapping owned cells apart without stacking
            const overlap = minDist - dist;
            const normalX = dx / dist;
            const normalY = dy / dist;
            const pushForce = Math.min(overlap * 0.45, 25);
            c1.x -= normalX * pushForce * 0.5;
            c1.y -= normalY * pushForce * 0.5;
            c2.x += normalX * pushForce * 0.5;
            c2.y += normalY * pushForce * 0.5;

            c1.x = Math.max(r1, Math.min(MAP_SIZE - r1, c1.x));
            c1.y = Math.max(r1, Math.min(MAP_SIZE - r1, c1.y));
            c2.x = Math.max(r2, Math.min(MAP_SIZE - r2, c2.x));
            c2.y = Math.max(r2, Math.min(MAP_SIZE - r2, c2.y));
          }
        }
      }
    }

    // 3. Food pellet consumption
    const eatenFoodIds: number[] = [];
    const newFoods: FoodPellet[] = [];

    for (const session of this.players.values()) {
      if (session.isDead || session.cells.length === 0) continue;

      for (const cell of session.cells) {
        const cellRadius = Math.sqrt(cell.mass * 100);
        const cellRadiusSq = cellRadius * cellRadius;

        for (const [foodId, food] of this.foods.entries()) {
          if (!this.foods.has(foodId)) continue;
          const dx = cell.x - food.x;
          const dy = cell.y - food.y;
          if (dx * dx + dy * dy < cellRadiusSq) {
            this.foods.delete(foodId);
            eatenFoodIds.push(foodId);
            cell.mass += 1;

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
    }

    // 4. Server-Authoritative Player-vs-Player (PvP) Consumption
    const activeSessions = Array.from(this.players.values()).filter(
      (p) => !p.isDead && p.cells.length > 0
    );

    for (let pi = 0; pi < activeSessions.length; pi++) {
      const p1 = activeSessions[pi];

      for (let pj = 0; pj < activeSessions.length; pj++) {
        if (pi === pj) continue;
        const p2 = activeSessions[pj];
        if (p2.isDead || p2.cells.length === 0) continue;

        for (let ci = p1.cells.length - 1; ci >= 0; ci--) {
          const c1 = p1.cells[ci];
          if (!c1) continue;
          const r1 = Math.sqrt(c1.mass * 100);

          for (let cj = p2.cells.length - 1; cj >= 0; cj--) {
            const c2 = p2.cells[cj];
            if (!c2) continue;
            const r2 = Math.sqrt(c2.mass * 100);
            const dist = Math.hypot(c1.x - c2.x, c1.y - c2.y);
            const minDist = r1 + r2;

            // Predator must be strictly at least 15% larger (massA >= massB * 1.15)
            if (c1.mass >= c2.mass * 1.15) {
              // Center inside predator circle or >= 60% covered
              if (dist < r1 - r2 * 0.25 || dist < r1 * 0.9) {
                c1.mass += c2.mass;
                p2.cells.splice(cj, 1);

                // If all cells for player 2 are eaten, trigger game-over packet
                if (p2.cells.length === 0) {
                  p2.isDead = true;
                  try {
                    p2.ws.send(
                      JSON.stringify({
                        type: 'gameOver',
                        killerName: p1.name || 'Player'
                      })
                    );
                  } catch (_) {}
                }
                break;
              }
            } else if (dist < minDist && c1.mass < c2.mass * 1.15 && c2.mass < c1.mass * 1.15) {
              // Cells similar in size (within 15% of each other) slide or collide gently without consuming
              const overlap = minDist - dist;
              const normalX = (c2.x - c1.x) / (dist || 1);
              const normalY = (c2.y - c1.y) / (dist || 1);
              const pushForce = Math.min(overlap * 0.35, 15);
              c1.x -= normalX * pushForce * 0.5;
              c1.y -= normalY * pushForce * 0.5;
              c2.x += normalX * pushForce * 0.5;
              c2.y += normalY * pushForce * 0.5;

              c1.x = Math.max(r1, Math.min(MAP_SIZE - r1, c1.x));
              c1.y = Math.max(r1, Math.min(MAP_SIZE - r1, c1.y));
              c2.x = Math.max(r2, Math.min(MAP_SIZE - r2, c2.x));
              c2.y = Math.max(r2, Math.min(MAP_SIZE - r2, c2.y));
            }
          }
        }
      }
    }

    this.broadcastState(eatenFoodIds, newFoods);
  }

  private broadcastState(eatenFoodIds: number[], newFoods: FoodPellet[]): void {
    if (this.players.size === 0) return;

    const payloadObj: any = {
      type: 'state',
      players: this.serializePlayers()
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
