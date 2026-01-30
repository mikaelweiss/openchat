import { getApiKey } from '../utils/secureStorage'

export interface TitleGenerationConfig {
  provider: string
  endpoint: string
  model: string
  apiKey?: string
  isLocal?: boolean
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

class TitleGenerationService {
  /**
   * Generate a conversation title based on the user's first message
   */
  async generateTitle(userMessage: string, config: TitleGenerationConfig): Promise<string> {
    if (!userMessage?.trim()) {
      throw new Error('User message is required for title generation')
    }

    // Detect provider type for proper formatting
    const isAnthropic = config.endpoint.includes('anthropic.com')
    const isOllama = config.endpoint.includes('ollama') || config.endpoint.includes('11434')

    // Create a prompt for title generation
    const systemPrompt = "Generate a short, descriptive title (maximum 50 characters) for a conversation based on the user's message. Return only the title, no quotes or additional text."

    // Build messages array based on provider
    const messages: OpenAIMessage[] = []
    
    if (!isAnthropic) {
      // For OpenAI-compatible APIs, include system message in messages array
      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }
    
    messages.push({
      role: 'user',
      content: `Generate a title for this message: "${userMessage}"`
    })

    // Build request payload based on provider
    const requestPayload = isAnthropic ? {
      model: config.model,
      system: systemPrompt, // Anthropic uses top-level system parameter
      messages,
      max_tokens: 50,
      temperature: 0.3,
      stream: false
    } : {
      model: config.model,
      messages,
      max_tokens: 50,
      temperature: 0.3,
      stream: false
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Add authentication based on provider
    if (!config.isLocal && config.apiKey) {
      if (isAnthropic) {
        headers['x-api-key'] = config.apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }
    }

    // Build endpoint URL
    const chatEndpoint = this.buildChatEndpoint(config.endpoint)

    try {
      // Make the API call
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload)
      })

      if (!response.ok) {
        let errorText = response.statusText
        try {
          const errorBody = await response.text()
          console.error('Title Generation API Error Response:', errorBody)
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
        throw new Error(`Title generation failed: ${errorText}`)
      }

      const data = await response.json()

      // Extract the generated title based on provider format
      let title = ''
      if (isOllama) {
        // Ollama format: { message: { content: "..." } }
        title = data.message?.content || ''
      } else if (isAnthropic) {
        // Anthropic format: { content: [{ text: "..." }] }
        title = data.content?.[0]?.text || ''
      } else {
        // OpenAI format: { choices: [{ message: { content: "..." } }] }
        title = data.choices?.[0]?.message?.content || ''
      }

      // Clean up the title
      title = title.trim()
      
      // Remove quotes if the AI added them
      if ((title.startsWith('"') && title.endsWith('"')) || 
          (title.startsWith("'") && title.endsWith("'"))) {
        title = title.slice(1, -1).trim()
      }

      // Ensure the title is not too long
      if (title.length > 50) {
        title = title.substring(0, 47) + '...'
      }

      // If title is empty or too short, fall back to truncated message
      if (!title || title.length < 3) {
        title = userMessage.length > 50 
          ? userMessage.substring(0, 47) + '...' 
          : userMessage
      }

      return title

    } catch (error) {
      console.error('Failed to generate title:', error)
      // Fall back to truncated user message
      return userMessage.length > 50 
        ? userMessage.substring(0, 47) + '...' 
        : userMessage
    }
  }

  /**
   * Create a TitleGenerationConfig from settings
   */
  async createConfigFromSettings(
    titleGenerationModel: string | null,
    providers: Record<string, any>
  ): Promise<TitleGenerationConfig | null> {
    if (!titleGenerationModel) {
      return null
    }

    // Parse the model setting (format: "providerId:modelName")
    const [providerId, modelName] = titleGenerationModel.split(':')
    if (!providerId || !modelName) {
      console.warn('Invalid title generation model format:', titleGenerationModel)
      return null
    }

    const provider = providers[providerId]
    if (!provider) {
      console.warn('Provider not found for title generation:', providerId)
      return null
    }

    // Check if the model is enabled
    if (!provider.enabledModels?.includes(modelName)) {
      console.warn('Model not enabled for title generation:', modelName)
      return null
    }

    // Get API key for non-local providers
    let apiKey: string | undefined
    if (!provider.isLocal) {
      try {
        apiKey = (await getApiKey(providerId)) || undefined
      } catch (error) {
        console.warn('Failed to get API key for title generation:', error)
        return null
      }
    }

    return {
      provider: providerId,
      endpoint: provider.endpoint,
      model: modelName,
      apiKey,
      isLocal: provider.isLocal
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
}

// Export singleton instance
export const titleGenerationService = new TitleGenerationService()