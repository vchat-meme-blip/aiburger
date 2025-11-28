import process from 'node:process';
import { DbService } from './db-service.js';

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
        const appUrl = process.env.AGENT_WEBAPP_URL || 'https://proud-ground-06bff150f.3.azurestaticapps.net';
        return `${appUrl}/.auth/login/done?mock=true`;
    }
    
    // Request Marketplace scopes
    const scopes = ['eats.store.search', 'eats.order', 'profile']; 
    
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

  async searchRestaurants(userId: string, lat: number, long: number): Promise<UberSearchResponse> {
    const db = await DbService.getInstance();
    const tokenData = await db.getUserToken(userId, 'uber');

    if (!tokenData || !tokenData.access_token) {
        if (this.useMock) return this.getMockRestaurants();
        throw new Error('User not connected to Uber (No token found)');
    }

    if (this.useMock || tokenData.access_token.startsWith('mock_')) {
        return this.getMockRestaurants();
    }

    const url = `${this.apiUrl}/eats/stores/search?lat=${lat}&lng=${long}&radius=5`; 

    const callApi = async (token: string) => {
        return fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    };

    let response = await callApi(tokenData.access_token);

    if (response.status === 401 && tokenData.refresh_token) {
        console.warn('[UberClient] Access token expired. Refreshing...');
        try {
            const newTokenData = await this.refreshAccessToken(tokenData.refresh_token);
            await db.updateUserToken(userId, 'uber', { ...newTokenData, acquired_at: Date.now() });
            response = await callApi(newTokenData.access_token);
        } catch (e) {
            console.error('[UberClient] Refresh failed', e);
        }
    }

    if (!response.ok) {
       const errorText = await response.text();
       console.warn(`[UberClient] API failed (${url}). Status: ${response.status}`, errorText);
       return this.getMockRestaurants();
    }

    return (await response.json()) as UberSearchResponse;
  }

  private getMockToken(): UberTokenResponse {
    return {
        access_token: 'mock_access_token_' + Date.now(),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock_refresh_token',
        scope: 'eats.store.search eats.order'
    };
  }

  private getMockRestaurants(): UberSearchResponse {
      return {
          stores: [
              {
                  id: "mock-store-1",
                  name: "Shake Shack (Sandbox)",
                  rating: 4.8,
                  eta: "15-25",
                  delivery_fee: "$1.99",
                  image_url: "https://d1ralsognjng37.cloudfront.net/e709d74b-d191-4197-a39d-b47c0936230e.jpeg",
                  url: "https://www.ubereats.com",
                  menu: [
                      { id: "ss-1", name: "ShackBurger", description: "Cheeseburger with lettuce, tomato, ShackSauce.", price: 8.99, tags: ["burger"] }
                  ]
              },
              {
                  id: "mock-store-2",
                  name: "Five Guys (Sandbox)",
                  rating: 4.6,
                  eta: "20-35",
                  delivery_fee: "$0.49",
                  image_url: "https://d1ralsognjng37.cloudfront.net/9369547e-e4f5-469e-b99b-3607d3d3a702.jpeg",
                  url: "https://www.ubereats.com",
                  promo: "BOGO Fries"
              }
          ]
      };
  }
}