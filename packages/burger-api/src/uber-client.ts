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
  webhooks_config?: WebhookConfig;
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
   */
  async activateStore(userToken: string, storeId: string, config: StoreActivationConfig) {
      const url = `${this.apiUrl}/eats/stores/${storeId}/activate`;

      // Ensure required fields are present
      if (!config.integrator_brand_id || !config.integrator_store_id || !config.merchant_store_id) {
          throw new Error('Missing required fields for store activation');
      }

      const payload: StoreActivationConfig = {
          ...config,
          // Set default webhook config if not provided
          webhooks_config: config.webhooks_config || {
              order_release_webhooks: { is_enabled: true },
              schedule_order_webhooks: { is_enabled: true },
              delivery_status_webhooks: { is_enabled: true },
              webhooks_version: "1.0.0"
          },
          // Set default customer requests if not provided
          allowed_customer_requests: {
              allow_single_use_items_requests: false,
              allow_special_instruction_requests: false,
              ...config.allowed_customer_requests
          }
      };

      console.log(`[UberClient] Activating store ${storeId}`);
      return this.callApi<any>(userToken, 'POST', url, payload);
  }

  /**
   * Update store configuration
   */
  async updateStoreConfig(storeId: string, config: StoreConfig): Promise<StoreConfig> {
      if (!storeId) {
          throw new Error('Store ID is required');
      }

      const token = await this.getClientCredentialsToken();
      const url = `${this.apiUrl}/eats/stores/${storeId}/config`;

      console.log(`[UberClient] Updating config for store ${storeId}`);
      return this.callApi<StoreConfig>(token.access_token, 'PUT', url, {
          ...config,
          updated_at: new Date().toISOString()
      });
  }

  /**
   * Get store configuration
   */
  async getStoreConfig(storeId: string): Promise<StoreConfig> {
      if (!storeId) {
          throw new Error('Store ID is required');
      }

      const token = await this.getClientCredentialsToken();
      const url = `${this.apiUrl}/eats/stores/${storeId}/config`;

      console.log(`[UberClient] Getting config for store ${storeId}`);
      return this.callApi<StoreConfig>(token.access_token, 'GET', url);
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
