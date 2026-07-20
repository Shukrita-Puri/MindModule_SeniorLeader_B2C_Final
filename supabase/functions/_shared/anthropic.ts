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
  // Verified against this workspace's `/v1/models` catalog on 2026-06-20.
  // The prior id `claude-sonnet-4-20250514` is NOT in this key's catalog and
  // returned HTTP 404 on every fallback attempt for ≥14 days.
  // Cost policy: use Haiku as the default Claude tier. Sonnet-quality paths
  // can opt into a separate constant later once usage/cost is sustainable.
  SONNET: 'claude-haiku-4-5-20251001',
  HAIKU: 'claude-haiku-4-5-20251001',
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
  cacheSystemPrompt?: boolean;
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

function shouldCacheSystemPrompt(system: string | undefined, explicit?: boolean): boolean {
  if (!system) return false;
  if (explicit !== undefined) return explicit;
  return system.length >= 1024;
}

function buildSystemPayload(
  system: string | undefined,
  cache?: boolean,
): string | Array<Record<string, unknown>> | undefined {
  if (!system) return undefined;
  if (!shouldCacheSystemPrompt(system, cache)) return system;
  return [{
    type: 'text',
    text: system,
    cache_control: { type: 'ephemeral' },
  }];
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

  const systemPayload = buildSystemPayload(system, params.cacheSystemPrompt);
  if (systemPayload) body.system = systemPayload;
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

  const systemPayload = buildSystemPayload(system, params.cacheSystemPrompt);
  if (systemPayload) body.system = systemPayload;
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
  response_format?: { type: string };
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

  const allMessages: Array<{ role: string; content: string }> = [];
  if (params.system) allMessages.push({ role: 'system', content: params.system });
  for (const m of params.messages) allMessages.push({ role: m.role, content: m.content });

  if (allMessages.length === 0) {
    const err = new Error('Lovable AI request invalid: empty messages array') as any;
    err.status = 400;
    err.body = 'empty_messages';
    throw err;
  }

  const invalidMessage = allMessages.find((m) =>
    !['system', 'user', 'assistant'].includes(m.role) ||
    typeof m.content !== 'string' ||
    m.content.trim().length === 0
  );
  if (invalidMessage) {
    const err = new Error('Lovable AI request invalid: messages must have role system/user/assistant and non-empty string content') as any;
    err.status = 400;
    err.body = 'invalid_messages';
    throw err;
  }

  const body: Record<string, unknown> = {
    model: params.model || 'google/gemini-2.5-flash',
    messages: allMessages,
    max_tokens: params.max_tokens || 1024,
    temperature: params.temperature,
  };
  if (params.response_format) body.response_format = params.response_format;

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Lovable-API-Key': apiKey,
      'X-Lovable-AIG-SDK': 'classic-edge-fetch',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  if (params.signal) fetchOptions.signal = params.signal;

  // Safe pre-flight debug (no keys, no user content).
  const firstMsg = allMessages[0];
  console.log('[lovable-ai] request', {
    endpoint: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    model: body.model,
    hasMessages: allMessages.length > 0,
    messageCount: allMessages.length,
    firstMessageRole: firstMsg?.role ?? null,
    firstMessageContentLength: typeof firstMsg?.content === 'string' ? firstMsg.content.length : 0,
    hasApiKey: !!apiKey,
  });

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[lovable-ai] HTTP ${response.status}:`, errorText);
    let reason = errorText;
    const lowerErrorText = errorText.toLowerCase();
    if (response.status === 403 && lowerErrorText.includes('credit_limit_reached')) {
      reason = `Workspace AI credit limit reached (403). Ask the workspace owner to increase the AI credit limit or add credits. Upstream: ${errorText}`;
    } else if (response.status === 401 || response.status === 403) {
      reason = `Unauthorized (${response.status}) — LOVABLE_API_KEY rejected by gateway. Rotate the key and redeploy edge functions. Upstream: ${errorText}`;
    } else if (response.status === 402) {
      reason = `Credits exhausted (402). Add credits in workspace billing. Upstream: ${errorText}`;
    } else if (response.status === 429) {
      reason = `Rate limited (429). Retry with backoff. Upstream: ${errorText}`;
    } else if (response.status === 400) {
      reason = `Bad request (400) — likely invalid model or malformed payload. Upstream: ${errorText}`;
    }
    const err = new Error(`Lovable AI error: ${response.status} - ${reason}`) as any;
    err.status = response.status;
    err.body = errorText;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
