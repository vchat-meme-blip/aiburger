import { WebPubSubClient } from '@azure/web-pubsub-client';

export class RealtimeService {
  private static instance: RealtimeService;
  private client: WebPubSubClient | undefined;
  private listeners: Map<string, Function[]> = new Map();
  private isConnected = false;

  private constructor() {}

  public static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  public async connect(userId: string) {
    if (this.isConnected) return;

    try {
      const burgerApiUrl = import.meta.env.VITE_BURGER_API_URL || 'http://localhost:7071';

      // 1. Pre-flight check: Validate negotiation endpoint manually
      // This catches 503s before the SDK throws a "URL invalid" error
      try {
          const checkRes = await fetch(`${burgerApiUrl}/api/realtime/negotiate?userId=${userId}`);
          if (checkRes.status === 503 || !checkRes.ok) {
               console.warn('Real-time service unavailable (Web PubSub not configured). Skipping connection.');
               return;
          }
      } catch (e) {
          console.warn('Failed to reach Real-time service. Skipping.', e);
          return;
      }

      this.client = new WebPubSubClient({
        getClientAccessUrl: async () => {
          const res = await fetch(`${burgerApiUrl}/api/realtime/negotiate?userId=${userId}`);
          // The pre-flight check handles the 503, but we keep this for robustness
          if (!res.ok) {
             throw new Error(`Failed to negotiate realtime connection: ${res.statusText}`);
          }
          const data = await res.json();
          if (!data.url) throw new Error('No URL returned from negotiate');
          return data.url;
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
      console.log('Real-time connection established');
    } catch (err) {
      // Swallow the error to prevent crashing the UI, but log a warning
      console.warn('Real-time service unavailable, falling back to polling/static updates.', err);
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
