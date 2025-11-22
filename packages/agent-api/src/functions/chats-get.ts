
import process from 'node:process';
import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions';
import { AzureCosmsosDBNoSQLChatMessageHistory } from '@langchain/azure-cosmosdb';
import { getCredentials, getInternalUserId } from '../auth.js';

async function getChats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`[chats-get] Processing request. URL: ${request.url}`);
  
  // Log all query parameters for debugging
  const queryParams = Object.fromEntries(request.query.entries());
  context.log(`[chats-get] Query Params: ${JSON.stringify(queryParams)}`);

  const userId = await getInternalUserId(request);
  
  if (!userId) {
    context.error('[chats-get] Failed to resolve userId from request.');
    return {
      status: 400,
      jsonBody: {
        error: 'Invalid or missing userId. Please ensure you are logged in or provide userId in query.',
        debug: { queryParams }
      },
    };
  }

  context.log(`[chats-get] Resolved userId: ${userId}`);
  
  const azureCosmosDbEndpoint = process.env.AZURE_COSMOSDB_NOSQL_ENDPOINT;
  const { sessionId } = request.params;

  try {
    if (!azureCosmosDbEndpoint) {
      if (process.env.NODE_ENV !== 'production') {
          context.warn('[chats-get] No Cosmos DB endpoint, returning mock empty list (dev mode)');
          return { jsonBody: [] };
      }
      const errorMessage = 'Missing required environment variable: AZURE_COSMOSDB_NOSQL_ENDPOINT';
      context.error(errorMessage);
      return { status: 500, jsonBody: { error: errorMessage } };
    }

    const credentials = getCredentials();
    const chatHistory = new AzureCosmsosDBNoSQLChatMessageHistory({
      sessionId,
      userId,
      credentials,
      containerName: 'history',
      databaseName: 'historyDB',
    });

    if (sessionId) {
      context.log(`[chats-get] Fetching messages for session: ${sessionId}`);
      const messages = await chatHistory.getMessages();
      const chatMessages = messages.map((message) => ({
        role: message.getType() === 'human' ? 'user' : 'assistant',
        content: message.content,
      }));
      return { jsonBody: chatMessages };
    }

    context.log(`[chats-get] Fetching all sessions for user: ${userId}`);
    try {
        const sessions = await chatHistory.getAllSessions();
        const chatSessions = sessions.map((session) => ({
          id: session.id,
          title: session.context?.title,
        }));
        return { jsonBody: chatSessions };
    } catch (dbError: any) {
        if (dbError.code === 404) {
            context.log('[chats-get] History container not found, returning empty list.');
            return { jsonBody: [] }; 
        }
        throw dbError;
    }

  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`[chats-get] Error processing request: ${error.message}`);
    return {
      status: 500,
      jsonBody: {
        error: 'Failed to retrieve chat history',
        details: error.message
      },
    };
  }
}

app.http('chats-get', {
  route: 'chats/{sessionId?}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: getChats,
});
