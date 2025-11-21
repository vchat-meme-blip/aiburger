
import process from 'node:process';
import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions';
import { AzureCosmsosDBNoSQLChatMessageHistory } from '@langchain/azure-cosmosdb';
import { getCredentials, getInternalUserId } from '../auth.js';

async function getChats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Processing GET /chats request');
  const azureCosmosDbEndpoint = process.env.AZURE_COSMOSDB_NOSQL_ENDPOINT;
  const { sessionId } = request.params;
  
  const userId = await getInternalUserId(request);
  context.log(`Resolved User ID: ${userId}`);

  if (!userId) {
    context.warn('User ID missing in request');
    return {
      status: 400,
      jsonBody: {
        error: 'Invalid or missing userId in the request. Please ensure you are logged in or provide userId in query.',
      },
    };
  }

  try {
    if (!azureCosmosDbEndpoint) {
      // Fallback to memory (mock) if no DB
      if (process.env.NODE_ENV !== 'production') {
          return { jsonBody: [] };
      }
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

    try {
        const sessions = await chatHistory.getAllSessions();
        const chatSessions = sessions.map((session) => ({
          id: session.id,
          title: session.context?.title,
        }));
        return { jsonBody: chatSessions };
    } catch (dbError: any) {
        if (dbError.code === 404) {
            return { jsonBody: [] }; // No history container yet
        }
        throw dbError;
    }

  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing chats-get request: ${error.message}`);

    return {
      status: 500, // Changed from 404 to 500 for generic errors, specific 404s handled above
      jsonBody: {
        error: 'Failed to retrieve chat history',
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
