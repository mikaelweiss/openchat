import { type CreateMessageInput, messageStore } from '../shared/messageStore'
import { tokenService } from './tokenService'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
  }>
}




export interface ModelConfig {
  provider: string
  endpoint: string
  model: string
  apiKey?: string
  isLocal?: boolean
  temperature?: number
  maxTokens?: number
  topP?: number
  topK?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string[]
  n?: number
  seed?: number
}

export interface SendMessageOptions {
  conversationId: number | 'pending'
  userMessage: CreateMessageInput
  userMessageId?: number
  systemPrompt?: string
  models: ModelConfig[]
  onStreamChunk?: (content: string, modelId: string) => void
  onStreamComplete?: (assistantMessage: CreateMessageInput, modelId: string) => void
  onModelStreamStart?: (modelId: string) => void
  onModelError?: (error: Error, modelId: string) => void
  signal?: AbortSignal
}

class ChatService {
  /**
   * Helper method to create a ModelConfig array from selected models and providers
   */
  createModelConfigs(
    selectedModels: Array<{provider: string, model: string}>,
    providers: Record<string, {endpoint: string, isLocal?: boolean}>,
    apiKeyLookup: (provider: string) => Promise<string | null>,
    options?: {
      temperature?: number
      maxTokens?: number
      topP?: number
      topK?: number
      reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
      frequencyPenalty?: number
      presencePenalty?: number
      stop?: string[]
      n?: number
      seed?: number
    }
  ): Promise<ModelConfig[]> {
    return Promise.all(
      selectedModels.map(async selectedModel => {
        const providerInfo = providers[selectedModel.provider]
        if (!providerInfo) {
          throw new Error(`Provider ${selectedModel.provider} not found`)
        }
        
        const apiKey = await apiKeyLookup(selectedModel.provider)
        
        return {
          provider: selectedModel.provider,
          model: selectedModel.model,
          endpoint: providerInfo.endpoint,
          isLocal: providerInfo.isLocal,
          apiKey: apiKey || undefined,
          ...options
        }
      })
    )
  }

  /**
   * Send a message to an OpenAI-compatible API and handle streaming response
   * 
   * Example usage for multiple models:
   * ```
   * const modelConfigs = await chatService.createModelConfigs(
   *   selectedModels, // Array<{provider: string, model: string}>
   *   providers,      // Record<string, {endpoint: string, isLocal?: boolean}>
   *   getProviderApiKey, // (provider: string) => Promise<string | null>
   *   conversationSettings // Optional settings
   * )
   * 
   * const responses = await chatService.sendMessage({
   *   conversationId,
   *   userMessage,
   *   systemPrompt,
   *   models: modelConfigs,
   *   onStreamChunk: (content: string, modelId: string) => {
   *     console.log(`Model ${modelId}: ${content}`)
   *   },
   *   onStreamComplete: (message: CreateMessageInput, modelId: string) => {
   *     console.log(`Model ${modelId} completed`)
   *   },
   *   onModelStreamStart: (modelId: string) => {
   *     console.log(`Model ${modelId} started`)
   *   },
   *   onModelError: (error: Error, modelId: string) => {
   *     console.error(`Model ${modelId} error:`, error)
   *   }
   * })
   * ```
   */
  async sendMessage({
    conversationId,
    userMessage,
    userMessageId,
    systemPrompt,
    models,
    onStreamChunk,
    onStreamComplete,
    onModelStreamStart,
    onModelError,
    signal
  }: SendMessageOptions): Promise<CreateMessageInput[]> {
    const startTime = Date.now()

    if (!models || models.length === 0) {
      throw new Error('At least one model must be provided')
    }

    return this.sendMessageToMultipleModels({
      conversationId,
      userMessage,
      userMessageId,
      systemPrompt,
      models,
      onStreamChunk,
      onStreamComplete,
      onModelStreamStart,
      onModelError,
      signal,
      startTime
    })
  }

  /**
   * Send a message to multiple models concurrently and handle streaming responses
   */
  private async sendMessageToMultipleModels({
    conversationId,
    userMessage,
    userMessageId,
    systemPrompt,
    models,
    onStreamChunk,
    onStreamComplete,
    onModelStreamStart,
    onModelError,
    signal,
    startTime
  }: {
    conversationId: number | 'pending'
    userMessage: CreateMessageInput
    userMessageId?: number
    systemPrompt?: string
    models: ModelConfig[]
    onStreamChunk?: (content: string, modelId: string) => void
    onStreamComplete?: (assistantMessage: CreateMessageInput, modelId: string) => void
    onModelStreamStart?: (modelId: string) => void
    onModelError?: (error: Error, modelId: string) => void
    signal?: AbortSignal
    startTime: number
  }): Promise<CreateMessageInput[]> {
    
    // Track occurrence count for each model config to disambiguate duplicates
    const modelConfigCounts = new Map<string, number>();
    const modelPromises = models.map(async (modelConfig) => {
      const modelKey = JSON.stringify({ provider: modelConfig.provider, model: modelConfig.model });
      const count = modelConfigCounts.get(modelKey) ?? 0;
      modelConfigCounts.set(modelKey, count + 1);
      // If the same model appears multiple times, append occurrence count
      const modelId = count === 0
        ? `${modelConfig.provider}:${modelConfig.model}`
        : `${modelConfig.provider}:${modelConfig.model}#${count + 1}`;
      
      try {
        onModelStreamStart?.(modelId)
        
        // Create individual abort controller for this model
        const modelAbortController = new AbortController()
        
        // If parent signal is aborted, abort this model too
        if (signal) {
          signal.addEventListener('abort', () => modelAbortController.abort())
        }
        
        const result = await this.sendMessageToSingleModel({
          conversationId,
          userMessage,
          userMessageId,
          systemPrompt,
          modelConfig,
          modelId,
          onStreamChunk,
          onStreamComplete,
          signal: modelAbortController.signal,
          startTime
        })
        
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error')
        onModelError?.(err, modelId)
        
        // Return error message as assistant response for this model
        return {
          role: 'assistant' as const,
          text: `Error from ${modelConfig.provider}/${modelConfig.model}: ${err.message}`,
          processing_time_ms: Date.now() - startTime,
          previous_message_id: userMessageId,
          provider: modelConfig.provider,
          model: modelConfig.model,
          metadata: { error: true, errorMessage: err.message }
        }
      }
    })
    
    // Wait for all models to complete (or error)
    const results = await Promise.allSettled(modelPromises)
    
    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : {
            role: 'assistant' as const,
            text: 'Failed to get response from model',
            processing_time_ms: Date.now() - startTime,
            metadata: { error: true, errorMessage: 'Promise rejected' }
          }
    )
  }

  /**
   * Send a message to a single model (used by multi-model flow)
   */
  private async sendMessageToSingleModel({
    conversationId,
    userMessage,
    userMessageId,
    systemPrompt,
    modelConfig,
    modelId,
    onStreamChunk,
    onStreamComplete,
    signal,
    startTime
  }: {
    conversationId: number | 'pending'
    userMessage: CreateMessageInput
    userMessageId?: number
    systemPrompt?: string
    modelConfig: ModelConfig
    modelId: string
    onStreamChunk?: (content: string, modelId: string) => void
    onStreamComplete?: (assistantMessage: CreateMessageInput, modelId: string) => void
    signal?: AbortSignal
    startTime: number
  }): Promise<CreateMessageInput> {
    
    // Get conversation history (only for persistent conversations)
    const conversationHistory = typeof conversationId === 'number' 
      ? await messageStore.getMessages(conversationId)
      : [] // Pending conversations have no history in database yet
    
    // Detect provider type for proper formatting
    const isAnthropic = modelConfig.endpoint.includes('anthropic.com')
    const isOllama = modelConfig.endpoint.includes('ollama') || modelConfig.endpoint.includes('11434')
    
    // Build provider-compatible messages array
    const messages: OpenAIMessage[] = []
    
    // Add system message if provided
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }

    // Add conversation history - filter to create model-specific history
    for (const message of conversationHistory) {
      if (message.role === 'system') continue // Skip system messages from history (we use systemPrompt)
      if (userMessageId && message.id === userMessageId) continue // Skip the current user message (added separately below)

      // Include all user messages
      if (message.role === 'user') {
        const content = this.buildMessageContent({
          role: message.role as 'user' | 'assistant',
          text: message.text || '',
          images: message.images || undefined,
          audio: message.audio || undefined,
          files: message.files || undefined
        }, isAnthropic)
        
        messages.push({
          role: message.role as 'user' | 'assistant',
          content
        })
      }
      // For assistant messages, only include those from the same model or if no model info exists (legacy)
      else if (message.role === 'assistant') {
        const isFromSameModel = (!message.provider && !message.model) || // Legacy messages without model info
                               (message.provider === modelConfig.provider && message.model === modelConfig.model)
        
        if (isFromSameModel) {
          const content = this.buildMessageContent({
            role: message.role as 'user' | 'assistant',
            text: message.text || '',
            images: message.images || undefined,
            audio: message.audio || undefined,
            files: message.files || undefined
          }, isAnthropic)
          
          messages.push({
            role: message.role as 'user' | 'assistant',
            content
          })
        }
      }
    }

    // Convert current user message to provider format and add it
    const userContent = this.buildMessageContent(userMessage, isAnthropic)
    messages.push({
      role: 'user',
      content: userContent
    })
    
    // Calculate input tokens for later use if API doesn't provide them
    const inputText = this.messagesToText(messages)
    const estimatedInputTokens = (await tokenService.countTokens(inputText, modelConfig.model)) || 0

    // Build request payload based on provider
    const requestPayload = isAnthropic ? {
      model: modelConfig.model,
      messages,
      stream: !!onStreamChunk,
      max_tokens: modelConfig.maxTokens || 1024,
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
    } : {
      model: modelConfig.model,
      messages,
      stream: !!onStreamChunk,
      ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
      ...(modelConfig.maxTokens !== undefined && { max_tokens: modelConfig.maxTokens }),
      ...(modelConfig.topP !== undefined && { top_p: modelConfig.topP }),
      ...(modelConfig.frequencyPenalty !== undefined && { frequency_penalty: modelConfig.frequencyPenalty }),
      ...(modelConfig.presencePenalty !== undefined && { presence_penalty: modelConfig.presencePenalty }),
      ...(modelConfig.stop !== undefined && modelConfig.stop.length > 0 && { stop: modelConfig.stop }),
      ...(modelConfig.n !== undefined && { n: modelConfig.n }),
      ...(modelConfig.seed !== undefined && { seed: modelConfig.seed }),
      ...(modelConfig.reasoningEffort !== undefined && modelConfig.reasoningEffort !== 'none' && { reasoning_effort: modelConfig.reasoningEffort }),
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
      let errorText = response.statusText
      try {
        const errorBody = await response.text()
        console.error('API Error Response:', errorBody)
        // Try to parse as JSON to extract error message
        try {
          const errorJson = JSON.parse(errorBody)
          if (errorJson.error?.message) {
            errorText = errorJson.error.message
          } else if (errorJson.message) {
            errorText = errorJson.message
          } else {
            errorText = errorBody || response.statusText
          }
        } catch {
          // Not JSON, use as-is
          errorText = errorBody || response.statusText
        }
      } catch (e) {
        // Ignore errors reading response body
      }
      throw new Error(errorText)
    }

    const processingTime = Date.now() - startTime

    if (requestPayload.stream) {
      return this.handleStreamResponse(response, {
        provider: modelConfig.provider,
        model: modelConfig.model,
        userMessageId,
        processingTime,
        onStreamChunk: onStreamChunk ? (content: string) => onStreamChunk(content, modelId) : undefined,
        onStreamComplete: onStreamComplete ? (message: CreateMessageInput) => onStreamComplete(message, modelId) : undefined,
        isAnthropic,
        isOllama,
        estimatedInputTokens
      })
    } else {
      return this.handleNonStreamResponse(response, {
        provider: modelConfig.provider,
        model: modelConfig.model,
        userMessageId,
        processingTime,
        isAnthropic,
        isOllama,
        estimatedInputTokens
      })
    }
  }

  /**
   * Build the appropriate chat endpoint URL based on provider
   */
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

  /**
   * Convert messages array to text for token counting
   */
  private messagesToText(messages: OpenAIMessage[]): string {
    let text = ''
    for (const message of messages) {
      text += `${message.role}: `
      if (typeof message.content === 'string') {
        text += message.content
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'text' && item.text) {
            text += item.text
          }
        }
      }
      text += '\n\n'
    }
    return text
  }
  
  /**
   * Build provider-compatible message content from our message format
   */
  private buildMessageContent(message: CreateMessageInput, isAnthropic: boolean = false): string | Array<any> {
    const content: Array<any> = []

    // Add text content
    if (message.text) {
      content.push({
        type: 'text',
        text: message.text
      })
    }

    // Add images
    if (message.images && message.images.length > 0) {
      for (const image of message.images) {
        if (isAnthropic) {
          // Anthropic format
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mime_type || 'image/png',
              data: image.file_path || image.url?.split(',')[1] || ''
            }
          })
        } else {
          // OpenAI format
          content.push({
            type: 'image_url',
            image_url: {
              url: image.url || `data:${image.mime_type};base64,${image.file_path}`
            }
          })
        }
      }
    }

    // Note: Audio files are not directly supported in OpenAI chat completions API
    // They would need to be transcribed first or handled by specific providers
    if (message.audio && message.audio.length > 0) {
      const audioReference = message.audio.map(audio => `[Audio file: ${audio.file_path || 'audio'}.${audio.mime_type?.split('/')[1] || 'audio'}]`).join('\n')
      
      // Add audio reference to text content
      const existingTextIndex = content.findIndex(item => item.type === 'text')
      if (existingTextIndex >= 0) {
        content[existingTextIndex].text += '\n\n' + audioReference
      } else {
        content.push({
          type: 'text',
          text: audioReference
        })
      }
    }

    // Add document files
    if (message.files && message.files.length > 0) {
      for (const file of message.files) {
        if (isAnthropic && file.content) {
          // Check Anthropic-specific limits for PDFs
          if (file.type === 'application/pdf') {
            // Rough estimate: PDF file size > 10MB might exceed 100 page limit
            const estimatedSizeMB = (file.content.length * 0.75) / 1024 / 1024 // base64 is ~33% larger
            if (estimatedSizeMB > 10) {
              console.warn(`PDF file ${file.name} might be too large for Anthropic (estimated ${estimatedSizeMB.toFixed(1)}MB). Anthropic has a 100-page limit.`)
            }
          }
          
          // Anthropic format - use document type for PDF and other files
          content.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: file.type || 'application/octet-stream',
              data: file.content
            }
          })
        } else {
          // For other providers or when no content available, include as text
          let fileContent = ''
          
          // Check if we have base64 content for text files that we can decode
          if (file.content && file.type) {
            const isTextFile = file.type.startsWith('text/') || 
                              ['application/json', 'application/xml'].includes(file.type)
            
            if (isTextFile) {
              try {
                // Decode base64 to text for text-based files
                const decodedContent = atob(file.content)
                fileContent = `\n\n--- File: ${file.name} (${file.type}) ---\n${decodedContent}\n--- End of file ---\n`
              } catch (error) {
                console.warn('Failed to decode file content for:', file.name)
                fileContent = `\n\n[File: ${file.name} (${file.type}) - content not readable]\n`
              }
            } else {
              // For non-text files, just reference them
              fileContent = `\n\n[File attachment: ${file.name} (${file.type})]\n`
            }
          } else {
            // Fallback if no base64 data available
            fileContent = `\n\n[File: ${file.name} (${file.type})]\n`
          }
          
          // If there's already text content, append to it
          const existingTextIndex = content.findIndex(item => item.type === 'text')
          if (existingTextIndex >= 0) {
            content[existingTextIndex].text += fileContent
          } else {
            content.push({
              type: 'text',
              text: message.text ? message.text + fileContent : fileContent.trim()
            })
          }
        }
      }
    }

    // Return simple string if only text, otherwise return array
    return content.length === 1 && content[0].type === 'text' 
      ? content[0].text 
      : content
  }

  /**
   * Handle streaming response from API
   */
  private async handleStreamResponse(
    response: Response, 
    options: {
      provider: string
      model: string
      userMessageId?: number
      processingTime: number
      onStreamChunk?: (content: string) => void
      onStreamComplete?: (message: CreateMessageInput) => void
      isAnthropic?: boolean
      isOllama?: boolean
      estimatedInputTokens?: number
    }
  ): Promise<CreateMessageInput> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body reader available')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCachedTokens = 0
    let totalReasoningTokens = 0
    let wasAborted = false

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
          let isDone = false
          
          // Handle different streaming formats
          if (options.isOllama) {
            // Ollama streams JSON objects directly, not prefixed with "data: "
            if (line.startsWith('data: ')) {
              data = line.slice(6).trim()
            }
          } else {
            // OpenAI and Anthropic use "data: " prefix
            if (line.startsWith('data: ')) {
              data = line.slice(6).trim()
              if (data === '[DONE]') continue
            } else {
              continue // Skip lines that don't start with "data: "
            }
          }

          try {
            const chunk = JSON.parse(data)
            let deltaContent = ''
            
            if (options.isAnthropic) {
              // Anthropic streaming format
              if (chunk.type === 'content_block_delta') {
                deltaContent = chunk.delta?.text || ''
              } else if (chunk.type === 'message_start' && chunk.message?.usage) {
                // Capture initial token counts
                totalInputTokens = chunk.message.usage.input_tokens || 0
                totalCachedTokens = chunk.message.usage.cache_read_input_tokens || 0
              } else if (chunk.type === 'message_delta' && chunk.usage) {
                // Capture final token counts
                totalOutputTokens = chunk.usage.output_tokens || 0
              }
            } else if (options.isOllama) {
              // Ollama streaming format - content is in message.content
              deltaContent = chunk.message?.content || ''
              // Check if Ollama response is done
              if (chunk.done === true) {
                isDone = true
              }
            } else {
              // OpenAI streaming format
              deltaContent = chunk.choices?.[0]?.delta?.content || ''
              
              // Capture usage from streaming response if available
              if (chunk.usage) {
                totalInputTokens = chunk.usage.prompt_tokens || totalInputTokens
                totalOutputTokens = chunk.usage.completion_tokens || totalOutputTokens
                totalCachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || totalCachedTokens
                
                // For reasoning models (o1, o3)
                if (chunk.usage.completion_tokens_details?.reasoning_tokens) {
                  totalReasoningTokens = chunk.usage.completion_tokens_details.reasoning_tokens
                }
              }
            }
            
            if (deltaContent) {
              fullContent += deltaContent
              options.onStreamChunk?.(deltaContent)
            }
            
            // For Ollama, capture token counts when done
            if (isDone && options.isOllama) {
              totalInputTokens = chunk.prompt_eval_count || 0
              totalOutputTokens = chunk.eval_count || 0
              break
            }
          } catch (err) {
            console.warn('Failed to parse streaming chunk:', err, 'Line:', line)
          }
        }
      }

      // If we didn't get token counts from the API, use accurate tokenizers
      if (totalInputTokens === 0 && options.estimatedInputTokens) {
        totalInputTokens = options.estimatedInputTokens
      }
      if (totalOutputTokens === 0 && fullContent) {
        totalOutputTokens = (await tokenService.countTokens(fullContent, options.model)) || 0
      }
      
      // Calculate cost
      const cost = tokenService.calculateCost(
        totalInputTokens,
        totalOutputTokens,
        options.model,
        totalCachedTokens,
        totalReasoningTokens
      )
      
      // Build final assistant message
      const assistantMessage: CreateMessageInput = {
        role: 'assistant',
        text: fullContent,
        input_tokens: totalInputTokens || undefined,
        output_tokens: totalOutputTokens || undefined,
        cached_tokens: totalCachedTokens || undefined,
        reasoning_tokens: totalReasoningTokens || undefined,
        cost: cost > 0 ? cost : undefined,
        processing_time_ms: options.processingTime,
        previous_message_id: options.userMessageId,
        provider: options.provider,
        model: options.model
      }

      // Only call onStreamComplete if not aborted (let the cancel handler save partial content)
      if (!wasAborted) {
        options.onStreamComplete?.(assistantMessage)
      }
      return assistantMessage

    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
        wasAborted = true
        // Don't call onStreamComplete for aborted requests - let the cancel handler deal with partial content
        // Still return the partial message for potential use
        // Calculate cost even for partial response
        const partialCost = tokenService.calculateCost(
          totalInputTokens,
          totalOutputTokens || (await tokenService.countTokens(fullContent, options.model)) || 0,
          options.model,
          totalCachedTokens,
          totalReasoningTokens
        )
        
        return {
          role: 'assistant',
          text: fullContent,
          input_tokens: totalInputTokens || undefined,
          output_tokens: totalOutputTokens || undefined,
          cached_tokens: totalCachedTokens || undefined,
          reasoning_tokens: totalReasoningTokens || undefined,
          cost: partialCost > 0 ? partialCost : undefined,
          processing_time_ms: options.processingTime,
          previous_message_id: options.userMessageId,
          provider: options.provider,
          model: options.model
        }
      }
      throw error
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Handle non-streaming response from API
   */
  private async handleNonStreamResponse(
    response: Response,
    options: {
      provider: string
      model: string
      userMessageId?: number
      processingTime: number
      isAnthropic?: boolean
      isOllama?: boolean
      estimatedInputTokens?: number
    }
  ): Promise<CreateMessageInput> {
    const data = await response.json()

    let text = ''
    let inputTokens: number | undefined = undefined
    let outputTokens: number | undefined = undefined
    let cachedTokens: number | undefined = undefined
    let reasoningTokens: number | undefined = undefined

    if (options.isOllama) {
      // Ollama non-streaming format: { message: { content: "..." } }
      text = data.message?.content || ''
      // Ollama may include usage statistics
      inputTokens = data.prompt_eval_count
      outputTokens = data.eval_count
    } else if (options.isAnthropic) {
      // Anthropic format
      text = data.content?.[0]?.text || ''
      inputTokens = data.usage?.input_tokens
      outputTokens = data.usage?.output_tokens
      cachedTokens = data.usage?.cache_read_input_tokens
    } else {
      // OpenAI format
      text = data.choices?.[0]?.message?.content || ''
      inputTokens = data.usage?.prompt_tokens
      outputTokens = data.usage?.completion_tokens
      cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens
      
      // For reasoning models
      if (data.usage?.completion_tokens_details?.reasoning_tokens) {
        reasoningTokens = data.usage.completion_tokens_details.reasoning_tokens
      }
    }

    // If we didn't get token counts from the API, use accurate tokenizers
    if (!inputTokens && options.estimatedInputTokens) {
      inputTokens = options.estimatedInputTokens
    }
    if (!outputTokens && text) {
      outputTokens = (await tokenService.countTokens(text, options.model)) || 0
    }
    
    // Calculate cost
    const cost = tokenService.calculateCost(
      inputTokens || 0,
      outputTokens || 0,
      options.model,
      cachedTokens || 0,
      reasoningTokens || 0
    )

    const assistantMessage: CreateMessageInput = {
      role: 'assistant',
      text,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: cachedTokens,
      reasoning_tokens: reasoningTokens,
      cost: cost > 0 ? cost : undefined,
      processing_time_ms: options.processingTime,
      previous_message_id: options.userMessageId,
      provider: options.provider,
      model: options.model
    }

    return assistantMessage
  }
}

// Export singleton instance
export const chatService = new ChatService()