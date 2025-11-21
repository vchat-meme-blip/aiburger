
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { UberClient } from '../uber-client.js';
import { DbService } from '../db-service.js';
import process from 'node:process';
import crypto from 'node:crypto';

const uberClient = new UberClient();

// 1. Login Endpoint: Redirects user to Uber
app.http('uber-login', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'uber/login',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        context.log('Uber Login Initiated');
        const userId = request.query.get('userId');
        if (!userId) {
            return { status: 400, body: 'Missing userId' };
        }
        // Pass userId as state to retrieve it in the callback
        const loginUrl = uberClient.getLoginUrl(userId);
        
        context.log(`Redirecting to Uber Auth URL for user: ${userId}`);
        return {
            status: 302,
            headers: { Location: loginUrl }
        };
    }
});

// 2. Callback Endpoint: Handles code exchange and token saving
app.http('uber-callback', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'uber/callback',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        context.log('Uber Callback Received');
        const code = request.query.get('code');
        const userId = request.query.get('state'); // We passed userId as state
        const error = request.query.get('error');

        if (error) {
            context.error(`Uber Auth Error Param: ${error}`);
            return { status: 400, body: `Uber Auth Error: ${error}` };
        }

        if (!code || !userId) {
            context.error('Missing code or state in callback');
            return { status: 400, body: 'Missing code or state (userId)' };
        }

        try {
            const tokenData = await uberClient.exchangeCodeForToken(code);
            const db = await DbService.getInstance();
            
            // Save token linked to user
            // Add a timestamp to know when it expires relative to now
            const tokenWithTimestamp = {
                ...tokenData,
                acquired_at: Date.now()
            };
            
            await db.updateUserToken(userId, 'uber', tokenWithTimestamp);
            context.log(`Uber token saved successfully for user: ${userId}`);

            return {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `<html><body><h1>Uber Connected Successfully!</h1><p>You can now close this window and return to the chat.</p><script>setTimeout(() => window.close(), 1500)</script></body></html>`
            };
        } catch (err: any) {
            context.error('Uber Callback Failed', err);
            return { status: 500, body: `Authentication failed: ${err.message}` };
        }
    }
});

// 3. Webhook Endpoint: Verifies signature and logs events
app.http('uber-webhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'uber/webhook',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const signature = request.headers.get('x-uber-signature');
        const bodyText = await request.text();
        
        // Prefer a dedicated webhook secret, fall back to client secret if not set
        const signingKey = process.env.UBER_WEBHOOK_SECRET || process.env.UBER_CLIENT_SECRET;

        if (!signingKey) {
             context.error('Missing Uber Signing Key (UBER_WEBHOOK_SECRET or UBER_CLIENT_SECRET)');
             return { status: 500, body: 'Server Configuration Error' };
        }

        if (!signature) {
            context.warn('Missing X-Uber-Signature header');
            return { status: 401, body: 'Missing Signature' };
        }

        // HMACSHA256 signature verification
        const hmac = crypto.createHmac('sha256', signingKey);
        const digest = hmac.update(bodyText).digest('hex');

        // Use timingSafeEqual to prevent timing attacks
        // Note: signature and digest must be buffers or strings of equal length for timingSafeEqual
        // so we simple-compare if lengths differ, which is fine as they are obviously wrong.
        let isValid = false;
        if (signature.length === digest.length) {
             isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
        }

        if (!isValid) {
            context.warn(`Invalid Webhook Signature. Expected: ${digest}, Got: ${signature}`);
            // Return 401 to reject the request
            return { status: 401, body: 'Invalid Signature' };
        }

        const payload = JSON.parse(bodyText);
        context.log(`Received Uber Webhook [${payload.event_type}]:`, payload);
        
        // TODO: Process specific event types here
        // e.g. orders.notification -> fetch order details -> update DB -> notify user via SignalR
        
        return { status: 200, body: 'OK' };
    }
});

// 4. Nearby Restaurants Endpoint: "Phase 1" discovery
app.http('uber-nearby', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'uber/nearby',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const userId = request.query.get('userId');
        const lat = parseFloat(request.query.get('lat') || '0');
        const long = parseFloat(request.query.get('long') || '0');

        if (!userId || !lat || !long) {
            return { status: 400, jsonBody: { error: 'Missing userId, lat, or long' } };
        }

        const db = await DbService.getInstance();
        const tokenData = await db.getUserToken(userId, 'uber');

        if (!tokenData || !tokenData.access_token) {
            context.warn(`User ${userId} tried to search but is not connected to Uber.`);
            return { status: 401, jsonBody: { error: 'User not connected to Uber. Please login first.' } };
        }

        try {
            const results = await uberClient.searchRestaurants(tokenData.access_token, lat, long);
            context.log(`Found ${results.stores ? results.stores.length : 0} restaurants for user ${userId}`);
            return { status: 200, jsonBody: results };
        } catch (err: any) {
            context.error('Uber Nearby Search Failed', err);
            return { status: 502, jsonBody: { error: 'Failed to fetch nearby restaurants from Uber' } };
        }
    }
});
