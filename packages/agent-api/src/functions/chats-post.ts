
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { HttpRequest, InvocationContext, HttpResponseInit, app } from '@azure/functions';
import { createAgent, AIMessage, HumanMessage } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AzureCosmsosDBNoSQLChatMessageHistory } from '@langchain/azure-cosmosdb';
import { loadMcpTools } from '@langchain/mcp-adapters';
import { StreamEvent } from '@langchain/core/dist/tracers/log_stream.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getAzureOpenAiTokenProvider, getCredentials, getInternalUserId } from '../auth.js';
import { type AIChatCompletionRequest, type AIChatCompletionDelta } from '../models.js';

const agentSystemPrompt = `## Role
You are **Chicha**, an intelligent and sassy burger ordering assistant. You don't just take orders; you manage the user's entire food experience. You know about promos, delivery times, and the best spots in town.

## Personality
- **Vibe**: Helpful, slightly witty, food-obsessed, efficient.
- **Goal**: Get the user the best burger possible, whether it's from the internal "Contoso Burgers" kitchen or a real restaurant via Uber Eats.

## Context
- **Contoso Burgers**: Our internal cloud kitchen. Always includes free fries and a drink. Fast delivery.
- **Uber Eats**: Your gateway to the real world. You can search for *real* restaurants near the user.

## Capabilities & Rules
1.  **Location First**: If the user asks for "nearby" or "delivery", ALWAYS check if you have their location context. If not, ask them to click the location pin button.
2.  **Real-World Discovery**: Use \`search_nearby_restaurants\` to find real places. 
    - If the tool fails with an auth error (or says "User not connected"), tell the user: "I need to connect to your Uber account to see what's good around here." and **provide this exact login link**: [Connect Uber Account](<LOGIN_URL>).
    - Format restaurant results beautifully with Markdown (bold names, star ratings, images).
3.  **Internal Orders**: Use \`get_burgers\` and \`place_order\` for Contoso Burgers. 
    - *Note*: Placing orders requires a \`userId\`.
4.  **Proactivity**: 
    - If a user selects a burger, suggest a matching topping or ask about allergies.
    - If looking at external restaurants, mention delivery times.
5.  **Follow-up**: ALWAYS generate 3 quick follow-up questions for the user to keep the flow moving.
    - Format: Enclose in double angle brackets \`<<Like this?>>\`.

## Response Format
- Use GFM Markdown.
- Be concise but engaging.
- If showing images, use Markdown \`![alt](url)\`.
`;

const titleSystemPrompt = `Create a short, punchy title for this chat session (max 30 chars). No quotes. Example: "Spicy Burger Hunt" or "Late Night Snack".`;

export async function postChats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Processing POST /chats/stream request');
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  const openAiBaseUrl = process.env.OPENAI_API_BASE_URL || process.env.AZURE_OPENAI_ENDPOINT;
  
  const burgerMcpUrl = process.env.BURGER_MCP_URL ?? 'http://localhost:3000/mcp';
  const burgerApiUrl = process.env.BURGER_API_URL ?? 'http://localhost:7071';

  try {
    const requestBody = (await request.json()) as AIChatCompletionRequest;
    const { messages, context: chatContext } = requestBody;

    // Debugging: Log incoming user details
    context.log('Resolving user ID...');
    const userId = await getInternalUserId(request, requestBody);
    
    if (!userId) {
      context.warn('Failed to resolve user ID from request or auth headers');
      return {
        status: 400,
        jsonBody: {
          error: 'Invalid or missing userId in the request. Please ensure you are logged in.',
        },
      };
    }
    context.log(`User resolved: ${userId}`);

    if (messages?.length === 0 || !messages[messages.length - 1]?.content) {
      return {
        status: 400,
        jsonBody: {
          error: 'Invalid or missing messages in the request body',
        },
      };
    }

    const sessionId = ((chatContext as any)?.sessionId as string) || randomUUID();
    const userLocation = chatContext?.location;

    context.log(`Starting session: ${sessionId} for user: ${userId}`);
    if (userLocation) {
      context.log(`User Location: ${userLocation.lat}, ${userLocation.long}`);
    }

    if ((!azureOpenAiEndpoint && !openAiApiKey) || !burgerMcpUrl) {
      const errorMessage = 'Missing required environment variables: AZURE_OPENAI_API_ENDPOINT (or OPENAI_API_KEY/AZURE_OPENAI_API_KEY) or BURGER_MCP_URL';
      context.error(errorMessage);
      return {
        status: 500,
        jsonBody: {
          error: errorMessage,
        },
      };
    }

    let model: ChatOpenAI;

    const modelName = process.env.OPENAI_MODEL ?? process.env.AZURE_OPENAI_MODEL ?? 'gpt-4o-mini';

    if (openAiApiKey) {
      context.log(`Using Standard OpenAI (or compatible) via API Key with model: ${modelName}`);
      model = new ChatOpenAI({
        apiKey: openAiApiKey,
        configuration: openAiBaseUrl ? { baseURL: openAiBaseUrl } : undefined,
        modelName: modelName,
        streaming: true,
      });
    } else {
      context.log(`Using Azure OpenAI via Managed Identity with model: ${modelName}`);
      model = new ChatOpenAI({
        configuration: {
          baseURL: azureOpenAiEndpoint,
          async fetch(url, init = {}) {
            const token = await getAzureOpenAiTokenProvider()();
            const headers = new Headers((init as RequestInit).headers);
            headers.set('Authorization', `Bearer ${token}`);
            return fetch(url, { ...init, headers });
          },
        },
        modelName: modelName,
        streaming: true,
        useResponsesApi: true,
        apiKey: 'not_used',
      });
    }

    const chatHistory = new AzureCosmsosDBNoSQLChatMessageHistory({
      sessionId,
      userId,
      credentials: getCredentials(),
      containerName: 'history',
      databaseName: 'historyDB',
    });

    const client = new Client({
      name: 'burger-mcp-client',
      version: '1.0.0',
    });
    context.log(`Connecting to Burger MCP server at ${burgerMcpUrl}`);
    const transport = new StreamableHTTPClientTransport(new URL(burgerMcpUrl));
    await client.connect(transport);

    const tools = await loadMcpTools('burger', client);
    context.log(`Loaded ${tools.length} tools from Burger MCP server`);

    const loginUrl = `${burgerApiUrl}/api/uber/login?userId=${userId}`;

    let currentSystemPrompt = agentSystemPrompt.replace('<LOGIN_URL>', loginUrl);
    
    if (userLocation) {
        currentSystemPrompt += `\n\n[SYSTEM NOTE]: User is currently located at Latitude: ${userLocation.lat}, Longitude: ${userLocation.long}. Use these coordinates for search_nearby_restaurants. Do not ask for location again.`;
    }

    const agent = createAgent({
      model,
      tools,
      systemPrompt: currentSystemPrompt,
    });

    const question = messages[messages.length - 1]!.content;
    const previousMessages = await chatHistory.getMessages();
    context.log(`History length: ${previousMessages.length} messages`);

    const responseStream = agent.streamEvents(
      {
        messages: [['human', `userId: ${userId}`], ...previousMessages, ['human', question]],
      },
      {
        configurable: { sessionId },
        version: 'v2',
      },
    );

    const generateSessionTitle = async () => {
      const { title } = await chatHistory.getContext();
      if (!title) {
        const response = await model.invoke([
          ['system', titleSystemPrompt],
          ['human', question],
        ]);
        context.log(`Generated title: ${response.text}`);
        chatHistory.setContext({ title: response.text });
      }
    };

    const sessionTitlePromise = generateSessionTitle();

    const onResponseComplete = async (content: string) => {
      try {
        if (content) {
          await chatHistory.addMessage(new HumanMessage(question));
          await chatHistory.addMessage(new AIMessage(content));
          context.log('Chat history updated');
          await sessionTitlePromise;
        }
        await client.close();
      } catch (error) {
        context.error('Error after response completion:', error);
      }
    };

    const jsonStream = Readable.from(createJsonStream(responseStream, sessionId, onResponseComplete));

    return {
      headers: {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
      },
      body: jsonStream,
    };
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error processing chat-post request: ${error.message}`, error.stack);

    return {
      status: 500,
      jsonBody: {
        error: `Internal server error: ${error.message}`,
      },
    };
  }
}

async function* createJsonStream(
  chunks: AsyncIterable<StreamEvent>,
  sessionId: string,
  onComplete: (responseContent: string) => Promise<void>,
) {
  for await (const chunk of chunks) {
    const { data } = chunk;
    let responseChunk: AIChatCompletionDelta | undefined;

    if (chunk.event === 'on_chat_model_end' && data.output?.content.length > 0) {
      const content = data?.output.content[0].text ?? data.output.content ?? '';
      await onComplete(content);
    } else if (chunk.event === 'on_chat_model_stream' && data.chunk.content.length > 0) {
      responseChunk = {
        delta: {
          content: data.chunk.content[0].text ?? data.chunk.content,
          role: 'assistant',
        },
      };
    } else if (chunk.event === 'on_chat_model_end') {
      responseChunk = {
        delta: {
          context: {
            intermediateSteps: [
              {
                type: 'llm',
                name: chunk.name,
                input: data.input ? JSON.stringify(data.input) : undefined,
                output:
                  data?.output.content.length > 0
                    ? JSON.stringify(data?.output.content)
                    : JSON.stringify(data?.output.tool_calls),
              },
            ],
          },
        },
      };
    } else if (chunk.event === 'on_tool_end') {
      responseChunk = {
        delta: {
          context: {
            intermediateSteps: [
              {
                type: 'tool',
                name: chunk.name,
                input: data?.input?.input ?? undefined,
                output: data?.output.content ?? undefined,
              },
            ],
          },
        },
      };
    } else if (chunk.event === 'on_chat_model_start') {
      responseChunk = {
        delta: {
          context: {
            currentStep: {
              type: 'llm',
              name: chunk.name,
              input: data?.input ?? undefined,
            },
          },
        },
        context: { sessionId },
      };
    } else if (chunk.event === 'on_tool_start') {
      responseChunk = {
        delta: {
          context: {
            currentStep: {
              type: 'tool',
              name: chunk.name,
              input: data?.input?.input ? JSON.stringify(data.input?.input) : undefined,
            },
          },
        },
      };
    }

    if (!responseChunk) {
      continue;
    }

    yield JSON.stringify(responseChunk) + '\n';
  }
}

app.setup({ enableHttpStream: true });
app.http('chats-post', {
  route: 'chats/stream',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: postChats,
});
