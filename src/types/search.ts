import { z } from 'zod'

// Search engine types
export type SearchEngineKind = 'tavily' | 'google' | 'bing' | 'duckduckgo' | 'brave'

export type SearchEngineConfig =
  | { kind: 'tavily'; apiKey: string }
  | { kind: 'google'; apiKey: string; cx: string }
  | { kind: 'bing'; apiKey: string }
  | { kind: 'duckduckgo' } // no key required
  | { kind: 'brave'; apiKey: string }

export interface SearchSettings {
  engines: SearchEngineConfig[]
  defaultEngine: SearchEngineKind
  autoDetectNeeded: boolean // search-only auto mode
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  engine: SearchEngineKind
}

// Tool calling types
export interface ToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
}

export interface ToolMessage {
  role: 'tool'
  name: string
  content: string
  tool_call_id?: string
}

// Zod schemas for validation
export const WebSearchInputSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  engine: z.enum(['tavily', 'google', 'bing', 'duckduckgo', 'brave']).optional(),
  topK: z.number().min(1).max(10).default(5).optional(),
})

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>

export interface WebSearchOutput {
  results: SearchResult[]
}

// Tool definition for OpenAI-compatible function calling
export interface WebSearchTool {
  type: 'function'
  function: {
    name: 'web_search'
    description: string
    parameters: {
      type: 'object'
      properties: {
        query: {
          type: 'string'
          description: string
        }
        engine?: {
          type: 'string'
          enum: SearchEngineKind[]
          description: string
        }
        topK?: {
          type: 'number'
          minimum: number
          maximum: number
          description: string
        }
      }
      required: string[]
    }
  }
}

// Intent detection
export function shouldSearch(utterance: string): boolean {
  const q = utterance.toLowerCase()
  if (q.length < 8) return false
  if (/\b(latest|current|today|now|updated|news|price|status|release|changelog)\b/.test(q)) return true
  if (/\b(search|look up|find|docs|api reference|spec|benchmark|what is|who is)\b/.test(q)) return true
  if (/\bwho|what|when|where|why|how\b/.test(q) && /\b(\d{4}|vs|compare|best|top)\b/.test(q)) return true
  return false
}

// Create web search tool definition
export function createWebSearchTool(): WebSearchTool {
  return {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information and real-time data. USE THIS FUNCTION WHEN THE USER ASKS ABOUT RECENT EVENTS, CURRENT INFORMATION, OR FACTS THAT MAY HAVE CHANGED. This includes latest news, current prices, recent releases, updated information, etc. When using search results in your response, ALWAYS cite your sources. Format citations as numbered references like [1](url)',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find information about. Make this specific and focused on the user\'s question.'
          },
          engine: {
            type: 'string',
            enum: ['tavily', 'google', 'bing', 'duckduckgo', 'brave'],
            description: 'Search engine to use (optional, defaults to configured engine)'
          },
          topK: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            description: 'Number of search results to return (default: 5)'
          }
        },
        required: ['query']
      }
    }
  }
}

