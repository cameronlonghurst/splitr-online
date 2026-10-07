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

interface ServerVirus {
  id: string;
  x: number;
  y: number;
  mass: number;
  vx?: number;
  vy?: number;
}

interface ServerEjectedPellet {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  color: string;
  createdAt: number;
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
  lastEjectTime: number;
}

interface FoodPellet {
  id: number;
  x: number;
  y: number;
  color: string;
  mass: number;
  radius: number;
  isSuper?: boolean;
}

const MAP_SIZE = 40000;
const FOOD_COUNT = 9600; // Sufficient pellets to populate the 40,000x40,000 arena
const FOOD_MASS = 2; // Standardized food pellet mass value
const SUPER_FOOD_MASS = 10; // Standardized super food pellet mass value
const BASE_PLAYER_MASS = 50;
const MAX_PLAYERS = 64;
const MAX_CELLS_PER_PLAYER = 16;
const MIN_SPLIT_MASS = 36;
const SPLIT_IMPULSE = 820; // px/s boost velocity conforming to PHYSICS_SPEC.md
const TICK_INTERVAL_MS = 50; // ~20 Hz server tick
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_SEC = 50;
const MAX_PAYLOAD_BYTES = 1024;

// Virus & Ejected Pellet Constants
const VIRUS_COUNT = 80; // Pool of 80 static viruses for 40,000x40,000 world
const BASE_VIRUS_MASS = 100;
const VIRUS_SPLIT_THRESHOLD = 200; // once fed ~7 pellets exceeding ~200 mass
const EJECT_MIN_CELL_MASS = 32;
const EJECT_MASS_COST = 15;
const EJECT_PELLET_MASS = 15;
const EJECT_IMPULSE = 800; // initial launch velocity ~800 px/s
const EJECT_RATE_LIMIT_MS = 110; // ~9 shots/s

const FOOD_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#14B8A6', '#6366F1', '#F97316'
];

const FOOD_GRID_CELL_SIZE = 800;
const FOOD_GRID_COLS = 50; // 40000 / 800

export class GameRoom extends DurableObject {
  private players: Map<string, PlayerSession> = new Map();
  private foods: Map<number, FoodPellet> = new Map();
  private foodGrid: Map<number, Set<number>> = new Map();
  private viruses: Map<string, ServerVirus> = new Map();
  private ejectedPellets: Map<string, ServerEjectedPellet> = new Map();
  private pendingVirusRespawns: Array<{ id: string; delay: number }> = [];
  private nextFoodId: number = 1;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initFoods();
    this.initViruses();
  }

  private getGridKey(x: number, y: number): number {
    const col = Math.min(FOOD_GRID_COLS - 1, Math.max(0, Math.floor(x / FOOD_GRID_CELL_SIZE)));
    const row = Math.min(FOOD_GRID_COLS - 1, Math.max(0, Math.floor(y / FOOD_GRID_CELL_SIZE)));
    return row * FOOD_GRID_COLS + col;
  }

  private addFoodToGrid(food: FoodPellet): void {
    const key = this.getGridKey(food.x, food.y);
    let bucket = this.foodGrid.get(key);
    if (!bucket) {
      bucket = new Set();
      this.foodGrid.set(key, bucket);
    }
    bucket.add(food.id);
  }

  private removeFoodFromGrid(food: FoodPellet): void {
    const key = this.getGridKey(food.x, food.y);
    const bucket = this.foodGrid.get(key);
    if (bucket) {
      bucket.delete(food.id);
    }
  }

  private initFoods(): void {
    this.foods.clear();
    this.foodGrid.clear();
    for (let i = 1; i <= FOOD_COUNT; i++) {
      const isSuper = Math.random() < 0.10;
      const pellet: FoodPellet = {
        id: i,
        x: Math.round(Math.random() * (MAP_SIZE - 200) + 100),
        y: Math.round(Math.random() * (MAP_SIZE - 200) + 100),
        color: isSuper ? '#F59E0B' : FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
        mass: isSuper ? SUPER_FOOD_MASS : FOOD_MASS,
        radius: isSuper ? 14 : 9.5,
        isSuper
      };
      this.foods.set(i, pellet);
      this.addFoodToGrid(pellet);
    }
    this.nextFoodId = FOOD_COUNT + 1;
  }

  private initViruses(): void {
    this.viruses.clear();
    this.pendingVirusRespawns = [];
    for (let i = 0; i < VIRUS_COUNT; i++) {
      const id = 'v_' + i;
      this.viruses.set(id, {
        id,
        x: Math.round(Math.random() * (MAP_SIZE - 2400) + 1200),
        y: Math.round(Math.random() * (MAP_SIZE - 2400) + 1200),
        mass: BASE_VIRUS_MASS
      });
    }
  }

  private spawnSafeVirus(id: string): void {
    let bestX = Math.round(Math.random() * (MAP_SIZE - 2400) + 1200);
    let bestY = Math.round(Math.random() * (MAP_SIZE - 2400) + 1200);

    // Pick location at least 450px away from any active player cell
    for (let attempt = 0; attempt < 35; attempt++) {
      const testX = Math.round(Math.random() * (MAP_SIZE - 2400) + 1200);
      const testY = Math.round(Math.random() * (MAP_SIZE - 2400) + 1200);
      let safe = true;
      for (const session of this.players.values()) {
        if (session.isDead) continue;
        for (const c of session.cells) {
          if (Math.hypot(c.x - testX, c.y - testY) < 450) {
            safe = false;
            break;
          }
        }
        if (!safe) break;
      }
      if (safe) {
        bestX = testX;
        bestY = testY;
        break;
      }
    }

    this.viruses.set(id, {
      id,
      x: bestX,
      y: bestY,
      mass: BASE_VIRUS_MASS
    });
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
          virusCount: this.viruses.size,
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
      msgCount: 0,
      lastEjectTime: 0
    };

    this.players.set(playerId, session);

    // Send full initial state: map size, player id, all food pellets, viruses, ejected pellets, existing players
    try {
      serverWs.send(
        JSON.stringify({
          type: 'init',
          playerId,
          mapSize: MAP_SIZE,
          spawn: { x: initialSpawnX, y: initialSpawnY },
          foods: Array.from(this.foods.values()),
          viruses: this.serializeViruses(),
          ejected: this.serializeEjected(),
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

  private serializeViruses() {
    return Array.from(this.viruses.values()).map((v) => ({
      id: v.id,
      x: Math.round(v.x),
      y: Math.round(v.y),
      mass: Math.round(v.mass)
    }));
  }

  private serializeEjected() {
    return Array.from(this.ejectedPellets.values()).map((ep) => ({
      id: ep.id,
      x: Math.round(ep.x),
      y: Math.round(ep.y),
      color: ep.color,
      mass: ep.mass
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
    } else if (parsed.type === 'eject') {
      this.handleEject(session);
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
        // Sigmally-style fast competitive recombine cooldown: base 18s, max 45s
        const recombineTimer = Math.min(45, Math.max(18, 18 + splitMass * 0.015));
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

  private handleEject(session: PlayerSession): void {
    if (session.isDead || session.cells.length === 0) return;

    const now = Date.now();
    if (now - session.lastEjectTime < EJECT_RATE_LIMIT_MS) return;
    session.lastEjectTime = now;

    for (const cell of session.cells) {
      if (cell.mass >= EJECT_MIN_CELL_MASS) {
        cell.mass -= EJECT_MASS_COST;

        const dx = session.targetX - cell.x;
        const dy = session.targetY - cell.y;
        const dist = Math.hypot(dx, dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;

        const r = Math.sqrt(cell.mass * 100);
        const spawnX = cell.x + dirX * (r + 14);
        const spawnY = cell.y + dirY * (r + 14);

        const pelletId = 'ep_' + Math.random().toString(36).substring(2, 9);
        const pellet: ServerEjectedPellet = {
          id: pelletId,
          ownerId: session.id,
          x: Math.max(10, Math.min(MAP_SIZE - 10, spawnX)),
          y: Math.max(10, Math.min(MAP_SIZE - 10, spawnY)),
          vx: dirX * EJECT_IMPULSE,
          vy: dirY * EJECT_IMPULSE,
          mass: EJECT_PELLET_MASS,
          color: session.color,
          createdAt: now
        };

        this.ejectedPellets.set(pelletId, pellet);
      }
    }
  }

  private popCellOnVirus(session: PlayerSession, cell: ServerCell): void {
    const availableSlots = MAX_CELLS_PER_PLAYER - session.cells.length;
    if (availableSlots <= 0) return;

    // Explode into equal sub-cells up to the 16-cell cap
    const piecesToCreate = Math.min(availableSlots, Math.max(2, Math.min(15, Math.floor(cell.mass / 32))));
    const totalPieces = piecesToCreate + 1;
    const pieceMass = Math.max(16, Math.floor(cell.mass / totalPieces));

    cell.mass = pieceMass;
    const recombineTimer = Math.min(45, Math.max(18, 18 + pieceMass * 0.015));
    cell.recombineTimer = recombineTimer;

    const angleStep = (Math.PI * 2) / piecesToCreate;
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < piecesToCreate; i++) {
      const a = baseAngle + i * angleStep;
      const popSpeed = 480 + Math.random() * 120;

      const child: ServerCell = {
        id: 'c_' + Math.random().toString(36).substring(2, 8),
        x: cell.x + Math.cos(a) * 35,
        y: cell.y + Math.sin(a) * 35,
        mass: pieceMass,
        vx: cell.vx,
        vy: cell.vy,
        boostVx: Math.cos(a) * popSpeed,
        boostVy: Math.sin(a) * popSpeed,
        recombineTimer
      };

      session.cells.push(child);
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
    const now = Date.now();

    // 0. Process queued safe virus respawns (5-second delay)
    for (let i = this.pendingVirusRespawns.length - 1; i >= 0; i--) {
      this.pendingVirusRespawns[i].delay -= dt;
      if (this.pendingVirusRespawns[i].delay <= 0) {
        const item = this.pendingVirusRespawns[i];
        this.pendingVirusRespawns.splice(i, 1);
        this.spawnSafeVirus(item.id);
      }
    }

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
          const speed = Math.max(70, 1450 / Math.pow(Math.max(1, cell.mass), 0.42));
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

    // 2. Move viruses propelled from feeding splits
    for (const v of this.viruses.values()) {
      if (v.vx && v.vy && (Math.abs(v.vx) > 5 || Math.abs(v.vy) > 5)) {
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        const decay = Math.exp(-4.5 * dt);
        v.vx *= decay;
        v.vy *= decay;
        v.x = Math.max(100, Math.min(MAP_SIZE - 100, v.x));
        v.y = Math.max(100, Math.min(MAP_SIZE - 100, v.y));
      } else {
        v.vx = 0;
        v.vy = 0;
      }
    }

    // 3. Move ejected pellets and decay velocity over ~0.4s
    for (const pellet of this.ejectedPellets.values()) {
      pellet.x += pellet.vx * dt;
      pellet.y += pellet.vy * dt;
      const decay = Math.exp(-7.5 * dt);
      pellet.vx *= decay;
      pellet.vy *= decay;
      pellet.x = Math.max(10, Math.min(MAP_SIZE - 10, pellet.x));
      pellet.y = Math.max(10, Math.min(MAP_SIZE - 10, pellet.y));
    }

    // 4. Ejected pellet feeding viruses and player consumption
    for (const [pelletId, pellet] of this.ejectedPellets.entries()) {
      let pelletConsumed = false;

      // Virus feeding check
      for (const v of this.viruses.values()) {
        const vr = Math.sqrt(v.mass * 100);
        const dist = Math.hypot(pellet.x - v.x, pellet.y - v.y);
        if (dist < vr + 12) {
          v.mass += pellet.mass;
          this.ejectedPellets.delete(pelletId);
          pelletConsumed = true;

          // Once fed ~7 pellets (exceeding ~200 mass), split & fire clone forward along line of fire
          if (v.mass >= VIRUS_SPLIT_THRESHOLD) {
            v.mass = BASE_VIRUS_MASS;
            const pSpeed = Math.hypot(pellet.vx, pellet.vy);
            const fwdX = pSpeed > 10 ? pellet.vx / pSpeed : 1;
            const fwdY = pSpeed > 10 ? pellet.vy / pSpeed : 0;

            if (this.viruses.size < 40) {
              const cloneId = 'v_' + Math.random().toString(36).substring(2, 8);
              this.viruses.set(cloneId, {
                id: cloneId,
                x: Math.max(120, Math.min(MAP_SIZE - 120, v.x + fwdX * 140)),
                y: Math.max(120, Math.min(MAP_SIZE - 120, v.y + fwdY * 140)),
                mass: BASE_VIRUS_MASS,
                vx: fwdX * 720,
                vy: fwdY * 720
              });
            }
          }
          break;
        }
      }

      if (pelletConsumed) continue;

      // Player re-consumption after 0.5s spawn invulnerability
      const ageSec = (now - pellet.createdAt) / 1000;
      if (ageSec >= 0.5) {
        for (const session of this.players.values()) {
          if (session.isDead || session.cells.length === 0) continue;
          for (const cell of session.cells) {
            const cr = Math.sqrt(cell.mass * 100);
            const dist = Math.hypot(cell.x - pellet.x, cell.y - pellet.y);
            if (dist < cr) {
              cell.mass += pellet.mass;
              this.ejectedPellets.delete(pelletId);
              pelletConsumed = true;
              break;
            }
          }
          if (pelletConsumed) break;
        }
      }
    }

    // 5. Sibling cell interaction: Rigid Sibling Separation & Recombining
    for (const session of this.players.values()) {
      if (session.isDead || session.cells.length < 2) continue;
      const cells = session.cells;

      // Multiple passes to resolve multi-cell clusters rigidly without collapsing
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const c1 = cells[i];
            const c2 = cells[j];
            if (!c1 || !c2) continue;
            const r1 = Math.sqrt(c1.mass * 100);
            const r2 = Math.sqrt(c2.mass * 100);
            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;
            const dist = Math.hypot(dx, dy) || 0.001;
            const minDist = r1 + r2;

            // Recombination allowed only when both cooldown timers expired
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
              // Rigid Sibling Separation: push apart along collision normal so they only touch at edges
              const overlap = minDist - dist;
              const normalX = dx / dist;
              const normalY = dy / dist;
              c1.x -= normalX * overlap * 0.5;
              c1.y -= normalY * overlap * 0.5;
              c2.x += normalX * overlap * 0.5;
              c2.y += normalY * overlap * 0.5;

              // Neutralize closing relative velocity along normal
              const relVx = c2.vx - c1.vx;
              const relVy = c2.vy - c1.vy;
              const normalVel = relVx * normalX + relVy * normalY;
              if (normalVel < 0) {
                c1.vx += normalX * normalVel * 0.5;
                c1.vy += normalY * normalVel * 0.5;
                c2.vx -= normalX * normalVel * 0.5;
                c2.vy -= normalY * normalVel * 0.5;
              }

              c1.x = Math.max(r1, Math.min(MAP_SIZE - r1, c1.x));
              c1.y = Math.max(r1, Math.min(MAP_SIZE - r1, c1.y));
              c2.x = Math.max(r2, Math.min(MAP_SIZE - r2, c2.x));
              c2.y = Math.max(r2, Math.min(MAP_SIZE - r2, c2.y));
            }
          }
        }
      }
    }

    // 6. Food pellet consumption
    const eatenFoodIds: number[] = [];
    const newFoods: FoodPellet[] = [];

    for (const session of this.players.values()) {
      if (session.isDead || session.cells.length === 0) continue;

      for (const cell of session.cells) {
        const cellRadius = Math.sqrt(cell.mass * 100);
        const cellRadiusSq = cellRadius * cellRadius;

        const minCol = Math.max(0, Math.floor((cell.x - cellRadius) / FOOD_GRID_CELL_SIZE));
        const maxCol = Math.min(FOOD_GRID_COLS - 1, Math.floor((cell.x + cellRadius) / FOOD_GRID_CELL_SIZE));
        const minRow = Math.max(0, Math.floor((cell.y - cellRadius) / FOOD_GRID_CELL_SIZE));
        const maxRow = Math.min(FOOD_GRID_COLS - 1, Math.floor((cell.y + cellRadius) / FOOD_GRID_CELL_SIZE));

        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const bucketKey = r * FOOD_GRID_COLS + c;
            const bucket = this.foodGrid.get(bucketKey);
            if (!bucket) continue;

            for (const foodId of Array.from(bucket)) {
              const food = this.foods.get(foodId);
              if (!food) continue;
              const dx = cell.x - food.x;
              const dy = cell.y - food.y;
              if (dx * dx + dy * dy < cellRadiusSq) {
                this.removeFoodFromGrid(food);
                this.foods.delete(foodId);
                eatenFoodIds.push(foodId);
                cell.mass += food.mass || FOOD_MASS;

                // Respawn new food pellet at random position
                const newId = this.nextFoodId++;
                if (this.nextFoodId > 1000000000) this.nextFoodId = 1;
                const isSuper = Math.random() < 0.10;
                const newFood: FoodPellet = {
                  id: newId,
                  x: Math.round(Math.random() * (MAP_SIZE - 120) + 60),
                  y: Math.round(Math.random() * (MAP_SIZE - 120) + 60),
                  color: isSuper ? '#F59E0B' : FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
                  mass: isSuper ? SUPER_FOOD_MASS : FOOD_MASS,
                  radius: isSuper ? 14 : 9.5,
                  isSuper
                };
                this.foods.set(newId, newFood);
                this.addFoodToGrid(newFood);
                newFoods.push(newFood);
              }
            }
          }
        }
      }
    }

    // 7. Player-Virus Collisions (Server-Authoritative)
    for (const session of this.players.values()) {
      if (session.isDead || session.cells.length === 0) continue;

      for (let ci = session.cells.length - 1; ci >= 0; ci--) {
        const cell = session.cells[ci];
        if (!cell) continue;
        const cr = Math.sqrt(cell.mass * 100);

        for (const v of Array.from(this.viruses.values())) {
          // If cell is small (mass < virus.mass): haven/shield, small cells pass safely under
          if (cell.mass < v.mass) {
            continue;
          }

          // If cell is big (mass >= 132 and > virus.mass * 1.15): consumes virus, pops into multiple cells
          if (cell.mass >= 132 && cell.mass > v.mass * 1.15) {
            const dist = Math.hypot(cell.x - v.x, cell.y - v.y);
            if (dist < cr) {
              cell.mass += v.mass;
              this.popCellOnVirus(session, cell);

              // Remove consumed virus and queue safe respawn after 5-second delay
              this.viruses.delete(v.id);
              this.pendingVirusRespawns.push({
                id: 'v_' + Math.random().toString(36).substring(2, 8),
                delay: 5.0
              });
              break;
            }
          }
        }
      }
    }

    // 8. Server-Authoritative Player-vs-Player (PvP) Consumption
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
      players: this.serializePlayers(),
      viruses: this.serializeViruses(),
      ejected: this.serializeEjected()
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
