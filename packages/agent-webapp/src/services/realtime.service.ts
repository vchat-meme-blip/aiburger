
import { WebPubSubClient } from '@azure/web-pubsub-client';

export class RealtimeService {
  private static instance: RealtimeService;
  private client: WebPubSubClient | undefined;
  private listeners: Map<string, Function[]> = new Map();
  private isConnected = false;
  private connectionAttempted = false;

  private constructor() {}

  public static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  public async connect(userId: string) {
    if (this.isConnected || this.connectionAttempted) return;
    this.connectionAttempted = true;

    try {
      const burgerApiUrl = import.meta.env.VITE_BURGER_API_URL || 'http://localhost:7071';
      
      this.client = new WebPubSubClient({
        getClientAccessUrl: async () => {
          try {
            const res = await fetch(`${burgerApiUrl}/api/realtime/negotiate?userId=${userId}`);
            if (!res.ok) {
               // Gracefully fail if service is unavailable (503) or error (500)
               // This happens if the resource isn't provisioned yet
               if (res.status === 503) {
                   console.warn('[Realtime] Service unavailable (503). Real-time updates disabled.');
                   return { url: '' }; // Abort
               }
               throw new Error(`Failed to negotiate: ${res.statusText}`);
            }
            const data = await res.json();
            if (!data.url) throw new Error('No URL returned from negotiate');
            return data.url;
          } catch (e) {
            console.warn('[Realtime] Negotiation failed:', e);
            return { url: '' };
          }
        }
      });

      this.client.on('server-message', (e) => {
        const eventData = e.message.data as any;
        const message = eventData;
        if (message && message.event) {
            this.emit(message.event, message.data);
        }
      });

      await this.client.start();
      this.isConnected = true;
      console.log('[Realtime] Connection established');
    } catch (err) {
      // Swallow the error to prevent crashing the UI
      console.warn('[Realtime] Failed to connect, falling back to polling/static updates.', err);
      this.isConnected = false;
    }
  }

  public on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  public off(event: string, callback: Function) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      this.listeners.set(event, callbacks.filter(cb => cb !== callback));
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }
}
