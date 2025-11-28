
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import process from 'node:process';

export class PubSubService {
  private static instance: PubSubService;
  private client: WebPubSubServiceClient | undefined;
  private isInitialized = false;
  private hubName = 'orders';

  private constructor() {}

  public static getInstance(): PubSubService {
    if (!PubSubService.instance) {
      PubSubService.instance = new PubSubService();
      PubSubService.instance.initialize();
    }
    return PubSubService.instance;
  }

  public get isConnected(): boolean {
    return this.isInitialized;
  }

  private initialize() {
    const connectionString = process.env.AZURE_WEBPUBSUB_CONNECTION_STRING;
    if (!connectionString) {
      console.warn('[PubSub] AZURE_WEBPUBSUB_CONNECTION_STRING not found. Real-time features disabled.');
      return;
    }

    if (connectionString.length < 20) {
        console.error('[PubSub] Connection string appears invalid or truncated.');
        return;
    }

    try {
      this.client = new WebPubSubServiceClient(connectionString, this.hubName);
      this.isInitialized = true;
      console.log('[PubSub] Service successfully initialized.');
    } catch (error) {
      console.error('[PubSub] Failed to initialize client:', error);
      // Do not throw here, allow the app to start without PubSub
    }
  }

  public async getClientAccessToken(userId: string) {
    if (!this.isInitialized || !this.client) {
      throw new Error('Web PubSub not initialized');
    }
    // Token valid for 60 minutes
    try {
        return await this.client.getClientAccessToken({ userId, expirationTimeInMinutes: 60 });
    } catch (error: any) {
        console.error('[PubSub] Failed to generate access token:', error);
        throw error;
    }
  }

  public async broadcastToUser(userId: string, eventName: string, data: any) {
    if (!this.isInitialized || !this.client) {
      return; 
    }
    try {
      await this.client.sendToUser(userId, {
        type: 'event',
        event: eventName,
        data: data
      });
      console.log(`[PubSub] Broadcasted ${eventName} to user ${userId}`);
    } catch (error: any) {
      // Handle quota exceeded or throttling gracefully
      if (error.statusCode === 429 || error.statusCode === 439) {
          console.warn(`[PubSub] Quota Exceeded or Throttled. Dropping message for user ${userId}.`);
      } else {
          console.error(`[PubSub] Failed to broadcast to user ${userId}:`, error);
      }
    }
  }

  public async broadcastToAll(eventName: string, data: any) {
    if (!this.isInitialized || !this.client) {
        return;
    }
    try {
        await this.client.sendToAll({
            type: 'event',
            event: eventName,
            data: data
        });
    } catch (error: any) {
        if (error.statusCode === 429 || error.statusCode === 439) {
            console.warn(`[PubSub] Quota Exceeded. Dropping broadcast message.`);
        } else {
            console.error('[PubSub] Failed to broadcast to all:', error);
        }
    }
  }
}
