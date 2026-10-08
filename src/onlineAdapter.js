/**
 * Splitr — Online WebSocket Room Client Adapter
 * Lightweight, zero-dependency client that connects to the Cloudflare Worker GameRoom Durable Object.
 */

export class OnlineRoomClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.localPlayerId = null;
    this.serverPlayers = [];
    this.lastInputSent = 0;
    this.pingInterval = null;
    this.onStateCallback = null;
    this.onErrorCallback = null;
    this.onDisconnectCallback = null;
    this.onConnectedCallback = null;
    this.onGameOverCallback = null;
    this.onRespawnedCallback = null;
    this.onKillCallback = null;
    this.onCellEatenCallback = null;
    this.cellVisualRadii = new Map();
  }

  static getWebSocketUrl() {
    // Check if an override is provided via localStorage or window
    if (window.SPLITR_WS_ENDPOINT) {
      return window.SPLITR_WS_ENDPOINT;
    }
    const savedCustomUrl = localStorage.getItem('splitr_custom_ws');
    if (savedCustomUrl) {
      return savedCustomUrl;
    }

    // Default: use same host with wss:// (or ws:// on localhost)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/room/public`;
  }

  connect({ nickname, color, onConnected, onInit, onState, onError, onDisconnect, onGameOver, onRespawned, onKill, onCellEaten }) {
    this.disconnect();

    this.onConnectedCallback = onConnected;
    this.onInitCallback = onInit;
    this.onStateCallback = onState;
    this.onErrorCallback = onError;
    this.onDisconnectCallback = onDisconnect;
    this.onGameOverCallback = onGameOver;
    this.onRespawnedCallback = onRespawned;
    this.onKillCallback = onKill;
    this.onCellEatenCallback = onCellEaten;

    const url = OnlineRoomClient.getWebSocketUrl();

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      if (this.onErrorCallback) this.onErrorCallback(err);
      return;
    }

    const connectTimeout = setTimeout(() => {
      if (!this.isConnected && this.ws && this.ws.readyState !== WebSocket.OPEN) {
        try { this.ws.close(); } catch (_) {}
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('Connection timed out. Ensure backend Worker is deployed.'));
        }
      }
    }, 7000);

    this.ws.onopen = () => {
      clearTimeout(connectTimeout);
      this.isConnected = true;

      // Send join handshake
      this.sendRaw({
        type: 'join',
        name: nickname || 'Player',
        color: color || '#111111'
      });
    };

    this.ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (!data || !data.type) return;

      if (data.type === 'init') {
        this.localPlayerId = data.playerId;
        if (this.onInitCallback) this.onInitCallback(data);
        if (this.onConnectedCallback) this.onConnectedCallback(data);
      } else if (data.type === 'connected') {
        this.localPlayerId = data.playerId;
        if (this.onConnectedCallback) this.onConnectedCallback(data);
      } else if (data.type === 'state') {
        this.serverPlayers = Array.isArray(data.players) ? data.players : [];
        // Apply radius easing smoothly toward Math.sqrt(mass * 100) at 0.15 per frame/update
        const activeIds = new Set();
        for (const p of this.serverPlayers) {
          if (Array.isArray(p.cells)) {
            for (const c of p.cells) {
              activeIds.add(c.id);
              const targetR = Math.sqrt(c.mass * 100);
              const prevR = this.cellVisualRadii.get(c.id) || targetR;
              const easedR = prevR + (targetR - prevR) * 0.15;
              this.cellVisualRadii.set(c.id, easedR);
              c.visualRadius = easedR;
            }
          }
        }
        for (const id of this.cellVisualRadii.keys()) {
          if (!activeIds.has(id)) {
            this.cellVisualRadii.delete(id);
          }
        }
        if (this.onStateCallback) {
          this.onStateCallback(data, this.localPlayerId);
        }
      } else if (data.type === 'gameOver') {
        if (this.onGameOverCallback) {
          this.onGameOverCallback(data);
        }
      } else if (data.type === 'respawned') {
        if (this.onRespawnedCallback) {
          this.onRespawnedCallback(data);
        }
      } else if (data.type === 'kill') {
        if (this.onKillCallback) {
          this.onKillCallback(data);
        }
      } else if (data.type === 'cellEaten') {
        if (this.onCellEatenCallback) {
          this.onCellEatenCallback(data);
        }
      }
    };

    this.ws.onerror = (err) => {
      clearTimeout(connectTimeout);
      if (this.onErrorCallback) this.onErrorCallback(err);
    };

    this.ws.onclose = () => {
      clearTimeout(connectTimeout);
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this.localPlayerId = null;
      if (wasConnected && this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }
    };
  }

  sendInput(targetWorldX, targetWorldY) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const now = performance.now();
    // Throttle client input transmission to ~25 Hz (every 40ms)
    if (now - this.lastInputSent < 40) return;
    this.lastInputSent = now;

    this.sendRaw({
      type: 'input',
      x: Math.round(targetWorldX),
      y: Math.round(targetWorldY)
    });
  }

  sendSplit() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.sendRaw({ type: 'split' });
  }

  sendEject() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.sendRaw({ type: 'eject' });
  }

  sendRespawn(name) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.sendRaw({ type: 'respawn', name: name || undefined });
  }

  sendRaw(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch (_) {}
    }
  }

  easeRadius(currentRadius, targetMass, factor = 0.15) {
    const targetRadius = Math.sqrt(targetMass * 100);
    if (!currentRadius) return targetRadius;
    return currentRadius + (targetRadius - currentRadius) * factor;
  }

  disconnect() {
    this.isConnected = false;
    this.localPlayerId = null;
    this.serverPlayers = [];
    this.cellVisualRadii.clear();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}
