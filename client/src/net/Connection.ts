import type { ClientMsg, ServerMsg } from '@kart/shared';

function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** Thin wrapper over a WebSocket speaking the shared JSON protocol. */
export class Connection {
  private ws: WebSocket | null = null;
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: () => void = () => {};

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(serverUrl());
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        resolve();
      };
      const timeout = setTimeout(() => { if(!opened){ws.close();reject(new Error('Connection timed out. Please try again.'));} },5000);
      ws.addEventListener('open',()=>clearTimeout(timeout));
      ws.addEventListener('close',()=>{clearTimeout(timeout);if(!opened)reject(new Error('Connection closed before joining.'));});
      ws.onerror = () => {
        if (!opened) reject(new Error('Could not reach the game server.'));
      };
      ws.onclose = () => {
        if(this.ws!==ws)return;
        this.ws = null;
        if (opened) this.onClose();
      };
      ws.onmessage = (ev) => {
        try {
          this.onMessage(JSON.parse(ev.data));
        } catch (err) {
          console.error('Bad message from server', err);
        }
      };
    });
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(notifyServer = true) {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      if(notifyServer && ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({t:'leave'}));
      ws.onclose = null;
      ws.close();
    }
  }
}
