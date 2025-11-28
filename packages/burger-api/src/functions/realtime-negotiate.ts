import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { PubSubService } from '../pubsub-service.js';

app.http('realtime-negotiate', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'realtime/negotiate',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const userId = request.query.get('userId') || 'anonymous';
        
        try {
            const pubSub = PubSubService.getInstance();
            const tokenResponse = await pubSub.getClientAccessToken(userId);
            
            return {
                status: 200,
                jsonBody: {
                    url: tokenResponse.url
                }
            };
        } catch (error: any) {
            // If service is not configured, we expect 'Web PubSub not initialized' error
            if (error.message === 'Web PubSub not initialized') {
                 context.warn('Real-time negotiate skipped: Web PubSub not configured.');
                 return {
                    status: 503, // Service Unavailable
                    jsonBody: { error: 'Real-time service unavailable' }
                 };
            }
            
            context.error('Failed to negotiate Web PubSub connection:', error);
            return {
                status: 500,
                jsonBody: { error: 'Internal Server Error' }
            };
        }
    }
});