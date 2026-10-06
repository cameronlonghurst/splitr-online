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

  connect({ nickname, color, onConnected, onInit, onState, onError, onDisconnect, onGameOver, onRespawned }) {
    this.disconnect();

    this.onConnectedCallback = onConnected;
    this.onInitCallback = onInit;
    this.onStateCallback = onState;
    this.onErrorCallback = onError;
    this.onDisconnectCallback = onDisconnect;
    this.onGameOverCallback = onGameOver;
    this.onRespawnedCallback = onRespawned;

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

  sendRespawn() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.sendRaw({ type: 'respawn' });
  }

  sendRaw(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch (_) {}
    }
  }

  disconnect() {
    this.isConnected = false;
    this.localPlayerId = null;
    this.serverPlayers = [];
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
