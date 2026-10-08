/**
 * Splitr. — Minimal Competitive Cell Arena
 * Clean Editorial Design, Slower Smooth Elastic Splits & Sigmally-Style Soft-Body Cell Physics.
 * Full Dark Mode, High-Reliability P2P WebRTC Multiplayer, & Intuitive Player Hub.
 */

import { OnlineRoomClient } from './onlineAdapter.js';

// Default Brain-Rot Names Generator
export const BRAIN_ROT_NAMES = [
  "Skibidi", "Sigma", "Alpha", "Beta", "Rizzler", "Fanum Tax",
  "Mewing", "Gyatt", "Grimace", "Baby Gronk", "Livvy Dunne",
  "Kai Cenat", "Looksmaxxer", "Bussin", "Edging", "GigaChad",
  "Ohio", "Cap", "No Cap", "Cooked", "Let Him Cook",
  "Delulu", "Glazing", "Brainrot", "Mogger", "EdgeLord",
  "Yapology", "Sussus Amogus"
];

export function getRandomBrainRotName() {
  return BRAIN_ROT_NAMES[Math.floor(Math.random() * BRAIN_ROT_NAMES.length)];
}

// 8 Vibrant Palette Colors (excluding black and white)
export const VIBRANT_PALETTE = [
  '#FF1744', '#00E676', '#2979FF', '#FFEA00', '#FF9100', '#D500F9', '#00E5FF', '#FF4081'
];

export function getRandomPaletteColor() {
  return VIBRANT_PALETTE[Math.floor(Math.random() * VIBRANT_PALETTE.length)];
}

(function () {
  'use strict';

  // --- ARENA TUNING (Conforms to PHYSICS_SPEC.md) ---
  const MAP_SIZE = 10000;
  const GRID_SIZE = 60;
  const FOOD_COUNT = 4800;
  const VIRUS_COUNT = 38;
  const FOOD_MASS = 2;
  const MEDIUM_FOOD_MASS = 5;
  const SUPER_FOOD_MASS = 10;

  // Mass pellets: 15 mass points for each ejected mass pellet
  const EJECT_MASS = 15;
  const EJECT_LOSS = 15;
  const EJECT_COOLDOWN_MS = 130;

  const BASE_PLAYER_MASS = 50;
  const VIRUS_BASE_MASS = 100;
  const VIRUS_MAX_FEED = 7;
  const MAX_SPLITS = 16;
  const BUCKET_SIZE = 400;

  // Mass to radius curve: R = 10 * sqrt(M)
  function massToRadius(m) {
    return Math.sqrt(Math.max(1, m) * 100);
  }

  // Smooth Speed Curve - Snappy and faster for smaller cells
  function massToSpeed(m) {
    const baseSpeed = 1450;
    const exponent = 0.42;
    const minimumSpeed = 70;
    return Math.max(
      minimumSpeed,
      baseSpeed / Math.pow(Math.max(1, m), exponent)
    );
  }

  // Recombine Cooldown: Sigmally / Competitive conforming
  function calcRecombineTime(m) {
    return Math.min(45, Math.max(18, 18 + m * 0.015));
  }

  // Unambiguous Room Code Generator (no confusing characters: 0, 1, O, I removed)
  function generateCleanRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'SP-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Palette for Food Pellets
  const FOOD_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#14B8A6', '#6366F1', '#F97316'
  ];

  // Random Nickname Generator List
  const RANDOM_NAMES = BRAIN_ROT_NAMES;

  // Smart Arena Bots
  const BOT_PROFILES = [
    { name: 'Sirius', color: '#111111', archetype: 'TEAM_DUO', skill: 0.98 },
    { name: 'Kage', color: '#111111', archetype: 'TEAM_DUO', skill: 0.96 },
    { name: 'Zen', color: '#2563EB', archetype: 'TEAM_DUO', skill: 0.95 },
    { name: 'Eclipse', color: '#2563EB', archetype: 'TEAM_DUO', skill: 0.92 },
    { name: 'Toxic', color: '#EF4444', archetype: 'TEAM_DUO', skill: 0.94 },
    { name: 'Viper', color: '#EF4444', archetype: 'TEAM_DUO', skill: 0.90 },
    { name: 'Specter', color: '#10B981', archetype: 'CRACKED_PRO', skill: 0.99 },
    { name: 'Mirage', color: '#F59E0B', archetype: 'CRACKED_PRO', skill: 0.97 },
    { name: 'Phantom', color: '#8B5CF6', archetype: 'CRACKED_PRO', skill: 0.95 },
    { name: 'Apex', color: '#111111', archetype: 'CRACKED_PRO', skill: 0.93 },
    { name: 'Hyperion', color: '#06B6D4', archetype: 'AGGRESSIVE_RUSHER', skill: 0.88 },
    { name: 'Vortex', color: '#2563EB', archetype: 'AGGRESSIVE_RUSHER', skill: 0.85 },
    { name: 'Titan', color: '#10B981', archetype: 'AGGRESSIVE_RUSHER', skill: 0.82 },
    { name: 'Echo', color: '#8B5CF6', archetype: 'CAUTIOUS_SURVIVOR', skill: 0.74 },
    { name: 'Nova', color: '#F59E0B', archetype: 'CAUTIOUS_SURVIVOR', skill: 0.70 },
    { name: 'Pulse', color: '#06B6D4', archetype: 'CAUTIOUS_SURVIVOR', skill: 0.66 }
  ];

  // Reliable Public STUN ICE Servers for WebRTC P2P
  const ICE_SERVERS_CONFIG = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  // --- SPATIAL HASH GRID FOR PERFORMANCE ---
  class SpatialGrid {
    constructor(width, height, cellSize) {
      this.cellSize = cellSize;
      this.cols = Math.ceil(width / cellSize);
      this.rows = Math.ceil(height / cellSize);
      this.grid = new Map();
    }

    clear() {
      this.grid.clear();
    }

    _getKey(col, row) {
      return (col << 16) | (row & 0xffff);
    }

    insert(entity) {
      const minCol = Math.max(0, Math.floor((entity.x - entity.radius) / this.cellSize));
      const maxCol = Math.min(this.cols - 1, Math.floor((entity.x + entity.radius) / this.cellSize));
      const minRow = Math.max(0, Math.floor((entity.y - entity.radius) / this.cellSize));
      const maxRow = Math.min(this.rows - 1, Math.floor((entity.y + entity.radius) / this.cellSize));

      for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
          const key = this._getKey(c, r);
          let cell = this.grid.get(key);
          if (!cell) {
            cell = [];
            this.grid.set(key, cell);
          }
          cell.push(entity);
        }
      }
    }

    query(x, y, radius) {
      const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
      const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
      const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
      const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

      const found = new Set();
      for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
          const key = this._getKey(c, r);
          const cell = this.grid.get(key);
          if (cell) {
            for (let i = 0; i < cell.length; i++) {
              found.add(cell[i]);
            }
          }
        }
      }
      return Array.from(found);
    }
  }

  // --- ENTITY CLASSES ---
  class Cell {
    constructor(id, playerId, x, y, mass, color, name) {
      this.id = id;
      this.playerId = playerId;
      this.x = x;
      this.y = y;
      this.mass = mass;
      this.radius = massToRadius(mass);
      this.color = color;
      this.name = name;
      this.vx = 0;
      this.vy = 0;
      this.boostVx = 0; // Forward split launch velocity
      this.boostVy = 0;
      this.recombineTimer = 0;

      // Sigmally-style organic elasticity & squish-stretch harmonic oscillator
      this.squish = 1.0;        // 1.0 = perfect circle, >1.0 = stretched along squishAngle, <1.0 = squashed
      this.squishAngle = 0;     // Angle of stretching axis
      this.squishVel = 0;       // Oscillator velocity
    }

    triggerSquish(intensity, angle) {
      this.squish = Math.max(0.65, Math.min(1.45, intensity));
      this.squishAngle = angle;
      this.squishVel = (1.0 - this.squish) * 12.0;
    }

    updatePhysics(dt, targetWorldX, targetWorldY) {
      // Smooth radius adaptation
      const targetRadius = massToRadius(this.mass);
      this.radius += (targetRadius - this.radius) * Math.min(1, dt * 5.0);

      // Mass decay above baseline
      if (this.mass > BASE_PLAYER_MASS) {
        this.mass -= (this.mass * 0.0016) * dt;
      }

      // Recombine timer countdown
      if (this.recombineTimer > 0) {
        this.recombineTimer = Math.max(0, this.recombineTimer - dt);
      }

      // Smooth forward split boost glide with exponential friction decay
      if (Math.abs(this.boostVx) > 2 || Math.abs(this.boostVy) > 2) {
        this.x += this.boostVx * dt;
        this.y += this.boostVy * dt;
        const decay = Math.exp(-3.5 * dt);
        this.boostVx *= decay;
        this.boostVy *= decay;
      } else {
        this.boostVx = 0;
        this.boostVy = 0;
      }

      // Sigmally Elastic Harmonic Oscillator (Spring returning to circle)
      const springAcc = (1.0 - this.squish) * 150.0 - this.squishVel * 16.0;
      this.squishVel += springAcc * dt;
      this.squish += this.squishVel * dt;
      if (Math.abs(this.squish - 1.0) < 0.002 && Math.abs(this.squishVel) < 0.005) {
        this.squish = 1.0;
        this.squishVel = 0;
      }

      // Cursor steering vector
      const dx = targetWorldX - this.x;
      const dy = targetWorldY - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 5) {
        const speed = massToSpeed(this.mass);
        const targetVx = (dx / dist) * speed;
        const targetVy = (dy / dist) * speed;

        const lerpRate = Math.min(1, dt * 5.2);
        this.vx += (targetVx - this.vx) * lerpRate;
        this.vy += (targetVy - this.vy) * lerpRate;
      } else {
        this.vx *= Math.exp(-4 * dt);
        this.vy *= Math.exp(-4 * dt);
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Arena boundary collision
      this.x = Math.max(this.radius, Math.min(MAP_SIZE - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(MAP_SIZE - this.radius, this.y));
    }
  }

  class Virus {
    constructor(id, x, y) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.mass = VIRUS_BASE_MASS;
      this.radius = massToRadius(this.mass);
      this.feedCount = 0;
    }

    feed(ejectedMassVal) {
      this.mass += ejectedMassVal;
      this.feedCount++;
      this.radius = massToRadius(this.mass);
      if (this.feedCount >= VIRUS_MAX_FEED) {
        this.feedCount = 0;
        this.mass = VIRUS_BASE_MASS;
        this.radius = massToRadius(this.mass);
        return true;
      }
      return false;
    }
  }

  class EjectedMass {
    constructor(id, playerId, x, y, angle, color) {
      this.id = id;
      this.playerId = playerId;
      this.x = x;
      this.y = y;
      this.mass = EJECT_MASS;
      this.radius = 12;
      this.color = color || '#111111';
      const launchSpeed = 820;
      this.vx = Math.cos(angle) * launchSpeed;
      this.vy = Math.sin(angle) * launchSpeed;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const decay = Math.exp(-4.6 * dt);
      this.vx *= decay;
      this.vy *= decay;
      this.x = Math.max(this.radius, Math.min(MAP_SIZE - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(MAP_SIZE - this.radius, this.y));
    }
  }

  // --- GAME CONTROLLER ---
  class SplitrGame {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.minimapCanvas = document.getElementById('minimapCanvas');
      this.minimapCtx = this.minimapCanvas.getContext('2d');

      // Theme State (Dark Mode)
      this.isDarkMode = document.documentElement.classList.contains('dark');

      // Font loading guarantee
      this.fontReady = false;
      if (document.fonts && document.fonts.load) {
        document.fonts.load("16px 'Alice'").then(() => {
          this.fontReady = true;
        }).catch(() => {
          this.fontReady = true;
        });
      } else {
        this.fontReady = true;
      }

      // HUD Panels
      this.topStatsHud = document.getElementById('topStatsHud');
      this.leaderboardHud = document.getElementById('leaderboardHud');
      this.btnShowLeaderboard = document.getElementById('btnShowLeaderboard');
      this.bottomLeftHud = document.getElementById('bottomLeftHud');
      this.minimapHud = document.getElementById('minimapHud');
      this.macroHud = document.getElementById('macroHud');
      this.lobbyScreen = document.getElementById('lobbyScreen');
      this.lobbyRoundSummary = document.getElementById('lobbyRoundSummary');

      // Room Pill
      this.roomCodePill = document.getElementById('roomCodePill');
      this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
      this.btnCopyCode = document.getElementById('btnCopyCode');
      this.btnCopyLinkHUD = document.getElementById('btnCopyLinkHUD');

      // Top Stats
      this.statFps = document.getElementById('statFps');
      this.statPing = document.getElementById('statPing');
      this.statPingDot = document.getElementById('statPingDot');
      this.hudMass = document.getElementById('hudMass');
      this.hudCells = document.getElementById('hudCells');
      this.hudCoords = document.getElementById('hudCoords');
      this.leaderboardList = document.getElementById('leaderboardList');
      this.playerTotalCount = document.getElementById('playerTotalCount');

      // Chat Elements
      this.chatMessages = document.getElementById('chatMessages');
      this.chatForm = document.getElementById('chatForm');
      this.chatInput = document.getElementById('chatInput');

      // Mass Display Toggle
      this.showMass = true;
      this.btnToggleMass = document.getElementById('btnToggleMass');
      this.labelMassToggle = document.getElementById('labelMassToggle');

      // Leaderboard Visibility Toggle
      this.showLeaderboard = true;
      this.btnHideLeaderboard = document.getElementById('btnHideLeaderboard');
      this.btnToggleLeaderboard = document.getElementById('btnToggleLeaderboard');
      this.labelLeaderboardToggle = document.getElementById('labelLeaderboardToggle');

      // Audio Toggle
      this.soundEnabled = true;
      this.btnHeaderAudioToggle = document.getElementById('btnHeaderAudioToggle');
      this.headerAudioText = document.getElementById('headerAudioText');
      this.headerAudioIcon = document.getElementById('headerAudioIcon');
      this.audioCtx = null;
      this.lastEatSoundTime = 0;
      this.lastEjectSoundTime = 0;

      // Theme Toggle Header Button
      this.btnHeaderThemeToggle = document.getElementById('btnHeaderThemeToggle');
      this.headerThemeText = document.getElementById('headerThemeText');
      this.headerThemeIcon = document.getElementById('headerThemeIcon');

      // Modals
      this.modalRecords = document.getElementById('modalRecords');
      this.modalControls = document.getElementById('modalControls');

      // High-Impact Elimination Modal Elements
      this.eliminationModal = document.getElementById('eliminationModal');
      this.eliminationHeader = document.getElementById('eliminationHeader');
      this.eliminationKillerName = document.getElementById('eliminationKillerName');
      this.deathPeakMass = document.getElementById('deathPeakMass');
      this.deathTimeSurvived = document.getElementById('deathTimeSurvived');
      this.deathFoodConsumed = document.getElementById('deathFoodConsumed');
      this.deathPlayersDefeated = document.getElementById('deathPlayersDefeated');
      this.btnRunItBack = document.getElementById('btnRunItBack');
      this.btnSpectate = document.getElementById('btnSpectate');
      this.btnLeaveToLobby = document.getElementById('btnLeaveToLobby');

      // Spectator Mode Top Pill Elements
      this.spectatorHud = document.getElementById('spectatorHud');
      this.btnSpectatorRespawn = document.getElementById('btnSpectatorRespawn');
      this.btnSpectatorMenu = document.getElementById('btnSpectatorMenu');

      // Sleek Brain-Rot Kill Feed
      this.killFeedContainer = document.getElementById('killFeedContainer');

      // Run Statistics & Spectator Camera State
      this.playersDefeated = 0;
      this.isEliminated = false;
      this.eliminationTime = 0;
      this.killerName = '';
      this.killerId = null;
      this.spectateTargetMode = 'killer'; // 'killer' for 3 seconds, then 'leader'

      // Lobby Preview Elements
      this.previewCellAvatar = document.getElementById('previewCellAvatar');
      this.previewCellName = document.getElementById('previewCellName');

      // Eject Cooldown
      this.lastEjectTime = 0;

      // Identity & State
      this.localPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
      let savedNick = localStorage.getItem('splitr_nick');
      if (!savedNick || savedNick === 'Player') {
        savedNick = getRandomBrainRotName();
      }
      this.localNickname = savedNick;
      this.localColor = getRandomPaletteColor();

      const nickInput = document.getElementById('inputNickname');
      if (nickInput) nickInput.value = this.localNickname;

      this.isHost = true;
      this.isAlive = false;
      this.isSpectating = false;
      this.peer = null;
      this.connections = new Map();
      this.hostConn = null;
      this.roomCode = '';
      this.pingInterval = null;
      this.lastBroadcastTime = 0;

      // Entities
      this.players = new Map();
      this.foods = [];
      this.viruses = [];
      this.ejectedMasses = [];
      this.chatHistory = [];

      // Camera & Viewport
      this.camX = MAP_SIZE / 2;
      this.camY = MAP_SIZE / 2;
      this.camZoom = 0.65;
      this.dpr = window.devicePixelRatio || 1;
      this.mouseScreenX = window.innerWidth / 2;
      this.mouseScreenY = window.innerHeight / 2;
      this.mouseWorldX = MAP_SIZE / 2;
      this.mouseWorldY = MAP_SIZE / 2;

      // Stats
      this.peakMass = 0;
      this.foodEaten = 0;
      this.virusesHit = 0;
      this.startTime = 0;
      this.fps = 60;
      this.ping = 0;
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      this.fpsTimer = performance.now();
      this.loopStarted = false;

      this.foodGrid = new SpatialGrid(MAP_SIZE, MAP_SIZE, BUCKET_SIZE);

      // Online WebSocket Client & State
      this.onlineClient = new OnlineRoomClient();
      this.isOnlineMode = false;
      this.onlineMapSize = MAP_SIZE;
      this.onlineFoods = new Map();
      this.onlineViruses = new Map();
      this.onlineEjectedPellets = new Map();
      this.onlineLocalCells = new Map();
      this.onlineRemotePlayers = new Map();
      this.onlineLocalPlayerInitialized = false;
      this.isOnlineDead = false;
      this.isHoldingW = false;
      this.lastOnlineEjectTime = 0;

      this.initTheme();
      this.initCanvasSize();
      this.initCareerStats();
      this.initModals();
      this.bindEvents();

      // Start ambient live arena simulation in lobby background
      this.initWorld();
      this.spawnBots(15);
      this.updateAvatarPreview();
      this.updatePingBadge();
      this.loopStarted = true;
      requestAnimationFrame((t) => this.gameLoop(t));
    }

    // --- THEME MANAGEMENT ---
    initTheme() {
      const saved = localStorage.getItem('splitr_theme');
      if (saved) {
        this.isDarkMode = (saved === 'dark');
      } else {
        // Default to dark mode for an immersive modern look
        this.isDarkMode = true;
      }
      this.applyTheme();
    }

    toggleTheme() {
      this.isDarkMode = !this.isDarkMode;
      try {
        localStorage.setItem('splitr_theme', this.isDarkMode ? 'dark' : 'light');
      } catch (_) {}
      this.applyTheme();
    }

    applyTheme() {
      if (this.isDarkMode) {
        document.documentElement.classList.add('dark');
        if (this.headerThemeText) this.headerThemeText.textContent = 'Theme: Light';
      } else {
        document.documentElement.classList.remove('dark');
        if (this.headerThemeText) this.headerThemeText.textContent = 'Theme: Dark';
      }
      this.updateAvatarPreview();
    }

    // --- MODALS ---
    initModals() {
      const btnOpenRecords = document.getElementById('btnOpenRecordsModal');
      const btnCloseRecords = document.getElementById('btnCloseRecordsModal');
      const btnDismissRecords = document.getElementById('btnDismissRecords');

      const btnOpenControls = document.getElementById('btnOpenControlsModal');
      const btnCloseControls = document.getElementById('btnCloseControlsModal');
      const btnDismissControls = document.getElementById('btnDismissControls');

      const openModal = (m) => { if (m) m.classList.remove('hidden'); };
      const closeModal = (m) => { if (m) m.classList.add('hidden'); };

      if (btnOpenRecords) btnOpenRecords.addEventListener('click', () => openModal(this.modalRecords));
      if (btnCloseRecords) btnCloseRecords.addEventListener('click', () => closeModal(this.modalRecords));
      if (btnDismissRecords) btnDismissRecords.addEventListener('click', () => closeModal(this.modalRecords));

      if (btnOpenControls) btnOpenControls.addEventListener('click', () => openModal(this.modalControls));
      if (btnCloseControls) btnCloseControls.addEventListener('click', () => closeModal(this.modalControls));
      if (btnDismissControls) btnDismissControls.addEventListener('click', () => closeModal(this.modalControls));

      // Close modals on outside click
      [this.modalRecords, this.modalControls].forEach(modal => {
        if (modal) {
          modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
          });
        }
      });
    }

    initCanvasSize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.ctx.imageSmoothingEnabled = true;
    }

    initCareerStats() {
      try {
        const best = parseInt(localStorage.getItem('splitr_best_mass') || '0', 10);
        const games = parseInt(localStorage.getItem('splitr_games_count') || '0', 10);
        const pellets = parseInt(localStorage.getItem('splitr_total_pellets') || '0', 10);
        const timeSec = parseInt(localStorage.getItem('splitr_total_time') || '0', 10);

        const elBest = document.getElementById('careerBestMass');
        const elGames = document.getElementById('careerGamesCount');
        const elPellets = document.getElementById('careerTotalPellets');
        const elTime = document.getElementById('careerTotalTime');

        if (elBest) elBest.textContent = best.toLocaleString();
        if (elGames) elGames.textContent = games.toLocaleString();
        if (elPellets) elPellets.textContent = pellets.toLocaleString();
        if (elTime) {
          const mins = Math.floor(timeSec / 60);
          elTime.textContent = mins > 0 ? `${mins}m ${timeSec % 60}s` : `${timeSec}s`;
        }
      } catch (_) {}
    }

    checkUrlRoomParam() {
      try {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
          const cleanRoom = room.trim().toUpperCase();
          const joinInput = document.getElementById('inputJoinCode');
          if (joinInput) joinInput.value = cleanRoom;

          const urlBanner = document.getElementById('urlRoomBanner');
          const urlText = document.getElementById('urlRoomCodeText');
          if (urlBanner && urlText) {
            urlText.textContent = cleanRoom;
            urlBanner.classList.remove('hidden');
          }
        }
      } catch (_) {}
    }

    bindEvents() {
      window.addEventListener('resize', () => this.initCanvasSize());
      window.addEventListener('mousemove', (e) => {
        this.mouseScreenX = e.clientX;
        this.mouseScreenY = e.clientY;
        const halfW = (this.canvas.width / this.dpr) / 2;
        const halfH = (this.canvas.height / this.dpr) / 2;
        this.mouseWorldX = this.camX + (this.mouseScreenX - halfW) / this.camZoom;
        this.mouseWorldY = this.camY + (this.mouseScreenY - halfH) / this.camZoom;
        const p = this.players.get(this.localPlayerId);
        if (p) {
          p.targetX = this.mouseWorldX;
          p.targetY = this.mouseWorldY;
        }
      });

      // Keyboard Controls
      window.addEventListener('keydown', (e) => {
        // Chat active: let input handle typing
        if (e.target === this.chatInput) {
          if (e.key === 'Escape') this.hideChatInput();
          return;
        }

        // Nickname or code inputs active: allow typing
        if (e.target && (e.target.id === 'inputNickname' || e.target.id === 'inputJoinCode')) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.target.id === 'inputJoinCode') {
              const btnJoin = document.getElementById('btnJoinPrivate');
              if (btnJoin) btnJoin.click();
            } else {
              this.startOnlineGame();
            }
          }
          return;
        }

        // If eliminated or spectating: Space or Enter immediately triggers fast respawn (Run It Back)
        if (this.isEliminated || (this.eliminationModal && !this.eliminationModal.classList.contains('hidden')) || this.isSpectating) {
          if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.runItBack();
            return;
          }
        }

        // On lobby menu: pressing Enter joins standard online match
        if (e.key === 'Enter' && !this.isAlive && this.lobbyScreen && !this.lobbyScreen.classList.contains('hidden')) {
          e.preventDefault();
          this.startOnlineGame();
          return;
        }

        // Close open modals with Escape
        if (e.key === 'Escape') {
          if (this.modalRecords && !this.modalRecords.classList.contains('hidden')) {
            this.modalRecords.classList.add('hidden');
            return;
          }
          if (this.modalControls && !this.modalControls.classList.contains('hidden')) {
            this.modalControls.classList.add('hidden');
            return;
          }
          this.toggleLobby();
          return;
        }

        // When in lobby, Enter starts match (or joins if focused on join code input)
        if (!this.isAlive && this.lobbyScreen && !this.lobbyScreen.classList.contains('hidden')) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (document.activeElement && document.activeElement.id === 'inputJoinCode') {
              const btnJoin = document.getElementById('btnJoinPrivate');
              if (btnJoin) btnJoin.click();
            } else {
              this.startMatch(false);
            }
            return;
          }
        }

        // Theme shortcut (T)
        if (e.key === 't' || e.key === 'T') {
          this.toggleTheme();
          return;
        }

        // In-game: Open chat with '/' or 'Enter'
        if (e.key === '/' || e.key === 'Enter') {
          if (this.isAlive) {
            e.preventDefault();
            this.toggleChatInput();
            return;
          }
        }

        // Space: Normal split
        if (e.code === 'Space') {
          if (this.isAlive) {
            e.preventDefault();
            this.handleSplit();
          }
        } else if (e.key === 'w' || e.key === 'W') {
          if (this.isAlive) {
            e.preventDefault();
            this.isHoldingW = true;
            const now = performance.now();
            if (this.isOnlineMode) {
              if (now - this.lastOnlineEjectTime > 110) {
                this.lastOnlineEjectTime = now;
                this.handleEject();
              }
            } else if (now - this.lastEjectTime > EJECT_COOLDOWN_MS) {
              this.lastEjectTime = now;
              this.handleEject();
            }
          }
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          this.toggleMassDisplay();
        } else if (e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          this.toggleLeaderboard();
        }
      });

      // Release continuous keys on keyup and window blur
      window.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'W') {
          this.isHoldingW = false;
        }
      });
      window.addEventListener('blur', () => {
        this.isHoldingW = false;
      });

      // Mass text display toggle
      if (this.btnToggleMass) {
        this.btnToggleMass.addEventListener('click', () => this.toggleMassDisplay());
      }

      // Leaderboard visibility toggles
      if (this.btnHideLeaderboard) {
        this.btnHideLeaderboard.addEventListener('click', () => this.toggleLeaderboard(false));
      }
      if (this.btnShowLeaderboard) {
        this.btnShowLeaderboard.addEventListener('click', () => this.toggleLeaderboard(true));
      }
      if (this.btnToggleLeaderboard) {
        this.btnToggleLeaderboard.addEventListener('click', () => this.toggleLeaderboard());
      }

      // Audio toggle
      if (this.btnHeaderAudioToggle) {
        this.btnHeaderAudioToggle.addEventListener('click', () => this.toggleAudio());
      }

      // Theme header toggle
      if (this.btnHeaderThemeToggle) {
        this.btnHeaderThemeToggle.addEventListener('click', () => this.toggleTheme());
      }

      // Unlock Audio on first interaction
      const unlockAudio = () => {
        this.initAudio();
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('keydown', unlockAudio);

      // Random Name Button (Brainrot Name Generator)
      const btnRandom = document.getElementById('btnRandomName');
      if (btnRandom) {
        btnRandom.addEventListener('click', () => {
          const randomNick = getRandomBrainRotName();
          const inputNick = document.getElementById('inputNickname');
          if (inputNick) {
            inputNick.value = randomNick;
            this.localNickname = randomNick;
            try { localStorage.setItem('splitr_nick', this.localNickname); } catch (_) {}
            this.updateAvatarPreview();
          }
        });
      }

      // Nickname input
      const inputNick = document.getElementById('inputNickname');
      if (inputNick) {
        inputNick.addEventListener('input', () => {
          this.localNickname = inputNick.value.trim() || 'Player';
          try { localStorage.setItem('splitr_nick', this.localNickname); } catch (_) {}
          this.updateAvatarPreview();
        });
      }

      // Fetch live room count periodically and on hover
      this.fetchOnlinePlayerCount();
      setInterval(() => {
        if (!this.isOnlineMode) {
          this.fetchOnlinePlayerCount();
        }
      }, 7000);

      // Primary Mode Buttons: Play Offline & Play Online
      const btnPlayNormal = document.getElementById('btnPlayNormal');
      if (btnPlayNormal) {
        btnPlayNormal.addEventListener('click', () => this.startNormalGame());
      }
      const btnPlayOnline = document.getElementById('btnPlayOnline');
      if (btnPlayOnline) {
        btnPlayOnline.addEventListener('mouseenter', () => this.fetchOnlinePlayerCount());
        btnPlayOnline.addEventListener('click', () => this.startOnlineGame());
      }
      const btnPlay = document.getElementById('btnPlay');
      if (btnPlay) {
        btnPlay.addEventListener('click', () => this.startNormalGame());
      }

      // Elimination Modal Action Buttons
      if (this.btnRunItBack) {
        this.btnRunItBack.addEventListener('click', () => this.runItBack());
      }
      if (this.btnSpectate) {
        this.btnSpectate.addEventListener('click', () => this.startSpectating());
      }
      if (this.btnLeaveToLobby) {
        this.btnLeaveToLobby.addEventListener('click', () => this.returnToLobby());
      }

      // Spectator Mode HUD Action Buttons
      if (this.btnSpectatorRespawn) {
        this.btnSpectatorRespawn.addEventListener('click', () => this.runItBack());
      }
      if (this.btnSpectatorMenu) {
        this.btnSpectatorMenu.addEventListener('click', () => this.returnToLobby());
      }

      // Online Connection Error Modal Buttons
      const btnReturnToMenu = document.getElementById('btnReturnToMenu');
      if (btnReturnToMenu) {
        btnReturnToMenu.addEventListener('click', () => {
          this.hideOnlineErrorModal();
          this.isAlive = false;
          if (this.onlineClient) this.onlineClient.disconnect();
          this.hideInGameHUD();
          if (this.lobbyScreen) this.lobbyScreen.classList.remove('hidden');
        });
      }
      const btnFallbackPlayNormal = document.getElementById('btnFallbackPlayNormal');
      if (btnFallbackPlayNormal) {
        btnFallbackPlayNormal.addEventListener('click', () => {
          this.startNormalGame();
        });
      }

      // Paste Room Code Button
      const btnPasteCode = document.getElementById('btnPasteCode');
      if (btnPasteCode) {
        btnPasteCode.addEventListener('click', async () => {
          try {
            const text = await navigator.clipboard.readText();
            const inputCode = document.getElementById('inputJoinCode');
            if (inputCode && text) {
              inputCode.value = text.trim().toUpperCase();
            }
          } catch (_) {}
        });
      }

      // Join URL Room Banner Button
      const btnJoinUrlRoom = document.getElementById('btnJoinUrlRoom');
      if (btnJoinUrlRoom) {
        btnJoinUrlRoom.addEventListener('click', () => {
          const codeInput = document.getElementById('inputJoinCode');
          const code = codeInput ? codeInput.value.trim() : '';
          if (code) this.joinRoom(code);
        });
      }

      // Copy Hosted Code Button
      const btnCopyHosted = document.getElementById('btnCopyHostedCode');
      if (btnCopyHosted) {
        btnCopyHosted.addEventListener('click', () => {
          if (this.roomCode) {
            navigator.clipboard.writeText(this.roomCode).then(() => {
              btnCopyHosted.textContent = 'COPIED';
              setTimeout(() => (btnCopyHosted.textContent = 'Copy Code'), 1500);
            });
          }
        });
      }

      // Copy Invite Link Button
      const btnCopyInviteLink = document.getElementById('btnCopyInviteLink');
      if (btnCopyInviteLink) {
        btnCopyInviteLink.addEventListener('click', () => {
          if (this.roomCode) {
            const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
              btnCopyInviteLink.textContent = 'COPIED';
              setTimeout(() => (btnCopyInviteLink.textContent = 'Copy Link'), 1500);
            });
          }
        });
      }

      // In-game HUD copy buttons
      if (this.btnCopyCode) {
        this.btnCopyCode.addEventListener('click', () => {
          if (this.roomCode) {
            navigator.clipboard.writeText(this.roomCode).then(() => {
              this.btnCopyCode.textContent = 'COPIED';
              setTimeout(() => (this.btnCopyCode.textContent = 'COPY'), 1500);
            });
          }
        });
      }
      if (this.btnCopyLinkHUD) {
        this.btnCopyLinkHUD.addEventListener('click', () => {
          if (this.roomCode) {
            const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
              this.btnCopyLinkHUD.textContent = 'COPIED';
              setTimeout(() => (this.btnCopyLinkHUD.textContent = 'LINK'), 1500);
            });
          }
        });
      }

      // Chat input submit
      if (this.chatForm) {
        this.chatForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const msg = this.chatInput ? this.chatInput.value.trim() : '';
          if (msg) {
            this.sendChatMessage(this.localNickname, msg);
            if (this.chatInput) this.chatInput.value = '';
          }
          this.hideChatInput();
        });
      }
    }

    // --- AUDIO SYNTHESIZER ---
    initAudio() {
      if (this.audioCtx) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      } catch (_) {}
    }

    playEatSound(isSuper = false) {
      if (!this.soundEnabled || !this.audioCtx) return;
      const now = performance.now();
      if (now - this.lastEatSoundTime < 60) return;
      this.lastEatSoundTime = now;
      try {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = isSuper ? 'triangle' : 'sine';
        const startFreq = isSuper ? 680 : 420 + Math.random() * 60;
        osc.frequency.setValueAtTime(startFreq, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.4, this.audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(isSuper ? 0.07 : 0.03, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.055);
      } catch (_) {}
    }

    playSplitSound() {
      if (!this.soundEnabled || !this.audioCtx) return;
      try {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(90, this.audioCtx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.17);
      } catch (_) {}
    }

    playEjectSound() {
      if (!this.soundEnabled || !this.audioCtx) return;
      const now = performance.now();
      if (now - this.lastEjectSoundTime < 60) return;
      this.lastEjectSoundTime = now;
      try {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(240, this.audioCtx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.045, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.045);
      } catch (_) {}
    }

    playVirusPopSound() {
      if (!this.soundEnabled || !this.audioCtx) return;
      try {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const chords = [260, 340, 420, 520];
        chords.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + idx * 0.03);
          gain.gain.setValueAtTime(0.035, this.audioCtx.currentTime + idx * 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + idx * 0.03 + 0.18);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(this.audioCtx.currentTime + idx * 0.03);
          osc.stop(this.audioCtx.currentTime + idx * 0.03 + 0.2);
        });
      } catch (_) {}
    }

    toggleAudio() {
      this.soundEnabled = !this.soundEnabled;
      if (this.headerAudioText) {
        this.headerAudioText.textContent = this.soundEnabled ? 'Audio: ON' : 'Audio: OFF';
      }
      if (this.soundEnabled) this.initAudio();
    }

    fetchOnlinePlayerCount() {
      fetch('/api/room/public')
        .then(res => res.json())
        .then(data => {
          const count = typeof data.connectedPlayers === 'number' ? data.connectedPlayers : 0;
          const badge = document.getElementById('onlinePlayerCountBadge');
          if (badge) {
            badge.textContent = `${count} Online`;
          }
        })
        .catch(() => {
          const badge = document.getElementById('onlinePlayerCountBadge');
          if (badge) badge.textContent = 'Active';
        });
    }

    updateAvatarPreview() {
      const nickInput = document.getElementById('inputNickname');
      const nickname = (nickInput ? nickInput.value.trim() : '') || 'Player';

      if (this.previewCellAvatar) {
        this.previewCellAvatar.style.backgroundColor = this.localColor || '#FF1744';
        this.previewCellAvatar.style.borderColor = '#000000';
      }
      if (this.previewCellName) {
        this.previewCellName.textContent = nickname;
        this.previewCellName.className = 'font-serif text-sm sm:text-base font-bold tracking-tight truncate max-w-[86px] sm:max-w-[100px] text-center px-1 text-white';
      }
    }

    toggleChatInput() {
      if (!this.chatForm) return;
      if (this.chatForm.classList.contains('hidden')) {
        this.chatForm.classList.remove('hidden');
        if (this.chatInput) this.chatInput.focus();
      } else {
        this.hideChatInput();
      }
    }

    hideChatInput() {
      if (this.chatForm) this.chatForm.classList.add('hidden');
      if (this.chatInput) this.chatInput.blur();
    }

    sendChatMessage(sender, text) {
      const item = { id: Math.random().toString(), sender, text, time: Date.now() };
      this.addChatMessage(item);

      if (this.isHost) {
        this.broadcastPacket({ type: 'chat', item });
      } else if (this.hostConn && this.hostConn.open) {
        this.hostConn.send({ type: 'chat', item });
      }
    }

    addChatMessage(item) {
      this.chatHistory.push(item);
      if (this.chatHistory.length > 25) this.chatHistory.shift();

      if (this.chatMessages) {
        const el = document.createElement('div');
        el.className = 'bg-white/95 dark:bg-[#141414]/95 border border-[#111111] dark:border-[#262626] px-2.5 py-1 rounded text-xs text-[#111111] dark:text-white shadow-sm';
        el.innerHTML = `<span class="font-serif font-bold text-[#111111] dark:text-white">${escapeHtml(item.sender)}:</span> <span>${escapeHtml(item.text)}</span>`;
        this.chatMessages.appendChild(el);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        setTimeout(() => {
          el.style.transition = 'opacity 1s ease';
          el.style.opacity = '0.35';
        }, 7000);
      }
    }

    toggleLobby() {
      if (!this.lobbyScreen) return;
      this.lobbyScreen.classList.toggle('hidden');
    }

    toggleMassDisplay() {
      this.showMass = !this.showMass;
      if (this.labelMassToggle) {
        this.labelMassToggle.textContent = this.showMass ? 'ON' : 'OFF';
        this.labelMassToggle.className = this.showMass ? 'font-bold' : 'font-normal text-zinc-400';
      }
    }

    toggleLeaderboard(forceState = null) {
      if (forceState !== null) {
        this.showLeaderboard = forceState;
      } else {
        this.showLeaderboard = !this.showLeaderboard;
      }

      if (this.leaderboardHud) {
        if (this.showLeaderboard) {
          this.leaderboardHud.classList.remove('hidden');
        } else {
          this.leaderboardHud.classList.add('hidden');
        }
      }

      if (this.btnShowLeaderboard) {
        if (!this.showLeaderboard && this.isAlive) {
          this.btnShowLeaderboard.classList.remove('hidden');
        } else {
          this.btnShowLeaderboard.classList.add('hidden');
        }
      }

      if (this.labelLeaderboardToggle) {
        this.labelLeaderboardToggle.textContent = this.showLeaderboard ? 'ON' : 'OFF';
        this.labelLeaderboardToggle.className = this.showLeaderboard ? 'font-bold' : 'font-normal text-zinc-400';
      }
    }

    // --- PING & NETWORK STATUS INDICATOR ---
    updatePingBadge() {
      if (!this.statPing) return;

      if (!this.peer || (!this.hostConn && this.connections.size === 0)) {
        // Solo / Local Offline practice
        this.statPing.textContent = 'SOLO';
        if (this.statPingDot) this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-zinc-400';
      } else if (this.isHost) {
        const count = this.connections.size;
        this.statPing.textContent = count > 0 ? `HOST (${count}P)` : 'HOST';
        if (this.statPingDot) this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse';
      } else {
        // Connected client with live RTT ping
        const val = this.ping;
        this.statPing.textContent = `${val}ms`;
        if (this.statPingDot) {
          if (val < 70) {
            this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-emerald-500';
          } else if (val < 150) {
            this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-amber-500';
          } else {
            this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-red-500';
          }
        }
      }
    }

    // --- GAME START & MODES ---
    startNormalGame() {
      this.isOnlineMode = false;
      this.localColor = getRandomPaletteColor();
      this.updateAvatarPreview();
      if (this.onlineClient) this.onlineClient.disconnect();
      this.hideOnlineErrorModal();
      this.startMatch(false);
    }

    startOnlineGame() {
      const inputNick = document.getElementById('inputNickname');
      this.localNickname = (inputNick ? inputNick.value.trim() : '') || 'Player';
      this.localColor = getRandomPaletteColor();
      this.updateAvatarPreview();

      this.isOnlineMode = true;
      this.isHost = false;
      this.isSpectating = false;

      // Online Entities: local predicted player cells & remote interpolated player cells
      this.onlineLocalCells = new Map();
      this.onlineRemotePlayers = new Map();
      this.onlineFoods = new Map();
      this.onlineViruses = new Map();
      this.onlineEjectedPellets = new Map();
      this.onlineLocalPlayerInitialized = false;
      this.isOnlineDead = false;
      this.isHoldingW = false;
      this.lastOnlineEjectTime = 0;

      this.hideOnlineErrorModal();
      if (this.lobbyScreen) this.lobbyScreen.classList.add('hidden');
      this.showInGameHUD();

      // Clear offline bots and entities for online room
      this.players.clear();
      this.foods = [];
      this.viruses = [];
      this.ejectedMasses = [];

      this.camX = this.onlineMapSize / 2;
      this.camY = this.onlineMapSize / 2;
      this.camZoom = 0.65;

      if (this.statPing) this.statPing.textContent = 'CONNECTING...';
      if (this.statPingDot) this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse';

      this.onlineClient.connect({
        nickname: this.localNickname,
        color: this.localColor,
        onInit: (data) => {
          if (data && data.mapSize) {
            this.onlineMapSize = data.mapSize;
          }
          this.onlineFoods.clear();
          if (data && Array.isArray(data.foods)) {
            for (const f of data.foods) {
              this.onlineFoods.set(f.id, f);
            }
          }
          this.onlineViruses.clear();
          if (data && Array.isArray(data.viruses)) {
            for (const v of data.viruses) {
              const vr = Math.sqrt((v.mass || 100) * 100);
              this.onlineViruses.set(v.id, {
                id: v.id,
                x: v.x,
                y: v.y,
                targetX: v.x,
                targetY: v.y,
                mass: v.mass || 100,
                radius: vr,
                targetRadius: vr
              });
            }
          }
          this.onlineEjectedPellets.clear();
          if (data && Array.isArray(data.ejected)) {
            for (const ep of data.ejected) {
              this.onlineEjectedPellets.set(ep.id, {
                id: ep.id,
                x: ep.x,
                y: ep.y,
                targetX: ep.x,
                targetY: ep.y,
                color: ep.color || '#111111',
                mass: ep.mass || 15
              });
            }
          }
          if (data && data.spawn) {
            this.camX = data.spawn.x;
            this.camY = data.spawn.y;
          }
          if (data && Array.isArray(data.players)) {
            this.syncOnlinePlayers(data.players, data.playerId);
          }
        },
        onConnected: (data) => {
          if (this.statPing) this.statPing.textContent = 'ONLINE';
          if (this.statPingDot) this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-emerald-500';
          this.isAlive = true;
          this.isOnlineDead = false;
          this.startTime = Date.now();
          this.peakMass = BASE_PLAYER_MASS;
          this.foodEaten = 0;
          this.virusesHit = 0;

          if (data && data.spawn) {
            this.camX = data.spawn.x;
            this.camY = data.spawn.y;
          }
        },
        onState: (stateData, localId) => {
          if (localId) this.localPlayerId = localId;

          // Process eaten and newly spawned food pellets
          if (Array.isArray(stateData.eaten)) {
            for (const id of stateData.eaten) {
              this.onlineFoods.delete(id);
            }
          }
          if (Array.isArray(stateData.newFoods)) {
            for (const f of stateData.newFoods) {
              this.onlineFoods.set(f.id, f);
            }
          }

          // Sync online viruses
          if (Array.isArray(stateData.viruses)) {
            const activeVirusIds = new Set();
            for (const sv of stateData.viruses) {
              activeVirusIds.add(sv.id);
              const targetR = Math.sqrt((sv.mass || 100) * 100);
              let ov = this.onlineViruses.get(sv.id);
              if (!ov) {
                ov = {
                  id: sv.id,
                  x: sv.x,
                  y: sv.y,
                  targetX: sv.x,
                  targetY: sv.y,
                  mass: sv.mass || 100,
                  radius: targetR,
                  targetRadius: targetR
                };
                this.onlineViruses.set(sv.id, ov);
              } else {
                ov.targetX = sv.x;
                ov.targetY = sv.y;
                ov.mass = sv.mass || 100;
                ov.targetRadius = targetR;
              }
            }
            for (const id of this.onlineViruses.keys()) {
              if (!activeVirusIds.has(id)) {
                this.onlineViruses.delete(id);
              }
            }
          }

          // Sync online ejected pellets
          if (Array.isArray(stateData.ejected)) {
            const activeEjectedIds = new Set();
            for (const sep of stateData.ejected) {
              activeEjectedIds.add(sep.id);
              let oep = this.onlineEjectedPellets.get(sep.id);
              if (!oep) {
                oep = {
                  id: sep.id,
                  x: sep.x,
                  y: sep.y,
                  targetX: sep.x,
                  targetY: sep.y,
                  color: sep.color || '#111111',
                  mass: sep.mass || 15
                };
                this.onlineEjectedPellets.set(sep.id, oep);
              } else {
                oep.targetX = sep.x;
                oep.targetY = sep.y;
                oep.color = sep.color || oep.color;
                oep.mass = sep.mass || oep.mass;
              }
            }
            for (const id of this.onlineEjectedPellets.keys()) {
              if (!activeEjectedIds.has(id)) {
                this.onlineEjectedPellets.delete(id);
              }
            }
          }

          if (Array.isArray(stateData.players)) {
            this.syncOnlinePlayers(stateData.players, this.localPlayerId);
          }
        },
        onGameOver: (data) => {
          if (this.isAlive) {
            this.onLocalPlayerDeath(data && data.killerName, data && data.killerId);
          }
        },
        onKill: (data) => {
          if (data && data.killerName && data.victimName) {
            const isKillerLocal = data.killerId === this.localPlayerId;
            const isVictimLocal = data.victimId === this.localPlayerId;
            this.addKillFeedEntry(data.killerName, data.victimName, isKillerLocal, isVictimLocal);
          }
        },
        onCellEaten: () => {
          this.playersDefeated++;
        },
        onRespawned: (data) => {
          this.isAlive = true;
          this.isOnlineDead = false;
          this.isEliminated = false;
          this.isSpectating = false;
          this.startTime = Date.now();
          this.peakMass = BASE_PLAYER_MASS;
          this.foodEaten = 0;
          this.playersDefeated = 0;
          this.camZoom = 0.65;
          if (data && data.spawn) {
            this.camX = data.spawn.x;
            this.camY = data.spawn.y;
          }
          if (this.eliminationModal) {
            this.eliminationModal.classList.add('hidden');
          }
          if (this.spectatorHud) {
            this.spectatorHud.classList.add('hidden');
          }
        },
        onError: (err) => {
          this.showOnlineErrorModal(
            'Online Connection Failed',
            err && err.message ? err.message : 'Could not connect to the multiplayer room WebSocket.'
          );
        },
        onDisconnect: () => {
          if (this.isOnlineMode && this.isAlive) {
            this.showOnlineErrorModal('Online Connection Lost', 'Disconnected from the public room server.');
          }
        }
      });

      if (!this.loopStarted) {
        this.loopStarted = true;
        requestAnimationFrame((t) => this.gameLoop(t));
      }
    }

    syncOnlinePlayers(serverPlayers, localId) {
      const activeRemoteIds = new Set();
      let foundLocalPlayer = false;

      for (const sp of serverPlayers) {
        if (sp.id === localId) {
          foundLocalPlayer = true;
          const activeLocalCellIds = new Set();
          const cells = Array.isArray(sp.cells) ? sp.cells : [];

          for (const sc of cells) {
            activeLocalCellIds.add(sc.id);
            const targetR = Math.sqrt(sc.mass * 100);
            let lc = this.onlineLocalCells.get(sc.id);

            if (!lc) {
              lc = {
                id: sc.id,
                x: sc.x,
                y: sc.y,
                targetX: sc.x,
                targetY: sc.y,
                mass: sc.mass,
                radius: targetR,
                targetRadius: targetR,
                vx: sc.vx || 0,
                vy: sc.vy || 0
              };
              this.onlineLocalCells.set(sc.id, lc);
            } else {
              lc.targetX = sc.x;
              lc.targetY = sc.y;
              lc.mass = sc.mass;
              lc.targetRadius = targetR;
              lc.vx = sc.vx || 0;
              lc.vy = sc.vy || 0;
            }
          }

          // Remove any cells no longer in server state
          for (const id of this.onlineLocalCells.keys()) {
            if (!activeLocalCellIds.has(id)) {
              this.onlineLocalCells.delete(id);
            }
          }

          const totalMass = sp.totalMass || cells.reduce((sum, c) => sum + c.mass, 0);
          if (totalMass > this.peakMass) {
            this.peakMass = totalMass;
          }

          if (this.onlineLocalCells.size === 0 && this.isAlive) {
            this.onLocalPlayerDeath();
          }
          continue;
        }

        // Remote players
        activeRemoteIds.add(sp.id);
        let rp = this.onlineRemotePlayers.get(sp.id);
        if (!rp) {
          rp = {
            id: sp.id,
            name: sp.name || 'Player',
            color: sp.color || '#737373',
            totalMass: sp.totalMass || 25,
            cells: new Map()
          };
          this.onlineRemotePlayers.set(sp.id, rp);
        } else {
          rp.name = sp.name || 'Player';
          rp.color = sp.color || '#737373';
          rp.totalMass = sp.totalMass || 25;
        }

        const activeRemoteCellIds = new Set();
        const cells = Array.isArray(sp.cells) ? sp.cells : [];

        for (const sc of cells) {
          activeRemoteCellIds.add(sc.id);
          const targetR = Math.sqrt(sc.mass * 100);
          let rc = rp.cells.get(sc.id);

          if (!rc) {
            rc = {
              id: sc.id,
              x: sc.x,
              y: sc.y,
              targetX: sc.x,
              targetY: sc.y,
              mass: sc.mass,
              radius: targetR,
              targetRadius: targetR,
              vx: sc.vx || 0,
              vy: sc.vy || 0
            };
            rp.cells.set(sc.id, rc);
          } else {
            rc.targetX = sc.x;
            rc.targetY = sc.y;
            rc.mass = sc.mass;
            rc.targetRadius = targetR;
            rc.vx = sc.vx || 0;
            rc.vy = sc.vy || 0;
          }
        }

        for (const id of rp.cells.keys()) {
          if (!activeRemoteCellIds.has(id)) {
            rp.cells.delete(id);
          }
        }
      }

      // Cleanup disconnected remote players
      for (const id of this.onlineRemotePlayers.keys()) {
        if (!activeRemoteIds.has(id)) {
          this.onlineRemotePlayers.delete(id);
        }
      }

      if (!foundLocalPlayer && this.isAlive && this.onlineLocalCells.size > 0) {
        this.onLocalPlayerDeath();
      }
    }

    showOnlineErrorModal(title, message) {
      const modal = document.getElementById('modalOnlineError');
      const titleEl = document.getElementById('onlineErrorTitle');
      const msgEl = document.getElementById('onlineErrorMessage');
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (modal) modal.classList.remove('hidden');
      if (this.statPing) this.statPing.textContent = 'OFFLINE';
      if (this.statPingDot) this.statPingDot.className = 'inline-block w-2 h-2 rounded-full bg-red-500';
    }

    hideOnlineErrorModal() {
      const modal = document.getElementById('modalOnlineError');
      if (modal) modal.classList.add('hidden');
    }

    startMatch(createRoom = false) {
      const inputNick = document.getElementById('inputNickname');
      this.localNickname = (inputNick ? inputNick.value.trim() : '') || 'Player';

      this.isHost = true;
      this.isSpectating = false;
      if (this.lobbyScreen) this.lobbyScreen.classList.add('hidden');
      this.showInGameHUD();

      this.initWorld();
      this.spawnLocalPlayer();

      if (createRoom) {
        this.initPeerHost();
      } else {
        this.spawnBots(15);
      }

      this.isAlive = true;
      this.startTime = Date.now();
      this.peakMass = BASE_PLAYER_MASS;
      this.foodEaten = 0;
      this.virusesHit = 0;

      this.updatePingBadge();

      if (!this.loopStarted) {
        this.loopStarted = true;
        requestAnimationFrame((t) => this.gameLoop(t));
      }
    }

    startSpectate() {
      this.isHost = true;
      this.isAlive = false;
      this.isSpectating = true;
      if (this.lobbyScreen) this.lobbyScreen.classList.add('hidden');
      this.showInGameHUD();
      this.initWorld();
      this.spawnBots(16);
      this.updatePingBadge();
      if (!this.loopStarted) {
        this.loopStarted = true;
        requestAnimationFrame((t) => this.gameLoop(t));
      }
    }

    showInGameHUD() {
      if (this.topStatsHud) this.topStatsHud.classList.remove('hidden');
      if (this.leaderboardHud && this.showLeaderboard) this.leaderboardHud.classList.remove('hidden');
      if (this.btnShowLeaderboard && !this.showLeaderboard) this.btnShowLeaderboard.classList.remove('hidden');
      if (this.killFeedContainer) this.killFeedContainer.classList.remove('hidden');
      if (this.bottomLeftHud) this.bottomLeftHud.classList.remove('hidden');
      if (this.minimapHud) this.minimapHud.classList.remove('hidden');
      if (this.macroHud) this.macroHud.classList.remove('hidden');
    }

    hideInGameHUD() {
      if (this.topStatsHud) this.topStatsHud.classList.add('hidden');
      if (this.leaderboardHud) this.leaderboardHud.classList.add('hidden');
      if (this.btnShowLeaderboard) this.btnShowLeaderboard.classList.add('hidden');
      if (this.killFeedContainer) {
        this.killFeedContainer.classList.add('hidden');
        this.killFeedContainer.innerHTML = '';
      }
      if (this.eliminationModal) this.eliminationModal.classList.add('hidden');
      if (this.spectatorHud) this.spectatorHud.classList.add('hidden');
      if (this.bottomLeftHud) this.bottomLeftHud.classList.add('hidden');
      if (this.minimapHud) this.minimapHud.classList.add('hidden');
      if (this.macroHud) this.macroHud.classList.add('hidden');
      this.hideChatInput();
    }

    initWorld() {
      this.foods = [];
      this.viruses = [];
      this.ejectedMasses = [];
      this.foodGrid.clear();

      // Stratified spatial distribution: 400 sectors across 10,000x10,000 map.
      // Exactly 12 food pellets per sector = 4,800 pellets perfectly even across entire arena.
      const sectorsCount = 20; // 10,000 / 500
      const sectorSize = 500;
      const pelletsPerSector = Math.floor(FOOD_COUNT / (sectorsCount * sectorsCount)); // 12
      let id = 0;

      for (let r = 0; r < sectorsCount; r++) {
        for (let c = 0; c < sectorsCount; c++) {
          for (let p = 0; p < pelletsPerSector; p++) {
            // Perfectly balanced size tiers per sector:
            // 1 Super Golden Orb (15px, mass 10), 3 Medium Pellets (12px, mass 5), 8 Standard Pellets (9.5px, mass 2)
            const isSuper = p === 0;
            const isMedium = p >= 1 && p <= 3;
            const mass = isSuper ? SUPER_FOOD_MASS : (isMedium ? MEDIUM_FOOD_MASS : FOOD_MASS);
            const radius = isSuper ? 15 : (isMedium ? 12 : 9.5);
            const color = isSuper ? '#F59E0B' : FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];

            const minX = c * sectorSize + 24;
            const maxX = (c + 1) * sectorSize - 24;
            const minY = r * sectorSize + 24;
            const maxY = (r + 1) * sectorSize - 24;

            const food = {
              id: id++,
              x: Math.round(minX + Math.random() * (maxX - minX)),
              y: Math.round(minY + Math.random() * (maxY - minY)),
              color,
              mass,
              radius,
              isSuper,
              isMedium
            };
            this.foods.push(food);
            this.foodGrid.insert(food);
          }
        }
      }

      for (let i = 0; i < VIRUS_COUNT; i++) {
        const v = new Virus(
          'v_' + i,
          Math.random() * (MAP_SIZE - 800) + 400,
          Math.random() * (MAP_SIZE - 800) + 400
        );
        this.viruses.push(v);
      }
    }

    spawnLocalPlayer() {
      const x = Math.random() * (MAP_SIZE - 2000) + 1000;
      const y = Math.random() * (MAP_SIZE - 2000) + 1000;

      const player = {
        id: this.localPlayerId,
        name: this.localNickname,
        color: this.localColor,
        cells: [],
        isBot: false,
        targetX: x,
        targetY: y
      };

      const mainCell = new Cell(
        'c_local_' + Math.random().toString(36).substring(2, 7),
        this.localPlayerId,
        x,
        y,
        BASE_PLAYER_MASS,
        this.localColor,
        this.localNickname
      );
      player.cells.push(mainCell);
      this.players.set(this.localPlayerId, player);

      this.camX = x;
      this.camY = y;
    }

    spawnBots(count) {
      for (let i = 0; i < count; i++) {
        const profile = BOT_PROFILES[i % BOT_PROFILES.length];
        const botId = 'bot_' + i + '_' + Math.random().toString(36).substring(2, 6);
        const startMass = Math.floor(Math.random() * 110) + 40;

        const bot = {
          id: botId,
          name: profile.name,
          color: profile.color,
          archetype: profile.archetype,
          skill: profile.skill,
          cells: [],
          isBot: true,
          desiredX: Math.random() * MAP_SIZE,
          desiredY: Math.random() * MAP_SIZE,
          decisionTimer: Math.random() * 0.5,
          splitCooldown: 0
        };

        const cell = new Cell(
          'c_' + botId,
          botId,
          Math.random() * (MAP_SIZE - 2000) + 1000,
          Math.random() * (MAP_SIZE - 2000) + 1000,
          startMass,
          bot.color,
          bot.name
        );
        bot.cells.push(cell);
        this.players.set(botId, bot);
      }
    }

    // --- PEERJS WEBRTC P2P MULTIPLAYER ---
    prepareHostRoom() {
      if (!this.roomCode) {
        this.roomCode = generateCleanRoomCode();
      }
      const hostedText = document.getElementById('hostedRoomCodeText');
      if (hostedText) hostedText.textContent = this.roomCode;
      this.initPeerHost();
    }

    initPeerHost() {
      if (!window.Peer) {
        console.warn('PeerJS library not available');
        return;
      }

      if (!this.roomCode) {
        this.roomCode = generateCleanRoomCode();
      }

      if (this.peer && !this.peer.destroyed) {
        return; // Already initialized
      }

      try {
        this.peer = new window.Peer(this.roomCode, {
          debug: 1,
          config: {
            iceServers: ICE_SERVERS_CONFIG,
            iceCandidatePoolSize: 10
          }
        });
      } catch (err) {
        console.error('Peer host creation failed:', err);
        return;
      }

      this.peer.on('open', (id) => {
        this.roomCode = id;
        this.updateRoomCodeUI(id);
        this.updatePingBadge();

        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.isHost && this.connections.size > 0) {
            this.broadcastPacket({ type: 'heartbeat', t: Date.now() });
          }
        }, 1500);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingPeerConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('Peer host error:', err);
        if (err.type === 'unavailable-id') {
          this.roomCode = generateCleanRoomCode();
          this.initPeerHost();
        }
      });
    }

    updateRoomCodeUI(code) {
      if (this.roomCodeDisplay) this.roomCodeDisplay.textContent = code;
      if (this.roomCodePill) this.roomCodePill.classList.remove('hidden');
      const hostedText = document.getElementById('hostedRoomCodeText');
      if (hostedText) hostedText.textContent = code;
    }

    handleIncomingPeerConnection(conn) {
      const peerId = conn.peer;
      this.connections.set(peerId, conn);

      conn.on('open', () => {
        this.updateHostPeerUI();
        this.updatePingBadge();

        this.addChatMessage({
          id: 'sys_' + Date.now(),
          sender: 'ARENA',
          text: `Player joined the room!`,
          time: Date.now()
        });

        // Send world state snapshot immediately so client initializes properly
        conn.send({
          type: 'init',
          playerId: peerId,
          foods: this.foods.map(f => ({
            id: f.id,
            x: Math.round(f.x),
            y: Math.round(f.y),
            c: f.color,
            s: !!f.isSuper,
            m: !!f.isMedium,
            r: f.radius
          })),
          viruses: this.viruses.map(v => ({ id: v.id, x: Math.round(v.x), y: Math.round(v.y), m: v.mass }))
        });
      });

      conn.on('data', (data) => this.handlePeerData(peerId, data));

      conn.on('close', () => {
        this.connections.delete(peerId);
        this.players.delete(peerId);
        this.updateHostPeerUI();
        this.updatePingBadge();
        this.addChatMessage({
          id: 'sys_' + Date.now(),
          sender: 'ARENA',
          text: `Player left the room.`,
          time: Date.now()
        });
      });
    }

    updateHostPeerUI() {
      const dot = document.getElementById('hostPeerStatusDot');
      const text = document.getElementById('hostPeerStatusText');
      const countBadge = document.getElementById('hostPeerCountBadge');
      const count = this.connections.size;

      if (countBadge) countBadge.textContent = `${count} connected`;

      if (count > 0) {
        if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
        if (text) text.textContent = `${count} friend${count > 1 ? 's' : ''} connected and ready!`;
      } else {
        if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse';
        if (text) text.textContent = 'Waiting for friends to join...';
      }
    }

    joinRoom(code) {
      const notice = document.getElementById('roomStatusNotice');
      const btnJoinText = document.getElementById('btnJoinText');

      if (!code) {
        if (notice) {
          notice.textContent = 'Please enter a valid match room code (e.g. SP-7A4B)';
          notice.className = 'text-xs font-mono text-red-500 font-bold block p-2 rounded bg-red-50 dark:bg-red-950/30';
        }
        return;
      }

      code = code.trim().toUpperCase();
      const nickInput = document.getElementById('inputNickname');
      this.localNickname = (nickInput ? nickInput.value.trim() : '') || 'Player';

      if (!window.Peer) {
        if (notice) {
          notice.textContent = 'WebRTC network library not loaded. Check internet connection.';
          notice.className = 'text-xs font-mono text-red-500 font-bold block p-2 rounded bg-red-50 dark:bg-red-950/30';
        }
        return;
      }

      if (notice) {
        notice.textContent = `Connecting to match room ${code}...`;
        notice.className = 'text-xs font-mono text-blue-500 font-bold block p-2 rounded bg-blue-50 dark:bg-blue-950/30';
      }
      if (btnJoinText) btnJoinText.textContent = 'Connecting...';

      if (this.peer) {
        try { this.peer.destroy(); } catch (_) {}
      }

      this.isHost = false;
      this.peer = new window.Peer(null, {
        debug: 1,
        config: {
          iceServers: ICE_SERVERS_CONFIG,
          iceCandidatePoolSize: 10
        }
      });

      this.peer.on('open', (myPeerId) => {
        this.localPlayerId = myPeerId;
        const conn = this.peer.connect(code, { reliable: false });
        this.hostConn = conn;

        const connectTimeout = setTimeout(() => {
          if (!conn.open) {
            if (notice) {
              notice.textContent = `Could not connect to "${code}". Check room code or ensure host is online.`;
              notice.className = 'text-xs font-mono text-red-500 font-bold block p-2 rounded bg-red-50 dark:bg-red-950/30';
            }
            if (btnJoinText) btnJoinText.textContent = 'Connect & Play';
          }
        }, 9000);

        conn.on('open', () => {
          clearTimeout(connectTimeout);
          if (notice) {
            notice.textContent = `Connected to room ${code}! Entering arena...`;
            notice.className = 'text-xs font-mono text-emerald-600 font-bold block p-2 rounded bg-emerald-50 dark:bg-emerald-950/30';
          }
          if (btnJoinText) btnJoinText.textContent = 'Entering Arena...';

          if (this.lobbyScreen) this.lobbyScreen.classList.add('hidden');
          this.showInGameHUD();
          this.roomCode = code;
          if (this.roomCodeDisplay) this.roomCodeDisplay.textContent = code;
          if (this.roomCodePill) this.roomCodePill.classList.remove('hidden');

          conn.send({
            type: 'join',
            name: this.localNickname,
            color: this.localColor
          });

          this.isAlive = true;
          this.startTime = Date.now();
          this.peakMass = BASE_PLAYER_MASS;
          this.foodEaten = 0;
          this.virusesHit = 0;

          if (!this.loopStarted) {
            this.loopStarted = true;
            requestAnimationFrame((t) => this.gameLoop(t));
          }

          // Periodic Real Two-Way Ping Measurement
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.pingInterval = setInterval(() => {
            if (this.hostConn && this.hostConn.open) {
              this.hostConn.send({ type: 'ping', t: performance.now() });
            }
          }, 1000);
        });

        conn.on('data', (data) => this.handleClientData(data));

        conn.on('close', () => {
          this.isAlive = false;
          if (this.pingInterval) clearInterval(this.pingInterval);
          if (notice) {
            notice.textContent = `Disconnected from host ${code}`;
            notice.className = 'text-xs font-mono text-zinc-500 font-bold block p-2 rounded bg-zinc-100 dark:bg-zinc-800';
          }
          if (btnJoinText) btnJoinText.textContent = 'Connect & Play';
          this.updatePingBadge();
          this.onLocalPlayerDeath();
        });

        conn.on('error', (err) => {
          clearTimeout(connectTimeout);
          if (notice) {
            notice.textContent = `Connection error: ${err.message || err}`;
            notice.className = 'text-xs font-mono text-red-500 font-bold block p-2 rounded bg-red-50 dark:bg-red-950/30';
          }
          if (btnJoinText) btnJoinText.textContent = 'Connect & Play';
        });
      });

      this.peer.on('error', (err) => {
        if (notice) {
          notice.textContent = `P2P Error: ${err.type || err.message}`;
          notice.className = 'text-xs font-mono text-red-500 font-bold block p-2 rounded bg-red-50 dark:bg-red-950/30';
        }
        if (btnJoinText) btnJoinText.textContent = 'Connect & Play';
      });
    }

    handlePeerData(peerId, data) {
      if (data.type === 'join') {
        const player = {
          id: peerId,
          name: data.name || 'Player',
          color: data.color || '#111111',
          cells: [],
          isBot: false,
          targetX: MAP_SIZE / 2,
          targetY: MAP_SIZE / 2
        };

        const cell = new Cell(
          'c_' + peerId,
          peerId,
          Math.random() * (MAP_SIZE - 2000) + 1000,
          Math.random() * (MAP_SIZE - 2000) + 1000,
          BASE_PLAYER_MASS,
          player.color,
          player.name
        );
        player.cells.push(cell);
        this.players.set(peerId, player);
      } else if (data.type === 'input') {
        const p = this.players.get(peerId);
        if (p) {
          p.targetX = data.tx;
          p.targetY = data.ty;
        }
      } else if (data.type === 'split') {
        const p = this.players.get(peerId);
        if (p && data.tx !== undefined) {
          p.targetX = data.tx;
          p.targetY = data.ty;
        }
        this.performSplitForPlayer(peerId);
      } else if (data.type === 'eject') {
        const p = this.players.get(peerId);
        if (p && data.tx !== undefined) {
          p.targetX = data.tx;
          p.targetY = data.ty;
        }
        this.performEjectForPlayer(peerId);
      } else if (data.type === 'ping') {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
          conn.send({ type: 'pong', t: data.t });
        }
      } else if (data.type === 'chat') {
        this.addChatMessage(data.item);
        this.broadcastPacket({ type: 'chat', item: data.item });
      }
    }

    handleClientData(data) {
      if (data.type === 'init') {
        this.foods = data.foods.map(f => ({
          id: f.id,
          x: f.x,
          y: f.y,
          color: f.c,
          radius: f.r || (f.s ? 15 : (f.m ? 12 : 9.5)),
          mass: f.s ? SUPER_FOOD_MASS : (f.m ? MEDIUM_FOOD_MASS : FOOD_MASS),
          isSuper: !!f.s,
          isMedium: !!f.m
        }));
        this.viruses = data.viruses.map(v => new Virus(v.id, v.x, v.y));
      } else if (data.type === 'state') {
        for (const pData of data.players) {
          let p = this.players.get(pData.id);
          if (!p) {
            p = {
              id: pData.id,
              name: pData.name,
              color: pData.color,
              cells: [],
              isBot: pData.isBot,
              targetX: MAP_SIZE / 2,
              targetY: MAP_SIZE / 2
            };
            this.players.set(pData.id, p);
          }
          p.name = pData.name;
          p.color = pData.color;

          const incomingIds = new Set(pData.cells.map(c => c.id));
          p.cells = p.cells.filter(c => incomingIds.has(c.id));

          const isMe = (pData.id === this.localPlayerId);

          for (const cData of pData.cells) {
            let existingCell = p.cells.find(c => c.id === cData.id);
            if (!existingCell) {
              existingCell = new Cell(
                cData.id,
                pData.id,
                cData.x,
                cData.y,
                cData.m,
                pData.color,
                pData.name
              );
              p.cells.push(existingCell);

              // Center camera onto spawn location immediately on join
              if (isMe && p.cells.length === 1 && Math.abs(this.camX - MAP_SIZE / 2) < 20) {
                this.camX = cData.x;
                this.camY = cData.y;
              }
            } else {
              // Smooth reconciliation: for own cell lerp smoothly to authority, for others lerp directly
              const lerpRate = isMe ? 0.35 : 0.65;
              existingCell.x += (cData.x - existingCell.x) * lerpRate;
              existingCell.y += (cData.y - existingCell.y) * lerpRate;
              existingCell.mass = cData.m;
              existingCell.radius = massToRadius(cData.m);
            }
          }
        }

        const activePlayerIds = new Set(data.players.map(p => p.id));
        for (const pid of this.players.keys()) {
          if (!activePlayerIds.has(pid)) this.players.delete(pid);
        }

        // Check if local player was eliminated in multiplayer match
        if (this.isAlive && !this.isHost) {
          const myP = this.players.get(this.localPlayerId);
          if (!myP || myP.cells.length === 0) {
            this.onLocalPlayerDeath();
          }
        }

        if (data.viruses) {
          for (let i = 0; i < data.viruses.length && i < this.viruses.length; i++) {
            this.viruses[i].x = data.viruses[i].x;
            this.viruses[i].y = data.viruses[i].y;
            this.viruses[i].mass = data.viruses[i].m;
            this.viruses[i].radius = massToRadius(data.viruses[i].m);
          }
        }

        if (data.ejected) {
          this.ejectedMasses = data.ejected.map(e => {
            const m = new EjectedMass(e.id, e.pid, e.x, e.y, 0, e.c);
            m.vx = e.vx;
            m.vy = e.vy;
            return m;
          });
        }

        if (data.eatenFoodIds && data.eatenFoodIds.length > 0) {
          const eatenSet = new Set(data.eatenFoodIds);
          for (const f of this.foods) {
            if (eatenSet.has(f.id)) {
              f.x = Math.random() * (MAP_SIZE - 200) + 100;
              f.y = Math.random() * (MAP_SIZE - 200) + 100;
            }
          }
        }
      } else if (data.type === 'pong') {
        const roundTrip = Math.round(performance.now() - data.t);
        this.ping = Math.max(1, roundTrip);
        this.updatePingBadge();
      } else if (data.type === 'chat') {
        this.addChatMessage(data.item);
      }
    }

    broadcastPacket(data) {
      for (const conn of this.connections.values()) {
        if (conn.open) {
          try { conn.send(data); } catch (_) {}
        }
      }
    }

    // --- GAME ACTIONS: SPLIT & EJECT ---
    handleSplit() {
      const halfW = (this.canvas.width / this.dpr) / 2;
      const halfH = (this.canvas.height / this.dpr) / 2;
      this.mouseWorldX = this.camX + (this.mouseScreenX - halfW) / this.camZoom;
      this.mouseWorldY = this.camY + (this.mouseScreenY - halfH) / this.camZoom;
      const p = this.players.get(this.localPlayerId);
      if (p) {
        p.targetX = this.mouseWorldX;
        p.targetY = this.mouseWorldY;
      }

      if (this.isOnlineMode) {
        this.playSplitSound();
        if (this.onlineClient && this.onlineClient.isConnected) {
          this.onlineClient.sendSplit();
        }
      } else if (this.isHost) {
        this.performSplitForPlayer(this.localPlayerId);
      } else if (this.hostConn && this.hostConn.open) {
        this.playSplitSound();
        this.hostConn.send({
          type: 'split',
          tx: Math.round(this.mouseWorldX),
          ty: Math.round(this.mouseWorldY)
        });
      }
    }

    handleEject() {
      const halfW = (this.canvas.width / this.dpr) / 2;
      const halfH = (this.canvas.height / this.dpr) / 2;
      this.mouseWorldX = this.camX + (this.mouseScreenX - halfW) / this.camZoom;
      this.mouseWorldY = this.camY + (this.mouseScreenY - halfH) / this.camZoom;
      const p = this.players.get(this.localPlayerId);
      if (p) {
        p.targetX = this.mouseWorldX;
        p.targetY = this.mouseWorldY;
      }

      if (this.isOnlineMode) {
        if (this.onlineClient && this.onlineClient.isConnected && this.isAlive) {
          this.playEjectSound();
          this.onlineClient.sendEject();
        }
      } else if (this.isHost) {
        this.performEjectForPlayer(this.localPlayerId);
      } else if (this.hostConn && this.hostConn.open) {
        this.playEjectSound();
        this.hostConn.send({
          type: 'eject',
          tx: Math.round(this.mouseWorldX),
          ty: Math.round(this.mouseWorldY)
        });
      }
    }

    performSplitForPlayer(playerId) {
      const p = this.players.get(playerId);
      if (!p || p.cells.length >= MAX_SPLITS) return;

      const isLocal = (playerId === this.localPlayerId);
      const targetX = isLocal ? this.mouseWorldX : (p.targetX !== undefined ? p.targetX : this.mouseWorldX);
      const targetY = isLocal ? this.mouseWorldY : (p.targetY !== undefined ? p.targetY : this.mouseWorldY);

      const newCells = [];
      const canAdd = MAX_SPLITS - p.cells.length;
      let added = 0;

      for (let i = 0; i < p.cells.length; i++) {
        const cell = p.cells[i];
        if (cell.mass >= 36 && added < canAdd) {
          const splitMass = Math.floor(cell.mass / 2);
          cell.mass = splitMass;
          cell.radius = massToRadius(cell.mass);
          cell.recombineTimer = calcRecombineTime(splitMass);

          let dx = targetX - cell.x;
          let dy = targetY - cell.y;
          let dist = Math.hypot(dx, dy);
          let dirX = 1;
          let dirY = 0;
          let splitAngle = 0;

          if (dist > 5) {
            dirX = dx / dist;
            dirY = dy / dist;
            splitAngle = Math.atan2(dy, dx);
          } else {
            // If mouse cursor is right on cell center, split in current cell velocity direction
            const moveSpeed = Math.hypot(cell.vx, cell.vy);
            if (moveSpeed > 5) {
              dirX = cell.vx / moveSpeed;
              dirY = cell.vy / moveSpeed;
              splitAngle = Math.atan2(dirY, dirX);
            } else {
              dirX = 1;
              dirY = 0;
              splitAngle = 0;
            }
          }

          // Parent cell soft-body elastic rebound squish
          cell.triggerSquish(0.82, splitAngle);

          const child = new Cell(
            'c_' + Math.random().toString(36).substring(2, 8),
            playerId,
            cell.x + dirX * (cell.radius * 0.9),
            cell.y + dirY * (cell.radius * 0.9),
            splitMass,
            cell.color,
            cell.name
          );

          // Impulse velocity conforms to PHYSICS_SPEC.md (820 px/s with exponential decay)
          const launchSpeed = 820;
          child.boostVx = dirX * launchSpeed;
          child.boostVy = dirY * launchSpeed;
          child.recombineTimer = calcRecombineTime(splitMass);

          child.triggerSquish(1.36, splitAngle);
          newCells.push(child);
          added++;
        }
      }

      if (newCells.length > 0) {
        if (playerId === this.localPlayerId) {
          this.playSplitSound();
        }
        p.cells.push(...newCells);
      }
    }

    performEjectForPlayer(playerId) {
      const p = this.players.get(playerId);
      if (!p) return;

      const isLocal = (playerId === this.localPlayerId);
      const targetX = isLocal ? this.mouseWorldX : (p.targetX !== undefined ? p.targetX : this.mouseWorldX);
      const targetY = isLocal ? this.mouseWorldY : (p.targetY !== undefined ? p.targetY : this.mouseWorldY);

      for (const cell of p.cells) {
        if (cell.mass >= 32) {
          cell.mass -= EJECT_LOSS;
          cell.radius = massToRadius(cell.mass);

          let dx = targetX - cell.x;
          let dy = targetY - cell.y;
          let dist = Math.hypot(dx, dy);
          let dirX = 1;
          let dirY = 0;
          let angle = 0;

          if (dist > 5) {
            dirX = dx / dist;
            dirY = dy / dist;
            angle = Math.atan2(dy, dx);
          } else {
            const moveSpeed = Math.hypot(cell.vx, cell.vy);
            if (moveSpeed > 5) {
              dirX = cell.vx / moveSpeed;
              dirY = cell.vy / moveSpeed;
              angle = Math.atan2(dirY, dirX);
            } else {
              dirX = 1;
              dirY = 0;
              angle = 0;
            }
          }

          cell.triggerSquish(0.95, angle);

          const spawnX = cell.x + dirX * (cell.radius + 12);
          const spawnY = cell.y + dirY * (cell.radius + 12);

          const massPellet = new EjectedMass(
            'em_' + Math.random().toString(36).substring(2, 8),
            playerId,
            spawnX,
            spawnY,
            angle,
            cell.color
          );
          this.ejectedMasses.push(massPellet);

          if (playerId === this.localPlayerId) {
            this.playEjectSound();
          }
        }
      }
    }

    // --- SMART BOT AI ---
    updateBotAI(dt) {
      for (const bot of this.players.values()) {
        if (!bot.isBot || bot.cells.length === 0) continue;

        bot.decisionTimer = (bot.decisionTimer || 0) - dt;
        bot.splitCooldown = Math.max(0, (bot.splitCooldown || 0) - dt);

        if (bot.decisionTimer <= 0) {
          bot.decisionTimer = 0.18 + Math.random() * 0.12;

          let botTotalMass = 0;
          let botCenterX = 0;
          let botCenterY = 0;
          for (const c of bot.cells) {
            botTotalMass += c.mass;
            botCenterX += c.x;
            botCenterY += c.y;
          }
          botCenterX /= bot.cells.length;
          botCenterY /= bot.cells.length;

          // Scan nearby threats and food
          let threatX = 0, threatY = 0, hasThreat = false;
          let preyX = 0, preyY = 0, hasPrey = false;
          let minPreyDist = Infinity;

          for (const other of this.players.values()) {
            if (other.id === bot.id || other.cells.length === 0) continue;
            for (const oc of other.cells) {
              const dist = Math.hypot(oc.x - botCenterX, oc.y - botCenterY);
              if (dist < 800) {
                if (oc.mass > botTotalMass * 1.25) {
                  threatX = oc.x;
                  threatY = oc.y;
                  hasThreat = true;
                  break;
                } else if (botTotalMass > oc.mass * 1.35 && dist < minPreyDist) {
                  minPreyDist = dist;
                  preyX = oc.x;
                  preyY = oc.y;
                  hasPrey = true;
                }
              }
            }
            if (hasThreat) break;
          }

          if (hasThreat) {
            const fleeAngle = Math.atan2(botCenterY - threatY, botCenterX - threatX);
            bot.desiredX = botCenterX + Math.cos(fleeAngle) * 900;
            bot.desiredY = botCenterY + Math.sin(fleeAngle) * 900;
          } else if (hasPrey) {
            bot.desiredX = preyX;
            bot.desiredY = preyY;
            if (minPreyDist < 450 && bot.splitCooldown <= 0 && bot.cells.length < 4 && Math.random() < 0.25) {
              bot.targetX = preyX;
              bot.targetY = preyY;
              this.performSplitForPlayer(bot.id);
              bot.splitCooldown = 3.5;
            }
          } else {
            const nearbyFood = this.foodGrid.query(botCenterX, botCenterY, 500);
            if (nearbyFood.length > 0) {
              const targetFood = nearbyFood[Math.floor(Math.random() * nearbyFood.length)];
              bot.desiredX = targetFood.x;
              bot.desiredY = targetFood.y;
            } else if (Math.random() < 0.05) {
              bot.desiredX = Math.random() * (MAP_SIZE - 2000) + 1000;
              bot.desiredY = Math.random() * (MAP_SIZE - 2000) + 1000;
            }
          }
        }

        for (const c of bot.cells) {
          c.updatePhysics(dt, bot.desiredX, bot.desiredY);
        }
      }
    }

    // --- COMPLETE PHYSICS ENGINE (HOST AUTHORITATIVE FOR ALL HUMAN PLAYERS) ---
    updatePhysics(dt) {
      // 1. CRITICAL MULTIPLAYER FIX: Update ALL human players (local host + all connected remote peers)
      for (const p of this.players.values()) {
        if (p.isBot) continue; // Bots simulated in updateBotAI
        const isLocal = (p.id === this.localPlayerId);
        if (isLocal) {
          p.targetX = this.mouseWorldX;
          p.targetY = this.mouseWorldY;
        }
        const targetX = isLocal ? this.mouseWorldX : (p.targetX !== undefined ? p.targetX : (p.cells[0]?.x ?? MAP_SIZE / 2));
        const targetY = isLocal ? this.mouseWorldY : (p.targetY !== undefined ? p.targetY : (p.cells[0]?.y ?? MAP_SIZE / 2));

        for (const c of p.cells) {
          c.updatePhysics(dt, targetX, targetY);
        }
      }

      // 2. Update Ejected Mass Pellets
      for (let i = this.ejectedMasses.length - 1; i >= 0; i--) {
        const em = this.ejectedMasses[i];
        em.update(dt);
      }

      // 3. Ejected Mass Collisions with Viruses & Cells
      for (let mi = this.ejectedMasses.length - 1; mi >= 0; mi--) {
        const em = this.ejectedMasses[mi];
        let absorbed = false;

        // Virus feeding
        for (let vi = 0; vi < this.viruses.length; vi++) {
          const v = this.viruses[vi];
          const dist = Math.hypot(em.x - v.x, em.y - v.y);
          if (dist < v.radius + em.radius) {
            const popped = v.feed(em.mass);
            this.ejectedMasses.splice(mi, 1);
            absorbed = true;

            if (popped && this.viruses.length < VIRUS_COUNT + 10) {
              const childVirus = new Virus(
                'v_' + Math.random().toString(36).substring(2, 8),
                v.x + (em.vx > 0 ? 120 : -120),
                v.y + (em.vy > 0 ? 120 : -120)
              );
              this.viruses.push(childVirus);
            }
            break;
          }
        }
        if (absorbed) continue;

        // Player absorbing ejected mass
        for (const p of this.players.values()) {
          for (const c of p.cells) {
            const dist = Math.hypot(em.x - c.x, em.y - c.y);
            if (dist < c.radius) {
              c.mass += em.mass;
              c.radius = massToRadius(c.mass);
              this.ejectedMasses.splice(mi, 1);
              absorbed = true;
              break;
            }
          }
          if (absorbed) break;
        }
      }

      // 4. Sigmally Soft-Body Cell Elasticity (Spring-damper contact & organic repulsion)
      for (const p of this.players.values()) {
        const cells = p.cells;
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const c1 = cells[i];
            const c2 = cells[j];
            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;
            const dist = Math.hypot(dx, dy) || 1;
            const minDist = c1.radius + c2.radius;

            // Recombination allowed if both cooldowns expired
            if (c1.recombineTimer <= 0 && c2.recombineTimer <= 0) {
              if (dist < Math.max(c1.radius, c2.radius)) {
                if (c1.mass >= c2.mass) {
                  c1.mass += c2.mass;
                  c1.radius = massToRadius(c1.mass);
                  c1.triggerSquish(1.15, Math.atan2(dy, dx));
                  cells.splice(j, 1);
                  j--;
                } else {
                  c2.mass += c1.mass;
                  c2.radius = massToRadius(c2.mass);
                  c2.triggerSquish(1.15, Math.atan2(dy, dx));
                  cells.splice(i, 1);
                  i--;
                  break;
                }
              }
            } else if (dist < minDist) {
              // Elastic spring-damper repulsion
              const overlap = minDist - dist;
              const angle = Math.atan2(dy, dx);
              const normalX = dx / dist;
              const normalY = dy / dist;

              const pushForce = Math.min(overlap * 0.45, 20);
              c1.x -= normalX * pushForce;
              c1.y -= normalY * pushForce;
              c2.x += normalX * pushForce;
              c2.y += normalY * pushForce;

              // Elastic squish impulse on contact
              const compression = Math.max(0.88, 1.0 - (overlap / minDist) * 0.22);
              if (c1.squish > compression) c1.triggerSquish(compression, angle + Math.PI / 2);
              if (c2.squish > compression) c2.triggerSquish(compression, angle + Math.PI / 2);
            }
          }
        }
      }

      // 5. Food Eating
      const eatenFoodIds = [];
      for (const p of this.players.values()) {
        for (const c of p.cells) {
          const candidates = this.foodGrid.query(c.x, c.y, c.radius + 15);
          for (const food of candidates) {
            const dist = Math.hypot(c.x - food.x, c.y - food.y);
            if (dist < c.radius) {
              c.mass += food.mass;
              c.radius = massToRadius(c.mass);
              eatenFoodIds.push(food.id);

              if (p.id === this.localPlayerId) {
                this.foodEaten++;
                this.playEatSound(food.isSuper);
              }

              // Respawn food in arena keeping balanced sector density and size tier
              const col = Math.min(19, Math.max(0, Math.floor(food.x / 500)));
              const row = Math.min(19, Math.max(0, Math.floor(food.y / 500)));
              const minX = col * 500 + 24;
              const maxX = (col + 1) * 500 - 24;
              const minY = row * 500 + 24;
              const maxY = (row + 1) * 500 - 24;
              food.x = Math.round(minX + Math.random() * (maxX - minX));
              food.y = Math.round(minY + Math.random() * (maxY - minY));
              food.color = food.isSuper ? '#F59E0B' : FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];
              this.foodGrid.insert(food);
            }
          }
        }
      }

      // 6. Virus Collisions (Popping big cells)
      for (const p of this.players.values()) {
        for (let ci = p.cells.length - 1; ci >= 0; ci--) {
          const c = p.cells[ci];
          for (let vi = 0; vi < this.viruses.length; vi++) {
            const v = this.viruses[vi];
            const dist = Math.hypot(c.x - v.x, c.y - v.y);
            if (dist < c.radius && c.mass > v.mass * 1.15) {
              this.popCellOnVirus(p, c);
              if (p.id === this.localPlayerId) this.virusesHit++;
              break;
            }
          }
        }
      }

      // 7. Player vs Player Eating
      const playerList = Array.from(this.players.values());
      for (let i = 0; i < playerList.length; i++) {
        const p1 = playerList[i];
        for (let j = 0; j < playerList.length; j++) {
          if (i === j) continue;
          const p2 = playerList[j];

          for (let ci = p1.cells.length - 1; ci >= 0; ci--) {
            const c1 = p1.cells[ci];
            for (let cj = p2.cells.length - 1; cj >= 0; cj--) {
              const c2 = p2.cells[cj];
              const dist = Math.hypot(c1.x - c2.x, c1.y - c2.y);

              if (c1.mass > c2.mass * 1.25 && dist < c1.radius - c2.radius * 0.35) {
                c1.mass += c2.mass;
                c1.radius = massToRadius(c1.mass);
                c1.triggerSquish(1.12, Math.atan2(c2.y - c1.y, c2.x - c1.x));

                p2.cells.splice(cj, 1);

                if (p1.id === this.localPlayerId && p2.id !== this.localPlayerId) {
                  this.playersDefeated++;
                }

                if (p2.cells.length === 0) {
                  this.addKillFeedEntry(
                    p1.name || 'Player',
                    p2.name || 'Player',
                    p1.id === this.localPlayerId,
                    p2.id === this.localPlayerId
                  );

                  if (p2.id === this.localPlayerId) {
                    this.onLocalPlayerDeath(p1.name, p1.id);
                  } else if (p2.isBot) {
                    setTimeout(() => {
                      if (this.players.has(p2.id)) {
                        const cell = new Cell(
                          'c_' + p2.id,
                          p2.id,
                          Math.random() * (MAP_SIZE - 2000) + 1000,
                          Math.random() * (MAP_SIZE - 2000) + 1000,
                          BASE_PLAYER_MASS,
                          p2.color,
                          p2.name
                        );
                        p2.cells.push(cell);
                      }
                    }, 2500);
                  }
                }
                break;
              }
            }
          }
        }
      }

      // Broadcast state to all connected peers if hosting
      if (this.isHost && this.connections.size > 0) {
        const now = performance.now();
        if (now - this.lastBroadcastTime >= 30) { // ~33 Hz throttle
          this.lastBroadcastTime = now;
          const playerSnapshots = [];
          for (const p of this.players.values()) {
            playerSnapshots.push({
              id: p.id,
              name: p.name,
              color: p.color,
              isBot: p.isBot,
              cells: p.cells.map(c => ({
                id: c.id,
                x: Math.round(c.x),
                y: Math.round(c.y),
                m: Math.round(c.mass)
              }))
            });
          }

          this.broadcastPacket({
            type: 'state',
            players: playerSnapshots,
            ejected: this.ejectedMasses.map(e => ({
              id: e.id,
              pid: e.playerId,
              x: Math.round(e.x),
              y: Math.round(e.y),
              vx: Math.round(e.vx),
              vy: Math.round(e.vy),
              c: e.color
            })),
            eatenFoodIds
          });
        }
      }
    }

    // Virus explosion: splits into pieces up to MAX_SPLITS (16)
    popCellOnVirus(player, cell) {
      if (player.id === this.localPlayerId) {
        this.playVirusPopSound();
      }
      const maxPieces = MAX_SPLITS - player.cells.length;
      if (maxPieces <= 0) return;

      const piecesToCreate = Math.min(maxPieces, Math.max(2, Math.floor(cell.mass / 28)));
      const pieceMass = Math.max(16, Math.floor(cell.mass / (piecesToCreate + 1)));

      cell.mass = pieceMass;
      cell.radius = massToRadius(pieceMass);
      cell.recombineTimer = calcRecombineTime(pieceMass);

      const angleStep = (Math.PI * 2) / piecesToCreate;
      for (let i = 0; i < piecesToCreate; i++) {
        const a = i * angleStep + Math.random() * 0.2;
        const popSpeed = 420 + Math.random() * 120;

        const child = new Cell(
          'c_' + Math.random().toString(36).substring(2, 8),
          player.id,
          cell.x + Math.cos(a) * cell.radius * 0.8,
          cell.y + Math.sin(a) * cell.radius * 0.8,
          pieceMass,
          cell.color,
          cell.name
        );

        child.boostVx = Math.cos(a) * popSpeed;
        child.boostVy = Math.sin(a) * popSpeed;
        child.recombineTimer = calcRecombineTime(pieceMass);
        child.triggerSquish(1.3, a);
        player.cells.push(child);
      }
    }

    // --- HIGH-IMPACT ELIMINATION SCREEN & RUN STATISTICS ---
    onLocalPlayerDeath(killerName = '', killerId = null) {
      if (this.isEliminated && !this.isAlive) return;
      this.isAlive = false;
      this.isEliminated = true;
      this.eliminationTime = performance.now();
      this.killerName = killerName || this.killerName || 'Player';
      this.killerId = killerId || this.killerId || null;
      this.spectateTargetMode = 'killer';

      const durationSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
      const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
      const secs = String(durationSec % 60).padStart(2, '0');
      const formattedTime = `${mins}:${secs}`;

      const finalPeakMass = Math.round(this.peakMass);
      const finalScore = Math.round(finalPeakMass * 1.5 + this.foodEaten * 10 + this.virusesHit * 50);

      // Check personal best
      let isNewRecord = false;
      try {
        const prevBest = parseInt(localStorage.getItem('splitr_best_mass') || '0', 10);
        if (finalPeakMass > prevBest) {
          isNewRecord = true;
          localStorage.setItem('splitr_best_mass', String(finalPeakMass));
        }

        const prevGames = parseInt(localStorage.getItem('splitr_games_count') || '0', 10);
        const prevPellets = parseInt(localStorage.getItem('splitr_total_pellets') || '0', 10);
        const prevTime = parseInt(localStorage.getItem('splitr_total_time') || '0', 10);

        localStorage.setItem('splitr_games_count', String(prevGames + 1));
        localStorage.setItem('splitr_total_pellets', String(prevPellets + this.foodEaten));
        localStorage.setItem('splitr_total_time', String(prevTime + durationSec));
      } catch (_) {}

      // Populate High-Impact Elimination Modal Badges
      if (this.eliminationKillerName) {
        this.eliminationKillerName.textContent = this.killerName;
      }
      if (this.deathPeakMass) {
        this.deathPeakMass.textContent = finalPeakMass.toLocaleString();
      }
      if (this.deathTimeSurvived) {
        this.deathTimeSurvived.textContent = formattedTime;
      }
      if (this.deathFoodConsumed) {
        this.deathFoodConsumed.textContent = this.foodEaten.toLocaleString();
      }
      if (this.deathPlayersDefeated) {
        this.deathPlayersDefeated.textContent = this.playersDefeated.toLocaleString();
      }

      // Show sleek elimination modal overlay (live canvas remains running smoothly behind backdrop blur)
      if (this.eliminationModal) {
        this.eliminationModal.classList.remove('hidden');
      }

      // Update Round Recap Banner for when player eventually returns to menu
      const elPeak = document.getElementById('summaryPeakMass');
      const elScore = document.getElementById('summaryScore');
      const elFood = document.getElementById('summaryFoodEaten');
      const elTime = document.getElementById('summaryTimeSurvived');
      const elRecordBadge = document.getElementById('summaryBadgeNewRecord');

      if (elPeak) elPeak.textContent = finalPeakMass.toLocaleString();
      if (elScore) elScore.textContent = finalScore.toLocaleString();
      if (elFood) elFood.textContent = this.foodEaten.toLocaleString();
      if (elTime) elTime.textContent = formattedTime;

      if (elRecordBadge) {
        if (isNewRecord && finalPeakMass > BASE_PLAYER_MASS) {
          elRecordBadge.classList.remove('hidden');
        } else {
          elRecordBadge.classList.add('hidden');
        }
      }

      this.initCareerStats();
      this.updatePingBadge();
    }

    // --- ZERO-RELOAD FAST RESPAWN (RUN IT BACK) ---
    runItBack() {
      if (this.eliminationModal) {
        this.eliminationModal.classList.add('hidden');
      }
      if (this.spectatorHud) {
        this.spectatorHud.classList.add('hidden');
      }
      this.isEliminated = false;
      this.isSpectating = false;

      if (this.isOnlineMode) {
        if (this.onlineClient && this.onlineClient.isConnected) {
          this.onlineClient.sendRespawn(this.localNickname);
        } else {
          this.startOnlineGame();
        }
      } else {
        this.spawnLocalPlayer();
      }
    }

    // --- SPECTATOR CAMERA TRANSITION ---
    startSpectating() {
      if (this.eliminationModal) {
        this.eliminationModal.classList.add('hidden');
      }
      if (this.spectatorHud) {
        this.spectatorHud.classList.remove('hidden');
      }
      this.isSpectating = true;
      this.spectateTargetMode = 'leader';
    }

    // --- RETURN TO LOBBY ---
    returnToLobby() {
      if (this.eliminationModal) {
        this.eliminationModal.classList.add('hidden');
      }
      if (this.spectatorHud) {
        this.spectatorHud.classList.add('hidden');
      }
      this.isAlive = false;
      this.isEliminated = false;
      this.isSpectating = false;
      if (this.isOnlineMode && this.onlineClient) {
        this.onlineClient.disconnect();
      }
      this.hideInGameHUD();
      if (this.lobbyScreen) {
        this.lobbyScreen.classList.remove('hidden');
        if (this.lobbyRoundSummary) {
          this.lobbyRoundSummary.classList.remove('hidden');
        }
      }
    }

    // --- SLEEK BRAIN-ROT KILL FEED (TOP-RIGHT HUD) ---
    addKillFeedEntry(killerName, victimName, isKillerLocal = false, isVictimLocal = false) {
      if (!this.killFeedContainer) {
        this.killFeedContainer = document.getElementById('killFeedContainer');
      }
      if (!this.killFeedContainer) return;

      // Cap feed at 4 active entries (remove oldest from top)
      while (this.killFeedContainer.children.length >= 4) {
        this.killFeedContainer.removeChild(this.killFeedContainer.firstElementChild);
      }

      const item = document.createElement('div');
      item.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0A0A0A]/90 border border-[#262626] text-xs font-mono font-bold shadow-md pointer-events-none transition-all animate-kill-slide';

      const killerSpan = document.createElement('span');
      killerSpan.className = isKillerLocal ? 'text-amber-400 font-extrabold' : 'text-white dark:text-zinc-200';
      killerSpan.textContent = killerName || 'Player';

      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'text-red-500 font-extrabold text-[11px] px-0.5';
      arrowSpan.textContent = '➔';

      const victimSpan = document.createElement('span');
      victimSpan.className = isVictimLocal ? 'text-amber-400 font-extrabold' : 'text-zinc-400 dark:text-zinc-400';
      victimSpan.textContent = victimName || 'Player';

      item.appendChild(killerSpan);
      item.appendChild(arrowSpan);
      item.appendChild(victimSpan);

      this.killFeedContainer.appendChild(item);

      // Cleanly fade out and slide away over 4 seconds
      setTimeout(() => {
        if (item.parentNode) {
          item.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
          item.style.opacity = '0';
          item.style.transform = 'translateX(24px)';
          setTimeout(() => {
            if (item.parentNode) {
              item.parentNode.removeChild(item);
            }
          }, 600);
        }
      }, 3400);
    }

    // --- MAIN GAME LOOP ---
    gameLoop(timestamp) {
      const dt = Math.min(0.08, (timestamp - this.lastFrameTime) / 1000) || 0.016;
      this.lastFrameTime = timestamp;

      // FPS tracking
      this.frameCount++;
      if (timestamp - this.fpsTimer >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsTimer = timestamp;
        if (this.statFps) this.statFps.textContent = `${this.fps} FPS`;
      }

      // Convert Screen Mouse to World Coordinates
      const halfW = (this.canvas.width / this.dpr) / 2;
      const halfH = (this.canvas.height / this.dpr) / 2;
      this.mouseWorldX = this.camX + (this.mouseScreenX - halfW) / this.camZoom;
      this.mouseWorldY = this.camY + (this.mouseScreenY - halfH) / this.camZoom;

      // Update AI & Physics
      if (this.isOnlineMode) {
        // Send cursor world coordinates to server for steering & directional splitting
        if (this.onlineClient && this.onlineClient.isConnected) {
          this.onlineClient.sendInput(this.mouseWorldX, this.mouseWorldY);
        }

        // 1. Smooth Interpolation for Local Player Sub-cells
        for (const lc of this.onlineLocalCells.values()) {
          lc.x += (lc.targetX - lc.x) * 0.25;
          lc.y += (lc.targetY - lc.y) * 0.25;
          const targetR = lc.targetRadius || Math.sqrt(lc.mass * 100);
          // Easing: Lerp the visual radius smoothly toward Math.sqrt(mass * 100) at a factor of 0.15 per frame
          lc.radius = (lc.radius || targetR) + (targetR - (lc.radius || targetR)) * 0.15;
        }

        // Rigid Sibling Separation for predicted local cells (No overlapping/collapsing)
        if (this.onlineLocalCells.size >= 2) {
          const localList = Array.from(this.onlineLocalCells.values());
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < localList.length; i++) {
              for (let j = i + 1; j < localList.length; j++) {
                const c1 = localList[i];
                const c2 = localList[j];
                const r1 = c1.radius || Math.sqrt(c1.mass * 100);
                const r2 = c2.radius || Math.sqrt(c2.mass * 100);
                const dx = c2.x - c1.x;
                const dy = c2.y - c1.y;
                const dist = Math.hypot(dx, dy) || 0.001;
                const minDist = r1 + r2;
                if (dist < minDist) {
                  const overlap = minDist - dist;
                  const nx = dx / dist;
                  const ny = dy / dist;
                  c1.x -= nx * overlap * 0.5;
                  c1.y -= ny * overlap * 0.5;
                  c2.x += nx * overlap * 0.5;
                  c2.y += ny * overlap * 0.5;
                }
              }
            }
          }
        }

        // 2. Linear Interpolation (Lerp) for Remote Players Sub-cells
        for (const rp of this.onlineRemotePlayers.values()) {
          for (const rc of rp.cells.values()) {
            rc.x += (rc.targetX - rc.x) * 0.25;
            rc.y += (rc.targetY - rc.y) * 0.25;
            const targetR = rc.targetRadius || Math.sqrt(rc.mass * 100);
            rc.radius = (rc.radius || targetR) + (targetR - (rc.radius || targetR)) * 0.15;
          }
        }

        // 3. Linear Interpolation for Online Viruses
        for (const ov of this.onlineViruses.values()) {
          ov.x += (ov.targetX - ov.x) * 0.25;
          ov.y += (ov.targetY - ov.y) * 0.25;
          const targetR = ov.targetRadius || 100;
          ov.radius = (ov.radius || targetR) + (targetR - (ov.radius || targetR)) * Math.min(1, dt * 5.0);
        }

        // 4. Linear Interpolation for Online Ejected Pellets
        for (const oep of this.onlineEjectedPellets.values()) {
          oep.x += (oep.targetX - oep.x) * 0.35;
          oep.y += (oep.targetY - oep.y) * 0.35;
        }

        // 5. Continuous Ejection while holding W (rate-limited ~9 shots/s)
        if (this.isAlive && this.isHoldingW) {
          const now = performance.now();
          if (now - this.lastOnlineEjectTime > 110) {
            this.lastOnlineEjectTime = now;
            this.handleEject();
          }
        }
      } else if (this.isHost) {
        this.updateBotAI(dt);
        this.updatePhysics(dt);
      } else if (this.hostConn && this.hostConn.open && this.isAlive) {
        // Send continuous steering inputs to host
        this.hostConn.send({
          type: 'input',
          tx: Math.round(this.mouseWorldX),
          ty: Math.round(this.mouseWorldY)
        });

        // CLIENT-SIDE PREDICTION: locally steer own cell for zero input lag
        const myP = this.players.get(this.localPlayerId);
        if (myP) {
          for (const c of myP.cells) {
            c.updatePhysics(dt, this.mouseWorldX, this.mouseWorldY);
          }
        }
      }

      // Camera follow
      let currX = this.camX;
      let currY = this.camY;

      if (this.isOnlineMode) {
        const localCells = Array.from(this.onlineLocalCells.values());
        if (localCells.length > 0 && this.isAlive) {
          let totalX = 0, totalY = 0, totalMass = 0;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

          for (const c of localCells) {
            const m = c.mass || 25;
            totalX += c.x * m;
            totalY += c.y * m;
            totalMass += m;
            const r = c.radius || Math.sqrt(m * 100);
            minX = Math.min(minX, c.x - r);
            maxX = Math.max(maxX, c.x + r);
            minY = Math.min(minY, c.y - r);
            maxY = Math.max(maxY, c.y + r);
          }

          const comX = totalMass > 0 ? totalX / totalMass : (this.onlineMapSize / 2);
          const comY = totalMass > 0 ? totalY / totalMass : (this.onlineMapSize / 2);

          // Focus camera on center-of-mass
          currX = comX;
          currY = comY;
          this.camX += (comX - this.camX) * Math.min(1, dt * 8);
          this.camY += (comY - this.camY) * Math.min(1, dt * 8);

          // Calculate camera zoom based on bounding box enclosing all sub-cells
          const spanW = Math.max(160, maxX - minX);
          const spanH = Math.max(160, maxY - minY);
          const maxSpan = Math.max(spanW, spanH);
          const targetZoom = Math.max(0.18, Math.min(0.85, 360 / maxSpan));
          this.camZoom += (targetZoom - this.camZoom) * Math.min(1, dt * 3.0);

          if (this.hudCoords) {
            this.hudCoords.textContent = `${Math.round(comX)}, ${Math.round(comY)}`;
          }
          if (this.hudMass) {
            this.hudMass.textContent = Math.round(totalMass);
          }
          if (this.hudCells) {
            this.hudCells.innerHTML = `${localCells.length}<span class="text-zinc-500 text-xs">/16</span>`;
          }
        } else {
          // ELIMINATED / SPECTATING CAMERA LOGIC (ONLINE)
          // 1. Lock smoothly onto killer for 3 seconds so player sees who ate them
          // 2. Transition camera to slowly drift toward leaderboard #1 leader
          const timeSinceDeath = performance.now() - (this.eliminationTime || 0);
          let targetX = null;
          let targetY = null;
          let targetMass = 200;

          if (timeSinceDeath < 3000 && this.spectateTargetMode === 'killer' && this.killerId) {
            const killer = this.onlineRemotePlayers.get(this.killerId);
            if (killer && killer.cells.size > 0) {
              let largestM = 0;
              for (const c of killer.cells.values()) {
                if (c.mass > largestM) {
                  largestM = c.mass;
                  targetX = c.x;
                  targetY = c.y;
                  targetMass = c.mass;
                }
              }
            }
          }

          // If no killer target found, or 3s elapsed, or in leader spectate mode
          if (targetX === null || targetY === null) {
            let leader = null;
            let topMass = -1;
            for (const rp of this.onlineRemotePlayers.values()) {
              if (rp.totalMass > topMass && rp.cells.size > 0) {
                topMass = rp.totalMass;
                leader = rp;
              }
            }

            if (leader && leader.cells.size > 0) {
              let largestM = 0;
              for (const c of leader.cells.values()) {
                if (c.mass > largestM) {
                  largestM = c.mass;
                  targetX = c.x;
                  targetY = c.y;
                  targetMass = c.mass;
                }
              }
            }
          }

          if (targetX !== null && targetY !== null) {
            currX = targetX;
            currY = targetY;
            // Smoothly track / drift towards target without ever snapping to (0,0)
            const trackSpeed = (timeSinceDeath < 3000 && this.spectateTargetMode === 'killer') ? 4.5 : 2.0;
            this.camX += (targetX - this.camX) * Math.min(1, dt * trackSpeed);
            this.camY += (targetY - this.camY) * Math.min(1, dt * trackSpeed);

            const targetZoom = Math.max(0.24, Math.min(0.8, 1 / Math.pow(Math.max(10, targetMass), 0.35) * 3.3));
            this.camZoom += (targetZoom - this.camZoom) * Math.min(1, dt * 2.0);
          } else {
            // Ambient drift near center of arena
            this.ambientAngle = (this.ambientAngle || 0) + dt * 0.15;
            currX = (this.onlineMapSize / 2) + Math.cos(this.ambientAngle) * 600;
            currY = (this.onlineMapSize / 2) + Math.sin(this.ambientAngle) * 600;
            this.camX += (currX - this.camX) * Math.min(1, dt * 2.0);
            this.camY += (currY - this.camY) * Math.min(1, dt * 2.0);
            this.camZoom += (0.55 - this.camZoom) * Math.min(1, dt * 1.5);
          }
        }
      } else {
        const localPlayer = this.players.get(this.localPlayerId);
        if (localPlayer && localPlayer.cells.length > 0 && this.isAlive) {
          let totalX = 0, totalY = 0, totalMass = 0;
          for (const c of localPlayer.cells) {
            totalX += c.x * c.mass;
            totalY += c.y * c.mass;
            totalMass += c.mass;
          }
          const avgX = totalX / totalMass;
          const avgY = totalY / totalMass;
          currX = avgX;
          currY = avgY;

          this.camX += (avgX - this.camX) * Math.min(1, dt * 8);
          this.camY += (avgY - this.camY) * Math.min(1, dt * 8);

          const targetZoom = Math.max(0.24, Math.min(1.1, 1 / Math.pow(Math.max(10, totalMass), 0.35) * 3.3));
          this.camZoom += (targetZoom - this.camZoom) * Math.min(1, dt * 5);

          if (totalMass > this.peakMass) this.peakMass = totalMass;
          if (this.hudMass) this.hudMass.textContent = Math.round(totalMass);
          if (this.hudCells) this.hudCells.innerHTML = `${localPlayer.cells.length}<span class="text-zinc-500 text-xs">/16</span>`;
        } else {
          // ELIMINATED / SPECTATING CAMERA LOGIC (OFFLINE)
          const timeSinceDeath = performance.now() - (this.eliminationTime || 0);
          let targetX = null;
          let targetY = null;
          let targetMass = 200;

          if (timeSinceDeath < 3000 && this.spectateTargetMode === 'killer' && this.killerId) {
            const killer = this.players.get(this.killerId);
            if (killer && killer.cells.length > 0) {
              let largestM = 0;
              for (const c of killer.cells) {
                if (c.mass > largestM) {
                  largestM = c.mass;
                  targetX = c.x;
                  targetY = c.y;
                  targetMass = c.mass;
                }
              }
            }
          }

          if (targetX === null || targetY === null) {
            let leader = null;
            let topMass = -1;
            for (const p of this.players.values()) {
              if (p.id !== this.localPlayerId && p.cells.length > 0) {
                const tm = p.cells.reduce((sum, c) => sum + c.mass, 0);
                if (tm > topMass) {
                  topMass = tm;
                  leader = p;
                }
              }
            }

            if (leader && leader.cells.length > 0) {
              let largestM = 0;
              for (const c of leader.cells) {
                if (c.mass > largestM) {
                  largestM = c.mass;
                  targetX = c.x;
                  targetY = c.y;
                  targetMass = c.mass;
                }
              }
            }
          }

          if (targetX !== null && targetY !== null) {
            currX = targetX;
            currY = targetY;
            const trackSpeed = (timeSinceDeath < 3000 && this.spectateTargetMode === 'killer') ? 4.5 : 2.0;
            this.camX += (targetX - this.camX) * Math.min(1, dt * trackSpeed);
            this.camY += (targetY - this.camY) * Math.min(1, dt * trackSpeed);

            const targetZoom = Math.max(0.24, Math.min(0.8, 1 / Math.pow(Math.max(10, targetMass), 0.35) * 3.3));
            this.camZoom += (targetZoom - this.camZoom) * Math.min(1, dt * 2.0);
          } else {
            this.ambientAngle = (this.ambientAngle || 0) + dt * 0.15;
            currX = 5000 + Math.cos(this.ambientAngle) * 800;
            currY = 5000 + Math.sin(this.ambientAngle) * 800;
            this.camX += (currX - this.camX) * Math.min(1, dt * 2.0);
            this.camY += (currY - this.camY) * Math.min(1, dt * 2.0);
            this.camZoom += (0.6 - this.camZoom) * Math.min(1, dt * 2.0);
          }
        }
      }

      if (this.hudCoords) this.hudCoords.textContent = `${Math.round(currX)}, ${Math.round(currY)}`;

      this.render();
      this.updateLeaderboard();
      this.renderMinimap();

      requestAnimationFrame((t) => this.gameLoop(t));
    }

    // --- ARENA RENDER (SUPPORTS DARK & LIGHT MODES) ---
    render() {
      const ctx = this.ctx;
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);

      // Arena floor color based on theme
      ctx.fillStyle = this.isDarkMode ? '#0A0A0A' : '#F7F7F5';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(this.camZoom, this.camZoom);
      ctx.translate(-this.camX, -this.camY);

      this.drawGrid(ctx);
      this.drawBoundaries(ctx);
      if (this.isOnlineMode) {
        const cellList = this.getOnlineCellList();
        // 1. Draw food pellets and ejected mass
        this.drawOnlineFoods(ctx);
        this.drawOnlineEjectedMasses(ctx);
        // 2. Draw all player cells that have radius < virus.radius (small cells render beneath viruses so they can hide inside)
        this.drawOnlineCellsBelowViruses(ctx, cellList);
        // 3. Draw viruses (green spiked circles)
        this.drawOnlineViruses(ctx);
        // 4. Draw all player cells that have radius >= virus.radius
        this.drawOnlineCellsAboveViruses(ctx, cellList);
        // 5. Draw text labels, masses, and cell outlines
        this.drawOnlineCellOverlays(ctx, cellList);
      } else {
        const cellList = this.getOfflineCellList();
        // 1. Draw food pellets and ejected mass
        this.drawFoods(ctx);
        this.drawEjectedMasses(ctx);
        // 2. Draw all player cells that have radius < virus.radius (small cells render beneath viruses so they can hide inside)
        this.drawCellsBelowViruses(ctx, cellList);
        // 3. Draw viruses (green spiked circles)
        this.drawViruses(ctx);
        // 4. Draw all player cells that have radius >= virus.radius
        this.drawCellsAboveViruses(ctx, cellList);
        // 5. Draw text labels, masses, and cell outlines
        this.drawCellOverlays(ctx, cellList);
      }

      ctx.restore();
      ctx.restore();
    }

    drawOnlineFoods(ctx) {
      const halfW = (this.canvas.width / 2) / this.camZoom + 30;
      const halfH = (this.canvas.height / 2) / this.camZoom + 30;

      for (const food of this.onlineFoods.values()) {
        if (
          food.x < this.camX - halfW ||
          food.x > this.camX + halfW ||
          food.y < this.camY - halfH ||
          food.y > this.camY + halfH
        ) {
          continue;
        }

        const r = food.radius || (food.isSuper ? 15 : (food.isMedium ? 12 : 9.5));
        ctx.beginPath();
        ctx.arc(food.x, food.y, r, 0, Math.PI * 2);
        ctx.fillStyle = food.color;
        ctx.fill();

        ctx.strokeStyle = this.isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#111111';
        ctx.lineWidth = food.isSuper ? 2 : (food.isMedium ? 1.5 : 1);
        ctx.stroke();
      }
    }

    drawOnlineEjectedMasses(ctx) {
      const halfW = (this.canvas.width / 2) / this.camZoom + 40;
      const halfH = (this.canvas.height / 2) / this.camZoom + 40;

      for (const em of this.onlineEjectedPellets.values()) {
        if (
          em.x < this.camX - halfW ||
          em.x > this.camX + halfW ||
          em.y < this.camY - halfH ||
          em.y > this.camY + halfH
        ) {
          continue;
        }

        ctx.beginPath();
        // Ejected mass: distinct from ambient food (13px radius vs 9.5px, shooter's color)
        ctx.arc(em.x, em.y, 13, 0, Math.PI * 2);
        ctx.fillStyle = em.color || '#111111';
        ctx.fill();
        ctx.strokeStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    drawOnlineViruses(ctx) {
      const halfW = (this.canvas.width / 2) / this.camZoom + 120;
      const halfH = (this.canvas.height / 2) / this.camZoom + 120;

      for (const v of this.onlineViruses.values()) {
        if (
          v.x < this.camX - halfW ||
          v.x > this.camX + halfW ||
          v.y < this.camY - halfH ||
          v.y > this.camY + halfH
        ) {
          continue;
        }

        ctx.save();
        ctx.translate(v.x, v.y);

        const spikes = 16;
        const outerR = v.radius || 100;
        const innerR = outerR * 0.85;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / spikes;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        ctx.fillStyle = '#22C55E';
        ctx.fill();
        ctx.strokeStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.restore();
      }
    }

    getOnlineCellList() {
      const cellList = [];

      // Collect remote player cells
      for (const p of this.onlineRemotePlayers.values()) {
        for (const c of p.cells.values()) {
          cellList.push({
            id: c.id,
            playerId: p.id,
            x: c.x,
            y: c.y,
            mass: c.mass,
            radius: c.radius || Math.sqrt(c.mass * 100),
            color: p.color || '#737373',
            name: p.name || 'Player',
            squish: c.squish || 1.0,
            squishAngle: c.squishAngle || 0
          });
        }
      }

      // Collect local player cells
      for (const c of this.onlineLocalCells.values()) {
        cellList.push({
          id: c.id,
          playerId: this.localPlayerId,
          x: c.x,
          y: c.y,
          mass: c.mass,
          radius: c.radius || Math.sqrt(c.mass * 100),
          color: this.localColor || (this.isDarkMode ? '#FFFFFF' : '#111111'),
          name: this.localNickname || 'Player',
          squish: c.squish || 1.0,
          squishAngle: c.squishAngle || 0
        });
      }

      // Sort cells by mass: smaller rendered underneath, larger rendered on top
      cellList.sort((a, b) => a.mass - b.mass);
      return cellList;
    }

    drawOnlineCellsBelowViruses(ctx, cellList) {
      const VIRUS_RADIUS = 100;

      for (const c of cellList) {
        if (c.radius >= VIRUS_RADIUS) continue;

        ctx.save();
        ctx.translate(c.x, c.y);

        const squishFactor = c.squish || 1.0;
        const radiusX = c.radius * Math.sqrt(squishFactor);
        const radiusY = c.radius / Math.sqrt(squishFactor);

        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, c.squishAngle || 0, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();

        // Clean solid black outline underneath virus
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(3, c.radius * 0.06);
        ctx.stroke();

        ctx.restore();
      }
    }

    drawOnlineCellsAboveViruses(ctx, cellList) {
      const VIRUS_RADIUS = 100;

      for (const c of cellList) {
        if (c.radius < VIRUS_RADIUS) continue;

        ctx.save();
        ctx.translate(c.x, c.y);

        const squishFactor = c.squish || 1.0;
        const radiusX = c.radius * Math.sqrt(squishFactor);
        const radiusY = c.radius / Math.sqrt(squishFactor);

        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, c.squishAngle || 0, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();

        ctx.restore();
      }
    }

    drawOnlineCellOverlays(ctx, cellList) {
      const VIRUS_RADIUS = 100;
      const fontFam = this.fontReady ? "'Alice', Georgia, serif" : "Georgia, serif";

      for (const c of cellList) {
        const isSmall = c.radius < VIRUS_RADIUS;

        // Check if small cell is currently hiding inside any active virus
        let isInsideVirus = false;
        if (isSmall) {
          for (const v of this.onlineViruses.values()) {
            if (Math.hypot(c.x - v.x, c.y - v.y) < (v.radius || 100)) {
              isInsideVirus = true;
              break;
            }
          }
        }
        if (isInsideVirus) continue; // Safely concealed inside the virus!

        ctx.save();
        ctx.translate(c.x, c.y);

        const squishFactor = c.squish || 1.0;
        const radiusX = c.radius * Math.sqrt(squishFactor);
        const radiusY = c.radius / Math.sqrt(squishFactor);

        // Outlines for cells above viruses
        if (!isSmall) {
          ctx.beginPath();
          ctx.ellipse(0, 0, radiusX, radiusY, c.squishAngle || 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(3, c.radius * 0.06);
          ctx.stroke();
        }

        // In-cell names & mass scaling smoothly with cell size
        if (c.radius >= 12) {
          let fontSize = Math.max(9, Math.min(Math.round(c.radius * 0.35), 320));
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          ctx.font = `700 ${fontSize}px ${fontFam}`;
          const maxTextW = c.radius * 1.68;
          let textW = ctx.measureText(c.name).width;

          // Scale font size down smoothly if name exceeds in-cell boundaries
          if (textW > maxTextW) {
            fontSize = Math.max(8, Math.floor(fontSize * (maxTextW / textW)));
            ctx.font = `700 ${fontSize}px ${fontFam}`;
          }

          if (fontSize >= 8) {
            ctx.lineWidth = Math.max(3, fontSize * 0.22);
            ctx.strokeStyle = '#000000';
            ctx.fillStyle = '#FFFFFF';

            if (this.showMass && c.radius >= 22) {
              const massFontSize = Math.max(8, Math.floor(fontSize * 0.65));
              ctx.strokeText(c.name, 0, -fontSize * 0.28);
              ctx.fillText(c.name, 0, -fontSize * 0.28);

              ctx.font = `700 ${massFontSize}px ${fontFam}`;
              ctx.lineWidth = Math.max(1.8, massFontSize * 0.14);
              ctx.strokeText(Math.round(c.mass), 0, fontSize * 0.62);
              ctx.fillText(Math.round(c.mass), 0, fontSize * 0.62);
            } else {
              ctx.strokeText(c.name, 0, 0);
              ctx.fillText(c.name, 0, 0);
            }
          }
        }

        ctx.restore();
      }
    }

    drawOnlinePlayers(ctx) {
      const cellList = this.getOnlineCellList();
      this.drawOnlineCellsBelowViruses(ctx, cellList);
      this.drawOnlineCellsAboveViruses(ctx, cellList);
      this.drawOnlineCellOverlays(ctx, cellList);
    }

    drawGrid(ctx) {
      const currentMapSize = this.isOnlineMode ? (this.onlineMapSize || MAP_SIZE) : MAP_SIZE;
      const halfW = (this.canvas.width / 2) / this.camZoom;
      const halfH = (this.canvas.height / 2) / this.camZoom;

      const viewLeft = Math.max(0, this.camX - halfW);
      const viewRight = Math.min(currentMapSize, this.camX + halfW);
      const viewTop = Math.max(0, this.camY - halfH);
      const viewBottom = Math.min(currentMapSize, this.camY + halfH);

      const startX = Math.floor(viewLeft / GRID_SIZE) * GRID_SIZE;
      const endX = Math.ceil(viewRight / GRID_SIZE) * GRID_SIZE;
      const startY = Math.floor(viewTop / GRID_SIZE) * GRID_SIZE;
      const endY = Math.ceil(viewBottom / GRID_SIZE) * GRID_SIZE;

      ctx.strokeStyle = this.isDarkMode ? 'rgba(255, 255, 255, 0.045)' : '#E8E8E4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = startX; x <= endX; x += GRID_SIZE) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += GRID_SIZE) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();
    }

    drawBoundaries(ctx) {
      const currentMapSize = this.isOnlineMode ? (this.onlineMapSize || MAP_SIZE) : MAP_SIZE;
      ctx.strokeStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, currentMapSize, currentMapSize);
    }

    drawFoods(ctx) {
      const halfW = (this.canvas.width / 2) / this.camZoom + 30;
      const halfH = (this.canvas.height / 2) / this.camZoom + 30;

      for (const food of this.foods) {
        if (
          food.x < this.camX - halfW ||
          food.x > this.camX + halfW ||
          food.y < this.camY - halfH ||
          food.y > this.camY + halfH
        ) {
          continue;
        }

        const r = food.radius || (food.isSuper ? 15 : (food.isMedium ? 12 : 9.5));
        ctx.beginPath();
        ctx.arc(food.x, food.y, r, 0, Math.PI * 2);
        ctx.fillStyle = food.color;
        ctx.fill();

        ctx.strokeStyle = this.isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#111111';
        ctx.lineWidth = food.isSuper ? 2 : (food.isMedium ? 1.5 : 1);
        ctx.stroke();
      }
    }

    drawEjectedMasses(ctx) {
      for (const em of this.ejectedMasses) {
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.radius, 0, Math.PI * 2);
        ctx.fillStyle = em.color;
        ctx.fill();
        ctx.strokeStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    drawViruses(ctx) {
      for (const v of this.viruses) {
        ctx.save();
        ctx.translate(v.x, v.y);

        const spikes = 16;
        const outerR = v.radius;
        const innerR = v.radius * 0.85;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / spikes;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        ctx.fillStyle = '#22C55E';
        ctx.fill();
        ctx.strokeStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.restore();
      }
    }

    getOfflineCellList() {
      const cellList = [];
      for (const p of this.players.values()) {
        for (const c of p.cells) cellList.push(c);
      }
      cellList.sort((a, b) => a.mass - b.mass);
      return cellList;
    }

    drawCellsBelowViruses(ctx, cellList) {
      const VIRUS_RADIUS = 100;

      for (const c of cellList) {
        if (c.radius >= VIRUS_RADIUS) continue;

        ctx.save();
        ctx.translate(c.x, c.y);

        const squishFactor = c.squish || 1.0;
        const radiusX = c.radius * Math.sqrt(squishFactor);
        const radiusY = c.radius / Math.sqrt(squishFactor);

        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, c.squishAngle || 0, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();

        const isSelf = c.playerId === this.localPlayerId;
        const borderCol = this.isDarkMode
          ? (c.color === '#111111' ? '#FFFFFF' : '#0A0A0A')
          : '#111111';

        ctx.strokeStyle = borderCol;
        ctx.lineWidth = isSelf ? Math.max(3, c.radius * 0.06) : Math.max(2, c.radius * 0.045);
        ctx.stroke();

        ctx.restore();
      }
    }

    drawCellsAboveViruses(ctx, cellList) {
      const VIRUS_RADIUS = 100;

      for (const c of cellList) {
        if (c.radius < VIRUS_RADIUS) continue;

        ctx.save();
        ctx.translate(c.x, c.y);

        const squishFactor = c.squish || 1.0;
        const radiusX = c.radius * Math.sqrt(squishFactor);
        const radiusY = c.radius / Math.sqrt(squishFactor);

        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, c.squishAngle || 0, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();

        ctx.restore();
      }
    }

    drawCellOverlays(ctx, cellList) {
      const VIRUS_RADIUS = 100;
      const fontFam = this.fontReady ? "'Alice', Georgia, serif" : "Georgia, serif";

      for (const c of cellList) {
        const isSmall = c.radius < VIRUS_RADIUS;

        let isInsideVirus = false;
        if (isSmall) {
          for (const v of this.viruses) {
            if (Math.hypot(c.x - v.x, c.y - v.y) < v.radius) {
              isInsideVirus = true;
              break;
            }
          }
        }
        if (isInsideVirus) continue;

        ctx.save();
        ctx.translate(c.x, c.y);

        const squishFactor = c.squish || 1.0;
        const radiusX = c.radius * Math.sqrt(squishFactor);
        const radiusY = c.radius / Math.sqrt(squishFactor);

        if (!isSmall) {
          const isSelf = c.playerId === this.localPlayerId;
          const borderCol = this.isDarkMode
            ? (c.color === '#111111' ? '#FFFFFF' : '#0A0A0A')
            : '#111111';

          ctx.beginPath();
          ctx.ellipse(0, 0, radiusX, radiusY, c.squishAngle || 0, 0, Math.PI * 2);
          ctx.strokeStyle = borderCol;
          ctx.lineWidth = isSelf ? Math.max(3, c.radius * 0.06) : Math.max(2, c.radius * 0.045);
          ctx.stroke();
        }

        if (c.radius >= 12) {
          let fontSize = Math.max(9, Math.min(Math.round(c.radius * 0.35), 320));
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Crisp black stroke outline around white text for maximum readability
          const textColor = '#FFFFFF';
          const strokeColor = '#000000';

          ctx.font = `700 ${fontSize}px ${fontFam}`;
          const maxTextW = c.radius * 1.68;
          let textW = ctx.measureText(c.name).width;
          if (textW > maxTextW) {
            fontSize = Math.max(8, Math.floor(fontSize * (maxTextW / textW)));
            ctx.font = `700 ${fontSize}px ${fontFam}`;
          }
          ctx.lineWidth = Math.max(3, fontSize * 0.22);
          ctx.strokeStyle = strokeColor;
          ctx.fillStyle = textColor;

          if (this.showMass && c.radius >= 22) {
            const massFontSize = Math.max(8, Math.floor(fontSize * 0.65));
            ctx.strokeText(c.name, 0, -fontSize * 0.28);
            ctx.fillText(c.name, 0, -fontSize * 0.28);

            ctx.font = `700 ${massFontSize}px ${fontFam}`;
            ctx.lineWidth = Math.max(2, massFontSize * 0.14);
            ctx.strokeText(Math.round(c.mass), 0, fontSize * 0.65);
            ctx.fillText(Math.round(c.mass), 0, fontSize * 0.65);
          } else {
            ctx.strokeText(c.name, 0, 0);
            ctx.fillText(c.name, 0, 0);
          }
        }

        ctx.restore();
      }
    }

    drawCells(ctx) {
      const cellList = this.getOfflineCellList();
      this.drawCellsBelowViruses(ctx, cellList);
      this.drawCellsAboveViruses(ctx, cellList);
      this.drawCellOverlays(ctx, cellList);
    }

    updateLeaderboard() {
      const rankings = [];
      if (this.isOnlineMode) {
        let localTotalMass = 0;
        for (const c of this.onlineLocalCells.values()) {
          localTotalMass += c.mass || 0;
        }
        if (this.onlineLocalCells.size > 0 || this.isAlive) {
          rankings.push({
            id: 'local',
            name: this.localNickname || 'Player',
            mass: localTotalMass || 25,
            isLocal: true
          });
        }
        for (const p of this.onlineRemotePlayers.values()) {
          let remoteTotalMass = p.totalMass || 0;
          if (remoteTotalMass === 0 && p.cells) {
            for (const c of p.cells.values()) {
              remoteTotalMass += c.mass || 0;
            }
          }
          rankings.push({
            id: p.id,
            name: p.name || 'Player',
            mass: remoteTotalMass || 25,
            isLocal: false
          });
        }
      } else {
        for (const p of this.players.values()) {
          if (p.cells.length === 0) continue;
          const totalMass = p.cells.reduce((sum, c) => sum + c.mass, 0);
          rankings.push({
            id: p.id,
            name: p.name,
            mass: totalMass,
            isLocal: p.id === this.localPlayerId
          });
        }
      }

      rankings.sort((a, b) => b.mass - a.mass);
      if (this.playerTotalCount) this.playerTotalCount.textContent = `(${rankings.length})`;

      let html = '';
      const top10 = rankings.slice(0, 10);
      for (let i = 0; i < top10.length; i++) {
        const item = top10[i];
        const nameClass = item.isLocal ? 'font-bold' : 'font-normal';

        html += `
          <div class="flex items-center justify-between py-0.5 text-xs text-[#111111] dark:text-[#F3F4F6]">
            <div class="flex items-center gap-1.5 truncate max-w-[130px]">
              <span class="text-zinc-400 text-[10px] w-3.5 font-mono">${i + 1}.</span>
              <span class="font-serif truncate ${nameClass}">${escapeHtml(item.name)}</span>
            </div>
            <span class="text-[11px] font-bold font-mono text-[#111111] dark:text-white">${Math.round(item.mass)}</span>
          </div>
        `;
      }
      if (this.leaderboardList) this.leaderboardList.innerHTML = html;
    }

    renderMinimap() {
      const mCtx = this.minimapCtx;
      const w = this.minimapCanvas.width;
      const h = this.minimapCanvas.height;

      mCtx.clearRect(0, 0, w, h);
      const currentMapSize = this.isOnlineMode ? (this.onlineMapSize || MAP_SIZE) : MAP_SIZE;
      const scale = w / currentMapSize;

      mCtx.fillStyle = this.isDarkMode ? '#121212' : '#FFFFFF';
      mCtx.fillRect(0, 0, w, h);

      mCtx.strokeStyle = this.isDarkMode ? '#282828' : '#111111';
      mCtx.lineWidth = 1;
      mCtx.strokeRect(0, 0, w, h);

      const camHalfW = ((this.canvas.width / 2) / this.camZoom) * scale;
      const camHalfH = ((this.canvas.height / 2) / this.camZoom) * scale;
      const camMinX = Math.max(0, this.camX * scale - camHalfW);
      const camMinY = Math.max(0, this.camY * scale - camHalfH);
      const camBoxW = Math.min(w - camMinX, camHalfW * 2);
      const camBoxH = Math.min(h - camMinY, camHalfH * 2);

      mCtx.strokeStyle = this.isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(17, 17, 17, 0.35)';
      mCtx.lineWidth = 1;
      mCtx.strokeRect(camMinX, camMinY, camBoxW, camBoxH);

      if (this.isOnlineMode) {
        // Draw online viruses on minimap (green dots)
        mCtx.fillStyle = '#22C55E';
        for (const v of this.onlineViruses.values()) {
          const mx = v.x * scale;
          const my = v.y * scale;
          mCtx.beginPath();
          mCtx.arc(mx, my, 2.5, 0, Math.PI * 2);
          mCtx.fill();
        }

        for (const p of this.onlineRemotePlayers.values()) {
          mCtx.fillStyle = p.color || '#737373';
          if (p.cells) {
            for (const c of p.cells.values()) {
              const mx = c.x * scale;
              const my = c.y * scale;
              const mr = Math.max(2, (c.radius || 20) * scale);
              mCtx.beginPath();
              mCtx.arc(mx, my, mr, 0, Math.PI * 2);
              mCtx.fill();
            }
          }
        }
        mCtx.fillStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
        for (const c of this.onlineLocalCells.values()) {
          const mx = c.x * scale;
          const my = c.y * scale;
          const mr = Math.max(2.5, (c.radius || 20) * scale);
          mCtx.beginPath();
          mCtx.arc(mx, my, mr, 0, Math.PI * 2);
          mCtx.fill();
        }
        return;
      }

      // Offline mode: Draw viruses on minimap (green dots)
      mCtx.fillStyle = '#22C55E';
      for (const v of this.viruses) {
        const mx = v.x * scale;
        const my = v.y * scale;
        mCtx.beginPath();
        mCtx.arc(mx, my, 2.5, 0, Math.PI * 2);
        mCtx.fill();
      }

      for (const p of this.players.values()) {
        if (p.cells.length === 0) continue;
        const isLocal = p.id === this.localPlayerId;
        mCtx.fillStyle = isLocal ? (this.isDarkMode ? '#FFFFFF' : '#111111') : '#737373';

        for (const c of p.cells) {
          const mx = c.x * scale;
          const my = c.y * scale;
          const mr = Math.max(1.5, c.radius * scale);
          mCtx.beginPath();
          mCtx.arc(mx, my, mr, 0, Math.PI * 2);
          mCtx.fill();
        }
      }

      const localPlayer = this.players.get(this.localPlayerId);
      if (localPlayer && localPlayer.cells.length > 0) {
        const c = localPlayer.cells[0];
        const mx = c.x * scale;
        const my = c.y * scale;
        mCtx.strokeStyle = this.isDarkMode ? '#FFFFFF' : '#111111';
        mCtx.lineWidth = 1.5;
        mCtx.beginPath();
        mCtx.arc(mx, my, 4.5, 0, Math.PI * 2);
        mCtx.stroke();
      }
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new SplitrGame();
  });
})();
