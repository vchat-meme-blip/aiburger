
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
  // Debug: Log all potential sources of ID
  const queryId = request.query.get('userId');
  const bodyId = body?.context?.userId;
  const authUserId = getAuthenticationUserId(request);
  
  console.log(`[Auth] Resolution - Headers: ${!!authUserId}, Query: ${queryId}, Body: ${bodyId}`);

  // 1. Preference: SWA Auth Header
  if (authUserId) {
    const id = createHash('sha256').update(authUserId).digest('hex').slice(0, 32);
    try {
        const db = await UserDbService.getInstance();
        const user = await db.getUserById(id);
        if (user) {
            return user.id;
        }
        // If user doesn't exist in DB yet (me-get not called), still return the hash
        // so the agent can work with it.
        return id;
    } catch (e) {
        console.warn(`[Auth] DB lookup failed for ${id}, continuing with hashed ID.`, e);
        return id;
    }
  }

  // 2. Fallback: Query Parameter (High Priority for Dev/Hybrid)
  if (queryId) {
      console.log(`[Auth] Using query parameter userId: ${queryId}`);
      return queryId;
  }

  // 3. Fallback: Body Parameter
  if (bodyId) {
      console.log(`[Auth] Using body context userId: ${bodyId}`);
      return bodyId;
  }

  console.warn('[Auth] No userId found in request.');
  return undefined;
}
