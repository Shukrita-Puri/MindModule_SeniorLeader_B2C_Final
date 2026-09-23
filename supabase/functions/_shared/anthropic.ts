/**
 * Shared AI writing helper (Anthropic Claude + Lovable AI Gateway / Gemini)
 *
 * Centralizes all writing/extraction calls so each edge function just imports
 * callClaude()/callClaudeText()/callAIText().
 * Handles: system prompt extraction, required max_tokens, response parsing, tool calling.
 *
 * PROVIDER SWITCH (2026-09-23)
 * ---------------------------
 * `WRITING_PROVIDER` selects the active provider: "gemini" (default) or
 * "anthropic". A per-function override is checked first:
 * `WRITING_PROVIDER_<FUNCTION_NAME>` (upper snake case), because env vars are
 * project-wide. Pass `fnName` in the call params to opt into the override.
 *
 * `WRITING_MODEL` sets the gateway model, default google/gemini-3.1-flash-lite.
 *
 * Every Anthropic code path below is intact and re-enabled by flipping
 * WRITING_PROVIDER back to "anthropic". Only the text paths (callClaude without
 * tools, callClaudeText, callAIText) have a Gemini branch; streaming and
 * tool-calling stay Anthropic-only for now and throw a clear error in Gemini
 * mode.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

export const DEFAULT_WRITING_MODEL = 'google/gemini-3.1-flash-lite';

export type WritingProvider = 'gemini' | 'anthropic';

/** The gateway model used whenever the active provider is Gemini. */
export function writingModel(): string {
  return (Deno.env.get('WRITING_MODEL') || '').trim() || DEFAULT_WRITING_MODEL;
}

/**
 * Active provider. `WRITING_PROVIDER_<FUNCTION_NAME>` wins over
 * `WRITING_PROVIDER`; default is Gemini.
 */
export function resolveWritingProvider(fnName?: string): WritingProvider {
  const normalize = (v: string | undefined): WritingProvider | null => {
    const s = (v || '').trim().toLowerCase();
    if (s === 'anthropic' || s === 'claude') return 'anthropic';
    if (s === 'gemini' || s === 'lovable') return 'gemini';
    return null;
  };

  if (fnName) {
    const envName = `WRITING_PROVIDER_${fnName.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;
    const perFn = normalize(Deno.env.get(envName));
    if (perFn) return perFn;
  }
  return normalize(Deno.env.get('WRITING_PROVIDER')) ?? 'gemini';
}

// Model mapping for easy reference
export const CLAUDE_MODELS = {
  // Verified against this workspace's `/v1/models` catalog on 2026-06-20.
  // COST POLICY (2026-08-31, two-model consolidation): Haiku 4.5 is the ONLY
  // Claude tier this app may use. The former `SONNET` alias was removed so no
  // call site can request a Sonnet-priced model — the Anthropic bill showed
  // Sonnet usage even though the alias already pointed at Haiku.
  // NOTE: ignored while WRITING_PROVIDER=gemini (WRITING_MODEL applies instead).
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
  /**
   * Per-user / per-request system content that must NOT be part of the cached
   * prefix. Sent as a second, uncached system block AFTER the cached `system`
   * block so the stable prefix stays byte-identical across users and the
   * ephemeral cache actually hits. Ignored when caching is off.
   */
  systemUncachedSuffix?: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  cacheSystemPrompt?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: { type: string; function?: { name: string } };
  signal?: AbortSignal;
  response_format?: { type: string };
  /**
   * Calling function's name, e.g. "generate-energy-insight". Enables the
   * per-function provider override WRITING_PROVIDER_<FUNCTION_NAME>.
   */
  fnName?: string;
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
  uncachedSuffix?: string,
): string | Array<Record<string, unknown>> | undefined {
  const suffix = uncachedSuffix?.trim() ? uncachedSuffix : '';
  if (!system) return suffix || undefined;
  if (!shouldCacheSystemPrompt(system, cache)) {
    return suffix ? `${system}${suffix}` : system;
  }
  const blocks: Array<Record<string, unknown>> = [{
    type: 'text',
    text: system,
    cache_control: { type: 'ephemeral' },
  }];
  // Trailing, per-request block stays OUTSIDE the cached prefix.
  if (suffix) blocks.push({ type: 'text', text: suffix });
  return blocks;
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
 * Fold a trailing assistant prefill (e.g. `{`) into the last user message,
 * since the gateway has no prefill concept.
 */
function foldAssistantPrefill(messages: ClaudeMessage[]): ClaudeMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return messages;

  const out = messages.slice(0, -1);
  const prefill = (last.content || '').trim();
  if (!prefill) return out;

  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user') {
      out[i] = {
        role: 'user',
        content:
          `${out[i].content}\n\nBegin your reply with exactly: ${prefill}`,
      };
      return out;
    }
  }
  return [...out, { role: 'user', content: `Begin your reply with exactly: ${prefill}` }];
}

/**
 * Gemini branch of callClaude: returns the SAME shape Anthropic callers read
 * today (content[0].text, stop_reason).
 */
async function callGeminiAsClaude(params: CallClaudeParams): Promise<ClaudeResponse> {
  const { system, messages } = extractSystem(params.messages, params.system);
  const suffix = params.systemUncachedSuffix?.trim() ? params.systemUncachedSuffix : '';
  const mergedSystem = `${system ?? ''}${suffix}` || undefined;

  const { text, finish_reason, model } = await callGatewayRaw({
    system: mergedSystem,
    messages: foldAssistantPrefill(messages),
    model: writingModel(),
    max_tokens: params.max_tokens,
    temperature: params.temperature,
    response_format: params.response_format,
    signal: params.signal,
  });

  const stop_reason = finish_reason === 'length'
    ? 'max_tokens'
    : finish_reason === 'tool_calls'
    ? 'tool_use'
    : 'end_turn';

  return {
    content: [{ type: 'text', text }],
    stop_reason,
    model,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

/**
 * Non-streaming text call.
 * Returns the raw Anthropic-shaped response object (both providers).
 */
export async function callClaude(params: CallClaudeParams): Promise<ClaudeResponse | ClaudeToolUseResponse> {
  const provider = resolveWritingProvider(params.fnName);

  if (provider === 'gemini') {
    if (params.tools && params.tools.length > 0) {
      throw new Error('Tool calling is not supported in Gemini mode yet');
    }
    return await callGeminiAsClaude(params);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');


  const { system, messages } = extractSystem(params.messages, params.system);
  const anthropicTools = convertTools(params.tools);
  const anthropicToolChoice = convertToolChoice(params.tool_choice);

  const body: Record<string, unknown> = {
    model: params.model || CLAUDE_MODELS.HAIKU,
    max_tokens: params.max_tokens || 1024,
    messages,
  };

  const systemPayload = buildSystemPayload(system, params.cacheSystemPrompt, params.systemUncachedSuffix);
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
  if (resolveWritingProvider(params.fnName) === 'gemini') {
    throw new Error('Tool calling is not supported in Gemini mode yet');
  }
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
  if (resolveWritingProvider(params.fnName) === 'gemini') {
    throw new Error('Streaming is not supported in Gemini mode yet');
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const { system, messages } = extractSystem(params.messages, params.system);

  const body: Record<string, unknown> = {
    model: params.model || CLAUDE_MODELS.HAIKU,
    max_tokens: params.max_tokens || 1024,
    messages,
    stream: true,
  };

  const systemPayload = buildSystemPayload(system, params.cacheSystemPrompt, params.systemUncachedSuffix);
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

/**
 * AI text generation with automatic Gemini fallback.
 * Tries Claude first; if Anthropic key is missing or credits exhausted (401/429),
 * automatically falls back to Lovable AI Gateway (google/gemini-2.5-flash).
 * Use this instead of callClaudeText for all non-critical paths.
 */
export async function callAIText(params: CallClaudeParams): Promise<string> {
  try {
    return await callClaudeText(params);
  } catch (err: any) {
    const status = err?.status ?? err?.statusCode;
    const isKeyIssue = err?.message?.includes('ANTHROPIC_API_KEY') || 
                       err?.message?.includes('not configured');
    const rawBody = `${err?.body ?? ''} ${err?.message ?? ''}`.toLowerCase();
    // Anthropic returns HTTP 400 (not 402) when the account balance is empty.
    const isBalanceError = rawBody.includes('credit balance is too low') ||
                           rawBody.includes('billing');
    const isCreditsIssue = status === 401 || status === 429 || status === 402 ||
                           (status === 400 && isBalanceError) || isBalanceError;
    
    if (isKeyIssue || isCreditsIssue) {
      console.warn('[anthropic] ⚠️ Claude unavailable, falling back to Gemini:', 
        isKeyIssue ? 'API key missing' : `HTTP ${status}`);
      return await callLovableAIText({
        system: `${params.system ?? ''}${params.systemUncachedSuffix ?? ''}` || undefined,
        messages: params.messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        response_format: params.response_format,
        signal: params.signal,
      });
    }
    throw err;
  }
}

