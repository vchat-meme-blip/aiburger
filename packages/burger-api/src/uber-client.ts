import process from 'node:process';

export interface UberTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
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
    this.clientId = process.env.UBER_CLIENT_ID || '';
    this.clientSecret = process.env.UBER_CLIENT_SECRET || '';
    this.redirectUri = process.env.UBER_REDIRECT_URI || '';
    
    // Allow overriding URLs for Sandbox/Test environments
    this.authUrl = process.env.UBER_AUTH_URL || 'https://login.uber.com/oauth/v2/authorize';
    this.tokenUrl = process.env.UBER_TOKEN_URL || 'https://login.uber.com/oauth/v2/token';
    this.apiUrl = process.env.UBER_API_URL || 'https://api.uber.com/v1';
    
    // If credentials aren't present, default to mock mode for the demo
    this.useMock = !this.clientId || !this.clientSecret;
    if (this.useMock) {
        console.log('⚠️ Uber Credentials missing. Initializing UberClient in SIMULATION MODE.');
    }
  }

  getLoginUrl(state: string): string {
    if (this.useMock) {
        // In mock mode, we skip the real auth flow and just return a callback URL
        // that the frontend can handle or a dummy page.
        const appUrl = process.env.AGENT_WEBAPP_URL || 'http://localhost:4280';
        return `${appUrl}/.auth/login/done?mock=true`;
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      // 'eats.store.search' allows finding restaurants
      // 'delivery' allows placing orders (requires separate approval usually, but good for sandbox)
      scope: 'eats.store.search', 
      state: state, 
    });
    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<UberTokenResponse> {
    if (this.useMock) {
        return {
            access_token: 'mock_access_token_' + Date.now(),
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'mock_refresh_token',
            scope: 'eats.store.search'
        };
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code: code,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Uber Token Exchange Failed: ${response.status} ${errorText}`);
    }

    return (await response.json()) as UberTokenResponse;
  }

  async searchRestaurants(accessToken: string, lat: number, long: number) {
    if (this.useMock || accessToken.startsWith('mock_')) {
        console.log(`[UberClient] Returning simulated restaurants for location: ${lat}, ${long}`);
        return this.getMockRestaurants();
    }

    // Uber Eats API endpoint for store search
    const url = `${this.apiUrl}/eats/stores/search?lat=${lat}&lng=${long}&radius=5`; 

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
       console.warn('Uber API call failed, returning mock data as fallback. Response:', await response.text());
       return this.getMockRestaurants();
    }

    return await response.json();
  }

  private getMockRestaurants() {
      return {
          stores: [
              {
                  name: "Shake Shack (Simulated)",
                  rating: 4.8,
                  eta: "15-25",
                  delivery_fee: "$1.99",
                  image_url: "https://images.unsplash.com/photo-1547584370-2cc98b8b8dc8?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  promo: "Free Shake w/ Burger"
              },
              {
                  name: "Five Guys (Simulated)",
                  rating: 4.6,
                  eta: "20-35",
                  delivery_fee: "$0.49",
                  image_url: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  promo: "BOGO Fries"
              },
              {
                  name: "In-N-Out Burger (Simulated)",
                  rating: 4.9,
                  eta: "30-45",
                  delivery_fee: "$3.99",
                  image_url: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com"
              },
              {
                  name: "Burger King (Simulated)",
                  rating: 4.2,
                  eta: "10-20",
                  delivery_fee: "$0.00",
                  image_url: "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  promo: "$0 Delivery Fee"
              }
          ]
      };
  }
}
