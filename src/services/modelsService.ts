import { ModelCapabilities } from '../types/provider'
import { httpFetch } from '../utils/httpClient'

export interface OpenRouterModel {
  id: string
  name: string
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    instruct_type?: string | null
  }
  pricing?: {
    prompt?: string
    completion?: string
    image?: string
    audio?: string
    web_search?: string
  }
  context_length?: number
}

export interface ProviderModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
}

export interface EnrichedModel {
  id: string
  name: string
  capabilities: ModelCapabilities
  contextLength?: number
}

class ModelsService {
  private openRouterCache: OpenRouterModel[] | null = null
  private cacheExpiry = 0
  private readonly CACHE_DURATION = 15 * 60 * 1000 // 15 minutes

  /**
   * Fetch models from OpenRouter for capability metadata
   */
  private async fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
    const now = Date.now()
    
    // Return cached data if still valid
    if (this.openRouterCache && now < this.cacheExpiry) {
      return this.openRouterCache
    }

    try {
      const response = await httpFetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`)
      }

      const data = await response.json()
      this.openRouterCache = data.data || []
      this.cacheExpiry = now + this.CACHE_DURATION
      
      return this.openRouterCache || []
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error)
      // Return cached data if available, or empty array
      return this.openRouterCache || []
    }
  }

  /**
   * Fetch models from a provider's endpoint
   */
  private async fetchProviderModels(endpoint: string, apiKey?: string, isLocal = false): Promise<ProviderModel[]> {
    try {
      // Handle different provider endpoints and auth methods
      let modelsEndpoint: string
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      // Anthropic specific handling (using native authentication)  
      if (endpoint.includes('anthropic.com')) {
        modelsEndpoint = endpoint + '/models'
        if (apiKey && !isLocal) {
          headers['x-api-key'] = apiKey
          headers['anthropic-version'] = '2023-06-01'
          headers['anthropic-dangerous-direct-browser-access'] = 'true'
        }
        delete headers['Content-Type'] // Remove Content-Type for GET request to Anthropic
      }
      // Google AI specific handling  
      else if (endpoint.includes('generativelanguage.googleapis.com')) {
        modelsEndpoint = `https://generativelanguage.googleapis.com/v1beta/models${apiKey ? `?key=${apiKey}` : ''}`
        // Don't add Authorization header for Google AI - it uses query param
      }
      // Cohere specific handling
      else if (endpoint.includes('cohere.ai') || endpoint.includes('cohere.com')) {
        modelsEndpoint = 'https://api.cohere.ai/v2/models'
        if (apiKey && !isLocal) {
          headers['Authorization'] = `Bearer ${apiKey}`
        }
      }
      // Deep Infra specific handling
      else if (endpoint.includes('deepinfra.com')) {
        modelsEndpoint = 'https://api.deepinfra.com/v1/openai/models'
        if (apiKey && !isLocal) {
          headers['Authorization'] = `Bearer ${apiKey}`
        }
      }
      // Ollama specific handling
      else if (endpoint.includes('ollama') || endpoint.includes('11434')) {
        modelsEndpoint = endpoint.replace('/v1', '') + '/api/tags'
      }
      // Standard OpenAI-compatible endpoints
      else {
        modelsEndpoint = endpoint + '/models'
        if (apiKey && !isLocal) {
          headers['Authorization'] = `Bearer ${apiKey}`
        }
      }

      const response = await httpFetch(modelsEndpoint, { headers })

      if (!response.ok) {
        throw new Error(`Provider API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()


      // Handle different response formats
      if (endpoint.includes('ollama') || endpoint.includes('11434')) {
        return (data.models || []).map((model: any) => ({
          id: model.name || model.model,
          object: 'model',
          owned_by: 'ollama'
        }))
      }
      
      // Google AI response format
      if (endpoint.includes('generativelanguage.googleapis.com')) {
        return (data.models || [])
          .filter((model: any) => model.name && !model.name.includes('embedding'))
          .map((model: any) => ({
            id: model.name.replace('models/', ''),
            object: 'model',
            owned_by: 'google'
          }))
      }

      // Cohere response format
      if (endpoint.includes('cohere.ai') || endpoint.includes('cohere.com')) {
        return (data.models || [])
          .filter((model: any) => model.name && !model.name.includes('embed') && !model.name.includes('rerank'))
          .map((model: any) => ({
            id: model.name,
            object: 'model',
            owned_by: 'cohere'
          }))
      }

      // Anthropic response format
      if (endpoint.includes('anthropic.com')) {
        return (data.data || []).map((model: any) => ({
          id: model.id,
          object: 'model',
          owned_by: 'anthropic'
        }))
      }

      // Together AI response format (returns direct array)
      if (endpoint.includes('together.xyz')) {
        return Array.isArray(data) ? data : []
      }

      // Standard OpenAI-compatible format
      return data.data || []
    } catch (error) {
      console.error(`Failed to fetch models from ${endpoint}:`, error)
      throw error
    }
  }


  /**
   * Fuzzy match provider model with OpenRouter model
   */
  private findOpenRouterMatch(providerModel: ProviderModel, openRouterModels: OpenRouterModel[]): OpenRouterModel | null {
    const modelId = providerModel.id.toLowerCase()

    // 1. Try exact match first
    let match = openRouterModels.find(orm => orm.id.toLowerCase() === modelId)
    if (match) return match

    // 2. Try with common provider prefixes
    const prefixes = ['openai/', 'anthropic/', 'meta-llama/', 'google/', 'mistralai/']
    for (const prefix of prefixes) {
      match = openRouterModels.find(orm => orm.id.toLowerCase() === prefix + modelId)
      if (match) return match
    }

    // 3. Try matching without provider prefix from OpenRouter side
    match = openRouterModels.find(orm => {
      const ormId = orm.id.toLowerCase()
      const withoutPrefix = ormId.includes('/') ? ormId.split('/')[1] : ormId
      return withoutPrefix === modelId
    })
    if (match) return match

    // 4. Try partial matching for model families
    match = openRouterModels.find(orm => {
      const ormId = orm.id.toLowerCase()
      const ormName = (orm.name || '').toLowerCase()
      
      // Check if provider model is contained in OpenRouter model ID or name
      return ormId.includes(modelId) || ormName.includes(modelId) || 
             modelId.includes(ormId.split('/')[1] || ormId)
    })

    return match || null
  }

  /**
   * Extract capabilities from OpenRouter model metadata
   */
  private extractCapabilities(openRouterModel: OpenRouterModel): ModelCapabilities {
    const arch = openRouterModel.architecture
    const pricing = openRouterModel.pricing
    
    const capabilities: ModelCapabilities = {
      vision: false,
      audio: false,
      files: false,
      multimodal: false,
      image: false,
      thinking: false,
      tools: false,
      webSearch: false
    }

    if (arch?.input_modalities) {
      capabilities.vision = arch.input_modalities.includes('image')
      capabilities.audio = arch.input_modalities.includes('audio')
      capabilities.files = arch.input_modalities.includes('file')
    }

    if (arch?.output_modalities) {
      capabilities.image = arch.output_modalities.includes('image')
      // Note: OpenRouter doesn't explicitly mark audio output, we'll infer from model names
    }

    // Detect multimodal capability
    capabilities.multimodal = capabilities.vision || capabilities.audio || capabilities.files

    // Detect thinking capability (reasoning models like o1)
    const modelId = openRouterModel.id.toLowerCase()
    const modelName = (openRouterModel.name || '').toLowerCase()
    capabilities.thinking = modelId.includes('o1-') || modelName.includes('reasoning') || 
                           modelId.includes('o1') || modelName.includes('o1')

    // Detect tools capability (function calling)
    // Most modern models support tools, but we can be more specific
    capabilities.tools = !modelId.includes('base') && 
                        (modelId.includes('gpt-4') || modelId.includes('gpt-3.5') ||
                         modelId.includes('claude-3') || modelId.includes('gemini') ||
                         modelId.includes('mixtral') || modelId.includes('llama-3'))

    // Detect web search capability
    capabilities.webSearch = !!pricing?.web_search

    return capabilities
  }

  /**
   * Get default capabilities for models we can't match
   */
  private getDefaultCapabilities(modelId: string): ModelCapabilities {
    const lowerModelId = modelId.toLowerCase()
    
    return {
      vision: lowerModelId.includes('vision') || lowerModelId.includes('4o') || 
              lowerModelId.includes('claude-3') || lowerModelId.includes('gemini'),
      audio: lowerModelId.includes('audio') || lowerModelId.includes('whisper'),
      files: true, // Most modern models support file inputs
      multimodal: lowerModelId.includes('vision') || lowerModelId.includes('4o') || 
                  lowerModelId.includes('claude-3') || lowerModelId.includes('gemini'),
      image: lowerModelId.includes('dall-e') || lowerModelId.includes('imagen'),
      thinking: lowerModelId.includes('o1'),
      tools: !lowerModelId.includes('base') && !lowerModelId.includes('instruct'),
      webSearch: false
    }
  }

  /**
   * Fetch and enrich models for a specific provider
   */
  async fetchModelsForProvider(
    providerId: string,
    endpoint: string,
    apiKey?: string,
    isLocal = false
  ): Promise<EnrichedModel[]> {
    try {
      // Stage 1: Fetch provider models
      const providerModels = await this.fetchProviderModels(endpoint, apiKey, isLocal)
      
      // Stage 2: Fetch OpenRouter metadata
      const openRouterModels = await this.fetchOpenRouterModels()
      
      // Stage 3: Match and enrich
      const enrichedModels: EnrichedModel[] = providerModels.map(providerModel => {
        const openRouterMatch = this.findOpenRouterMatch(providerModel, openRouterModels)
        
        const capabilities = openRouterMatch 
          ? this.extractCapabilities(openRouterMatch)
          : this.getDefaultCapabilities(providerModel.id)
        
        return {
          id: providerModel.id,
          name: openRouterMatch?.name || providerModel.id,
          capabilities,
          contextLength: openRouterMatch?.context_length
        }
      })

      return enrichedModels
    } catch (error) {
      console.error(`Failed to fetch models for provider ${providerId}:`, error)
      throw error
    }
  }

  /**
   * Clear the OpenRouter cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.openRouterCache = null
    this.cacheExpiry = 0
  }
}

// Export singleton instance
export const modelsService = new ModelsService()