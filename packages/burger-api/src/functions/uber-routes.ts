
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { UberClient, UberSearchResponse } from '../uber-client.js';
import { DbService } from '../db-service.js';
import process from 'node:process';
import crypto from 'node:crypto';

const uberClient = new UberClient();

// 1. Login Endpoint: Redirects user to Uber via an interstitial page
// We use HTML instead of 302 Redirect to prevent "Bounce Tracking" protection in browsers
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
        const userId = request.query.get('state'); // We passed userId as state
        const error = request.query.get('error');

        if (error) {
            context.error(`Uber Auth Error Param: ${error}`);
            return { 
                status: 400, 
                headers: { 'Content-Type': 'text/html' },
                body: `<h1>Connection Failed</h1><p>Uber returned an error: ${error}</p>` 
            };
        }

        if (!code || !userId) {
            context.error('Missing code or state in callback');
            return { status: 400, body: 'Missing code or state (userId)' };
        }

        try {
            const tokenData = await uberClient.exchangeCodeForToken(code);
            const db = await DbService.getInstance();

            // Save token linked to user
            const tokenWithTimestamp = {
                ...tokenData,
                acquired_at: Date.now()
            };

            await db.updateUserToken(userId, 'uber', tokenWithTimestamp);
            context.log(`Uber token saved successfully for user: ${userId}`);

            return {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Connected!</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: system-ui, sans-serif; text-align: center; padding-top: 50px; color: #333; }
                        .success { font-size: 64px; margin-bottom: 20px; }
                        p { margin-bottom: 30px; }
                        .btn { background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; border: none; cursor: pointer; font-size: 16px;}
                    </style>
                </head>
                <body>
                    <div class="success">✅</div>
                    <h1>Uber Connected!</h1>
                    <p>You can now close this window and ask Chicha to find food.</p>
                    <button onclick="window.close()" class="btn">Close Window</button>
                    <script>
                        // Attempt to close automatically
                        setTimeout(() => {
                            try { window.close(); } catch(e) {}
                        }, 2000);
                    </script>
                </body>
                </html>`
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

        const signingKey = process.env.UBER_WEBHOOK_SECRET || process.env.UBER_CLIENT_SECRET;

        if (!signingKey) {
             context.error('Missing Uber Signing Key');
             return { status: 500, body: 'Server Configuration Error' };
        }

        if (!signature) {
            context.warn('Missing X-Uber-Signature header');
            return { status: 401, body: 'Missing Signature' };
        }

        const hmac = crypto.createHmac('sha256', signingKey);
        const digest = hmac.update(bodyText).digest('hex');

        let isValid = false;
        if (signature.length === digest.length) {
             isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
        }

        if (!isValid) {
            context.warn(`Invalid Webhook Signature.`);
            return { status: 401, body: 'Invalid Signature' };
        }

        const payload = JSON.parse(bodyText);
        context.log(`Received Uber Webhook [${payload.event_type}]:`, payload);

        return { status: 200, body: 'OK' };
    }
});

// 4. Nearby Restaurants Endpoint
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

        try {
            // Pass userId directly, allow client to handle token retrieval/refresh/fallback
            const results = (await uberClient.searchRestaurants(userId, lat, long)) as UberSearchResponse;
            context.log(`Found ${results.stores?.length ?? 0} restaurants for user ${userId}`);
            return { status: 200, jsonBody: results };
        } catch (err: any) {
            context.error('Uber Nearby Search Failed', err);
            
            const isAuthError = err.message.includes('Unauthorized') || err.message.includes('not connected');
            const status = isAuthError ? 401 : 502;
            
            return { status, jsonBody: { error: err.message } };
        }
    }
});
