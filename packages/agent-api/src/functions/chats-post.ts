
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { HttpRequest, InvocationContext, HttpResponseInit, app } from '@azure/functions';
import { createAgent, AIMessage, HumanMessage } from 'langchain';
import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai';
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
  context.log('[chats-post] Processing POST request');
  
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  const openAiBaseUrl = process.env.OPENAI_API_BASE_URL || process.env.AZURE_OPENAI_ENDPOINT;
  
  const burgerMcpUrl = process.env.BURGER_MCP_URL ?? 'http://localhost:3000/mcp';
  const burgerApiUrl = process.env.BURGER_API_URL ?? 'http://localhost:7071';

  try {
    const requestBody = (await request.json()) as AIChatCompletionRequest;
    const { messages, context: chatContext } = requestBody;

    const userId = await getInternalUserId(request, requestBody);
    
    if (!userId) {
      const hasAuthHeader = request.headers.has('x-ms-client-principal');
      if (!hasAuthHeader) {
          context.warn('[chats-post] CRITICAL: SWA Auth header missing. Request likely bypassed the proxy.');
      }

      return {
        status: 400,
        jsonBody: {
          error: 'Invalid or missing userId. Please ensure you are logged in.',
          details: hasAuthHeader ? 'Header present but invalid' : 'Missing SWA Auth header'
        },
      };
    }
    context.log(`[chats-post] User resolved: ${userId}`);

    if (messages?.length === 0 || !messages[messages.length - 1]?.content) {
      return {
        status: 400,
        jsonBody: {
          error: 'Invalid request: "messages" array must not be empty.',
        },
      };
    }

    const sessionId = ((chatContext as any)?.sessionId as string) || randomUUID();
    const userLocation = chatContext?.location;

    // Validate AI Config
    if ((!azureOpenAiEndpoint && !openAiApiKey) || !burgerMcpUrl) {
      return {
        status: 500,
        jsonBody: {
          error: 'Missing AI configuration (Endpoint or Keys).',
        },
      };
    }

    let model: ChatOpenAI | AzureChatOpenAI;
    const modelName = process.env.OPENAI_MODEL ?? process.env.AZURE_OPENAI_MODEL ?? 'gpt-4o-mini';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview";

    if (openAiApiKey && !azureOpenAiEndpoint) {
      context.log(`[chats-post] Using Standard OpenAI client. Model: ${modelName}`);
      model = new ChatOpenAI({
        apiKey: openAiApiKey,
        configuration: openAiBaseUrl ? { baseURL: openAiBaseUrl } : undefined,
        modelName: modelName,
        streaming: true,
      });
    } else {
      context.log(`[chats-post] Using Azure OpenAI (Managed Identity). Endpoint: ${azureOpenAiEndpoint}`);
      context.log(`[chats-post] Configuration - Deployment: ${modelName}, API Version: ${apiVersion}`);
      
      model = new AzureChatOpenAI({
        azureOpenAIEndpoint: azureOpenAiEndpoint,
        azureOpenAIApiDeploymentName: modelName,
        azureOpenAIApiVersion: apiVersion,
        azureADTokenProvider: getAzureOpenAiTokenProvider(),
        streaming: true,
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
    context.log(`[chats-post] Connecting to MCP: ${burgerMcpUrl}`);
    const transport = new StreamableHTTPClientTransport(new URL(burgerMcpUrl));
    await client.connect(transport);

    const tools = await loadMcpTools('burger', client);
    
    const loginUrl = `${burgerApiUrl}/api/uber/login?userId=${userId}`;
    let currentSystemPrompt = agentSystemPrompt.replace('<LOGIN_URL>', loginUrl);
    
    if (userLocation) {
        currentSystemPrompt += `\n\n[SYSTEM NOTE]: User is currently located at Latitude: ${userLocation.lat}, Longitude: ${userLocation.long}. Use these coordinates.`;
    }

    const agent = createAgent({
      model,
      tools,
      systemPrompt: currentSystemPrompt,
    });

    const question = messages[messages.length - 1]!.content;
    const previousMessages = await chatHistory.getMessages();

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
      try {
          const { title } = await chatHistory.getContext();
          if (!title) {
            const response = await model.invoke([
              ['system', titleSystemPrompt],
              ['human', question],
            ]);
            chatHistory.setContext({ title: response.text });
          }
      } catch (e: any) {
          context.warn('Failed to generate session title (non-fatal):', e.message);
          if (e.message?.includes('404')) {
             context.warn('HINT: This 404 usually means the Deployment Name in Azure OpenAI does not match the environment variable AZURE_OPENAI_MODEL.');
          }
      }
    };

    const sessionTitlePromise = generateSessionTitle();

    const onResponseComplete = async (content: string) => {
      try {
        if (content) {
          await chatHistory.addMessage(new HumanMessage(question));
          await chatHistory.addMessage(new AIMessage(content));
          await sessionTitlePromise;
        }
        await client.close();
      } catch (error) {
        context.error('Error after response completion:', error);
      }
    };

    const jsonStream = Readable.from(createJsonStream(responseStream, sessionId, onResponseComplete, context));

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
  context: InvocationContext
) {
  try {
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
  } catch (e: any) {
      context.error('Error during stream generation:', e);
      // Send an error chunk to the client so it knows to stop spinning
      const errorChunk = {
          delta: {
              content: `\n\n**Error:** ${e.message || 'An error occurred while communicating with the AI service.'}\n\n*Admin Note: Check if the Azure OpenAI Deployment Name matches the configuration.*`,
              role: 'assistant'
          }
      };
      yield JSON.stringify(errorChunk) + '\n';
  }
}

app.setup({ enableHttpStream: true });
app.http('chats-post', {
  route: 'chats/stream',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: postChats,
});
