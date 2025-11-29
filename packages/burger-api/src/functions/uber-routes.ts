import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { UberClient, StoreActivationConfig, StoreConfig } from '../uber-client.js';
import { DbService } from '../db-service.js';

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
            const result = await uberClient.searchRestaurants(lat, long);
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

// 5. Store Activation Endpoint
app.http('uber-activate-store', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'uber/stores/{storeId}/activate',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const storeId = request.params.storeId;
        const userId = request.query.get('userId');

        if (!userId || !storeId) {
            return { status: 400, body: 'Missing userId or storeId' };
        }

        try {
            // Get user's token (obtained via authorization_code flow)
            const db = await DbService.getInstance();
            const tokenData = await db.getUserToken(userId, 'uber');

            if (!tokenData?.access_token) {
                return { status: 401, body: 'User not connected to Uber' };
            }

            const config = (await request.json()) as StoreActivationConfig;

            const result = await uberClient.activateStore(
                tokenData.access_token,
                storeId,
                config
            );

            return { status: 200, jsonBody: result };
        } catch (error) {
            context.error('Error activating store:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Failed to activate store',
                    details: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
});

// 6. Update Store Configuration
app.http('uber-update-store-config', {
    methods: ['PUT'],
    authLevel: 'function',
    route: 'uber/stores/{storeId}/config',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const storeId = request.params.storeId;

        if (!storeId) {
            return { status: 400, body: 'Missing storeId' };
        }

        try {
            const config = (await request.json()) as StoreConfig;
            const result = await uberClient.updateStoreConfig(storeId, config);

            return { status: 200, jsonBody: result };
        } catch (error) {
            context.error('Error updating store config:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Failed to update store config',
                    details: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
});

// 7. Get Store Configuration
app.http('uber-get-store-config', {
    methods: ['GET'],
    authLevel: 'function',
    route: 'uber/stores/{storeId}/config',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const storeId = request.params.storeId;

        if (!storeId) {
            return { status: 400, body: 'Missing storeId' };
        }

        try {
            const config = await uberClient.getStoreConfig(storeId);
            return { status: 200, jsonBody: config };
        } catch (error) {
            context.error('Error getting store config:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Failed to get store config',
                    details: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
});

// 8. Webhook Endpoint
app.http('uber-webhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'uber/webhook',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        try {
            const body = await request.json();
            context.log('Webhook received:', body);

            // Verify the webhook signature if needed
            const signature = request.headers.get('x-uber-signature');
            if (signature) {
                // Add signature verification logic here
                context.log('Webhook signature:', signature);
            }

            // Process different webhook events
            const eventType = request.headers.get('x-uber-event-type');
            switch (eventType) {
                case 'orders.notification':
                    // Handle new order
                    context.log('New order received:', body);
                    break;
                case 'orders.status_update':
                    // Handle order status update
                    context.log('Order status updated:', body);
                    break;
                default:
                    context.log('Unknown webhook event type:', eventType);
            }

            return { status: 200, jsonBody: { success: true } };
        } catch (error) {
            context.error('Error processing webhook:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Failed to process webhook',
                    details: error instanceof Error ? error.message : String(error)
                }
            };
        }

        return { status: 200 };
    }
});
