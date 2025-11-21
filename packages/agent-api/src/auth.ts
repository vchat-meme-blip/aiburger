
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { HttpRequest } from '@azure/functions';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { UserDbService } from './user-db-service.js';

const azureOpenAiScope = 'https://cognitiveservices.azure.com/.default';

let credentials: DefaultAzureCredential | undefined;

export function getCredentials(): DefaultAzureCredential {
  // Use the current user identity to authenticate.
  // No secrets needed, it uses `az login` or `azd auth login` locally,
  // and managed identity when deployed on Azure.
  credentials ||= new DefaultAzureCredential();
  return credentials;
}

export function getAzureOpenAiTokenProvider() {
  return getBearerTokenProvider(getCredentials(), azureOpenAiScope);
}

export function getAuthenticationUserId(request: HttpRequest): string | undefined {
  let userId: string | undefined;

  // Get the user ID from Azure easy auth
  try {
    const token = Buffer.from(request.headers.get('x-ms-client-principal') ?? '', 'base64').toString('ascii');
    const infos = token && JSON.parse(token);
    userId = infos?.userId;
  } catch {}

  return userId;
}

export async function getInternalUserId(request: HttpRequest, body?: any): Promise<string | undefined> {
  // Get the user ID from Azure easy auth if it's available
  const authUserId = getAuthenticationUserId(request);
  
  if (authUserId) {
    // Exchange the auth user ID to the internal user ID
    // NOTE: We must hash it to match how it is stored in me-get.ts
    const id = createHash('sha256').update(authUserId).digest('hex').slice(0, 32);
    
    const db = await UserDbService.getInstance();
    const user = await db.getUserById(id);
    if (user) {
      return user.id;
    }
    // If we have a valid auth user ID but no DB record, we return the hash
    // The me-get endpoint will create the record lazily if needed, 
    // but this ensures downstream functions get the correct ID format immediately.
    return id;
  }

  // Get the user ID from the request as a fallback
  const fallbackId = body?.context?.userId ?? request.query.get('userId') ?? undefined;
  return fallbackId;
}
