import { toolService } from './toolService'
import { type CreateMessageInput } from '../shared/messageStore'
import { convertToolsToAnthropicFormat } from '../types/search'
import { httpFetch } from '../utils/httpClient'
import { isNativeOllamaEndpoint } from '../utils/providerEndpoints'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{
    type: 'text' | 'image_url' | 'document'
    text?: string
    image_url?: { url: string }
    source?: {
      type: string
      media_type: string
      data: string
    }
  }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
  name?: string
}

// Anthropic-specific types
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image' | 'document'
  text?: string
  id?: string
  name?: string
  input?: any
  tool_use_id?: string
  content?: string
  source?: {
    type: string
    media_type: string
    data: string
  }
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface ModelConfig {
  provider: string
  endpoint: string
  model: string
  apiKey?: string
  isLocal?: boolean
  temperature?: number
  maxTokens?: number
  topP?: number
  tools?: Array<{ 
    type: 'function'
    function: {
      name: string
      description: string
      parameters: any
    }
  }> 
}

class FunctionCallingService {
  /**
   * Normalize weird AI citation formats to standard format
   * Handles:
   * - Multiple URLs: [1](url1)(url2) -> [1](url1)
   * - Reference with URL: [text][1](url) -> text[1](url)
   * - Loose URLs: [1] some text (url) -> [1](url)
   */
  private normalizeCitationFormats(content: string, searchResults: Map<number, string>): string {
    let processed = content

    // Fix 1: Convert [text][number](url) to text[number](url)
    processed = processed.replace(
      /\[([^\]]+)\]\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_match, text, num, url) => {
        return `${text}[${num}](${url})`
      }
    )

    // Fix 2: Normalize multiple URLs [1](url1)(url2) -> [1](url1)
    // Keep only the first URL for each citation
    processed = processed.replace(
      /\[(\d+)\]((?:\((https?:\/\/[^\s)]*)\))+)/g,
      (_match, num, _allParens, firstUrl) => {
        if (firstUrl) {
          return `[${num}](${firstUrl})`
        }
        return _match
      }
    )

    // Fix 3: Handle loose URLs that appear after citation markers
    // Pattern: [1] some text (url) -> [1](url) some text
    // We look for [number] followed eventually by (url) on the same line
    processed = processed.replace(
      /\[(\d+)\]([^\n]*?)\((https?:\/\/[^\s)]+)\)/g,
      (_match, num, middle, url) => {
        // If there's just whitespace or nothing between, keep it simple
        if (middle.trim() === '' || /^\s+$/.test(middle)) {
          return `[${num}](${url})${middle}`
        }
        // If there's text, move the URL to the citation
        return `[${num}](${url})${middle}`
      }
    )

    // Fix 4: Convert reference-style citations [text][number] to text[number](url)
    // This preserves the readable text and makes the citation number clickable
    processed = processed.replace(/\[([^\]]+)\]\[(\d+)\](?!\()/g, (_match, text, num) => {
      const number = parseInt(num)
      const url = searchResults.get(number)
      if (url) {
        return `${text}[${number}](${url})`
      }
      return _match // Leave unchanged if no URL found
    })

    // Fix 5: Remove orphaned reference definitions at the end (just numbers on their own lines)
    processed = processed.replace(/\n\n\d+\n\d+\n\d+[\n\d]*$/g, '')

    return processed
  }

  /**
   * Execute a complete function calling loop with a model
   */
  async executeWithFunctionCalling({
    messages,
    modelConfig,
    maxToolCalls = 3,
    onStreamChunk,
    onSearchQuery,
    signal
  }: {
    messages: OpenAIMessage[]
    modelConfig: ModelConfig
    maxToolCalls?: number
    onStreamChunk?: (content: string) => void
    onSearchQuery?: (query: string) => void
    signal?: AbortSignal
  }): Promise<CreateMessageInput> {
    let currentMessages = [...messages]
    let toolCallCount = 0
    let finalContent = ''
    const searchResultUrls = new Map<number, string>() // Track URLs for citation post-processing
    const searchQueries: Array<{ query: string; timestamp: number }> = [] // Track search queries

    while (toolCallCount < maxToolCalls) {
      const response = await this.callModel({
        messages: currentMessages,
        modelConfig,
        signal
      })

      // Check if the response contains tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        toolCallCount++

        // Add assistant message with tool calls
        currentMessages.push({
          role: 'assistant',
          content: response.content || undefined,
          tool_calls: response.tool_calls
        })

        // Track search queries for display (dropdown will show these after completion)
        for (const tc of response.tool_calls) {
          if (tc.function.name === 'web_search') {
            try {
              const args = JSON.parse(tc.function.arguments)
              const query = args.query || 'unknown'
              searchQueries.push({ query, timestamp: Date.now() })
              // Notify the UI immediately so we can show it during streaming
              onSearchQuery?.(query)
            } catch {
              searchQueries.push({ query: 'unknown', timestamp: Date.now() })
              onSearchQuery?.('unknown')
            }
          }
        }

        // Execute tool calls
        console.log('Executing tool calls:', response.tool_calls)
        const toolResults = await toolService.executeToolCalls(
          response.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: tc.function
          }))
        )

        console.log('Tool results:', toolResults)

        // Extract URLs from web search results for citation post-processing
        for (const result of toolResults) {
          if (result.name === 'web_search') {
            try {
              // Parse the formatted search results to extract URLs
              const urlMatches = result.content.matchAll(/\*\*Result (\d+):\*\*[\s\S]*?\*\*URL:\*\* (https?:\/\/[^\s\n]+)/g)
              for (const match of urlMatches) {
                searchResultUrls.set(parseInt(match[1]), match[2])
              }
            } catch (error) {
              console.error('Failed to extract search URLs:', error)
            }
          }
        }

        // Add tool results to messages in OpenAI format
        // The conversion to provider-specific format happens in callModel()
        for (const result of toolResults) {
          currentMessages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.tool_call_id,
            name: result.name
          })
        }

        console.log('Messages after tool execution:', currentMessages.slice(-3)) // Show last 3 messages

        // Continue the loop to get the final response
        continue
      } else {
        // No tool calls, this is the final response - use streaming!
        finalContent = await this.callModelWithStreaming({
          messages: currentMessages,
          modelConfig,
          onStreamChunk,
          signal
        })
        break
      }
    }

    // If we exited the loop due to hitting max tool calls without getting a final response,
    // make one final call to get the model's answer (without allowing more tool calls)
    // Use streaming for better UX
    if (!finalContent && toolCallCount >= maxToolCalls) {
      console.log('Hit max tool calls, requesting final response without tools')
      const configWithoutTools = { ...modelConfig, tools: undefined }
      finalContent = await this.callModelWithStreaming({
        messages: currentMessages,
        modelConfig: configWithoutTools,
        onStreamChunk,
        signal
      })
    }

    // Post-process content to normalize weird citation formats
    if (searchResultUrls.size > 0 && finalContent) {
      finalContent = this.normalizeCitationFormats(finalContent, searchResultUrls)
    }

    // Return the final assistant message
    return {
      role: 'assistant',
      text: finalContent,
      processing_time_ms: Date.now(),
      provider: modelConfig.provider,
      model: modelConfig.model,
      metadata: searchQueries.length > 0 ? { searchQueries } : undefined
    }
  }

  /**
   * Convert OpenAI-format messages to Anthropic format
   */
  private convertToAnthropicMessages(messages: OpenAIMessage[]): AnthropicMessage[] {
    return messages.map(msg => {
      // Tool result messages (OpenAI 'tool' role -> Anthropic user message with tool_result)
      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: msg.tool_call_id || '',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          }]
        }
      }

      // Assistant messages with tool calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        const contentBlocks: AnthropicContentBlock[] = []

        // Add text content if exists
        if (msg.content) {
          const textContent = typeof msg.content === 'string' ? msg.content : ''
          if (textContent) {
            contentBlocks.push({ type: 'text', text: textContent })
          }
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
          role: 'assistant' as const,
          content: contentBlocks
        }
      }

      // Regular text messages
      if (typeof msg.content === 'string') {
        // Skip messages with empty content (Anthropic rejects them)
        if (!msg.content.trim()) {
          return null as any // Will be filtered out
        }

        // Anthropic doesn't support system role in messages array
        // System prompts should be sent via the 'system' parameter
        return {
          role: (msg.role === 'system' ? 'user' : msg.role) as 'user' | 'assistant',
          content: [{ type: 'text', text: msg.content }]
        }
      }

      // Multimodal content (images, documents, etc.)
      if (Array.isArray(msg.content)) {
        const anthropicBlocks: AnthropicContentBlock[] = msg.content.map(block => {
          if (block.type === 'text' && block.text) {
            return { type: 'text' as const, text: block.text }
          }
          // Handle image_url type (OpenAI format -> Anthropic format)
          if (block.type === 'image_url' && block.image_url) {
            // Extract base64 data from data URL
            const url = block.image_url.url
            if (url.startsWith('data:')) {
              const [mimeType, base64] = url.split(',')[1] ? [url.split(';')[0].split(':')[1], url.split(',')[1]] : ['image/png', url.split(',')[1]]
              return {
                type: 'image' as const,
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64
                }
              }
            }
          }
          // Handle document type (PDFs and other files)
          if (block.type === 'document' && block.source) {
            return {
              type: 'document' as const,
              source: block.source
            }
          }
          // Fallback for unknown types
          console.warn('Unknown content block type in Anthropic conversion:', block)
          return { type: 'text' as const, text: '' }
        }).filter(block => block.type !== 'text' || block.text !== '') // Remove empty text blocks

        return {
          role: msg.role as 'user' | 'assistant',
          content: anthropicBlocks
        }
      }

      // Fallback - return null to filter out invalid messages
      console.warn('Unhandled message format in Anthropic conversion:', msg)
      return null as any
    }).filter(msg => msg !== null) // Remove null entries
  }

  /**
   * Make a single API call to the model
   */
  private async callModel({
    messages,
    modelConfig,
    signal
  }: { 
    messages: OpenAIMessage[]
    modelConfig: ModelConfig
    signal?: AbortSignal
  }): Promise<{ 
    content?: string
    tool_calls?: Array<{ 
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }
    }> 
  }> {
    const isAnthropic = modelConfig.endpoint.includes('anthropic.com')
    const isGemini = modelConfig.endpoint.includes('generativelanguage.googleapis.com')

    // Convert messages to provider-specific format
    let apiMessages: any = messages
    let anthropicTools: any[] | undefined
    let anthropicSystemPrompt: string | undefined

    if (isAnthropic) {
      // Extract system messages before conversion
      const systemMessages = messages.filter(m => m.role === 'system')
      const nonSystemMessages = messages.filter(m => m.role !== 'system')

      // Combine all system message content
      if (systemMessages.length > 0) {
        anthropicSystemPrompt = systemMessages
          .map(m => typeof m.content === 'string' ? m.content : '')
          .filter(Boolean)
          .join('\n\n')
      }

      apiMessages = this.convertToAnthropicMessages(nonSystemMessages)

      // Convert tools to Anthropic format using the proper conversion function
      // This handles web_search tools specially (native Anthropic format)
      if (modelConfig.tools && modelConfig.tools.length > 0) {
        anthropicTools = convertToolsToAnthropicFormat(modelConfig.tools)
      }
    }

    // Build request payload
    const requestPayload = isAnthropic ? {
      model: modelConfig.model,
      messages: apiMessages,
      stream: false, // Function calling is easier with non-streaming for now
      max_tokens: modelConfig.maxTokens || 1024,
      ...(anthropicSystemPrompt && { system: anthropicSystemPrompt }),
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(anthropicTools && anthropicTools.length > 0 && {
        tools: anthropicTools,
        tool_choice: { type: "any" } // Force model to use at least one tool when tools are provided
      }),
    } : {
      model: modelConfig.model,
      messages: apiMessages,
      stream: false,
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.maxTokens !== undefined && { max_tokens: modelConfig.maxTokens }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(modelConfig.tools && modelConfig.tools.length > 0 && {
        tools: modelConfig.tools,
        // Only add tool_choice for OpenAI (Gemini doesn't support this parameter)
        ...(!isGemini && { tool_choice: "required" })
      }),
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Add authentication based on provider
    if (!modelConfig.isLocal && modelConfig.apiKey) {
      if (isAnthropic) {
        headers['x-api-key'] = modelConfig.apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else {
        headers['Authorization'] = `Bearer ${modelConfig.apiKey}`
      }
    }

    // Build endpoint URL
    const chatEndpoint = this.buildChatEndpoint(modelConfig.endpoint)

    // Make the API call (using Tauri HTTP plugin to bypass CORS)
    const response = await httpFetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      signal
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    // Parse response based on provider
    if (isAnthropic) {
      // Anthropic format - tool use is in content array, not separate field
      const contentBlocks = data.content || []

      // Extract text content from text blocks
      const textBlocks = contentBlocks.filter((block: any) => block.type === 'text')
      const textContent = textBlocks.map((block: any) => block.text).join('') || ''

      // Extract tool use blocks
      const toolUseBlocks = contentBlocks.filter((block: any) => block.type === 'tool_use')

      // Convert Anthropic tool_use format to OpenAI tool_calls format for internal consistency
      const tool_calls = toolUseBlocks.length > 0 && data.stop_reason === 'tool_use'
        ? toolUseBlocks.map((block: any) => ({
            id: block.id,
            type: 'function' as const,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input) // Convert input object to JSON string
            }
          }))
        : undefined

      console.log('Anthropic response:', {
        stop_reason: data.stop_reason,
        textContent,
        tool_calls,
        raw_content: contentBlocks
      })

      return { content: textContent, tool_calls }
    } else {
      // OpenAI format
      const message = data.choices?.[0]?.message
      return {
        content: message?.content || '',
        tool_calls: message?.tool_calls
      }
    }
  }

  /**
   * Make a streaming API call to the model (for final text response)
   * This is used after all tool calls are complete
   */
  private async callModelWithStreaming({
    messages,
    modelConfig,
    onStreamChunk,
    signal
  }: {
    messages: OpenAIMessage[]
    modelConfig: ModelConfig
    onStreamChunk?: (content: string) => void
    signal?: AbortSignal
  }): Promise<string> {
    const isAnthropic = modelConfig.endpoint.includes('anthropic.com')
    const isGemini = modelConfig.endpoint.includes('generativelanguage.googleapis.com')

    // Convert messages to provider-specific format
    let apiMessages: any = messages
    let anthropicTools: any[] | undefined
    let anthropicSystemPrompt: string | undefined

    if (isAnthropic) {
      // Extract system messages before conversion
      const systemMessages = messages.filter(m => m.role === 'system')
      const nonSystemMessages = messages.filter(m => m.role !== 'system')

      // Combine all system message content
      if (systemMessages.length > 0) {
        anthropicSystemPrompt = systemMessages
          .map(m => typeof m.content === 'string' ? m.content : '')
          .filter(Boolean)
          .join('\n\n')
      }

      apiMessages = this.convertToAnthropicMessages(nonSystemMessages)

      // Convert tools to Anthropic format using the proper conversion function
      // This handles web_search tools specially (native Anthropic format)
      if (modelConfig.tools && modelConfig.tools.length > 0) {
        anthropicTools = convertToolsToAnthropicFormat(modelConfig.tools)
      }
    }

    // Build request payload with streaming enabled
    const requestPayload = isAnthropic ? {
      model: modelConfig.model,
      messages: apiMessages,
      stream: true, // Enable streaming for final response
      max_tokens: modelConfig.maxTokens || 1024,
      ...(anthropicSystemPrompt && { system: anthropicSystemPrompt }),
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(anthropicTools && anthropicTools.length > 0 && {
        tools: anthropicTools,
        tool_choice: { type: "any" }
      }),
    } : {
      model: modelConfig.model,
      messages: apiMessages,
      stream: true, // Enable streaming for final response
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.maxTokens !== undefined && { max_tokens: modelConfig.maxTokens }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(modelConfig.tools && modelConfig.tools.length > 0 && {
        tools: modelConfig.tools,
        ...(!isGemini && { tool_choice: "required" })
      }),
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Add authentication based on provider
    if (!modelConfig.isLocal && modelConfig.apiKey) {
      if (isAnthropic) {
        headers['x-api-key'] = modelConfig.apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else {
        headers['Authorization'] = `Bearer ${modelConfig.apiKey}`
      }
    }

    // Build endpoint URL
    const chatEndpoint = this.buildChatEndpoint(modelConfig.endpoint)

    // Make the API call (using Tauri HTTP plugin to bypass CORS)
    const response = await httpFetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      signal
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    // Process streaming response
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body reader available')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue

          let data = line

          // OpenAI and Anthropic use "data: " prefix
          if (line.startsWith('data: ')) {
            data = line.slice(6).trim()
            if (data === '[DONE]') continue
          } else {
            continue // Skip lines that don't start with "data: "
          }

          try {
            const chunk = JSON.parse(data)
            let deltaContent = ''

            if (isAnthropic) {
              // Anthropic streaming format
              if (chunk.type === 'content_block_delta') {
                deltaContent = chunk.delta?.text || ''
              }
            } else {
              // OpenAI streaming format
              deltaContent = chunk.choices?.[0]?.delta?.content || ''
            }

            if (deltaContent) {
              fullContent += deltaContent
              onStreamChunk?.(deltaContent)
            }
          } catch (err) {
            console.warn('Failed to parse streaming chunk:', err, 'Line:', line)
          }
        }
      }

      return fullContent
    } finally {
      reader.releaseLock()
    }
  }

  private buildChatEndpoint(endpoint: string): string {
    // Special case for Anthropic
    if (endpoint.includes('anthropic.com')) {
      return endpoint.endsWith('/v1') ? endpoint + '/messages' : endpoint + '/messages'
    }

    // Special case for Ollama
    if (isNativeOllamaEndpoint(endpoint)) {
      return endpoint.replace('/v1', '') + '/api/chat'
    }

    // For OpenAI-compatible endpoints, ensure /chat/completions suffix
    if (endpoint.endsWith('/chat/completions')) {
      return endpoint
    }

    // Add appropriate suffix
    if (endpoint.endsWith('/v1')) {
      return endpoint + '/chat/completions'
    }

    // Default: append /chat/completions
    return endpoint + '/chat/completions'
  }
}

// Export singleton instance
export const functionCallingService = new FunctionCallingService()