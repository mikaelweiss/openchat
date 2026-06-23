export function isNativeOllamaEndpoint(endpoint: string): boolean {
  return (endpoint.includes('ollama') && !endpoint.includes('ollama.com'))
    || endpoint.includes('11434')
}
