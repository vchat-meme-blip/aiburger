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
        } catch (error) {
            context.error('Failed to negotiate Web PubSub connection:', error);
            // If Web PubSub isn't configured, return 503 so client knows to stop trying or fallback
            return {
                status: 503,
                jsonBody: { error: 'Real-time service unavailable' }
            };
        }
    }
});