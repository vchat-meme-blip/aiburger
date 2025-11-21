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

  private initialize() {
    const connectionString = process.env.AZURE_WEBPUBSUB_CONNECTION_STRING;
    if (!connectionString) {
      console.warn('AZURE_WEBPUBSUB_CONNECTION_STRING not found. Real-time features disabled.');
      return;
    }

    try {
      this.client = new WebPubSubServiceClient(connectionString, this.hubName);
      this.isInitialized = true;
      console.log('Web PubSub Service initialized.');
    } catch (error) {
      console.error('Failed to initialize Web PubSub client:', error);
      // Don't crash, just don't set isInitialized
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
        console.error('Failed to generate access token:', error);
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
      console.log(`Broadcasted ${eventName} to user ${userId}`);
    } catch (error: any) {
      // Handle quota exceeded or throttling gracefully
      if (error.statusCode === 429 || error.statusCode === 439) {
          console.warn(`Web PubSub Quota Exceeded or Throttled. Dropping message for user ${userId}.`);
      } else {
          console.error(`Failed to broadcast to user ${userId}:`, error);
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
            console.warn(`Web PubSub Quota Exceeded. Dropping broadcast message.`);
        } else {
            console.error('Failed to broadcast to all:', error);
        }
    }
  }
}