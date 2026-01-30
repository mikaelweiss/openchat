import { invoke } from '@tauri-apps/api/core'
import { createWebSearchTool, WebSearchInput, WebSearchOutput, WebSearchInputSchema } from '../types/search'
import { useSearchStore } from '../stores/searchStore'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  name: string
  content: string
}

class ToolService {
  /**
   * Get available tools based on search settings and capabilities
   */
  async getAvailableTools(): Promise<Array<{ type: 'function'; function: { name: string; description: string; parameters: any } }>> {
    console.log('getAvailableTools called')
    const searchStore = useSearchStore.getState()
    console.log('Search store state:', searchStore.settings)
    
    const hasValidEngine = await searchStore.hasValidEngine()
    console.log('hasValidEngine result:', hasValidEngine)
    
    const tools = []
    
    // Add web search tool if available
    if (hasValidEngine) {
      const webSearchTool = createWebSearchTool()
      console.log('Adding web search tool:', webSearchTool)
      tools.push(webSearchTool)
    } else {
      console.log('No valid search engine found, not adding web search tool')
    }
    
    console.log('Final tools array:', tools)
    return tools
  }

  /**
   * Execute a tool call and return the result
   */
  async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    console.log('executeToolCall called with:', toolCall)
    const { function: func } = toolCall
    
    try {
      let result: any
      
      switch (func.name) {
        case 'web_search':
          console.log('Executing web_search tool')
          result = await this.executeWebSearch(func.arguments)
          break
        default:
          throw new Error(`Unknown tool: ${func.name}`)
      }
      
      let formattedContent: string
      if (func.name === 'web_search' && result && result.results) {
        formattedContent = this.formatSearchResults(result)
      } else {
        formattedContent = JSON.stringify(result)
      }

      const toolResult = {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        name: func.name,
        content: formattedContent
      }
      
      console.log('Tool execution successful, returning:', toolResult)
      return toolResult
    } catch (error) {
      console.error(`Tool execution failed for ${func.name}:`, error)
      const errorResult = {
        tool_call_id: toolCall.id,
        role: 'tool' as const,
        name: func.name,
        content: JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Unknown error occurred' 
        })
      }
      console.log('Tool execution failed, returning error:', errorResult)
      return errorResult
    }
  }

  /**
   * Execute web search tool
   */
  private async executeWebSearch(argumentsJson: string): Promise<WebSearchOutput> {
    console.log('executeWebSearch called with:', argumentsJson)
    
    let args: WebSearchInput
    
    try {
      const parsedArgs = JSON.parse(argumentsJson)
      console.log('Parsed arguments:', parsedArgs)
      
      const validationResult = WebSearchInputSchema.safeParse(parsedArgs)
      
      if (!validationResult.success) {
        console.error('Validation failed:', validationResult.error)
        throw new Error(`Invalid arguments: ${validationResult.error.message}`)
      }
      
      args = validationResult.data
      console.log('Validated arguments:', args)
    } catch (error) {
      console.error('Failed to parse/validate arguments:', error)
      throw new Error(`Failed to parse arguments: ${error}`)
    }

    // Get search settings to determine engine
    const searchStore = useSearchStore.getState()
    const engine = searchStore.settings.defaultEngine
    
    console.log('Using search engine:', engine)
    console.log('Search settings:', searchStore.settings)
    
    // Execute search via Tauri command
    const input = {
      query: args.query,
      engine,
      topK: args.topK || 5
    }
    
    console.log('Invoking tool_web_search with input:', input)
    
    try {
      const result = await invoke<WebSearchOutput>('tool_web_search', {
        input
      })
      
      console.log('Search result received:', result)
      return result
    } catch (error) {
      console.error('Tauri command failed:', error)
      throw new Error(`Search command failed: ${error}`)
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const promises = toolCalls.map(toolCall => this.executeToolCall(toolCall))
    return Promise.all(promises)
  }

  /**
   * Check if web search is available
   */
  async isWebSearchAvailable(): Promise<boolean> {
    const searchStore = useSearchStore.getState()
    return await searchStore.hasValidEngine()
  }

  /**
   * Format search results to encourage proper citations
   */
  formatSearchResults(searchOutput: WebSearchOutput): string {
    const { results } = searchOutput
    
    if (!results || results.length === 0) {
      return 'No search results found.'
    }

    let formatted = `Found ${results.length} search result${results.length > 1 ? 's' : ''}:\n\n`
    
    results.forEach((result, index) => {
      formatted += `**Result ${index + 1}:**\n`
      formatted += `**Title:** ${result.title}\n`
      formatted += `**URL:** ${result.url}\n`
      formatted += `**Content:** ${result.snippet}\n`
      formatted += `**Source Engine:** ${result.engine}\n\n`
    })
    
    formatted += '\n---\n'
    formatted += 'CRITICAL CITATION INSTRUCTIONS:\n'
    formatted += '1. You MUST cite sources using INLINE markdown links in this exact format: [number](url)\n'
    formatted += '   Example: According to recent data[1](https://example.com/article), the fact is...\n'
    formatted += '2. DO NOT use reference-style citations like [text][1] or footnote-style citations.\n'
    formatted += '3. DO NOT put citation definitions at the end of your response.\n'
    formatted += '4. Put the citation number immediately after the relevant statement.\n'
    formatted += '5. Use the exact URLs from the search results above.\n'
    formatted += '6. Number citations sequentially: [1](url), [2](url), [3](url), etc.\n'
    formatted += '7. Every factual claim from the search results MUST have an inline citation.\n'
    
    return formatted
  }
}

// Export singleton instance
export const toolService = new ToolService()
