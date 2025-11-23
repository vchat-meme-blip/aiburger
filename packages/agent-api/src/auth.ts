
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { HttpRequest } from '@azure/functions';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { UserDbService } from './user-db-service.js';

const azureOpenAiScope = 'https://cognitiveservices.azure.com/.default';

let credentials: DefaultAzureCredential | undefined;

export function getCredentials(): DefaultAzureCredential {
  credentials ||= new DefaultAzureCredential();
  return credentials;
}

export function getAzureOpenAiTokenProvider() {
  return getBearerTokenProvider(getCredentials(), azureOpenAiScope);
}

export function getAuthenticationUserId(request: HttpRequest): string | undefined {
  try {
    const header = request.headers.get('x-ms-client-principal');
    if (header) {
        // Use utf-8 to ensure special characters in names/IDs are parsed correctly
        const token = Buffer.from(header, 'base64').toString('utf-8');
        const infos = token && JSON.parse(token);
        return infos?.userId || infos?.sub || infos?.userDetails;
    }
  } catch (error) {
      console.error('Error parsing x-ms-client-principal header:', error);
  }
  return undefined;
}

export async function getInternalUserId(request: HttpRequest, body?: any): Promise<string | undefined> {
  // 1. Priority: Explicit Query Param (Used by Client)
  // Fix: Allow null (returned by get) or undefined
  let queryId: string | null | undefined = request.query.get('userId');

  // Debug logging for diagnosis
  if (!queryId) {
      // If request.query is empty, try manual parse (rare edge case in some proxy setups)
      if (request.url && request.url.includes('userId=')) {
          try {
              const urlObj = new URL(request.url);
              queryId = urlObj.searchParams.get('userId');
              if (queryId) console.log(`[Auth] Recovered userId from URL string: ${queryId}`);
          } catch {}
      }
  }

  if (queryId) {
      return queryId;
  }

  // 2. Priority: Body Context (Used in Chat POST)
  const bodyId = body?.context?.userId || body?.userId;
  if (bodyId) {
      return bodyId;
  }

  // 3. Fallback: SWA Auth Header (Initial Login / Discovery)
  const authUserId = getAuthenticationUserId(request);
  if (authUserId) {
    // IMPORTANT: The ID must be hashed to match how it's stored in the DB/Frontend
    const id = createHash('sha256').update(authUserId).digest('hex').slice(0, 32);
    
    try {
        const db = await UserDbService.getInstance();
        const user = await db.getUserById(id);
        if (user) {
            return user.id;
        }
        return id;
    } catch (e) {
        console.warn(`[Auth] DB lookup failed for ${id}, using hash directly.`, e);
        return id;
    }
  }

  // Detailed failure log
  console.warn(`[Auth] Failed to resolve UserID. URL: ${request.url}, Headers: ${Array.from(request.headers.keys()).join(',')}`);
  return undefined;
}
