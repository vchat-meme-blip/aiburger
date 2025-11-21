import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
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
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;
  const openAiApiKey = process.env.OPENAI_API_KEY;
  const openAiBaseUrl = process.env.OPENAI_API_BASE_URL;
  const burgerMcpUrl = process.env.BURGER_MCP_URL ?? 'http://localhost:3000/mcp';
  // We need the Burger API URL to construct the login link. Usually inferred or env var.
  // If not set, we guess based on convention or fallback to local.
  const burgerApiUrl = process.env.BURGER_API_URL ?? 'http://localhost:7071';

  try {
    const requestBody = (await request.json()) as AIChatCompletionRequest;
    const { messages, context: chatContext } = requestBody;

    const userId = await getInternalUserId(request, requestBody);
    if (!userId) {
      return {
        status: 400,
        jsonBody: {
          error: 'Invalid or missing userId in the request',
        },
      };
    }

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

    context.log(`userId: ${userId}, sessionId: ${sessionId}`);
    if (userLocation) {
      context.log(`User Location: ${userLocation.lat}, ${userLocation.long}`);
    }

    if ((!azureOpenAiEndpoint && !openAiApiKey) || !burgerMcpUrl) {
      const errorMessage = 'Missing required environment variables: AZURE_OPENAI_API_ENDPOINT (or OPENAI_API_KEY) or BURGER_MCP_URL';
      context.error(errorMessage);
      return {
        status: 500,
        jsonBody: {
          error: errorMessage,
        },
      };
    }

    let model: ChatOpenAI;

    if (openAiApiKey) {
      // Standard OpenAI or compatible endpoint
      model = new ChatOpenAI({
        apiKey: openAiApiKey,
        configuration: openAiBaseUrl ? { baseURL: openAiBaseUrl } : undefined,
        modelName: process.env.OPENAI_MODEL ?? process.env.AZURE_OPENAI_MODEL ?? 'gpt-4o',
        streaming: true,
      });
    } else {
      // Azure OpenAI with Managed Identity
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
        modelName: process.env.AZURE_OPENAI_MODEL ?? 'gpt-5-mini',
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

    // Construct dynamic login URL
    const loginUrl = `${burgerApiUrl}/api/uber/login?userId=${userId}`;

    // Enhance system prompt with dynamic data
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
    context.log(`Previous messages in history: ${previousMessages.length}`);

    // Start the agent and stream the response events
    const responseStream = agent.streamEvents(
      {
        messages: [['human', `userId: ${userId}`], ...previousMessages, ['human', question]],
      },
      {
        configurable: { sessionId },
        version: 'v2',
      },
    );

    // Create a short title for this chat session
    const generateSessionTitle = async () => {
      const { title } = await chatHistory.getContext();
      if (!title) {
        const response = await model.invoke([
          ['system', titleSystemPrompt],
          ['human', question],
        ]);
        context.log(`Title for session: ${response.text}`);
        chatHistory.setContext({ title: response.text });
      }
    };

    // We don't await this yet, to allow parallel execution.
    // We'll await it later, after the response is fully sent.
    const sessionTitlePromise = generateSessionTitle();

    // Update chat history when the response is complete
    const onResponseComplete = async (content: string) => {
      try {
        if (content) {
          // When no content is generated, do not update the history as it's likely an error
          await chatHistory.addMessage(new HumanMessage(question));
          await chatHistory.addMessage(new AIMessage(content));
          context.log('Chat history updated successfully');

          // Ensure the session title has finished generating
          await sessionTitlePromise;
        }

        // Close MCP client connection
        await client.close();
      } catch (error) {
        context.error('Error after response completion:', error);
      }
    };

    const jsonStream = Readable.from(createJsonStream(responseStream, sessionId, onResponseComplete));

    return {
      headers: {
        // This content type is needed for streaming responses
        // when using a SWA linked backend API
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
      },
      body: jsonStream,
    };
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing chat-post request: ${error.message}`);

    return {
      status: 500,
      jsonBody: {
        error: 'Internal server error while processing the request',
      },
    };
  }
}

// Transform the response chunks into a JSON stream
async function* createJsonStream(
  chunks: AsyncIterable<StreamEvent>,
  sessionId: string,
  onComplete: (responseContent: string) => Promise<void>,
) {
  for await (const chunk of chunks) {
    const { data } = chunk;
    let responseChunk: AIChatCompletionDelta | undefined;

    if (chunk.event === 'on_chat_model_end' && data.output?.content.length > 0) {
      // End of our agentic chain
      const content = data?.output.content[0].text ?? data.output.content ?? '';
      await onComplete(content);
    } else if (chunk.event === 'on_chat_model_stream' && data.chunk.content.length > 0) {
      // Streaming response from the LLM
      responseChunk = {
        delta: {
          content: data.chunk.content[0].text ?? data.chunk.content,
          role: 'assistant',
        },
      };
    } else if (chunk.event === 'on_chat_model_end') {
      // Intermediate LLM response (no content)
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
      // Tool call completed
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
      // Start of a new LLM call
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
      // Start of a new tool call
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

    // Format response chunks in Newline delimited JSON
    // see https://github.com/ndjson/ndjson-spec
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
