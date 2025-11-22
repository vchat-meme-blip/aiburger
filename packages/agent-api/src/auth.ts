
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

  // 1. Priority: Query Parameter (Fix for 400 errors when client has state)
  if (queryId) {
      console.log(`[Auth] Using query parameter userId: ${queryId}`);
      return queryId;
  }

  // 2. Priority: Body Parameter
  if (bodyId) {
      console.log(`[Auth] Using body context userId: ${bodyId}`);
      return bodyId;
  }

  // 3. Fallback: SWA Auth Header (Initial login state)
  if (authUserId) {
    const id = createHash('sha256').update(authUserId).digest('hex').slice(0, 32);
    try {
        const db = await UserDbService.getInstance();
        const user = await db.getUserById(id);
        if (user) {
            return user.id;
        }
        // If user doesn't exist in DB yet, return the hash
        return id;
    } catch (e) {
        console.warn(`[Auth] DB lookup failed for ${id}, continuing with hashed ID.`, e);
        return id;
    }
  }

  console.warn('[Auth] No userId found in request.');
  return undefined;
}
