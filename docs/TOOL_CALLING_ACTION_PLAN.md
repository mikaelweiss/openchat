# Tool Calling Implementation Action Plan

**Status:** 🔴 CRITICAL FIXES REQUIRED
**Last Updated:** January 30, 2026

## Executive Summary

The current web search tool calling implementation has **critical bugs** that prevent it from working with Anthropic Claude API. The OpenAI-compatible implementation works, but needs improvements.

### What's Broken

1. ❌ **Anthropic response parsing** - Expects non-existent `data.tool_calls` field
2. ❌ **Anthropic tool results** - Uses wrong message format (`tool` role doesn't exist in Anthropic)
3. ❌ **Message format conversion** - Sends OpenAI-format messages to Anthropic API

### What's Working

- ✅ OpenAI function calling
- ✅ Ollama tool calling (OpenAI-compatible models)
- ✅ Tool execution service
- ✅ Search engine integrations

---

## Priority 1: Critical Fixes (MUST DO IMMEDIATELY)

### Fix 1: Anthropic Response Parsing

**File:** `src/services/functionCallingService.ts`
**Line:** 217-222

**Problem:**
```typescript
// CURRENT CODE (WRONG)
if (isAnthropic) {
  return {
    content: data.content?.[0]?.text || '',
    tool_calls: data.tool_calls  // ❌ This field doesn't exist!
  }
}
```

**Solution:**
```typescript
if (isAnthropic) {
  // Extract text content from blocks
  const textBlocks = data.content?.filter(block => block.type === 'text') || []
  const textContent = textBlocks.map(block => block.text).join('') || ''

  // Extract tool use blocks
  const toolUseBlocks = data.content?.filter(block => block.type === 'tool_use') || []

  // Convert to OpenAI format for internal consistency
  const tool_calls = toolUseBlocks.length > 0 && data.stop_reason === 'tool_use'
    ? toolUseBlocks.map(block => ({
        id: block.id,
        type: 'function' as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      }))
    : undefined

  return { content: textContent, tool_calls }
}
```

**Test:** Try a search with Claude after this fix - it should detect tool calls properly.

---

### Fix 2: Anthropic Tool Result Format

**File:** `src/services/functionCallingService.ts`
**Line:** 106-114

**Problem:**
```typescript
// CURRENT CODE (WRONG FOR ANTHROPIC)
for (const result of toolResults) {
  currentMessages.push({
    role: 'tool',  // ❌ Anthropic doesn't support 'tool' role
    content: result.content,
    tool_call_id: result.tool_call_id,
    name: result.name
  })
}
```

**Solution:**
```typescript
// Check provider type
const isAnthropic = modelConfig.endpoint.includes('anthropic.com')

if (isAnthropic) {
  // Anthropic: tool results must be user messages
  currentMessages.push({
    role: 'user',
    content: toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.tool_call_id,
      content: result.content
    }))
  })
} else {
  // OpenAI: standard tool role
  for (const result of toolResults) {
    currentMessages.push({
      role: 'tool',
      content: result.content,
      tool_call_id: result.tool_call_id,
      name: result.name
    })
  }
}
```

**Test:** Send tool results back to Claude - it should process them correctly.

---

### Fix 3: Message Format Conversion

**File:** `src/services/functionCallingService.ts`
**Line:** Before line 165 (in `callModel` method)

**Problem:** OpenAI-format messages sent directly to Anthropic API

**Solution:** Add conversion layer before API call:

```typescript
private async callModel({ messages, modelConfig, signal }: {
  messages: OpenAIMessage[]
  modelConfig: ModelConfig
  signal?: AbortSignal
}): Promise<...> {
  const isAnthropic = modelConfig.endpoint.includes('anthropic.com')

  // Convert messages if needed
  let apiMessages = messages
  if (isAnthropic) {
    apiMessages = this.convertToAnthropicMessages(messages)
  }

  // ... rest of method uses apiMessages
}

private convertToAnthropicMessages(messages: OpenAIMessage[]): any[] {
  return messages.map(msg => {
    // Tool result messages
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content
        }]
      }
    }

    // Assistant messages with tool calls
    if (msg.role === 'assistant' && msg.tool_calls) {
      const contentBlocks: any[] = []

      // Add text content if exists
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content })
      }

      // Add tool use blocks
      msg.tool_calls.forEach(tc => {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments)
        })
      })

      return {
        role: 'assistant',
        content: contentBlocks
      }
    }

    // Regular text messages
    if (typeof msg.content === 'string') {
      return {
        role: msg.role === 'system' ? 'user' : msg.role,  // Anthropic doesn't have system role in messages
        content: [{ type: 'text', text: msg.content }]
      }
    }

    // Array content (multimodal)
    return msg
  })
}
```

**Test:** Full conversation with tool calling should work end-to-end with Claude.

---

## Priority 2: Important Improvements (DO SOON)

### Improvement 1: Add Tool Type Safety

**File:** Create `src/types/toolCalling.ts`

```typescript
// Provider-specific message types
export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: Array<
    | { type: 'text', text: string }
    | { type: 'tool_use', id: string, name: string, input: any }
    | { type: 'tool_result', tool_use_id: string, content: string }
  >
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{ type: string, text?: string, image_url?: any }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string, arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

// Provider response types
export interface AnthropicToolUseResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<
    | { type: 'text', text: string }
    | { type: 'tool_use', id: string, name: string, input: any }
  >
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  usage: { input_tokens: number, output_tokens: number }
}

export interface OpenAIToolCallResponse {
  id: string
  object: 'chat.completion'
  choices: Array<{
    message: {
      role: 'assistant'
      content?: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string, arguments: string }
      }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
}
```

---

### Improvement 2: Better Error Handling

**Add to `toolService.ts`:**

```typescript
async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    // Set timeout for tool execution
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
    )

    const executionPromise = this.executeToolCallInternal(toolCall)

    const result = await Promise.race([executionPromise, timeoutPromise])
    return result

  } catch (error) {
    console.error(`Tool execution failed:`, error)

    // Return error message to model so it can handle gracefully
    return {
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify({
        error: true,
        message: error.message || 'Tool execution failed',
        suggestion: 'Please try rephrasing your question or ask for something else.'
      })
    }
  }
}
```

---

### Improvement 3: Streaming Progress Indicators

**Update `functionCallingService.ts`:**

```typescript
async executeWithFunctionCalling({ ... }): Promise<CreateMessageInput> {
  // ... existing code

  if (response.tool_calls && response.tool_calls.length > 0) {
    // Stream progress for each tool call
    for (const tc of response.tool_calls) {
      if (onStreamChunk) {
        try {
          const args = JSON.parse(tc.function.arguments)
          const query = args.query || 'information'
          onStreamChunk(`\n\n🔍 **Searching for:** ${query}\n\n`)
        } catch {
          onStreamChunk(`\n\n🔍 **Searching...**\n\n`)
        }
      }

      // Execute tool
      const result = await toolService.executeToolCall(tc)

      // Stream result preview
      if (onStreamChunk) {
        const preview = result.content.slice(0, 200)
        onStreamChunk(`✅ **Found results**\n\n`)
      }
    }
  }
}
```

---

## Priority 3: Nice-to-Have Enhancements (DO LATER)

### Enhancement 1: Tool Choice Control

Add `toolChoice` parameter to give users control:

```typescript
interface ModelConfig {
  // ... existing fields
  toolChoice?: 'auto' | 'none' | 'required' | { name: string }
}
```

### Enhancement 2: Parallel Tool Execution

```typescript
// Execute all tools in parallel instead of sequentially
const toolResults = await Promise.all(
  response.tool_calls.map(tc => toolService.executeToolCall(tc))
)
```

### Enhancement 3: Tool Result Caching

```typescript
class ToolCache {
  private cache = new Map<string, { result: string, timestamp: number }>()
  private TTL = 5 * 60 * 1000 // 5 minutes

  get(query: string): string | null {
    const cached = this.cache.get(query)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(query)
      return null
    }

    return cached.result
  }

  set(query: string, result: string): void {
    this.cache.set(query, { result, timestamp: Date.now() })
  }
}
```

### Enhancement 4: Support More Providers

Add implementations for:
- **Google AI (Gemini)** - Different API format
- **Cohere** - Different tool definition format
- **Groq** - OpenAI-compatible
- **Perplexity** - Native search capabilities

---

## Testing Checklist

After implementing fixes, test these scenarios:

### Basic Tool Calling
- [ ] OpenAI GPT-4 with web search
- [ ] Anthropic Claude with web search
- [ ] Ollama Llama 3.2 with web search

### Multi-Turn Conversations
- [ ] Multiple tool calls in one response
- [ ] Tool call followed by follow-up question
- [ ] Tool call that leads to another tool call

### Error Handling
- [ ] Tool execution timeout
- [ ] Invalid search query
- [ ] API key missing
- [ ] Network error during search

### Edge Cases
- [ ] Empty search results
- [ ] Search result with special characters
- [ ] Very long search query
- [ ] Multiple searches in quick succession

---

## Implementation Timeline

### Week 1: Critical Fixes
- Day 1-2: Fix Anthropic response parsing (Fix 1)
- Day 2-3: Fix tool result format (Fix 2)
- Day 3-4: Add message conversion (Fix 3)
- Day 4-5: Test with Claude models

### Week 2: Important Improvements
- Day 1-2: Add type safety (Improvement 1)
- Day 3: Better error handling (Improvement 2)
- Day 4-5: Streaming progress (Improvement 3)

### Week 3: Testing & Polish
- Day 1-3: Comprehensive testing
- Day 4-5: Bug fixes and documentation

### Future: Enhancements
- Tool choice control
- Parallel execution
- Caching
- Additional providers

---

## Success Metrics

### Functional Requirements
- ✅ Web search works with Claude
- ✅ Web search works with OpenAI
- ✅ Web search works with Ollama
- ✅ Multi-turn tool calling works
- ✅ Error handling is graceful

### Performance Requirements
- ⏱️ Tool calls complete within 5 seconds
- ⏱️ No memory leaks in long conversations
- ⏱️ Proper cleanup of resources

### User Experience
- 👍 Clear progress indicators
- 👍 Proper citations in responses
- 👍 Helpful error messages
- 👍 Consistent behavior across providers

---

## References

- See `docs/TOOL_CALLING_REFERENCE.md` for detailed API formats
- Official docs linked in reference guide
- Test with models listed in `src/services/modelsService.ts`

---

**Document Version:** 1.0
**Priority:** 🔴 CRITICAL
**Owner:** Development Team
**Review Date:** Weekly until completed
