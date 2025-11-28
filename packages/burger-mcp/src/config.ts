import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env file is located in the root of the repository
// We wrap in try-catch to avoid crashing in production where .env might not exist or path is different
try {
    dotenv.config({ path: path.join(__dirname, '../../../.env'), quiet: true });
} catch (e) {
    // Ignore errors, rely on environment variables
}

// Use --local option to force MCP server to connect to local Burger API
const localApiUrl = 'http://localhost:7071';
export const burgerApiUrl = process.argv[2] === '--local' ? localApiUrl : process.env.BURGER_API_URL || localApiUrl;
