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
      
      this.client = new WebPubSubClient({
        getClientAccessUrl: async () => {
          const res = await fetch(`${burgerApiUrl}/api/realtime/negotiate?userId=${userId}`);
          if (!res.ok) throw new Error('Failed to negotiate realtime connection');
          const data = await res.json();
          return data.url;
        }
      });

      this.client.on('server-message', (e) => {
        const eventData = e.message.data as any;
        // Expecting { type: 'event', event: 'event-name', data: ... }
        // However, the PubSubService sends it wrapped. Let's handle the unwrapping or raw data.
        
        // If sent via sendToUser with type 'event', the payload is what we passed in `data` field? 
        // Actually, `e.message.data` contains the payload we sent.
        // Our API sends { type: 'event', event: name, data: payload } inside the message body? 
        // No, the client receives the raw data object we passed to `sendToUser`.
        // But wait, `sendToUser` usually sends a custom event.
        
        // Simplified assumption for this demo:
        // The data received here corresponds to the 3rd argument of sendToUser/sendToAll if using JSON content type.
        // Our backend sends: { type: 'event', event: eventName, data: data }
        
        const message = eventData;
        if (message && message.event) {
            this.emit(message.event, message.data);
        }
      });

      await this.client.start();
      this.isConnected = true;
      console.log('Real-time connection established');
    } catch (err) {
      console.warn('Real-time service unavailable:', err);
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