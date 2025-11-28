
import process from 'node:process';
import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { DbService } from '../db-service.js';
import { PubSubService } from '../pubsub-service.js';
import { BlobService } from '../blob-service.js';
import { OrderStatus } from '../order.js';

app.http('status-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: '{ignored:maxlength(0)?}', // Empty route for the API root
  async handler(_request: HttpRequest, context: InvocationContext) {
    context.log('Processing request to get server status...');

    try {
      const dataService = await DbService.getInstance();
      const orders = await dataService.getOrders();
      const registeredUsers = await dataService.getRegisteredUsers();

      // Count active orders (orders that are not completed or cancelled)
      const activeOrders = orders.filter(
        (order) => order.status !== OrderStatus.Completed && order.status !== OrderStatus.Cancelled,
      );

      // Check Configurations
      const pubSub = PubSubService.getInstance();
      const blob = await BlobService.getInstance();
      
      const uberClientSecret = process.env.UBER_CLIENT_SECRET;
      const uberConfig = {
          clientId: !!process.env.UBER_CLIENT_ID,
          clientSecret: !!uberClientSecret && uberClientSecret.length > 0,
          mode: (uberClientSecret && uberClientSecret.length > 0) ? 'sandbox' : 'mock'
      };

      return {
        jsonBody: {
          status: 'up',
          activeOrders: activeOrders.length,
          totalOrders: orders.length,
          registeredUsers,
          timestamp: new Date().toISOString(),
          config: {
              pubSub: pubSub.isConnected ? 'connected' : 'disconnected',
              blobStorage: blob.isConnected ? 'connected' : 'local-fallback',
              uber: uberConfig
          }
        },
        status: 200,
      };
    } catch (error) {
      context.error('Error processing server status request:', error);

      return {
        jsonBody: {
          status: 'up',
          error: 'Error retrieving order information',
          timestamp: new Date().toISOString(),
        },
        status: 200, // Still return 200 to indicate the server is up
      };
    }
  },
});
