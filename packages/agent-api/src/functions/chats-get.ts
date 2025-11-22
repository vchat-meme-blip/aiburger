
import process from 'node:process';
import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions';
import { AzureCosmsosDBNoSQLChatMessageHistory } from '@langchain/azure-cosmosdb';
import { getCredentials, getInternalUserId } from '../auth.js';

async function getChats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const azureCosmosDbEndpoint = process.env.AZURE_COSMOSDB_NOSQL_ENDPOINT;
  const { sessionId } = request.params;
  
  // Verbose logging for debugging 400 errors
  const userId = await getInternalUserId(request);
  
  if (!userId) {
    context.warn(`[chats-get] User ID missing. Request URL: ${request.url}`);
    return {
      status: 400,
      jsonBody: {
        error: 'Invalid or missing userId in the request',
        debug: 'Ensure userId query parameter is provided'
      },
    };
  }

  try {
    // In local dev mode without Cosmos DB, return empty list instead of crashing
    if (!azureCosmosDbEndpoint && !process.env.AZURE_COSMOSDB_NOSQL_ENDPOINT) {
        context.warn('Cosmos DB endpoint not configured. Returning empty chat history (Mock Mode).');
        return { jsonBody: [] };
    }

    if (!azureCosmosDbEndpoint) {
      // This error implies we are in production but config is missing
      const errorMessage = 'Missing required environment variable: AZURE_COSMOSDB_NOSQL_ENDPOINT';
      context.error(errorMessage);
      return {
        status: 500,
        jsonBody: {
          error: errorMessage,
        },
      };
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
      const messages = await chatHistory.getMessages();
      const chatMessages = messages.map((message) => ({
        role: message.getType() === 'human' ? 'user' : 'assistant',
        content: message.content,
      }));
      return { jsonBody: chatMessages };
    }

    const sessions = await chatHistory.getAllSessions();
    const chatSessions = sessions.map((session) => ({
      id: session.id,
      title: session.context?.title,
    }));
    return { jsonBody: chatSessions };
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing chats-get request: ${error.message}`);
    return {
      status: 500, // Changed from 404 to 500 for generic errors, 404 is for not found
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
