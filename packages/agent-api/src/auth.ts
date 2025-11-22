
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
        const token = Buffer.from(header, 'base64').toString('ascii');
        const infos = token && JSON.parse(token);
        return infos?.userId;
    }
  } catch (error) {
      console.error('Error parsing x-ms-client-principal header:', error);
  }
  return undefined;
}

export async function getInternalUserId(request: HttpRequest, body?: any): Promise<string | undefined> {
  // 1. Priority: Explicit Query Param (Used by Client)
  let queryId = request.query.get('userId');

  // Fallback: Manually parse URL if request.query is empty (Edge case in some proxy configs)
  if (!queryId && request.url.includes('userId=')) {
      try {
          const urlObj = new URL(request.url);
          queryId = urlObj.searchParams.get('userId');
      } catch (e) {
          console.warn('[Auth] Failed to manual parse URL for userId', e);
      }
  }

  if (queryId) {
      return queryId;
  }

  // 2. Priority: Body Context (Used in Chat POST)
  const bodyId = body?.context?.userId;
  if (bodyId) {
      return bodyId;
  }

  // 3. Fallback: SWA Auth Header (Initial Login / Discovery)
  const authUserId = getAuthenticationUserId(request);
  if (authUserId) {
    // IMPORTANT: The ID must be hashed to match how it's stored in the DB/Frontend
    const id = createHash('sha256').update(authUserId).digest('hex').slice(0, 32);
    
    // Verify existence (lazy creation handled by /me-get)
    try {
        const db = await UserDbService.getInstance();
        const user = await db.getUserById(id);
        if (user) {
            return user.id;
        }
        // If not found in DB yet, return the hash so downstream can try to use it or fail gracefully
        return id;
    } catch (e) {
        console.warn(`[Auth] DB lookup failed for ${id}, using hash directly.`, e);
        return id;
    }
  }

  return undefined;
}
