import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { UberClient } from '../uber-client';
import { DbService } from '../db-service';

interface TestStoreRequest {
    userId: string;
    testStores: Array<{
        storeId: string;
        integratorBrandId?: string;
        integratorStoreId?: string;
        merchantStoreId?: string;
    }>;
}

const uberClient = new UberClient();

// Admin endpoint to add test stores
app.http('admin-add-test-stores', {
    methods: ['POST'],
    authLevel: 'anonymous', // Changed to 'anonymous' for testing
    route: 'admin/test-stores',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        try {
            const body = await request.json() as TestStoreRequest;
            const { userId, testStores } = body;

            if (!userId || !testStores || !Array.isArray(testStores)) {
                return {
                    status: 400,
                    jsonBody: { error: 'userId and testStores array are required' }
                };
            }

            const db = await DbService.getInstance();
            const results = [];

            for (const testStore of testStores) {
                try {
                    // Get user's Uber token
                    const userToken = await db.getUserToken(userId, 'uber');
                    if (!userToken) {
                        results.push({ storeId: testStore.storeId, error: 'User not connected to Uber' });
                        continue;
                    }

                    // Activate the test store with default configuration
                    const storeConfig = await uberClient.activateStore(userToken.access_token, testStore.storeId, {
                        integrator_brand_id: testStore.integratorBrandId || 'test-brand-001',
                        integrator_store_id: testStore.integratorStoreId || `test-store-${testStore.storeId}`,
                        merchant_store_id: testStore.merchantStoreId || testStore.storeId,
                        is_order_manager: true,
                        require_manual_acceptance: false,
                        webhooks_config: {
                            order_release_webhooks: { is_enabled: true },
                            schedule_order_webhooks: { is_enabled: true },
                            delivery_status_webhooks: { is_enabled: true },
                            webhooks_version: '1.0.0'
                        }
                    });

                    // Store the configuration
                    await db.updateStoreConfig(userId, 'uber', testStore.storeId, {
                        ...storeConfig,
                        activated_at: new Date().toISOString(),
                        is_test_store: true
                    });

                    results.push({
                        storeId: testStore.storeId,
                        status: 'activated',
                        config: storeConfig
                    });

                } catch (error) {
                    context.error(`Failed to activate test store ${testStore.storeId}:`, error);
                    results.push({
                        storeId: testStore.storeId,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }

            return {
                status: 200,
                jsonBody: {
                    message: 'Test store activation completed',
                    results
                }
            };

        } catch (error) {
            context.error('Error in admin test stores endpoint:', error);
            return {
                status: 500,
                jsonBody: { error: 'Internal server error' }
            };
        }
    }
});
