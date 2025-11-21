import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DbService } from '../db-service.js';
import { UberClient, UberSearchResponse } from '../uber-client.js';

const uberClient = new UberClient();

// A simple scoring function to simulate "Semantic Search"
// Ranks items higher if they contain query keywords in name, description, or tags
function scoreItem(item: any, queryTerms: string[]): number {
    let score = 0;
    const text = `${item.name} ${item.description} ${item.tags?.join(' ')} ${item.category}`.toLowerCase();
    
    for (const term of queryTerms) {
        if (text.includes(term)) {
            score += 1;
            // Boost exact matches in name
            if (item.name.toLowerCase().includes(term)) score += 2;
        }
    }
    return score;
}

app.http('discovery-search', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'discovery/search',
    handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const userId = request.query.get('userId');
        const query = request.query.get('q') || '';
        const lat = parseFloat(request.query.get('lat') || '0');
        const long = parseFloat(request.query.get('long') || '0');

        if (!query) {
             return { status: 400, jsonBody: { error: 'Search query (q) is required' } };
        }

        const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2); // Ignore small words
        const results: any[] = [];

        // 1. Search Internal Menu (Contoso Burgers)
        const db = await DbService.getInstance();
        const burgers = await db.getBurgers();
        
        for (const burger of burgers) {
            // Enhance burger object with tags for scoring
            const burgerWithTags = { ...burger, tags: ['burger', 'internal', 'contoso'] };
            const score = scoreItem(burgerWithTags, queryTerms);
            
            if (score > 0) {
                results.push({
                    type: 'internal',
                    source: 'Contoso Burgers',
                    id: burger.id,
                    name: burger.name,
                    description: burger.description,
                    price: burger.price,
                    image_url: `api/images/${burger.imageUrl}`, // Relative to our API
                    score: score + 0.5, // Slight bias for internal items
                    promo: 'Free Fries & Drink Included'
                });
            }
        }

        // 2. Search External (Uber Eats)
        try {
            let token = 'mock_token'; 
            if (userId) {
                const tokenData = await db.getUserToken(userId, 'uber');
                if (tokenData?.access_token) token = tokenData.access_token;
            }

            const uberData: UberSearchResponse = await uberClient.searchRestaurants(token, lat, long);
            
            if (uberData && uberData.stores) {
                for (const store of uberData.stores) {
                    if (store.menu) {
                        for (const item of store.menu) {
                             const score = scoreItem(item, queryTerms);
                             if (score > 0) {
                                 results.push({
                                     type: 'external',
                                     source: store.name,
                                     id: item.id,
                                     name: item.name,
                                     description: item.description,
                                     price: item.price,
                                     image_url: store.image_url, // Use store image as fallback
                                     score: score,
                                     url: store.url,
                                     promo: store.promo // inherit store promo
                                 });
                             }
                        }
                    }
                    // Also score the store itself if the query is generic (e.g. "Burgers")
                    const storeScore = scoreItem({ ...store, tags: ['restaurant'] }, queryTerms);
                    if (storeScore > 0) {
                         results.push({
                             type: 'external_store',
                             source: 'Uber Eats',
                             id: store.id,
                             name: store.name,
                             description: `ETA: ${store.eta} mins • ${store.rating} ⭐`,
                             price: 0, // Not applicable
                             image_url: store.image_url,
                             score: storeScore * 0.8, // Lower priority than specific items
                             url: store.url,
                             promo: store.promo
                         });
                    }
                }
            }
        } catch (e) {
            context.warn('Failed to search Uber:', e);
        }

        // 3. Sort by Score
        results.sort((a, b) => b.score - a.score);

        return {
            status: 200,
            jsonBody: {
                query,
                count: results.length,
                results: results
            }
        };
    }
});
