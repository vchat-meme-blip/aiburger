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

    this.authUrl = process.env.UBER_AUTH_URL || 'https://login.uber.com/oauth/v2/authorize';
    this.tokenUrl = process.env.UBER_TOKEN_URL || 'https://login.uber.com/oauth/v2/token';

    // Intelligent Default: If token/auth URL implies sandbox, default API to sandbox
    const isSandbox = this.authUrl.includes('sandbox') || this.tokenUrl.includes('sandbox');
    const defaultApi = isSandbox ? 'https://sandbox-api.uber.com/v1' : 'https://api.uber.com/v1';

    this.apiUrl = process.env.UBER_API_URL || defaultApi;

    // If credentials aren't present, default to mock mode
    this.useMock = !this.clientId || !this.clientSecret;

    if (this.useMock) {
        console.log('[UberClient] Credentials missing. Using SIMULATION MODE.');
    } else {
        console.log(`[UberClient] Initialized in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode. API: ${this.apiUrl}`);
    }
  }

  getLoginUrl(state: string): string {
    if (this.useMock) {
        const appUrl = process.env.AGENT_WEBAPP_URL || 'http://localhost:4280';
        return `${appUrl}/.auth/login/done?mock=true`;
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
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

  async searchRestaurants(accessToken: string, lat: number, long: number): Promise<UberSearchResponse> {
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
       const errorText = await response.text();
       console.warn('[UberClient] API call failed, returning mock data.', errorText);

       // If it's an auth error, propagate it so the agent knows to ask for re-login
       if (response.status === 401 || response.status === 403) {
           throw new Error(`Uber API Unauthorized: ${errorText}`);
       }

       return this.getMockRestaurants();
    }

    return (await response.json()) as UberSearchResponse;
  }

  private getMockRestaurants(): UberSearchResponse {
      return {
          stores: [
              {
                  id: "mock-store-1",
                  name: "Shake Shack (Simulated)",
                  rating: 4.8,
                  eta: "15-25",
                  delivery_fee: "$1.99",
                  image_url: "https://images.unsplash.com/photo-1547584370-2cc98b8b8dc8?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  promo: "Free Shake w/ Burger",
                  menu: [
                      { id: "ss-1", name: "ShackBurger", description: "Cheeseburger with lettuce, tomato, ShackSauce.", price: 8.99, tags: ["burger", "beef", "classic"] },
                      { id: "ss-2", name: "Shroom Burger", description: "Crisp-fried portobello mushroom filled with melted muenster and cheddar cheeses.", price: 9.49, tags: ["vegetarian", "mushroom", "cheesy"] }
                  ]
              },
              {
                  id: "mock-store-2",
                  name: "Five Guys (Simulated)",
                  rating: 4.6,
                  eta: "20-35",
                  delivery_fee: "$0.49",
                  image_url: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  promo: "BOGO Fries",
                  menu: [
                      { id: "fg-1", name: "Bacon Cheeseburger", description: "Fresh patties, hotdog style bacon.", price: 11.99, tags: ["burger", "bacon", "heavy"] },
                      { id: "fg-2", name: "Little Cajun Fries", description: "Fresh cut fries cooked in peanut oil with cajun spice.", price: 5.49, tags: ["fries", "spicy", "side"] }
                  ]
              },
              {
                  id: "mock-store-3",
                  name: "In-N-Out Burger (Simulated)",
                  rating: 4.9,
                  eta: "30-45",
                  delivery_fee: "$3.99",
                  image_url: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  menu: [
                      { id: "io-1", name: "Double-Double", description: "Two beef patties, two slices of American cheese.", price: 6.50, tags: ["burger", "cheap", "classic"] },
                      { id: "io-2", name: "Animal Style Fries", description: "Fries topped with cheese, spread, and grilled onions.", price: 4.50, tags: ["fries", "messy", "cheesy"] }
                  ]
              },
              {
                  id: "mock-store-4",
                  name: "Spicy Dragon Wok (Simulated)",
                  rating: 4.2,
                  eta: "10-20",
                  delivery_fee: "$0.00",
                  image_url: "https://images.unsplash.com/photo-1562967960-f55430ed5164?auto=format&fit=crop&w=500&q=60",
                  url: "https://www.ubereats.com",
                  promo: "$0 Delivery Fee",
                  menu: [
                      { id: "dw-1", name: "Szechuan Burger", description: "Spicy beef patty with chili oil and peppercorns.", price: 13.99, tags: ["spicy", "burger", "fusion"] },
                      { id: "dw-2", name: "Mapo Tofu", description: "Spicy tofu with minced meat.", price: 12.99, tags: ["spicy", "tofu", "chinese"] }
                  ]
              }
          ]
      };
  }
}
