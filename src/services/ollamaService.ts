// Ollama API service for managing local models
import { invoke } from '@tauri-apps/api/core'

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface ModelSize {
  tag: string;
  displayName: string;
  parameterCount?: string;
  isInstalled?: boolean;
}

export interface OllamaLibraryModel {
  name: string;
  description?: string;
  tags: string[];
  updated_at: string;
  pulls?: number;
  size?: number;
  availableSizes?: ModelSize[];
  otherTags?: string[];
}

export interface OllamaModelResponse {
  models: OllamaModel[];
}

export interface OllamaDownloadProgress {
  status: 'pulling' | 'success' | 'error';
  digest?: string;
  total?: number;
  completed?: number;
  progress?: number;
  error?: string;
}

export interface OllamaModelStatus {
  name: string;
  status: 'not_loaded' | 'loading' | 'loaded' | 'error';
  size_vram?: number;
  error?: string;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

class ModelSizeParser {
  private static readonly SIZE_PATTERNS = [
    /^(\d+(?:\.\d+)?)b$/i,      // e.g., "7b", "1.5b", "70b"
    /^(\d+(?:\.\d+)?)gb$/i,     // e.g., "1gb", "2.5gb"
    /^(\d+)m$/i,                // e.g., "400m", "3m"
    /^(\d+)k$/i,                // e.g., "100k", "500k"
  ];

  static parseModelSizes(tags: string[]): { sizes: ModelSize[], otherTags: string[] } {
    const sizes: ModelSize[] = [];
    const otherTags: string[] = [];

    for (const tag of tags) {
      if (this.isModelSize(tag)) {
        sizes.push({
          tag,
          displayName: this.formatSizeDisplay(tag),
          parameterCount: this.extractParameterCount(tag)
        });
      } else {
        otherTags.push(tag);
      }
    }

    // Sort sizes by parameter count (ascending)
    sizes.sort((a, b) => {
      const aNum = this.getSizeNumericValue(a.tag);
      const bNum = this.getSizeNumericValue(b.tag);
      return aNum - bNum;
    });

    return { sizes, otherTags };
  }

  private static isModelSize(tag: string): boolean {
    return this.SIZE_PATTERNS.some(pattern => pattern.test(tag));
  }

  private static formatSizeDisplay(tag: string): string {
    const match = tag.match(/^(\d+(?:\.\d+)?)([bmgk]?)$/i);
    if (!match) return tag;

    const [, number, suffix] = match;
    const suffixMap: { [key: string]: string } = {
      'b': 'B',
      'm': 'M', 
      'k': 'K',
      'g': 'GB',
      'gb': 'GB'
    };

    const displaySuffix = suffixMap[suffix.toLowerCase()] || suffix.toUpperCase();
    return `${number}${displaySuffix}`;
  }

  private static extractParameterCount(tag: string): string {
    const match = tag.match(/^(\d+(?:\.\d+)?)([bmgk]?)$/i);
    if (!match) return tag;

    const [, number, suffix] = match;
    if (suffix.toLowerCase() === 'b') {
      return `${number} billion parameters`;
    } else if (suffix.toLowerCase() === 'm') {
      return `${number} million parameters`;
    } else if (suffix.toLowerCase() === 'k') {
      return `${number} thousand parameters`;
    }
    return `${number}${suffix.toUpperCase()}`;
  }

  private static getSizeNumericValue(tag: string): number {
    const match = tag.match(/^(\d+(?:\.\d+)?)([bmgk]?)$/i);
    if (!match) return 0;

    const [, numberStr, suffix] = match;
    const number = parseFloat(numberStr);

    switch (suffix.toLowerCase()) {
      case 'b': return number * 1000000000;     // billions
      case 'm': return number * 1000000;       // millions  
      case 'k': return number * 1000;          // thousands
      case 'g':
      case 'gb': return number * 1000000000;   // treat GB as billions for sorting
      default: return number;
    }
  }
}

export class OllamaService {
  private baseUrl = 'http://localhost:11434';
  private timeout = 30000; // 30 seconds default timeout

  constructor(baseUrl?: string, timeout?: number) {
    if (baseUrl) this.baseUrl = baseUrl;
    if (timeout) this.timeout = timeout;
  }

  /**
   * Auto-start Ollama if it's not running (for app initialization)
   */
  async autoStartOllama(): Promise<{ success: boolean; message: string }> {
    try {
      // First check if Ollama is already running
      const isAccessible = await this.isAccessible();
      if (isAccessible) {
        return { success: true, message: 'Ollama is already running' };
      }

      // Try to start Ollama using Tauri command
      try {
        await invoke('start_ollama');
        
        // Wait a moment for Ollama to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if it's now accessible
        const isNowAccessible = await this.isAccessible();
        if (isNowAccessible) {
          return { success: true, message: 'Ollama started successfully' };
        } else {
          return { success: false, message: 'Ollama started but not yet accessible' };
        }
      } catch (invokeError) {
        return { 
          success: false, 
          message: `Failed to start Ollama: ${invokeError instanceof Error ? invokeError.message : 'Unknown error'}` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Error during Ollama auto-start: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Stop Ollama service completely (including all loaded models)
   */
  async stopOllama(): Promise<{ success: boolean; message: string }> {
    try {
      // First check if Ollama is running
      const isAccessible = await this.isAccessible();
      if (!isAccessible) {
        return { success: true, message: 'Ollama is already stopped' };
      }

      // Try to stop Ollama using Tauri command
      try {
        await invoke('stop_ollama');
        
        // Wait a moment for Ollama to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if it's now stopped
        const isNowAccessible = await this.isAccessible();
        if (!isNowAccessible) {
          return { success: true, message: 'Ollama stopped successfully' };
        } else {
          return { success: false, message: 'Ollama stop signal sent but service still accessible' };
        }
      } catch (invokeError) {
        return { 
          success: false, 
          message: `Failed to stop Ollama: ${invokeError instanceof Error ? invokeError.message : 'Unknown error'}` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Error during Ollama stop: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Test if Ollama API is accessible
   */
  async isAccessible(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // Quick check
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get list of locally installed models
   */
  async getInstalledModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data: OllamaModelResponse = await response.json();
      return data.models || [];
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get installed models: ${error.message}`);
      }
      throw new Error('Failed to get installed models: Unknown error');
    }
  }

  /**
   * Search for models in Ollama library using a static list of popular models
   */
  async searchLibraryModels(query?: string): Promise<OllamaLibraryModel[]> {
    try {
      console.log('Getting popular models from static list...');
      
      // Complete list of Ollama models based on the library page
      const baseModels: OllamaLibraryModel[] = [
        {
          name: 'gpt-oss',
          description: 'OpenAI\'s open-weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.',
          tags: ['20b', '120b', 'tools', 'thinking'],
          updated_at: '2025-08-11T22:43:00Z',
          pulls: 840000
        },
        {
          name: 'deepseek-r1',
          description: 'DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.',
          tags: ['1.5b', '7b', '8b', '14b', '32b', '70b', '671b', 'tools', 'thinking'],
          updated_at: '2025-07-02T06:09:00Z',
          pulls: 57000000
        },
        {
          name: 'gemma3',
          description: 'The current, most capable model that runs on a single GPU.',
          tags: ['1b', '4b', '12b', '27b', 'vision'],
          updated_at: '2025-04-18T02:08:00Z',
          pulls: 11700000
        },
        {
          name: 'qwen3',
          description: 'Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.',
          tags: ['0.6b', '1.7b', '4b', '8b', '14b', '30b', '32b', '235b', 'tools', 'thinking'],
          updated_at: '2025-01-15T10:00:00Z',
          pulls: 5100000
        },
        {
          name: 'llama3.3',
          description: 'Meta Llama 3.3 70B is a multilingual large language model optimized for conversational use cases.',
          tags: ['70b', 'instruct'],
          updated_at: '2024-12-06T00:00:00Z',
          pulls: 4200000
        },
        {
          name: 'deepseek-r1-distill',
          description: 'DeepSeek-R1-Distill is a distilled version of DeepSeek-R1 that retains its reasoning capabilities while being more efficient.',
          tags: ['1.5b', '7b', '8b', '14b', '32b', '70b', 'thinking'],
          updated_at: '2025-01-21T00:00:00Z',
          pulls: 3800000
        },
        {
          name: 'llama3.2',
          description: 'Meta Llama 3.2 is a collection of instruction-tuned generative models in 1B, 3B, 11B and 90B sizes.',
          tags: ['1b', '3b', '11b', '90b', 'vision', 'instruct'],
          updated_at: '2024-10-23T00:00:00Z',
          pulls: 25000000
        },
        {
          name: 'llama3.1',
          description: 'Meta developed and released the Meta Llama 3 family of large language models (LLMs), a collection of pretrained and instruction tuned generative text models.',
          tags: ['8b', '70b', '405b', 'instruct'],
          updated_at: '2024-07-23T00:00:00Z',
          pulls: 20000000
        },
        {
          name: 'qwen2.5',
          description: 'Qwen2.5 is the latest series of Qwen large language models.',
          tags: ['0.5b', '1.5b', '3b', '7b', '14b', '32b', '72b'],
          updated_at: '2024-09-19T00:00:00Z',
          pulls: 8000000
        },
        {
          name: 'mistral',
          description: 'The 7B model released by Mistral AI, updated to version 0.3.',
          tags: ['7b', 'instruct'],
          updated_at: '2024-05-22T00:00:00Z',
          pulls: 5000000
        },
        {
          name: 'phi3',
          description: 'Phi-3 is a family of open AI models developed by Microsoft.',
          tags: ['3.8b', '14b', 'mini', 'medium'],
          updated_at: '2024-04-24T00:00:00Z',
          pulls: 4000000
        },
        {
          name: 'phi4',
          description: 'Phi-4 is Microsoft\'s latest small language model, offering improved performance over Phi-3.',
          tags: ['14b'],
          updated_at: '2024-12-11T00:00:00Z',
          pulls: 3200000
        },
        {
          name: 'codellama',
          description: 'Code Llama is a model for generating and discussing code, built on top of Llama 2.',
          tags: ['7b', '13b', '34b', 'code', 'instruct'],
          updated_at: '2023-08-24T00:00:00Z',
          pulls: 3500000
        },
        {
          name: 'llava',
          description: 'LLaVA is a novel end-to-end trained large multimodal model that combines a vision encoder and Vicuna for general-purpose visual and language understanding.',
          tags: ['7b', '13b', '34b', 'vision', 'multimodal'],
          updated_at: '2023-10-17T00:00:00Z',
          pulls: 3000000
        },
        {
          name: 'gemma2',
          description: 'Gemma 2 is a family of lightweight, state-of-the-art open models from Google.',
          tags: ['2b', '9b', '27b'],
          updated_at: '2024-06-27T00:00:00Z',
          pulls: 2500000
        },
        {
          name: 'qwen',
          description: 'Qwen is a series of Large Language Models developed by Alibaba Cloud.',
          tags: ['0.5b', '1.8b', '4b', '7b', '14b', '72b'],
          updated_at: '2023-09-25T00:00:00Z',
          pulls: 2000000
        },
        {
          name: 'mistral-nemo',
          description: 'A 12B model with 128k context length, developed by Mistral AI in collaboration with NVIDIA.',
          tags: ['12b'],
          updated_at: '2024-07-18T00:00:00Z',
          pulls: 1800000
        },
        {
          name: 'granite3',
          description: 'IBM Granite 3.0 is a family of lightweight, open models for enterprise applications.',
          tags: ['2b', '8b', 'dense', 'moe'],
          updated_at: '2024-12-19T00:00:00Z',
          pulls: 1600000
        },
        {
          name: 'qwen2.5-coder',
          description: 'The latest series of Code-Specific Qwen models, with significant improvements in code generation and reasoning.',
          tags: ['1.5b', '3b', '7b', '14b', '32b', 'code'],
          updated_at: '2024-11-12T00:00:00Z',
          pulls: 1500000
        },
        {
          name: 'llama3',
          description: 'Meta Llama 3: The most capable openly available LLM to date.',
          tags: ['8b', '70b', 'instruct'],
          updated_at: '2024-04-18T00:00:00Z',
          pulls: 15000000
        },
        {
          name: 'gemma',
          description: 'Gemma is a family of lightweight, state-of-the-art open models from Google.',
          tags: ['2b', '7b'],
          updated_at: '2024-02-21T00:00:00Z',
          pulls: 1400000
        },
        {
          name: 'starcoder2',
          description: 'StarCoder2 is the next generation of transparently trained open code LLMs.',
          tags: ['3b', '7b', '15b', 'code'],
          updated_at: '2024-02-28T00:00:00Z',
          pulls: 1300000
        },
        {
          name: 'llava-phi3',
          description: 'A multimodal model that combines the Phi-3 language model with LLaVA\'s visual capabilities.',
          tags: ['3.8b', 'vision', 'multimodal'],
          updated_at: '2024-05-23T00:00:00Z',
          pulls: 1200000
        },
        {
          name: 'marco-o1',
          description: 'Marco-o1 is a large reasoning model trained on Chain-of-Thought data.',
          tags: ['7b', 'reasoning'],
          updated_at: '2024-11-21T00:00:00Z',
          pulls: 1100000
        },
        {
          name: 'nemotron-mini',
          description: 'A compact model in the Nemotron family, optimized for efficiency.',
          tags: ['4b'],
          updated_at: '2024-10-01T00:00:00Z',
          pulls: 1000000
        },
        {
          name: 'dolphin-mistral',
          description: 'An uncensored fine-tune of Mistral with a variety of instruction, conversational, and coding skills.',
          tags: ['7b'],
          updated_at: '2024-03-15T00:00:00Z',
          pulls: 950000
        },
        {
          name: 'aya',
          description: 'Aya 23 is an open weights research release of an instruction following model with highly advanced multilingual capabilities.',
          tags: ['8b', '35b', 'multilingual'],
          updated_at: '2024-05-23T00:00:00Z',
          pulls: 900000
        },
        {
          name: 'mistral-large',
          description: 'Mistral Large: flagship model, top-tier reasoning for high-complexity tasks.',
          tags: ['123b'],
          updated_at: '2024-07-24T00:00:00Z',
          pulls: 850000
        },
        {
          name: 'wizard-vicuna-uncensored',
          description: 'Wizard Vicuna 13B Uncensored is a 13B model for generating and following instructions.',
          tags: ['13b', 'uncensored'],
          updated_at: '2023-07-01T00:00:00Z',
          pulls: 800000
        },
        {
          name: 'nous-hermes2',
          description: 'The flagship Nous Research model trained over the Mistral 7B base.',
          tags: ['7b'],
          updated_at: '2024-01-09T00:00:00Z',
          pulls: 750000
        },
        {
          name: 'llama2',
          description: 'Llama 2 is a collection of foundation language models ranging from 7B to 70B parameters.',
          tags: ['7b', '13b', '70b'],
          updated_at: '2023-07-18T00:00:00Z',
          pulls: 700000
        },
        {
          name: 'deepseek-coder',
          description: 'DeepSeek Coder is a model series for code generation.',
          tags: ['1.3b', '6.7b', '33b', 'code'],
          updated_at: '2023-11-15T00:00:00Z',
          pulls: 650000
        },
        {
          name: 'vicuna',
          description: 'An open-source chatbot trained by fine-tuning LLaMA.',
          tags: ['7b', '13b', '33b'],
          updated_at: '2023-03-30T00:00:00Z',
          pulls: 600000
        },
        {
          name: 'falcon',
          description: 'Falcon is a foundation model from the Technology Innovation Institute.',
          tags: ['7b', '40b', '180b'],
          updated_at: '2023-05-25T00:00:00Z',
          pulls: 550000
        },
        {
          name: 'neural-chat',
          description: 'A fine-tuned model based on Mistral with good conversation capabilities.',
          tags: ['7b'],
          updated_at: '2023-11-01T00:00:00Z',
          pulls: 500000
        }
      ];

      // Parse sizes for each model
      const models = baseModels.map(model => {
        const { sizes, otherTags } = ModelSizeParser.parseModelSizes(model.tags);
        return {
          ...model,
          availableSizes: sizes,
          otherTags
        };
      });

      // Filter by query if provided
      if (query) {
        const queryLower = query.toLowerCase();
        const filtered = models.filter(model => 
          model.name.toLowerCase().includes(queryLower) ||
          model.description?.toLowerCase().includes(queryLower) ||
          model.tags.some(tag => tag.toLowerCase().includes(queryLower))
        );
        console.log(`Filtered to ${filtered.length} models based on query: "${query}"`);
        return filtered;
      }

      console.log(`Returning ${models.length} models from static list`);
      return models;
    } catch (error) {
      console.warn('Failed to get models from static list:', error);
      return [];
    }
  }

  /**
   * Download a model from the Ollama library
   */
  async downloadModel(
    modelName: string,
    onProgress?: (progress: OllamaDownloadProgress) => void
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start download: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for download stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const progress: OllamaDownloadProgress = JSON.parse(line);
              onProgress?.(progress);

              if (progress.status === 'success') {
                return; // Download complete
              }
              
              if (progress.status === 'error') {
                throw new Error(progress.error || 'Download failed');
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete chunks
              continue;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to download model: ${error.message}`);
      }
      throw new Error('Failed to download model: Unknown error');
    }
  }

  /**
   * Load a model into memory (start it)
   */
  async loadModel(modelName: string): Promise<void> {
    try {
      // First check if Ollama is accessible
      const isAccessible = await this.isAccessible();
      if (!isAccessible) {
        throw new Error('Ollama is not accessible. Please ensure Ollama is running.');
      }

      // Use a minimal prompt to load the model
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: 'Hello', // Minimal prompt to load the model
          stream: false,
          options: { num_predict: 1 }, // Only generate 1 token
        }),
        signal: AbortSignal.timeout(60000), // 60 seconds for model loading
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load model: ${response.status} ${response.statusText}. ${errorText}`);
      }

      // The model is now loaded in memory
      console.log(`Model ${modelName} loaded successfully`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load model: ${error.message}`);
      }
      throw new Error('Failed to load model: Unknown error');
    }
  }

  /**
   * Unload a model from memory
   * Note: Ollama doesn't have an explicit unload API, so we signal unload by 
   * making a request that causes Ollama to free the model memory
   */
  async unloadModel(modelName: string): Promise<void> {
    try {
      // First check if Ollama is accessible
      const isAccessible = await this.isAccessible();
      if (!isAccessible) {
        throw new Error('Ollama is not accessible. Please ensure Ollama is running.');
      }

      // Ollama doesn't have a direct unload API, but we can trigger memory cleanup
      // by making a request with keep_alive: 0 which tells Ollama to unload immediately
      await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: '',
          stream: false,
          keep_alive: 0, // This tells Ollama to unload the model immediately
        }),
        signal: AbortSignal.timeout(10000),
      });

      // Even if the response is not OK, the unload signal has been sent
      console.log(`Model ${modelName} unload signal sent to Ollama`);
    } catch (error) {
      // Don't throw error for unload failures - it's not critical
      console.warn(`Warning: Could not send unload signal for model ${modelName}:`, error);
    }
  }

  /**
   * Unload all currently loaded models from memory
   * This is useful for cleanup when the app shuts down
   */
  async unloadAllModels(): Promise<void> {
    try {
      // First check if Ollama is accessible
      const isAccessible = await this.isAccessible();
      if (!isAccessible) {
        console.warn('Ollama is not accessible, skipping model cleanup');
        return;
      }

      // Get list of installed models and try to unload each one
      // This is a simple approach - send unload signal to all models
      const installedModels = await this.getInstalledModels();
      
      if (installedModels.length === 0) {
        console.log('No models found to unload');
        return;
      }

      console.log(`Attempting to unload ${installedModels.length} models...`);
      
      // Send unload signal to all models (parallel for speed)
      const unloadPromises = installedModels.map(async (model) => {
        try {
          await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model.name,
              prompt: '',
              stream: false,
              keep_alive: 0, // This tells Ollama to unload the model immediately
            }),
            signal: AbortSignal.timeout(5000), // Shorter timeout for cleanup
          });
          console.log(`Unload signal sent for model: ${model.name}`);
        } catch (error) {
          // Don't fail the whole operation if one model fails
          console.warn(`Failed to send unload signal for model ${model.name}:`, error);
        }
      });

      // Wait for all unload attempts to complete
      await Promise.allSettled(unloadPromises);
      console.log('All model unload signals sent');
      
    } catch (error) {
      // Don't throw error for unload failures - it's not critical for app shutdown
      console.warn('Warning: Could not complete model cleanup:', error);
    }
  }

  /**
   * Check if a specific model is currently loaded
   */
  async getModelStatus(modelName: string): Promise<OllamaModelStatus> {
    try {
      // First check if Ollama is accessible
      const isAccessible = await this.isAccessible();
      if (!isAccessible) {
        return {
          name: modelName,
          status: 'error',
          error: 'Ollama is not accessible. Please ensure Ollama is running.',
        };
      }

      // Check if the model is installed first
      const installedModels = await this.getInstalledModels();
      const isInstalled = installedModels.some(m => m.name === modelName || m.name.startsWith(modelName + ':'));
      
      if (!isInstalled) {
        return {
          name: modelName,
          status: 'error',
          error: 'Model is not installed. Please install it first.',
        };
      }

      // Test if model responds quickly to determine if it's loaded
      const startTime = Date.now();
      
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: 'Hi',
          stream: false,
          options: { num_predict: 1 },
        }),
        signal: AbortSignal.timeout(3000), // Shorter timeout for status check
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        // If response is fast (< 2 seconds), model is likely loaded
        // Otherwise it might be loading
        const status = responseTime < 2000 ? 'loaded' : 'loading';
        return {
          name: modelName,
          status,
        };
      } else {
        return {
          name: modelName,
          status: 'not_loaded',
          error: `Model not responding: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      // If we get a timeout or connection error, the model is likely not loaded
      return {
        name: modelName,
        status: 'not_loaded',
        error: error instanceof Error ? error.message : 'Model not accessible',
      };
    }
  }

  /**
   * Delete a locally installed model
   */
  async deleteModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete model: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to delete model: ${error.message}`);
      }
      throw new Error('Failed to delete model: Unknown error');
    }
  }

  /**
   * Get detailed information about a model
   */
  async getModelInfo(modelName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get model info: ${error.message}`);
      }
      throw new Error('Failed to get model info: Unknown error');
    }
  }

  /**
   * Generate text using a model (for testing purposes)
   */
  async generate(request: OllamaGenerateRequest): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate: ${error.message}`);
      }
      throw new Error('Failed to generate: Unknown error');
    }
  }
}

// Create a singleton instance
export const ollamaService = new OllamaService();