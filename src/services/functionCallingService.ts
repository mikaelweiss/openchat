import { toolService } from './toolService'
import { type CreateMessageInput } from '../shared/messageStore'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | Array<{
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
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
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: any
  tool_use_id?: string
  content?: string
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
   * Execute a complete function calling loop with a model
   */
  async executeWithFunctionCalling({
    messages,
    modelConfig,
    maxToolCalls = 3,
    onStreamChunk,
    signal
  }: { 
    messages: OpenAIMessage[]
    modelConfig: ModelConfig
    maxToolCalls?: number
    onStreamChunk?: (content: string) => void
    signal?: AbortSignal
  }): Promise<CreateMessageInput> {
    let currentMessages = [...messages]
    let toolCallCount = 0
    let finalContent = ''

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

        // Stream tool execution info if needed
        if (onStreamChunk) {
          const toolInfo = response.tool_calls.map(tc => {
            try {
              const args = JSON.parse(tc.function.arguments)
              return `🔍 Searching for: ${args.query || 'information'}`
            } catch {
              return `🔍 Searching...`
            }
          }).join('\n')
          onStreamChunk(toolInfo + '\n\n')
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

        // Add tool results to messages (format depends on provider)
        const isAnthropic = modelConfig.endpoint.includes('anthropic.com')

        if (isAnthropic) {
          // Anthropic: tool results must be user messages with tool_result blocks
          currentMessages.push({
            role: 'user',
            content: toolResults.map(result => ({
              type: 'tool_result',
              tool_use_id: result.tool_call_id,
              content: result.content
            })) as any
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

        console.log('Messages after tool execution:', currentMessages.slice(-3)) // Show last 3 messages

        // Continue the loop to get the final response
        continue
      } else {
        // No tool calls, this is the final response
        finalContent = response.content || ''
        if (onStreamChunk && finalContent) {
          onStreamChunk(finalContent)
        }
        break
      }
    }

    // Return the final assistant message
    return {
      role: 'assistant',
      text: finalContent,
      processing_time_ms: Date.now(),
      provider: modelConfig.provider,
      model: modelConfig.model
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
        // Anthropic doesn't support system role in messages array
        // System prompts should be sent via the 'system' parameter
        return {
          role: (msg.role === 'system' ? 'user' : msg.role) as 'user' | 'assistant',
          content: [{ type: 'text', text: msg.content }]
        }
      }

      // Multimodal content (images, etc.)
      if (Array.isArray(msg.content)) {
        const anthropicBlocks: AnthropicContentBlock[] = msg.content.map(block => {
          if (block.type === 'text' && block.text) {
            return { type: 'text', text: block.text }
          }
          // For now, convert image_url to text description
          // TODO: Proper image support for Anthropic
          return { type: 'text', text: '[Image]' }
        })

        return {
          role: msg.role as 'user' | 'assistant',
          content: anthropicBlocks
        }
      }

      // Fallback
      return {
        role: 'user' as const,
        content: [{ type: 'text', text: '' }]
      }
    })
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

    // Convert messages to provider-specific format
    let apiMessages: any = messages
    let anthropicTools: any[] | undefined

    if (isAnthropic) {
      apiMessages = this.convertToAnthropicMessages(messages)

      // Convert tools to Anthropic format (use input_schema instead of parameters)
      if (modelConfig.tools && modelConfig.tools.length > 0) {
        anthropicTools = modelConfig.tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        }))
      }
    }

    // Build request payload
    const requestPayload = isAnthropic ? {
      model: modelConfig.model,
      messages: apiMessages,
      stream: false, // Function calling is easier with non-streaming for now
      max_tokens: modelConfig.maxTokens || 1024,
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(anthropicTools && anthropicTools.length > 0 && { tools: anthropicTools }),
    } : {
      model: modelConfig.model,
      messages: apiMessages,
      stream: false,
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.maxTokens !== undefined && { max_tokens: modelConfig.maxTokens }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(modelConfig.tools && modelConfig.tools.length > 0 && { tools: modelConfig.tools }),
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

    // Make the API call
    const response = await fetch(chatEndpoint, {
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

  private buildChatEndpoint(endpoint: string): string {
    // Special case for Anthropic
    if (endpoint.includes('anthropic.com')) {
      return endpoint.endsWith('/v1') ? endpoint + '/messages' : endpoint + '/messages'
    }
    
    // Special case for Ollama
    if (endpoint.includes('ollama') || endpoint.includes('11434')) {
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