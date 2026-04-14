/**
 * Shared Anthropic Claude API helper
 * 
 * Centralizes all Claude API calls so each edge function just imports callClaude() or streamClaude().
 * Handles: system prompt extraction, required max_tokens, response parsing, tool calling.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Model mapping for easy reference
export const CLAUDE_MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  HAIKU: 'claude-3-5-haiku-latest',
} as const;

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeToolFunction {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface ClaudeTool {
  type: 'function';
  function: ClaudeToolFunction;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface CallClaudeParams {
  system?: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ClaudeTool[];
  tool_choice?: { type: string; function?: { name: string } };
  signal?: AbortSignal;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface ClaudeToolUseResponse {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason: string;
}

/**
 * Extract system message from an OpenAI-style messages array.
 * Returns { system, messages } where messages has no system role.
 */
function extractSystem(msgs: Array<{ role: string; content: string }>, explicitSystem?: string): {
  system: string | undefined;
  messages: ClaudeMessage[];
} {
  let system = explicitSystem;
  const filtered: ClaudeMessage[] = [];

  for (const m of msgs) {
    if (m.role === 'system') {
      // Concatenate multiple system messages
      system = system ? `${system}\n\n${m.content}` : m.content;
    } else {
      filtered.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }
  }

  return { system, messages: filtered };
}

/**
 * Convert OpenAI-style tools to Anthropic tool format.
 */
function convertTools(tools?: ClaudeTool[]): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters || { type: 'object', properties: {} },
  }));
}

/**
 * Convert OpenAI-style tool_choice to Anthropic format.
 */
function convertToolChoice(tc?: { type: string; function?: { name: string } }): Record<string, unknown> | undefined {
  if (!tc) return undefined;
  if (tc.type === 'function' && tc.function?.name) {
    return { type: 'tool', name: tc.function.name };
  }
  return undefined;
}

/**
 * Non-streaming call to Claude.
 * Returns the raw Anthropic response object.
 */
export async function callClaude(params: CallClaudeParams): Promise<ClaudeResponse | ClaudeToolUseResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const { system, messages } = extractSystem(params.messages, params.system);
  const anthropicTools = convertTools(params.tools);
  const anthropicToolChoice = convertToolChoice(params.tool_choice);

  const body: Record<string, unknown> = {
    model: params.model || CLAUDE_MODELS.SONNET,
    max_tokens: params.max_tokens || 1024,
    messages,
  };

  if (system) body.system = system;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (anthropicTools) body.tools = anthropicTools;
  if (anthropicToolChoice) body.tool_choice = anthropicToolChoice;

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  if (params.signal) fetchOptions.signal = params.signal;

  const response = await fetch(ANTHROPIC_API_URL, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[anthropic] HTTP ${response.status}:`, errorText);
    const error = new Error(`Claude API error: ${response.status}`) as any;
    error.status = response.status;
    error.body = errorText;
    throw error;
  }

  return await response.json();
}

/**
 * Convenience: call Claude and return just the text content.
 */
export async function callClaudeText(params: CallClaudeParams): Promise<string> {
  const response = await callClaude(params);
  return response.content
    ?.filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('') || '';
}

/**
 * Convenience: call Claude and return tool call results in OpenAI-compatible format.
 * Maps Anthropic tool_use blocks to OpenAI-style tool_calls array.
 */
export async function callClaudeWithTools(params: CallClaudeParams): Promise<{
  content: string | null;
  tool_calls: Array<{ function: { name: string; arguments: string } }> | null;
}> {
  const response = await callClaude(params);

  const textContent = response.content
    ?.filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('') || null;

  const toolUseBlocks = response.content?.filter((c: any) => c.type === 'tool_use') || [];

  const toolCalls = toolUseBlocks.length > 0
    ? toolUseBlocks.map((t: any) => ({
        function: {
          name: t.name,
          arguments: JSON.stringify(t.input),
        },
      }))
    : null;

  return { content: textContent, tool_calls: toolCalls };
}

/**
 * Streaming call to Claude.
 * Returns the raw Response with SSE body in Anthropic format.
 * 
 * For the coach/dialogue, we need to transform Anthropic SSE events
 * into OpenAI-compatible SSE events so the client parser doesn't need changes.
 */
export async function streamClaude(params: CallClaudeParams): Promise<Response> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const { system, messages } = extractSystem(params.messages, params.system);

  const body: Record<string, unknown> = {
    model: params.model || CLAUDE_MODELS.SONNET,
    max_tokens: params.max_tokens || 1024,
    messages,
    stream: true,
  };

  if (system) body.system = system;
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  if (params.signal) fetchOptions.signal = params.signal;

  const response = await fetch(ANTHROPIC_API_URL, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[anthropic] Streaming HTTP ${response.status}:`, errorText);
    const error = new Error(`Claude streaming error: ${response.status}`) as any;
    error.status = response.status;
    error.body = errorText;
    throw error;
  }

  return response;
}

/**
 * Stream Claude and transform into OpenAI-compatible SSE format.
 * This lets existing client-side SSE parsers work without changes.
 * 
 * Anthropic SSE: event: content_block_delta → data: {"delta":{"text":"..."}}
 * OpenAI SSE:    data: {"choices":[{"delta":{"content":"..."}}]}
 */
export async function streamClaudeAsOpenAI(params: CallClaudeParams): Promise<ReadableStream> {
  const rawResponse = await streamClaude(params);

  if (!rawResponse.body) {
    throw new Error('No response body from Claude streaming');
  }

  const reader = rawResponse.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Send OpenAI-compatible [DONE]
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (!line || line.startsWith('event:')) continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          try {
            const parsed = JSON.parse(jsonStr);

            // Handle content_block_delta events
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const openAIChunk = {
                choices: [{
                  delta: { content: parsed.delta.text },
                  index: 0,
                  finish_reason: null,
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
            }

            // Handle message_stop
            if (parsed.type === 'message_stop') {
              const stopChunk = {
                choices: [{
                  delta: {},
                  index: 0,
                  finish_reason: 'stop',
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(stopChunk)}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }
          } catch {
            // Ignore unparseable lines
          }
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

/**
 * Call Lovable AI Gateway (OpenAI-compatible).
 * Fallback provider when Anthropic is unavailable.
 * Uses google/gemini-2.5-flash by default.
 */
export async function callLovableAIText(params: {
  system?: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

  const allMessages: Array<{ role: string; content: string }> = [];
  if (params.system) allMessages.push({ role: 'system', content: params.system });
  for (const m of params.messages) allMessages.push({ role: m.role, content: m.content });

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model || 'google/gemini-2.5-flash',
      messages: allMessages,
      max_tokens: params.max_tokens || 1024,
      temperature: params.temperature,
    }),
  };

  if (params.signal) fetchOptions.signal = params.signal;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[lovable-ai] HTTP ${response.status}:`, errorText);
    throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
