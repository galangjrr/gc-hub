import http, { IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { OpCode, Packet, ClientRegisterPayload } from '../../shared/protocol';
import { signPacket, verifyPacket } from '../../shared/lanAuth';

export interface ConnectedClient {
  ws: WebSocket;
  pcId: string;
  pcName: string;
  ip: string;
  mac: string;
  isRegistered: boolean;
  lastPing: number;
  inQueue: Promise<void>; // verifikasi HMAC async, antrean menjaga urutan paket
}

export type ServerPacketListener = (client: ConnectedClient, packet: Packet) => void;

export class ServerNetworkBridge {
  private static httpServer: http.Server | null = null;
  private static wss: WebSocketServer | null = null;
  private static clients: Map<string, ConnectedClient> = new Map(); // Key: pcId
  private static listeners: Map<OpCode, ServerPacketListener[]> = new Map();
  private static port: number = 7894;
  private static lanSecret: string = '';
  private static outQueue: Promise<void> = Promise.resolve();

  /** Kunci LAN bersama. Jika diisi, semua paket masuk wajib bertanda tangan valid dan paket keluar ikut ditandatangani. */
  public static setLanSecret(secret: string): void {
    this.lanSecret = secret || '';
  }

  private static transmit(targets: WebSocket[], packet: Packet): void {
    this.outQueue = this.outQueue.then(async () => {
      const json = JSON.stringify(this.lanSecret ? await signPacket(this.lanSecret, packet) : packet);
      targets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(json);
      });
    }).catch(err => console.error('[SERVER NETWORK] Gagal mengirim paket:', err));
  }

  /**
   * Start Server HTTP & WebSocket Listener (Port 7894)
   */
  public static start(port: number = 7894): void {
    if (this.wss || this.httpServer) {
      console.log(`[SERVER NETWORK] Server is already running on port ${this.port}`);
      return;
    }

    this.port = port;
    try {
      this.httpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url || '/';
        if (url === '/health' || url === '/api/health' || url === '/status') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({
            status: 'ok',
            service: 'GC-Hub Billing Server',
            port: this.port,
            connectedClients: this.clients.size,
            uptime: Math.round(process.uptime()),
            timestamp: Date.now()
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('GC-Hub Cyber Cafe Management HTTP & WebSocket Engine Active');
      });

      this.wss = new WebSocketServer({ server: this.httpServer });
      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`[SERVER NETWORK] GC-Hub Billing HTTP & WebSocket Server listening on 0.0.0.0:${this.port}`);
      });

      this.wss.on('error', (err: any) => {
        console.error(`[SERVER NETWORK] Critical WebSocket Server Error on port ${this.port}:`, err);
      });

      this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const remoteIp = req.socket.remoteAddress || '127.0.0.1';
        const tempId = `TEMP-${Date.now()}`;
        
        const clientInfo: ConnectedClient = {
          ws,
          pcId: tempId,
          pcName: 'Unregistered PC',
          ip: remoteIp === '::1' ? '127.0.0.1' : remoteIp.replace(/^::ffff:/, ''),
          mac: '00:00:00:00:00:00',
          isRegistered: false,
          lastPing: Date.now(),
          inQueue: Promise.resolve(),
        };

        this.clients.set(tempId, clientInfo);
        console.log(`[SERVER NETWORK] New workstation connected from ${clientInfo.ip} (Assigned Temp ID: ${tempId})`);

        ws.on('message', (data: string | Buffer) => {
          let packet: Packet;
          try {
            packet = JSON.parse(data.toString());
          } catch (err) {
            console.error(`[SERVER NETWORK] Failed to parse message from ${clientInfo.pcId}:`, err);
            return;
          }
          clientInfo.inQueue = clientInfo.inQueue.then(async () => {
            if (this.lanSecret && !(await verifyPacket(this.lanSecret, packet))) {
              console.warn(`[SERVER NETWORK] Paket ditolak dari ${clientInfo.ip} (${clientInfo.pcId}): tanda tangan LAN tidak valid.`);
              if (!clientInfo.isRegistered) ws.close(4001, 'Invalid LAN signature');
              return;
            }
            this.handleIncomingPacket(clientInfo, packet);
          }).catch(err => console.error(`[SERVER NETWORK] Error memproses paket dari ${clientInfo.pcId}:`, err));
        });

        ws.on('close', () => {
          console.warn(`[SERVER NETWORK] Workstation ${clientInfo.pcId} (${clientInfo.pcName}) disconnected.`);
          this.clients.delete(clientInfo.pcId);
          this.notifyConnectionChange(clientInfo.pcId, false);
        });

        ws.on('error', (err) => {
          console.error(`[SERVER NETWORK] Socket error for ${clientInfo.pcId}:`, err);
        });
      });

      // Background Ping / Liveness Check
      setInterval(() => {
        const now = Date.now();
        this.clients.forEach((client, pcId) => {
          if (client.ws.readyState === WebSocket.OPEN) {
            // Heartbeat
            if (now - client.lastPing > 30000) {
              console.warn(`[SERVER NETWORK] Workstation ${pcId} heartbeat timeout, terminating...`);
              client.ws.terminate();
              this.clients.delete(pcId);
              this.notifyConnectionChange(pcId, false);
            }
          }
        });
      }, 10000);

    } catch (error) {
      console.error('[SERVER NETWORK] Failed to start WebSocket Server:', error);
    }
  }

  private static connectionChangeListeners: ((pcId: string, isConnected: boolean) => void)[] = [];

  public static onConnectionChange(listener: (pcId: string, isConnected: boolean) => void): () => void {
    this.connectionChangeListeners.push(listener);
    return () => {
      this.connectionChangeListeners = this.connectionChangeListeners.filter(l => l !== listener);
    };
  }

  private static notifyConnectionChange(pcId: string, isConnected: boolean): void {
    this.connectionChangeListeners.forEach(fn => {
      try { fn(pcId, isConnected); } catch (e) {}
    });
  }

  /**
   * Handle incoming packets from clients
   */
  private static handleIncomingPacket(client: ConnectedClient, packet: Packet): void {
    client.lastPing = Date.now();

    // 1. Handshake & Registration
    if (packet.op === OpCode.CLIENT_REGISTER) {
      const regData = packet.payload as ClientRegisterPayload;
      if (regData) {
        // Re-key client in map
        this.clients.delete(client.pcId);
        client.pcId = regData.pcId || client.pcId;
        client.pcName = regData.pcName || client.pcId;
        client.mac = regData.mac || client.mac;
        // IP dari socket lebih bisa dipercaya; pakai IP laporan client hanya bila tersambung via loopback
        if (client.ip === '127.0.0.1') client.ip = regData.ip || client.ip;
        client.isRegistered = true;
        this.clients.set(client.pcId, client);

        console.log(`[SERVER NETWORK] Registered Workstation: ${client.pcName} (${client.pcId}) [${client.ip}]`);
        this.notifyConnectionChange(client.pcId, true);

        // Send confirmation back to client
        this.sendToClient(client.pcId, OpCode.SERVER_CONFIG_INIT, {
          cafeName: 'GC-Hub Cyber Cafe',
          serverTime: Date.now(),
          allowedDirectGuest: true,
        });
      }
      // Let it fall through to dispatch to listeners
    }

    // 2. Heartbeat Ping
    if (packet.op === OpCode.HEARTBEAT) {
      this.sendToClient(client.pcId, OpCode.HEARTBEAT, { serverTime: Date.now() });
      return;
    }

    // 3. Dispatch to subscribed listeners
    const handlers = this.listeners.get(packet.op);
    if (handlers) {
      handlers.forEach((fn) => fn(client, packet));
    }
  }

  /**
   * Send packet to specific PC
   */
  public static sendToClient<T>(pcId: string, op: OpCode, payload?: T): boolean {
    let client = this.clients.get(pcId);
    if (!client) {
      const cleanTarget = (pcId || '').trim().toUpperCase();
      for (const [key, c] of this.clients.entries()) {
        if (
          key.toUpperCase() === cleanTarget ||
          (c.pcId && c.pcId.toUpperCase() === cleanTarget) ||
          (c.pcName && c.pcName.toUpperCase() === cleanTarget) ||
          (c.ip && c.ip === pcId)
        ) {
          client = c;
          break;
        }
      }
    }

    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[SERVER NETWORK] Cannot send ${op} to ${pcId} (Not connected).`);
      return false;
    }

    this.transmit([client.ws], { op, ts: Date.now(), pcId: client.pcId, payload });
    return true;
  }

  /**
   * Broadcast packet to all connected workstations
   */
  public static broadcast<T>(op: OpCode, payload?: T): void {
    this.transmit(Array.from(this.clients.values(), c => c.ws), { op, ts: Date.now(), payload });
  }

  /**
   * Register event listener for OpCodes
   */
  public static on(op: OpCode, handler: ServerPacketListener): void {
    const list = this.listeners.get(op) || [];
    list.push(handler);
    this.listeners.set(op, list);
  }

  /**
   * Get all currently connected workstations
   */
  public static getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Stop Server Network Bridge
   */
  public static stop(): void {
    if (this.wss) {
      try { this.wss.close(); } catch {}
      this.wss = null;
    }
    if (this.httpServer) {
      try { this.httpServer.close(); } catch {}
      this.httpServer = null;
    }
    this.clients.clear();
    console.log('[SERVER NETWORK] Server stopped.');
  }
}
