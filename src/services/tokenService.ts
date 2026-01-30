// Dynamic imports to handle WASM loading in Tauri
let tiktoken: any = null
let anthropicTokenizer: any = null

// Load tokenizers - either they work or they don't
const loadTokenizers = async () => {
  if (!tiktoken) {
    try {
      tiktoken = await import('tiktoken')
      console.log('Tiktoken loaded successfully')
    } catch (error) {
      console.error('Failed to load tiktoken:', error)
      tiktoken = false // Mark as failed
    }
  }
  
  if (!anthropicTokenizer) {
    try {
      const module = await import('@anthropic-ai/tokenizer')
      if (module.countTokens && typeof module.countTokens === 'function') {
        anthropicTokenizer = {
          countTokens: module.countTokens
        }
        console.log('Anthropic tokenizer loaded successfully')
      } else {
        console.error('Anthropic tokenizer countTokens function not found')
        anthropicTokenizer = false
      }
    } catch (error) {
      console.error('Failed to load anthropic tokenizer:', error)
      anthropicTokenizer = false
    }
  }
}

// Pricing per million tokens (in USD)
export interface ModelPricing {
  inputPricePerMillion: number
  outputPricePerMillion: number
  cachedInputPricePerMillion?: number // For models that support caching
  reasoningPricePerMillion?: number // For o1 models
}

// Updated comprehensive pricing as of 2025 - All major providers
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ========== ANTHROPIC CLAUDE MODELS ==========
  
  // Claude 4.x Models (Latest)
  'claude-opus-4.1': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    cachedInputPricePerMillion: 1.50 // Read price, write is 18.75
  },
  'claude-sonnet-4': {
    inputPricePerMillion: 3.00, // ≤200K tokens
    outputPricePerMillion: 15.00, // ≤200K tokens  
    cachedInputPricePerMillion: 0.30 // Read price
  },
  'claude-haiku-3.5': {
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
    cachedInputPricePerMillion: 0.08 // Read price
  },
  
  // Claude 3.x Models (Current)
  'claude-3-5-sonnet-20241022': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30
  },
  'claude-3-5-haiku-20241022': {
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 5.00,
    cachedInputPricePerMillion: 0.10
  },
  'claude-3-opus-20240229': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    cachedInputPricePerMillion: 1.50
  },
  'claude-3-sonnet-20240229': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30
  },
  'claude-3-haiku-20240307': {
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    cachedInputPricePerMillion: 0.025
  },
  
  // Claude Aliases
  'claude-3.5-sonnet': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30
  },
  'claude-3.5-haiku': {
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 5.00,
    cachedInputPricePerMillion: 0.10
  },
  'claude-3-opus': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    cachedInputPricePerMillion: 1.50
  },
  'claude-3-sonnet': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30
  },
  'claude-3-haiku': {
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    cachedInputPricePerMillion: 0.025
  },
  
  // ========== OPENAI GPT MODELS ==========
  
  // GPT-5 Series
  'gpt-5': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 0.125
  },
  'gpt-5-mini': {
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 2.00,
    cachedInputPricePerMillion: 0.025
  },
  'gpt-5-nano': {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.40,
    cachedInputPricePerMillion: 0.005
  },
  'gpt-5-chat-latest': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 0.125
  },
  
  // GPT-4.1 Series
  'gpt-4.1': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 8.00,
    cachedInputPricePerMillion: 0.50
  },
  'gpt-4.1-mini': {
    inputPricePerMillion: 0.40,
    outputPricePerMillion: 1.60,
    cachedInputPricePerMillion: 0.10
  },
  'gpt-4.1-nano': {
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
    cachedInputPricePerMillion: 0.025
  },
  
  // GPT-4o Series  
  'gpt-4o': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 1.25
  },
  'gpt-4o-2024-05-13': {
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 15.00
  },
  'gpt-4o-2024-11-20': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 1.25
  },
  'gpt-4o-2024-08-06': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 1.25
  },
  'gpt-4o-audio-preview': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00
  },
  'gpt-4o-realtime-preview': {
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 20.00,
    cachedInputPricePerMillion: 2.50
  },
  'gpt-4o-mini': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    cachedInputPricePerMillion: 0.075
  },
  'gpt-4o-mini-audio-preview': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60
  },
  'gpt-4o-mini-realtime-preview': {
    inputPricePerMillion: 0.60,
    outputPricePerMillion: 2.40,
    cachedInputPricePerMillion: 0.30
  },
  'gpt-4o-mini-search-preview': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60
  },
  'gpt-4o-search-preview': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00
  },
  
  // GPT-4 Legacy
  'gpt-4': {
    inputPricePerMillion: 30.00,
    outputPricePerMillion: 60.00
  },
  'gpt-4-turbo': {
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00
  },
  'gpt-4-turbo-preview': {
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00
  },
  
  // GPT-3.5 Series
  'gpt-3.5-turbo': {
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 1.50
  },
  'gpt-3.5-turbo-16k': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 4.00
  },
  
  // O-Series (Reasoning Models)
  'o1': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 60.00,
    cachedInputPricePerMillion: 7.50
  },
  'o1-pro': {
    inputPricePerMillion: 150.00,
    outputPricePerMillion: 600.00
  },
  'o1-preview': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 60.00
  },
  'o1-mini': {
    inputPricePerMillion: 1.10,
    outputPricePerMillion: 4.40,
    cachedInputPricePerMillion: 0.55
  },
  'o3': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 8.00,
    cachedInputPricePerMillion: 0.50
  },
  'o3-pro': {
    inputPricePerMillion: 20.00,
    outputPricePerMillion: 80.00
  },
  'o3-mini': {
    inputPricePerMillion: 1.10,
    outputPricePerMillion: 4.40,
    cachedInputPricePerMillion: 0.55
  },
  'o3-deep-research': {
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 40.00,
    cachedInputPricePerMillion: 2.50
  },
  'o4-mini': {
    inputPricePerMillion: 1.10,
    outputPricePerMillion: 4.40,
    cachedInputPricePerMillion: 0.275
  },
  'o4-mini-deep-research': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 8.00,
    cachedInputPricePerMillion: 0.50
  },
  
  // Specialized Models
  'codex-mini-latest': {
    inputPricePerMillion: 1.50,
    outputPricePerMillion: 6.00,
    cachedInputPricePerMillion: 0.375
  },
  'computer-use-preview': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 12.00
  },
  
  // Image Models
  'gpt-image-1': {
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 0, // Image models don't have output tokens
    cachedInputPricePerMillion: 1.25
  },
  
  // Transcription Models
  'gpt-4o-mini-tts': {
    inputPricePerMillion: 0.60,
    outputPricePerMillion: 0
  },
  'gpt-4o-transcribe': {
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00
  },
  'gpt-4o-mini-transcribe': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00
  },
  
  // Embeddings
  'text-embedding-3-small': {
    inputPricePerMillion: 0.01,
    outputPricePerMillion: 0
  },
  'text-embedding-3-large': {
    inputPricePerMillion: 0.065,
    outputPricePerMillion: 0
  },
  'text-embedding-ada-002': {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0
  },
  
  // ========== GROK MODELS ==========
  
  'grok-4': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00
  },
  'grok-3': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00
  },
  'grok-3-mini': {
    inputPricePerMillion: 0.30,
    outputPricePerMillion: 0.50
  },
  'grok-2-image-1212': {
    inputPricePerMillion: 0, // Priced per image, not tokens
    outputPricePerMillion: 0
  },
  
  // ========== DEEPINFRA MODELS ==========
  
  // DeepSeek Models
  'DeepSeek-R1': {
    inputPricePerMillion: 0.45,
    outputPricePerMillion: 2.15
  },
  'DeepSeek-R1-0528': {
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 2.15
  },
  'DeepSeek-R1-Turbo': {
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 3.00
  },
  'DeepSeek-R1-0528-Turbo': {
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 3.00
  },
  'DeepSeek-V3-0324': {
    inputPricePerMillion: 0.28,
    outputPricePerMillion: 0.88
  },
  'DeepSeek-V3': {
    inputPricePerMillion: 0.38,
    outputPricePerMillion: 0.89
  },
  'DeepSeek-V3-0324-Turbo': {
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 3.00
  },
  'DeepSeek-Prover-V2-671B': {
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 2.18
  },
  'DeepSeek-R1-Distill-Llama-70B': {
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40
  },
  'DeepSeek-R1-Distill-Qwen-32B': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.15
  },
  
  // Llama Models (DeepInfra)
  'Llama-4-Scout-17B-16E': {
    inputPricePerMillion: 0.08,
    outputPricePerMillion: 0.30
  },
  'Llama-4-Maverick-17B-128E': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60
  },
  'Llama-4-Maverick-17B-128E-Turbo': {
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 0.50
  },
  'Llama-Guard-4-12B': {
    inputPricePerMillion: 0.18,
    outputPricePerMillion: 0.18
  },
  'Llama-3.3-70B-Instruct': {
    inputPricePerMillion: 0.23,
    outputPricePerMillion: 0.40
  },
  'Llama-3.3-70B-Instruct-Turbo': {
    inputPricePerMillion: 0.038,
    outputPricePerMillion: 0.12
  },
  'Llama-3.2-11B-Vision-Instruct': {
    inputPricePerMillion: 0.049,
    outputPricePerMillion: 0.049
  },
  'Llama-3.2-3B-Instruct': {
    inputPricePerMillion: 0.012,
    outputPricePerMillion: 0.024
  },
  'Llama-3.2-1B-Instruct': {
    inputPricePerMillion: 0.005,
    outputPricePerMillion: 0.01
  },
  'Meta-Llama-3.1-405B-Instruct': {
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 0.80
  },
  'Meta-Llama-3.1-70B-Instruct': {
    inputPricePerMillion: 0.23,
    outputPricePerMillion: 0.40
  },
  'Meta-Llama-3.1-70B-Instruct-Turbo': {
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.28
  },
  'Meta-Llama-3.1-8B-Instruct': {
    inputPricePerMillion: 0.03,
    outputPricePerMillion: 0.05
  },
  'Meta-Llama-3.1-8B-Instruct-Turbo': {
    inputPricePerMillion: 0.015,
    outputPricePerMillion: 0.02
  },
  'Meta-Llama-3-70B-Instruct': {
    inputPricePerMillion: 0.30,
    outputPricePerMillion: 0.40
  },
  'Meta-Llama-3-8B-Instruct': {
    inputPricePerMillion: 0.03,
    outputPricePerMillion: 0.06
  },
  
  // Qwen Models
  'QwQ-32B': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.15
  },
  'Qwen3-235B-A22B': {
    inputPricePerMillion: 0.13,
    outputPricePerMillion: 0.60
  },
  'Qwen3-32B': {
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.30
  },
  'Qwen3-30B-A3B': {
    inputPricePerMillion: 0.08,
    outputPricePerMillion: 0.29
  },
  'Qwen14B': {
    inputPricePerMillion: 0.06,
    outputPricePerMillion: 0.24
  },
  'Qwen2.5-72B-Instruct': {
    inputPricePerMillion: 0.12,
    outputPricePerMillion: 0.39
  },
  'Qwen2.5-Coder-32B-Instruct': {
    inputPricePerMillion: 0.06,
    outputPricePerMillion: 0.15
  },
  'Qwen2.5-7B-Instruct': {
    inputPricePerMillion: 0.04,
    outputPricePerMillion: 0.10
  },
  
  // Gemma Models
  'gemma-3-27b-it': {
    inputPricePerMillion: 0.09,
    outputPricePerMillion: 0.17
  },
  'gemma-3-12b-it': {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.10
  },
  'gemma-3-4b-it': {
    inputPricePerMillion: 0.02,
    outputPricePerMillion: 0.04
  },
  
  // Phi Models
  'phi-4': {
    inputPricePerMillion: 0.07,
    outputPricePerMillion: 0.14
  },
  'Phi-4-multimodal-instruct': {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.10
  },
  'phi-4-reasoning-plus': {
    inputPricePerMillion: 0.07,
    outputPricePerMillion: 0.35
  },
  
  // Mixture of Experts
  'Mixtral-8x7B-Instruct-v0.1': {
    inputPricePerMillion: 0.08,
    outputPricePerMillion: 0.24
  },
  'WizardLM-2-8x22B': {
    inputPricePerMillion: 0.48,
    outputPricePerMillion: 0.48
  },
  
  // Other Models
  'MythoMax-L2-13b': {
    inputPricePerMillion: 0.072,
    outputPricePerMillion: 0.072
  },
  'Mistral-7B-Instruct-v0.3': {
    inputPricePerMillion: 0.028,
    outputPricePerMillion: 0.054
  },
  
  // ========== OLLAMA/LOCAL MODELS (FREE) ==========
  
  'llama3.2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'llama3.1': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'llama3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'llama2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'mistral': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'mixtral': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'codellama': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'deepseek-coder': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'phi': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'qwen2.5': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'gemma2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  'starcoder2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
}

class TokenService {
  /**
   * Count tokens for a given text and model
   */
  async countTokens(text: string, model: string): Promise<number | undefined> {
    await loadTokenizers()
    
    // For Claude models, use official Anthropic tokenizer
    if (model.includes('claude')) {
      if (anthropicTokenizer && anthropicTokenizer !== false) {
        try {
          return anthropicTokenizer.countTokens(text)
        } catch (error) {
          console.error(`Failed to count tokens with Anthropic tokenizer:`, error)
          return undefined
        }
      }
      return undefined
    }
    
    // For OpenAI models, use tiktoken
    if (this.isOpenAIModel(model)) {
      return await this.countOpenAITokens(text, model)
    }
    
    // For Ollama/local models, return 0 (they're free)
    return 0
  }
  
  /**
   * Count tokens synchronously (returns undefined if tokenizers not loaded)
   */
  countTokensSync(_text: string, model: string): number | undefined {
    // For Ollama/local models, return 0 (they're free)
    if (!this.isOpenAIModel(model) && !model.includes('claude')) {
      return 0
    }
    
    // For other models, require async loading
    return undefined
  }
  
  /**
   * Count OpenAI tokens using tiktoken
   */
  private async countOpenAITokens(text: string, model: string): Promise<number | undefined> {
    if (!tiktoken || tiktoken === false) {
      return undefined
    }
    
    try {
      // Try to get encoding for the specific model
      const encoding = tiktoken.encoding_for_model(model)
      const tokens = encoding.encode(text)
      encoding.free() // Important: free the encoding to avoid memory leaks
      return tokens.length
    } catch (error) {
      // If model not found, try with a default encoding
      try {
        const encoding = tiktoken.get_encoding('cl100k_base') // Default for most modern models
        const tokens = encoding.encode(text)
        encoding.free()
        return tokens.length
      } catch (error2) {
        console.error(`Failed to count tokens with tiktoken:`, error2)
        return undefined
      }
    }
  }
  
  
  /**
   * Check if a model is an OpenAI model
   */
  private isOpenAIModel(model: string): boolean {
    return model.includes('gpt') || model.includes('o1') || model.includes('o3')
  }
  
  
  
  /**
   * Count tokens for an image
   */
  countImageTokens(width: number, height: number, model: string): number {
    // For Claude models (formula from Anthropic docs)
    if (model.includes('claude')) {
      return Math.ceil((width * height) / 750)
    }
    
    // For OpenAI vision models
    // OpenAI uses a tile-based system for high-res images
    // Low-res is always 85 tokens, high-res uses tiles
    if (model.includes('gpt-4') && model.includes('vision')) {
      // Assuming high-res mode
      const tiles = Math.ceil(width / 512) * Math.ceil(height / 512)
      return 85 + (tiles * 170) // Base cost + tile cost
    }
    
    // Default estimation for other models
    return 85 // Conservative estimate
  }
  
  /**
   * Calculate cost for tokens
   */
  calculateCost(
    inputTokens: number | undefined,
    outputTokens: number | undefined,
    model: string,
    cachedTokens: number = 0,
    reasoningTokens: number = 0
  ): number {
    const pricing = this.getModelPricing(model)
    if (!pricing) {
      return 0 // No pricing info available
    }
    
    // If we don't have token counts, we can't calculate cost
    if (inputTokens === undefined || outputTokens === undefined) {
      return 0
    }
    
    let totalCost = 0
    
    // Calculate input cost (subtract cached tokens if applicable)
    const uncachedInputTokens = Math.max(0, inputTokens - cachedTokens)
    totalCost += (uncachedInputTokens / 1_000_000) * pricing.inputPricePerMillion
    
    // Add cached input cost if applicable
    if (cachedTokens > 0 && pricing.cachedInputPricePerMillion) {
      totalCost += (cachedTokens / 1_000_000) * pricing.cachedInputPricePerMillion
    }
    
    // Add output cost
    totalCost += (outputTokens / 1_000_000) * pricing.outputPricePerMillion
    
    // Add reasoning cost if applicable (for o1 models)
    if (reasoningTokens > 0 && pricing.reasoningPricePerMillion) {
      totalCost += (reasoningTokens / 1_000_000) * pricing.reasoningPricePerMillion
    }
    
    return totalCost
  }
  
  /**
   * Get pricing for a model
   */
  getModelPricing(model: string): ModelPricing | null {
    // Check exact match first
    if (MODEL_PRICING[model]) {
      return MODEL_PRICING[model]
    }
    
    // Check if model contains any known pattern
    for (const [pattern, pricing] of Object.entries(MODEL_PRICING)) {
      if (model.toLowerCase().includes(pattern.toLowerCase())) {
        return pricing
      }
    }
    
    // No pricing found
    return null
  }
  
  /**
   * Check if a model is free (local)
   */
  isLocalModel(model: string): boolean {
    const pricing = this.getModelPricing(model)
    return pricing ? 
      pricing.inputPricePerMillion === 0 && pricing.outputPricePerMillion === 0 : 
      false
  }
  
  /**
   * Format cost for display
   */
  formatCost(cost: number): string {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    if (cost < 1) return `$${cost.toFixed(3)}`
    return `$${cost.toFixed(2)}`
  }
  
}

// Export singleton instance
export const tokenService = new TokenService()