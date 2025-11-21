import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DbService } from '../db-service.js';
import { PubSubService } from '../pubsub-service.js';

app.http('wallet-get', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'wallet',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        context.log('Processing wallet get request');
        const userId = request.query.get('userId');
        if (!userId) return { status: 400, jsonBody: { error: 'Missing userId' } };

        const db = await DbService.getInstance();
        const wallet = await db.getUserWallet(userId);

        return { status: 200, jsonBody: wallet };
    }
});

app.http('wallet-deposit', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'wallet/deposit',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        try {
            const body = (await request.json()) as { userId: string; amount: number; type: 'crypto' | 'fiat' };
            
            if (!body.userId || !body.amount) {
                return { status: 400, jsonBody: { error: 'Missing userId or amount' } };
            }

            const db = await DbService.getInstance();
            const newWallet = await db.depositFunds(body.userId, body.amount, body.type || 'fiat');

            return { status: 200, jsonBody: newWallet };
        } catch (e: any) {
            context.error(e);
            return { status: 500, jsonBody: { error: e.message } };
        }
    }
});

app.http('order-pay', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'orders/{id}/pay',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const orderId = request.params.id;
        try {
            const body = (await request.json()) as { userId: string };
            
            if (!body.userId) {
                return { status: 400, jsonBody: { error: 'Missing userId' } };
            }

            const db = await DbService.getInstance();
            await db.processPayment(body.userId, orderId);
            
            // Notify user
            const pubSub = PubSubService.getInstance();
            await pubSub.broadcastToUser(body.userId, 'payment-success', { orderId });

            return { status: 200, jsonBody: { message: 'Payment successful' } };
        } catch (e: any) {
            context.error(e);
            return { status: 402, jsonBody: { error: e.message } };
        }
    }
});