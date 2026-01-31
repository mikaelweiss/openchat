# Tool Calling Reference Guide

**Last Updated:** January 30, 2026

This document provides a comprehensive reference for implementing tool calling (function calling) across all AI provider APIs supported by Open Chat.

---

## Table of Contents

1. [Overview](#overview)
2. [Current Implementation Status](#current-implementation-status)
3. [Provider-Specific Implementations](#provider-specific-implementations)
   - [Anthropic Claude](#anthropic-claude)
   - [OpenAI](#openai)
   - [Ollama](#ollama)
   - [Google AI (Gemini)](#google-ai-gemini)
   - [Cohere](#cohere)
   - [Other OpenAI-Compatible](#other-openai-compatible-providers)
4. [Critical Issues & Required Fixes](#critical-issues--required-fixes)
5. [Improvement Recommendations](#improvement-recommendations)
6. [References](#references)

---

## Overview

Tool calling (also known as function calling) enables AI models to invoke external functions during conversation. This allows models to:
- Search the web for current information
- Query databases
- Perform calculations
- Call APIs
- Access real-time data

### Current Tools Implemented
- **Web Search** (`web_search`): Search the web using Tavily, Google, Bing, DuckDuckGo, or Brave

---

## Current Implementation Status

### ✅ Working
- Tool definition schema
- OpenAI-compatible format implementation
- Tool execution service
- Multi-turn conversation loop
- Search engine integrations (5 engines)

### ❌ Broken
- **Anthropic Claude**: Response parsing is INCORRECT
  - Current code expects `data.tool_calls` which doesn't exist
  - Anthropic returns tool use in `content` array blocks
- **Stop reason handling**: Not properly checking Anthropic's `stop_reason`
- **Tool result format**: Anthropic uses different format than OpenAI

### ⚠️ Partially Implemented
- Non-streaming only (no streaming support for tool calls)
- Limited to models marked with `tools: true` capability
- No parallel tool execution optimization
- No tool choice control

---

## Provider-Specific Implementations

### Anthropic Claude

**Endpoint:** `https://api.anthropic.com/v1/messages`

**Authentication:**
```typescript
headers: {
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true'
}
```

**Tool Definition Format:**
```typescript
{
  name: 'web_search',
  description: 'Search the web for current information...',
  input_schema: {  // Note: "input_schema", NOT "parameters"
    type: 'object',
    properties: {
      query: { type: 'string', description: '...' },
      topK: { type: 'number', minimum: 1, maximum: 10 }
    },
    required: ['query']
  }
}
```

**Request Format:**
```typescript
{
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'What is the weather in SF?' }
  ],
  tools: [/* tool definitions */]
}
```

**Response Format (Tool Use):**
```typescript
{
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_123',
      name: 'web_search',
      input: { query: 'weather San Francisco' }
    }
  ],
  stop_reason: 'tool_use',  // CRITICAL: Check this!
  usage: { input_tokens: 100, output_tokens: 50 }
}
```

**Tool Result Format:**
```typescript
{
  role: 'user',  // Tool results MUST be sent as user messages!
  content: [
    {
      type: 'tool_result',
      tool_use_id: 'toolu_123',  // Must match the tool_use id
      content: 'Search results here...'
    }
  ]
}
```

**Multi-Turn Flow:**
```typescript
// 1. Initial request with tools
const response1 = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [webSearchTool]
})

// 2. Check stop_reason
if (response1.stop_reason === 'tool_use') {
  // 3. Extract tool use block
  const toolUse = response1.content.find(block => block.type === 'tool_use')

  // 4. Execute tool
  const result = await executeWebSearch(toolUse.input)

  // 5. Send tool result back (FULL conversation history!)
  const response2 = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'What is the weather?' },
      { role: 'assistant', content: response1.content },  // Original response
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        }]
      }
    ],
    tools: [webSearchTool]
  })

  // 6. Get final answer
  const finalAnswer = response2.content.find(block => block.type === 'text')?.text
}
```

**Key Differences from OpenAI:**
1. Uses `input_schema` instead of `parameters`
2. Tool use is in `content` array, not separate `tool_calls` field
3. Tool results must be sent as `user` role messages
4. Must include `stop_reason` check
5. Must send entire conversation history on each turn

---

### OpenAI

**Endpoint:** `https://api.openai.com/v1/chat/completions`

**Authentication:**
```typescript
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json'
}
```

**Tool Definition Format:**
```typescript
{
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for current information...',
    parameters: {  // Note: "parameters", NOT "input_schema"
      type: 'object',
      properties: {
        query: { type: 'string', description: '...' },
        topK: { type: 'number', minimum: 1, maximum: 10 }
      },
      required: ['query']
    },
    strict: true  // Optional: Enable strict mode for structured outputs
  }
}
```

**Request Format:**
```typescript
{
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'What is the weather in SF?' }
  ],
  tools: [/* tool definitions */],
  tool_choice: 'auto'  // 'auto' | 'none' | { type: 'function', function: { name: 'web_search' } }
}
```

**Response Format (Tool Call):**
```typescript
{
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1234567890,
  model: 'gpt-4o',
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'web_search',
            arguments: '{"query":"weather San Francisco"}'  // JSON string!
          }
        }
      ]
    },
    finish_reason: 'tool_calls'  // Check this!
  }]
}
```

**Tool Result Format:**
```typescript
{
  role: 'tool',  // Special 'tool' role for results
  name: 'web_search',
  content: 'Search results here...',
  tool_call_id: 'call_123'  // Must match the tool call id
}
```

**Multi-Turn Flow:**
```typescript
// 1. Initial request with tools
const response1 = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [webSearchTool]
})

// 2. Check finish_reason
if (response1.choices[0].finish_reason === 'tool_calls') {
  const toolCalls = response1.choices[0].message.tool_calls

  // 3. Execute all tool calls (can be parallel!)
  const toolResults = await Promise.all(
    toolCalls.map(async (tc) => {
      const args = JSON.parse(tc.function.arguments)
      const result = await executeWebSearch(args)
      return {
        role: 'tool',
        name: tc.function.name,
        content: result,
        tool_call_id: tc.id
      }
    })
  )

  // 4. Send tool results back
  const response2 = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: 'What is the weather?' },
      response1.choices[0].message,  // Assistant message with tool_calls
      ...toolResults  // Tool result messages
    ],
    tools: [webSearchTool]
  })

  // 5. Get final answer
  const finalAnswer = response2.choices[0].message.content
}
```

**Key Features:**
- Supports parallel tool calls (multiple tools in one response)
- `tool_choice` parameter for controlling when tools are used
- `strict` mode for enforced schema compliance
- Streaming support with tool calls (complex implementation)

---

### Ollama

**Endpoint:** `http://localhost:11434/api/chat`

**Authentication:** None (local)

**Format:** Uses OpenAI-compatible format with some differences

**Tool Definition Format:**
```typescript
// Same as OpenAI
{
  type: 'function',
  function: {
    name: 'web_search',
    description: '...',
    parameters: { /* JSON Schema */ }
  }
}
```

**Request Format:**
```typescript
{
  model: 'llama3.2',
  messages: [/* OpenAI format */],
  tools: [/* tool definitions */],
  stream: false  // Tool calling works better without streaming
}
```

**Response Format:**
```typescript
// Similar to OpenAI, but check model capabilities first!
{
  message: {
    role: 'assistant',
    content: '',
    tool_calls: [/* if model supports tools */]
  }
}
```

**Supported Models:**
- ✅ Llama 3.2, 3.1
- ✅ Mistral/Mixtral
- ✅ Qwen2-VL
- ✅ Dolphin
- ✅ Granite
- ✅ Nous Hermes
- ❌ Llama 3 (base)
- ❌ Phi-3, Gemma, Code Llama (no tool support)

**Important Notes:**
- Not all Ollama models support function calling
- Must check model capabilities before enabling tools
- Use `/api/tags` endpoint to list available models
- Tool calling quality varies by model

---

### Google AI (Gemini)

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

**Authentication:**
```typescript
// Query parameter, NOT header!
url = `${endpoint}?key=${apiKey}`
```

**Tool Definition Format:**
```typescript
{
  functionDeclarations: [  // Note: different structure!
    {
      name: 'web_search',
      description: '...',
      parameters: {  // Standard JSON Schema
        type: 'object',
        properties: { /* ... */ },
        required: ['query']
      }
    }
  ]
}
```

**Request Format:**
```typescript
{
  contents: [  // Not "messages"!
    {
      role: 'user',
      parts: [{ text: 'What is the weather?' }]
    }
  ],
  tools: {  // Wrapped in "tools" object
    functionDeclarations: [/* tool definitions */]
  }
}
```

**Response Format:**
```typescript
{
  candidates: [{
    content: {
      role: 'model',
      parts: [
        {
          functionCall: {  // Tool call format
            name: 'web_search',
            args: { query: 'weather' }  // Already parsed!
          }
        }
      ]
    },
    finishReason: 'STOP'
  }]
}
```

**Tool Result Format:**
```typescript
{
  role: 'function',  // Special role for tool results
  parts: [{
    functionResponse: {
      name: 'web_search',
      response: {  // Wrapped in response object
        result: 'Search results...'
      }
    }
  }]
}
```

**Key Differences:**
1. Uses `contents` instead of `messages`
2. Uses `parts` array for message content
3. Tool definitions in `functionDeclarations`
4. Arguments are pre-parsed (not JSON string)
5. API key in query parameter
6. Different role names (`model` instead of `assistant`)

---

### Cohere

**Endpoint:** `https://api.cohere.ai/v2/chat`

**Authentication:**
```typescript
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json'
}
```

**Tool Definition Format:**
```typescript
{
  name: 'web_search',
  description: '...',
  parameter_definitions: {  // Note: "parameter_definitions"!
    query: {
      description: '...',
      type: 'string',
      required: true
    },
    topK: {
      description: '...',
      type: 'number',
      required: false
    }
  }
}
```

**Request Format:**
```typescript
{
  model: 'command-r-plus',
  message: 'What is the weather?',  // Single message string
  chat_history: [  // Previous messages
    { role: 'USER', message: '...' },
    { role: 'CHATBOT', message: '...' }
  ],
  tools: [/* tool definitions */]
}
```

**Response Format:**
```typescript
{
  text: '',
  tool_calls: [
    {
      name: 'web_search',
      parameters: { query: 'weather' }  // Already parsed
    }
  ],
  finish_reason: 'TOOL_CALL'
}
```

**Key Differences:**
1. Uses `message` for current turn, `chat_history` for context
2. Different role names: `USER` and `CHATBOT`
3. Uses `parameter_definitions` instead of `parameters`
4. Parameters are already parsed (not JSON string)
5. V2 API has different structure than V1

---

### Other OpenAI-Compatible Providers

These providers typically follow OpenAI's format:

- **Deep Infra** (`https://api.deepinfra.com/v1/openai/chat/completions`)
- **Together AI** (`https://api.together.xyz/v1/chat/completions`)
- **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`)
- **Groq** (`https://api.groq.com/openai/v1/chat/completions`)
- **Perplexity** (`https://api.perplexity.ai/chat/completions`)

All use:
- Bearer token authentication
- OpenAI's `messages` format
- `tools` array with `function` type
- Standard `tool_calls` response format

**Note:** Not all models on these platforms support function calling!

---

## Critical Issues & Required Fixes

### 🔴 CRITICAL: Fix Anthropic Response Parsing

**Location:** `src/services/functionCallingService.ts:217-222`

**Current Code (BROKEN):**
```typescript
if (isAnthropic) {
  // Anthropic format
  return {
    content: data.content?.[0]?.text || '',
    tool_calls: data.tool_calls  // ❌ WRONG! This doesn't exist!
  }
}
```

**Fixed Code:**
```typescript
if (isAnthropic) {
  // Anthropic format - tool use is in content array
  const textContent = data.content
    ?.filter(block => block.type === 'text')
    .map(block => block.text)
    .join('') || ''

  // Check if there are tool use blocks
  const toolUseBlocks = data.content?.filter(block => block.type === 'tool_use') || []

  if (toolUseBlocks.length > 0 && data.stop_reason === 'tool_use') {
    // Convert Anthropic tool_use format to OpenAI tool_calls format
    return {
      content: textContent,
      tool_calls: toolUseBlocks.map(block => ({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)  // Convert to JSON string
        }
      }))
    }
  }

  return {
    content: textContent,
    tool_calls: undefined
  }
}
```

### 🔴 CRITICAL: Fix Tool Result Message Format for Anthropic

**Location:** `src/services/functionCallingService.ts:106-114`

**Current Code (WRONG FOR ANTHROPIC):**
```typescript
// Add tool results to messages
for (const result of toolResults) {
  currentMessages.push({
    role: 'tool',  // ❌ Anthropic doesn't support 'tool' role!
    content: result.content,
    tool_call_id: result.tool_call_id,
    name: result.name
  })
}
```

**Fixed Code:**
```typescript
// Add tool results to messages (format depends on provider)
if (modelConfig.endpoint.includes('anthropic.com')) {
  // Anthropic: tool results must be user messages with tool_result blocks
  currentMessages.push({
    role: 'user',
    content: toolResults.map(result => ({
      type: 'tool_result',
      tool_use_id: result.tool_call_id,
      content: result.content
    }))
  })
} else {
  // OpenAI/others: standard tool role messages
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

### 🔴 CRITICAL: Fix Message Format Conversion for Anthropic

**Location:** `src/services/functionCallingService.ts:165-181`

**Issue:** Sending OpenAI-format messages to Anthropic API

**Solution:** Convert message format before sending to Anthropic:
```typescript
// Convert OpenAI messages to Anthropic format if needed
let apiMessages = messages
if (isAnthropic) {
  apiMessages = messages.map(msg => {
    // Handle tool messages specially
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

    // Handle assistant messages with tool_calls
    if (msg.role === 'assistant' && msg.tool_calls) {
      return {
        role: 'assistant',
        content: msg.tool_calls.map(tc => {
          const args = JSON.parse(tc.function.arguments)
          return {
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: args
          }
        })
      }
    }

    // Standard text messages
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: [{ type: 'text', text: msg.content }]
      }
    }

    return msg
  })
}
```

### ⚠️ Add Support for Other Providers

**Needed:**
1. Google AI (Gemini) format conversion
2. Cohere format conversion
3. Provider detection logic
4. Proper endpoint routing

---

## Improvement Recommendations

### 1. Streaming Support for Tool Calls

**Current:** No streaming during tool execution

**Recommended:**
- Show "Searching..." progress indicator
- Stream tool results as they arrive
- Handle partial JSON parsing for streamed tool calls

### 2. Parallel Tool Execution

**Current:** Tools executed sequentially

**Recommended:**
```typescript
// Execute all tool calls in parallel
const toolResults = await Promise.all(
  toolCalls.map(tc => toolService.executeToolCall(tc))
)
```

### 3. Tool Choice Control

**Add parameter:**
```typescript
interface ModelConfig {
  // ... existing fields
  toolChoice?: 'auto' | 'none' | 'required' | { name: string }
}
```

### 4. Better Error Handling

**Add:**
- Tool execution timeouts
- Retry logic for failed searches
- Graceful degradation if tool fails
- Error messages back to model

### 5. Tool Result Caching

**Implement:**
- Cache search results by query
- Avoid duplicate searches in same conversation
- Configurable cache TTL

### 6. Model Capability Detection

**Improve:**
- Auto-detect tool support per model
- Warn user if model doesn't support tools
- Fallback to prompt-based search if no tool support

### 7. Multiple Tool Support

**Prepare for:**
- Calculator tool
- Code execution tool
- Database query tool
- File system access tool

**Architecture:**
```typescript
interface Tool {
  name: string
  description: string
  execute: (args: any) => Promise<string>
  schema: JSONSchema
}

class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool) {
    this.tools.set(tool.name, tool)
  }

  getAvailable(): Tool[] {
    return Array.from(this.tools.values())
  }

  execute(name: string, args: any): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Tool not found: ${name}`)
    return tool.execute(args)
  }
}
```

### 8. Better Type Safety

**Use discriminated unions:**
```typescript
type ProviderMessage =
  | AnthropicMessage
  | OpenAIMessage
  | GeminiMessage
  | CohereMessage

type ProviderResponse =
  | { provider: 'anthropic', data: AnthropicResponse }
  | { provider: 'openai', data: OpenAIResponse }
  | { provider: 'gemini', data: GeminiResponse }
```

### 9. Tool Call Observability

**Add:**
- Log all tool executions
- Track tool success/failure rates
- Monitor search quality
- Debug UI for tool calls

### 10. Cost Tracking

**Implement:**
- Count tokens used in tool calls
- Track API costs per tool
- Budget limits for expensive operations

---

## References

### Official Documentation

- **Anthropic Tool Use:** https://docs.anthropic.com/claude/docs/tool-use
- **OpenAI Function Calling:** https://platform.openai.com/docs/guides/function-calling
- **Ollama API:** https://github.com/ollama/ollama/blob/main/docs/api.md
- **Google AI:** https://ai.google.dev/api/generate-content#function-calling
- **Cohere Tools:** https://docs.cohere.com/docs/tool-use

### SDK Documentation

- **Anthropic TypeScript SDK:** https://github.com/anthropics/anthropic-sdk-typescript
- **OpenAI Node SDK:** https://github.com/openai/openai-node
- **Google Generative AI:** https://github.com/google/generative-ai-js

### Related Files in Codebase

- `src/services/functionCallingService.ts` - Main function calling logic
- `src/services/toolService.ts` - Tool execution and registry
- `src/types/search.ts` - Search tool types and schemas
- `src/stores/searchStore.ts` - Search engine configuration
- `src-tauri/src/search.rs` - Backend search implementation
- `src/services/modelsService.ts` - Model capability detection

---

**Document Version:** 1.0
**Authors:** Tool Calling Implementation Team
**Status:** Active Reference
