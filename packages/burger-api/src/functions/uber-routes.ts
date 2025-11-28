import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { UberClient } from '../uber-client.js';
import { DbService } from '../db-service.js';
import process from 'node:process';
import crypto from 'node:crypto';

const uberClient = new UberClient();

// 1. Login Endpoint: Redirects user to Uber via an interstitial page
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
        
        // Generate the Uber Auth URL
        const loginUrl = uberClient.getLoginUrl(userId);
        context.log(`Generated Login URL: ${loginUrl}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Connect to Uber</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #ffffff; text-align: center; padding: 20px; box-sizing: border-box; color: #333; }
                .container { max-width: 400px; width: 100%; }
                .logo { font-size: 48px; margin-bottom: 20px; }
                h2 { margin-bottom: 10px; }
                p { color: #666; margin-bottom: 30px; line-height: 1.5; }
                .btn { background: #000; color: #fff; padding: 16px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: block; width: 100%; box-sizing: border-box; transition: background 0.2s; cursor: pointer;}
                .btn:hover { background: #333; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🍔 + 🚗</div>
                <h2>Connect Uber Eats</h2>
                <p>Link your Uber account to find real restaurants and delivery times near you.</p>
                <a href="${loginUrl}" class="btn">Connect Account</a>
            </div>
        </body>
        </html>
        `;

        return {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
            body: html
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
        const userId = request.query.get('state');
        const error = request.query.get('error');

        if (error) {
            context.error(`Uber Auth Error Param: ${error}`);
            return { 
                status: 400, 
                body: `Uber Authentication Error: ${error}. Please try again.` 
            };
        }

        if (!code || !userId) {
            return { status: 400, body: 'Missing code or state (userId)' };
        }

        try {
            const db = await DbService.getInstance();
            
            // Exchange code for token
            const tokenData = await uberClient.exchangeCodeForToken(code);
            
            // Save token to user's record
            const storedToken = { ...tokenData, acquired_at: Date.now() };
            await db.updateUserToken(userId, 'uber', storedToken);

            return {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `
                <html>
                <body style="font-family: sans-serif; text-align: center; padding: 40px;">
                    <h1>✅ Connected!</h1>
                    <p>Your Uber account has been linked successfully.</p>
                    <p>You can close this window and return to Chicha.</p>
                    <script>
                        setTimeout(() => window.close(), 3000);
                    </script>
                </body>
                </html>
                `
            };
        } catch (e: any) {
            context.error('Uber Token Exchange Error:', e);
            return { 
                status: 500, 
                body: `Failed to connect to Uber. ${e.message}` 
            };
        }
    }
});

// 3. Nearby Search Endpoint
app.http('uber-nearby', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'uber/nearby',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const userId = request.query.get('userId');
        const lat = parseFloat(request.query.get('lat') || '0');
        const long = parseFloat(request.query.get('long') || '0');

        if (!userId) {
            return { status: 400, jsonBody: { error: 'Missing userId' } };
        }

        try {
            const result = await uberClient.searchRestaurants(userId, lat, long);
            return { status: 200, jsonBody: result };
        } catch (e: any) {
            context.error('Uber Search Error:', e);
            const message = e.message || 'Unknown error';
            if (message.includes('User not connected')) {
                 return { status: 401, jsonBody: { error: message } };
            }
            return { status: 500, jsonBody: { error: message } };
        }
    }
});

// 4. Status Endpoint: Check if user is connected
app.http('uber-status', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'uber/status',
    handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
        const userId = request.query.get('userId');
        if (!userId) return { status: 400, jsonBody: { error: 'Missing userId' } };

        const db = await DbService.getInstance();
        const token = await db.getUserToken(userId, 'uber');

        return {
            status: 200,
            jsonBody: { 
                connected: !!token 
            }
        };
    }
});

// 5. Webhook Endpoint
app.http('uber-webhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'uber/webhook',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const signature = request.headers.get('x-uber-signature');
        const body = await request.text();

        const clientSecret = process.env.UBER_WEBHOOK_SECRET;
        if (clientSecret) {
            const hmac = crypto.createHmac('sha256', clientSecret);
            const digest = hmac.update(body).digest('hex');
            if (signature !== digest) {
                context.warn('Webhook signature mismatch');
            }
        }

        const payload = JSON.parse(body);
        context.log('Uber Webhook Received:', payload);

        return { status: 200 };
    }
});