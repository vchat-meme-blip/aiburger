import process from 'node:process';
export interface UberTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface UberStore {
    id: string;
    name: string;
    rating: number;
    eta: string;
    delivery_fee: string;
    image_url: string;
    url: string;
    promo?: string;
    menu?: UberMenuItem[];
}

export interface UberMenuItem {
    id: string;
    name: string;
    description: string;
    price: number;
    image_url?: string;
    tags: string[];
}

export interface UberSearchResponse {
    stores?: UberStore[];
}

export interface StoreActivationConfig {
  integrator_brand_id: string;
  integrator_store_id: string;
  is_order_manager: boolean;
  merchant_store_id: string;
  require_manual_acceptance?: boolean;
  store_configuration_data?: string;
  allowed_customer_requests?: {
    allow_single_use_items_requests?: boolean;
    allow_special_instruction_requests?: boolean;
  };
  webhooks_config: {
    order_release_webhooks: { is_enabled: boolean };
    schedule_order_webhooks: { is_enabled: boolean };
    delivery_status_webhooks: { is_enabled: boolean };
    webhooks_version: string;
  };
  timezone?: string;
  currency?: string;
}

export interface WebhookConfig {
  order_release_webhooks: { is_enabled: boolean };
  schedule_order_webhooks: { is_enabled: boolean };
  delivery_status_webhooks: { is_enabled: boolean };
  webhooks_version: string;
}

export interface StoreConfig extends StoreActivationConfig {
  integration_enabled: boolean;
  created_at?: string;
  updated_at?: string;
  // Additional fields from Uber's API
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  webhook_url?: string;
  webhook_secret?: string;
  last_sync_at?: string;
}

export class UberClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private authUrl: string;
  private tokenUrl: string;
  private apiUrl: string;
  private useMock: boolean;

  constructor() {
    // --- UBER SANDBOX CONFIGURATION ---
    // Fallbacks strictly match the "Master Deployment & Configuration Guide"

    this.clientId = process.env.UBER_CLIENT_ID || 'TrNolyK4ausCZ9dur-1qjq7zDGRTfoPr';
    this.clientSecret = process.env.UBER_CLIENT_SECRET || '';

    // Auto-detect the deployed function URL if not set explicitly
    // This helps avoiding "redirect_uri_mismatch" errors
    this.redirectUri = process.env.UBER_REDIRECT_URI ||
       (process.env.BURGER_API_URL
           ? `${process.env.BURGER_API_URL}/api/uber/callback`
           : 'https://func-burger-api-lf6kch3t2wm3e.azurewebsites.net/api/uber/callback');

    // Explicitly using Sandbox URLs for testing
    this.authUrl = process.env.UBER_AUTH_URL || 'https://sandbox-login.uber.com/oauth/v2/authorize';
    this.tokenUrl = process.env.UBER_TOKEN_URL || 'https://sandbox-login.uber.com/oauth/v2/token';
    this.apiUrl = 'https://test-api.uber.com/v1';

    // Only mock if we really don't have secrets
    this.useMock = !this.clientSecret;

    if (this.useMock) {
        console.log('⚠️ Uber Credentials (Secret) missing. Initializing UberClient in SIMULATION MODE.');
    } else {
        console.log(`[UberClient] Initialized in SANDBOX mode.`);
        console.log(`- Client ID: ${this.clientId ? '***' + this.clientId.slice(-4) : 'Missing'}`);
        console.log(`- Auth URL: ${this.authUrl}`);
        console.log(`- Redirect URI: ${this.redirectUri}`);
    }
  }

  getLoginUrl(state: string): string {
    if (this.useMock) {
        const appUrl = process.env.AGENT_WEBAPP_URL || 'https://func-agent-api-lf6kch3t2wm3e.azurewebsites.net';
        return `${appUrl}/.auth/login/done?mock=true`;
    }

    // Only request the pos_provisioning scope that's enabled in the dashboard
    const scopes = ['eats.pos_provisioning'];

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state: state,
    });
    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<UberTokenResponse> {
    if (this.useMock) {
        return this.getMockToken();
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code: code,
    });

    return this.fetchToken(params);
  }

  async refreshAccessToken(refreshToken: string): Promise<UberTokenResponse> {
      if (this.useMock) return this.getMockToken();

      console.log('[UberClient] Refreshing expired access token...');
      const params = new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
      });

      return this.fetchToken(params);
  }

  private async fetchToken(params: URLSearchParams): Promise<UberTokenResponse> {
    console.log(`[UberClient] Fetching token from ${this.tokenUrl}`);
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[UberClient] Token Error (${this.tokenUrl}): ${response.status}`, errorText);
      throw new Error(`Uber Token Request Failed: ${response.status} ${errorText}`);
    }

    return (await response.json()) as UberTokenResponse;
  }

  async searchRestaurants(lat: number, long: number): Promise<UberSearchResponse> {
    if (this.useMock) {
      console.log('[UberClient] Using mock restaurant data');
      return this.getMockRestaurants();
    }

    try {
      console.log(`[UberClient] Searching restaurants near ${lat}, ${long}`);
      // Get client credentials token for regular API operations
      const token = await this.getClientCredentialsToken();

      const response = await this.callApi<UberSearchResponse>(
        token.access_token,
        'GET',
        `/eats/stores?latitude=${lat}&longitude=${long}`
      );

      console.log(`[UberClient] Found ${response?.stores?.length || 0} restaurants`);
      return response;
    } catch (error) {
      console.error('[UberClient] Error searching restaurants:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to search restaurants: ${errorMessage}`);
    }
  }

  private async callApi<T>(token: string, method: string, endpoint: string, body?: any): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.apiUrl}${endpoint}`;

    console.log(`[UberClient] ${method} ${url}`);
    if (body && method !== 'GET') {
        console.log('[UberClient] Request body:', JSON.stringify(body, null, 2));
    }

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Uber-Source': 'aiburger-webapp',
        'Accept': 'application/json'
    };

    try {
        const options: RequestInit = {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        };

        const response = await fetch(url, options);
        const responseText = await response.text();
        let responseData: any;

        try {
            responseData = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            responseData = { _raw: responseText };
        }

        if (!response.ok) {
            console.error(`[UberClient] API Error (${response.status}):`, responseData);

            if (response.status === 401) {
                throw new Error('Invalid or expired token. Please re-authenticate with Uber.');
            }
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            }

            const errorMessage = responseData.message ||
                               responseData.error_description ||
                               `API request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        // Log successful response (without sensitive data)
        console.log(`[UberClient] ${method} ${endpoint} - Status: ${response.status}`);

        return responseData as T;
    } catch (error) {
        console.error(`[UberClient] Network error during API call to ${url}:`, error);
        // Re-throw the error to be handled by the caller
        throw error;
    }
  }

  private getMockToken(): UberTokenResponse {
    return {
        access_token: 'mock_access_token_' + Date.now(),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock_refresh_token',
        scope: 'eats.pos_provisioning'
    };
  }

  /**
   * Get a client credentials token for regular API operations
   */
  private async getClientCredentialsToken(): Promise<UberTokenResponse> {
      if (this.useMock) {
          return this.getMockToken();
      }

      const params = new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: 'eats.store eats.order'
      });

      try {
          console.log('[UberClient] Requesting client credentials token');
          return await this.fetchToken(params);
      } catch (error) {
          console.error('[UberClient] Error getting client credentials token:', error);
          throw new Error('Failed to get client credentials token');
      }
  }

  /**
   * Activate a store using the user's token
   * @param userToken User's OAuth token with eats.pos_provisioning scope
   * @param storeId The Uber store ID to activate
   * @param config Configuration for the store activation
   */
  async activateStore(userToken: string, storeId: string, config: Omit<StoreActivationConfig, 'webhooks_config'> & {
    webhooks_config?: Partial<WebhookConfig>
  }): Promise<StoreConfig> {
      if (!storeId) {
          throw new Error('Store ID is required');
      }

      // Validate required fields
      const requiredFields = ['integrator_brand_id', 'integrator_store_id', 'merchant_store_id'];
      const missingFields = requiredFields.filter(field => {
          const key = field as keyof typeof config;
          return !config[key];
      });

      if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Build the complete payload with defaults
      const payload: StoreActivationConfig = {
          ...config,
          // Set default webhook config
          webhooks_config: {
              order_release_webhooks: { is_enabled: true },
              schedule_order_webhooks: { is_enabled: true },
              delivery_status_webhooks: { is_enabled: true },
              webhooks_version: '1.0.0',
              ...(config.webhooks_config || {})
          },
          // Set default customer requests
          allowed_customer_requests: {
              allow_single_use_items_requests: false,
              allow_special_instruction_requests: false,
              ...(config.allowed_customer_requests || {})
          },
          // Set default values for optional fields
          require_manual_acceptance: config.require_manual_acceptance ?? false,
          is_order_manager: config.is_order_manager ?? true
      };

      console.log(`[UberClient] Activating store ${storeId} with config:`, JSON.stringify(payload, null, 2));

      try {
          const response = await this.callApi<StoreConfig>(
              userToken,
              'POST',
              `/eats/stores/${storeId}/activate`,
              payload
          );

          console.log(`[UberClient] Successfully activated store ${storeId}`);
          return response;
      } catch (error) {
          console.error(`[UberClient] Error activating store ${storeId}:`, error);
          throw new Error(`Failed to activate store: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
  }

  /**
   * Get store menu from Uber API
   * @param userToken User's OAuth token
   * @param storeId The Uber store ID
   * @returns Store menu data
   */
  async getStoreMenu(userToken: string, storeId: string): Promise<any> {
      if (!storeId) {
          throw new Error('Store ID is required');
      }

      console.log(`[UberClient] Getting menu for store ${storeId}`);

      try {
          const response = await this.callApi<any>(
              userToken,
              'GET',
              `/eats/stores/${storeId}/menu`
          );

          console.log(`[UberClient] Successfully retrieved menu for store ${storeId}`);
          return response;
      } catch (error) {
          console.error(`[UberClient] Error getting menu for store ${storeId}:`, error);
          throw new Error(`Failed to get store menu: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
  }

  /**
   * Update store configuration
   * @param storeId The Uber store ID to update
   * @param config Configuration for the store update
   * @returns Updated store configuration
   */
  async updateStoreConfig(storeId: string, config: Partial<StoreConfig>): Promise<StoreConfig> {
      if (!storeId) {
          throw new Error('Store ID is required');
      }

      // Validate required fields if this is a new configuration
      if (config.integrator_brand_id === undefined ||
          config.integrator_store_id === undefined ||
          config.merchant_store_id === undefined) {
          throw new Error('Missing required fields for store configuration');
      }

      // Get client credentials token for regular API operations
      const token = await this.getClientCredentialsToken();

      // Prepare the payload with only the fields that are allowed to be updated
      const payload: Partial<StoreConfig> = {
          ...config,
          webhooks_config: config.webhooks_config ? {
              order_release_webhooks: {
                  is_enabled: config.webhooks_config.order_release_webhooks?.is_enabled ?? true
              },
              schedule_order_webhooks: {
                  is_enabled: config.webhooks_config.schedule_order_webhooks?.is_enabled ?? true
              },
              delivery_status_webhooks: {
                  is_enabled: config.webhooks_config.delivery_status_webhooks?.is_enabled ?? true
              },
              webhooks_version: config.webhooks_config.webhooks_version || '1.0.0'
          } : undefined,
          updated_at: new Date().toISOString()
      };

      console.log(`[UberClient] Updating config for store ${storeId}`, JSON.stringify(payload, null, 2));

      try {
          const response = await this.callApi<StoreConfig>(
              token.access_token,
              'PATCH',  // Using PATCH as per Uber's API specification
              `/eats/stores/${storeId}/config`,
              payload
          );

          console.log(`[UberClient] Successfully updated config for store ${storeId}`);
          return response;
      } catch (error) {
          console.error(`[UberClient] Error updating store ${storeId} config:`, error);
          throw new Error(`Failed to update store config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
  }

  /**
   * Get store configuration
   * @param storeId The Uber store ID to get configuration for
   * @returns Store configuration
   * @throws {Error} If storeId is missing or API request fails
   */
  async getStoreConfig(storeId: string): Promise<StoreConfig> {
      if (!storeId) {
          throw new Error('Store ID is required');
      }

      try {
          // Get client credentials token for regular API operations
          const token = await this.getClientCredentialsToken();

          console.log(`[UberClient] Fetching config for store ${storeId}`);

          const response = await this.callApi<StoreConfig>(
              token.access_token,
              'GET',
              `/eats/stores/${storeId}/config`
          );

          console.log(`[UberClient] Successfully retrieved config for store ${storeId}`);
          return response;
      } catch (error) {
          console.error(`[UberClient] Error getting config for store ${storeId}:`, error);

          // Handle 404 specifically as store not found
          if (error instanceof Error && error.message.includes('404')) {
              throw new Error(`Store configuration not found for store ID: ${storeId}`);
          }

          throw new Error(`Failed to get store config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
  }

  private getMockRestaurants(): UberSearchResponse {
      return {
          stores: [
              {
                  id: "mock-store-1",
                  name: "Chicha Burger (Sandbox)",
                  rating: 4.9,
                  eta: "15-25",
                  delivery_fee: "$2.99",
                  image_url: "https://d1ralsognjng37.cloudfront.net/mock-burger.jpg",
                  url: "https://www.ubereats.com",
                  menu: [
                      {
                          id: "cb-1",
                          name: "Classic Burger",
                          description: "100% beef patty with lettuce, tomato, and special sauce.",
                          price: 9.99,
                          tags: ["burger"]
                      }
                  ]
              }
          ]
      };
  }
}
