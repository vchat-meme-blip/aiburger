
import { z } from 'zod';
import { burgerApiUrl } from './config.js';

export const tools = [
  {
    name: 'get_burgers',
    description: 'Get a list of all burgers in the menu',
    async handler() {
      return fetchBurgerApi('/api/burgers');
    },
  },
  {
    name: 'get_burger_by_id',
    description: 'Get a specific burger by its ID',
    schema: z.object({
      id: z.string().describe('ID of the burger to retrieve'),
    }),
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi(`/api/burgers/${args.id}`);
    },
  },
  {
    name: 'get_toppings',
    description: 'Get a list of all toppings in the menu',
    schema: z.object({
      category: z.string().optional().describe('Category of toppings to filter by (can be empty)'),
    }),
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi(`/api/toppings?category=${args.category ?? ''}`);
    },
  },
  {
    name: 'get_topping_by_id',
    description: 'Get a specific topping by its ID',
    schema: z.object({
      id: z.string().describe('ID of the topping to retrieve'),
    }),
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi(`/api/toppings/${args.id}`);
    },
  },
  {
    name: 'get_topping_categories',
    description: 'Get a list of all topping categories',
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi('/api/toppings/categories');
    },
  },
  {
    name: 'get_orders',
    description: 'Get a list of orders in the system',
    schema: z.object({
      userId: z.string().optional().describe('Filter orders by user ID'),
      status: z.string().optional().describe('Filter by order status. Comma-separated list allowed.'),
      last: z.string().optional().describe("Filter orders created in the last X minutes or hours (e.g. '60m', '2h')"),
    }),
    async handler(args: { userId?: string; status?: string; last?: string }) {
      const parameters = new URLSearchParams();
      if (args.userId) parameters.append('userId', args.userId);
      if (args.status) parameters.append('status', args.status);
      if (args.last) parameters.append('last', args.last);
      const query = parameters.toString();
      const url = query ? `/api/orders?${query}` : '/api/orders';
      return fetchBurgerApi(url);
    },
  },
  {
    name: 'get_order_by_id',
    description: 'Get a specific order by its ID',
    schema: z.object({
      id: z.string().describe('ID of the order to retrieve'),
    }),
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi(`/api/orders/${args.id}`);
    },
  },
  {
    name: 'place_order',
    description: 'Place a new order with burgers (requires userId)',
    schema: z.object({
      userId: z.string().describe('ID of the user placing the order'),
      nickname: z.string().optional().describe('Optional nickname for the order (only first 10 chars displayed)'),
      items: z
        .array(
          z.object({
            burgerId: z.string().describe('ID of the burger'),
            quantity: z.number().min(1).describe('Quantity of the burger'),
            extraToppingIds: z.array(z.string()).describe('List of extra topping IDs'),
          }),
        )
        .nonempty()
        .describe('List of items in the order'),
    }),
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi('/api/orders', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    },
  },
  {
    name: 'delete_order_by_id',
    description: 'Cancel an order if it has not yet been started (status must be "pending", requires userId)',
    schema: z.object({
      id: z.string().describe('ID of the order to cancel'),
      userId: z.string().describe('ID of the user that placed the order'),
    }),
    async handler(args: z.ZodRawShape) {
      return fetchBurgerApi(`/api/orders/${args.id}?userId=${args.userId}`, {
        method: 'DELETE',
      });
    },
  },
  {
    name: 'search_nearby_restaurants',
    description:
      'Search for real nearby restaurants using Uber Eats (requires userId, latitude, and longitude).',
    schema: z.object({
      userId: z.string().describe('ID of the user performing the search'),
      lat: z.number().describe('Latitude of the user location'),
      long: z.number().describe('Longitude of the user location'),
    }),
    async handler(args: { userId: string; lat: number; long: number }) {
      try {
         const resultJson = await fetchBurgerApi(`/api/uber/nearby?userId=${args.userId}&lat=${args.lat}&long=${args.long}`);
         const results = JSON.parse(resultJson);
         
         if (results.stores && results.stores.length > 0) {
             // Generate a rich HTML grid for the frontend
             let html = `<div class="restaurant-grid">`;
             for (const store of results.stores) {
                 html += `
                 <div class="restaurant-card">
                     <div class="card-image" style="background-image: url('${store.image_url}')">
                        ${store.promo ? `<span class="promo-badge">${store.promo}</span>` : ''}
                     </div>
                     <div class="card-details">
                         <h4>${store.name}</h4>
                         <div class="meta">
                            <span class="rating">⭐ ${store.rating}</span>
                            <span class="eta">🕒 ${store.eta} min</span>
                         </div>
                         <div class="fee">Delivery: ${store.delivery_fee}</div>
                         <a href="${store.url}" target="_blank" class="order-btn">Order on Uber Eats</a>
                     </div>
                 </div>`;
             }
             html += `</div>`;
             return html;
         } else if (Array.isArray(results) && results.length > 0) {
             // Fallback for simple arrays
             return results.map((r: any) => `- ${r.name}`).join('\n');
         } else {
             return "No restaurants found nearby.";
         }

      } catch (e: any) {
         // Better error handling for LLM
         console.error("Search Tool Error:", e);
         if (e.message && e.message.includes("401")) {
             return "User not connected. Please ask the user to connect their Uber account.";
         }
         return `Error searching: ${e.message || e}`;
      }
    },
  },
];

// Wraps standard fetch to include the base URL and handle errors
async function fetchBurgerApi(url: string, options: RequestInit = {}): Promise<string> {
  const fullUrl = new URL(url, burgerApiUrl).toString();
  console.log(`[MCP] Fetching ${fullUrl}`);
  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[MCP] API Error (${response.status}):`, errorBody);
      
      try {
         const jsonError = JSON.parse(errorBody);
         throw new Error(jsonError.error || jsonError.message || response.statusText);
      } catch {
         throw new Error(errorBody || response.statusText);
      }
    }

    if (response.status === 204) {
      return 'Operation completed successfully. No content returned.';
    }

    return JSON.stringify(await response.json());
  } catch (error: any) {
    console.error(`[MCP] Execution Error for ${fullUrl}:`, error);
    throw error;
  }
}
