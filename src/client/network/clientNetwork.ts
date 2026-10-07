import { OpCode, Packet, ClientRegisterPayload, ClientSessionSnapshot } from '../../shared/protocol';
import { signPacket, verifyPacket } from '../../shared/lanAuth';

const SNAPSHOT_KEY = 'gchub_session_snapshot';

export type PacketHandler = (packet: Packet) => void;
export type ConnectionStateListener = (connected: boolean) => void;

export class ClientNetworkService {
  private static ws: WebSocket | null = null;
  private static serverUrl: string = (typeof window !== 'undefined' && window.localStorage?.getItem('gchub_server_url')) || 'ws://localhost:7894';
  private static isConnected: boolean = false;
  private static lanSecret: string = '';
  private static outQueue: Promise<void> = Promise.resolve();
  private static inQueue: Promise<void> = Promise.resolve();

  /** Kunci LAN dari client-config.json. Jika diisi, paket dari server yang tidak bertanda tangan valid dibuang. */
  public static setLanSecret(secret: string): void {
    this.lanSecret = (secret || '').trim();
  }
  private static heartbeatInterval: any = null;
  private static listeners: Map<OpCode, PacketHandler[]> = new Map();
  private static connectionListeners: ConnectionStateListener[] = [];
  
  private static pcId: string = (typeof window !== 'undefined' && window.localStorage?.getItem('gchub_pc_id')) || 'PC-01';
  private static pcName: string = (typeof window !== 'undefined' && window.localStorage?.getItem('gchub_pc_name')) || 'PC-01';
  private static mac: string = '';
  private static machineIp: string = '';
  private static osName: string = '';

  public static setMachineInfo(info: { mac?: string; ip?: string; os?: string }): void {
    if (info.mac) this.mac = info.mac;
    if (info.ip) this.machineIp = info.ip;
    if (info.os) this.osName = info.os;
  }

  public static setWorkstationConfig(id: string, name?: string, mac?: string): void {
    this.pcId = id;
    this.pcName = name || id;
    if (mac) this.mac = mac;
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem('gchub_pc_id', id);
      window.localStorage?.setItem('gchub_pc_name', name || id);
    }
    // Re-register with server immediately if websocket is already active
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRegister();
    }
  }

  private static sendRegister(): void {
    this.send<ClientRegisterPayload>(OpCode.CLIENT_REGISTER, {
      pcId: this.pcId,
      pcName: this.pcName,
      mac: this.mac,
      ip: this.machineIp,
      os: this.osName,
      clientVersion: '1.0.0-gchub',
      sessionSnapshot: this.loadSessionSnapshot(),
    });
    // Sekali pakai: tick berikutnya menulis ulang jika sesi masih aktif, jadi snapshot basi tidak terbawa ke sesi lain
    this.saveSessionSnapshot(null);
  }

  // Snapshot disimpan di localStorage supaya selamat saat client restart ketika server mati.
  // Aman dari manipulasi: server hanya memakainya untuk MENAMBAH waktu terpakai, tidak pernah mengurangi.
  public static saveSessionSnapshot(snapshot: ClientSessionSnapshot | null): void {
    try {
      if (snapshot) window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
      else window.localStorage.removeItem(SNAPSHOT_KEY);
    } catch {}
  }

  private static loadSessionSnapshot(): ClientSessionSnapshot | undefined {
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  public static setServerUrl(url: string): void {
    this.serverUrl = url;
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem('gchub_server_url', url);
    }
  }

  public static getServerUrl(): string {
    return this.serverUrl;
  }

  public static getWorkstationConfig(): { pcId: string; pcName: string; mac: string } {
    return { pcId: this.pcId, pcName: this.pcName, mac: this.mac };
  }

  public static getIsConnected(): boolean {
    return this.isConnected;
  }

  private static reconnectTimeout: any = null;

  /**
   * Hubungkan ke Server Kasir
   */
  public static connect(url?: string): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (url) {
      if (this.ws) {
        try {
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.close();
        } catch (e) {}
        this.ws = null;
      }
      this.serverUrl = url;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log(`[CLIENT NETWORK] Connecting to Server at ${this.serverUrl}...`);
    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('[CLIENT NETWORK] Connected to Server successfully.');
        this.isConnected = true;
        this.notifyConnectionState(true);
        
        // Kirim Register Handshake
        this.sendRegister();

        this.startHeartbeat();
        this.startTelemetryReporting();
      };

      this.ws.onmessage = (event) => {
        let packet: Packet;
        try {
          packet = JSON.parse(event.data);
        } catch (e) {
          console.error('[CLIENT NETWORK] Failed to parse incoming packet:', e);
          return;
        }
        this.inQueue = this.inQueue.then(async () => {
          if (this.lanSecret && !(await verifyPacket(this.lanSecret, packet))) {
            console.warn(`[CLIENT NETWORK] Paket ${packet.op} dibuang: tanda tangan server tidak valid.`);
            return;
          }
          this.dispatch(packet);
        }).catch(e => console.error('[CLIENT NETWORK] Error memproses paket:', e));
      };

      this.ws.onclose = () => {
        console.warn('[CLIENT NETWORK] Connection lost. Reconnecting in 3s...');
        this.isConnected = false;
        this.notifyConnectionState(false);
        this.stopHeartbeat();
        this.stopTelemetryReporting();
        if (!this.reconnectTimeout) {
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
          }, 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[CLIENT NETWORK] WebSocket error:', err);
      };
    } catch (error) {
      console.error('[CLIENT NETWORK] Connection error:', error);
    }
  }

  /**
   * Kirim Paket ke Server
   */
  public static send<T>(op: OpCode, payload?: T): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[CLIENT NETWORK] Cannot send ${op}, not connected to server.`);
      return;
    }

    const ws = this.ws;
    const packet: Packet<T> = {
      op,
      ts: Date.now(),
      pcId: this.pcId,
      payload,
    };

    this.outQueue = this.outQueue.then(async () => {
      const signed = this.lanSecret ? await signPacket(this.lanSecret, packet) : packet;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(signed));
    }).catch(e => console.error('[CLIENT NETWORK] Gagal mengirim paket:', e));
  }

  /**
   * Daftarkan Listener untuk Event Paket Tertentu
   */
  public static on(op: OpCode, handler: PacketHandler): () => void {
    const list = this.listeners.get(op) || [];
    list.push(handler);
    this.listeners.set(op, list);

    // Return unsubscriber
    return () => {
      const current = this.listeners.get(op) || [];
      this.listeners.set(op, current.filter(h => h !== handler));
    };
  }

  public static onConnectionStateChange(listener: ConnectionStateListener): () => void {
    this.connectionListeners.push(listener);
    listener(this.isConnected);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }

  private static notifyConnectionState(connected: boolean): void {
    this.connectionListeners.forEach(l => l(connected));
  }

  private static dispatch(packet: Packet): void {
    const list = this.listeners.get(packet.op);
    if (list) {
      list.forEach(handler => handler(packet));
    }
  }

  private static telemetryInterval: any = null;

  private static startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send(OpCode.HEARTBEAT);
    }, 5000);
  }

  private static stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private static startTelemetryReporting(): void {
    this.stopTelemetryReporting();
    this.telemetryInterval = setInterval(() => this.sendTelemetry(), 10000);
  }

  /** Report telemetry now, e.g. right after a kiosk switch so the cashier sees it without waiting. */
  public static async sendTelemetry(): Promise<void> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
      const snapshot = api?.getTelemetry ? await api.getTelemetry(this.pcId) : null;
      if (snapshot) {
        this.send(OpCode.REMOTE_COMMAND, { action: 'telemetry', params: snapshot });
      }
    } catch (err) {
      console.warn('[CLIENT NETWORK] Telemetry send failed:', err);
    }
  }

  private static stopTelemetryReporting(): void {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  public static disconnect(): void {
    this.stopHeartbeat();
    this.stopTelemetryReporting();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnected = false;
    this.notifyConnectionState(false);
  }
}

