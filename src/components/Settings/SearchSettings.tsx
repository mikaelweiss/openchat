import { useState, useEffect } from 'react'
import { Plus, Trash2, Eye, EyeOff, Globe, ExternalLink, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react'
import { SearchEngineConfig, SearchEngineKind } from '../../types/search'
import { useSearchStore } from '../../stores/searchStore'

// Helper to get engine metadata
const engineOptions: { value: SearchEngineKind; label: string; requiresKey: boolean; fields?: string[], url: string }[] = [
  { value: 'tavily', label: 'Tavily', requiresKey: true, url: 'https://tavily.com' },
  { value: 'google', label: 'Google Custom Search', requiresKey: true, fields: ['apiKey', 'cx'], url: 'https://developers.google.com/custom-search/v1/overview' },
  { value: 'bing', label: 'Bing Search', requiresKey: true, url: 'https://www.microsoft.com/en-us/bing/apis/bing-web-search-api' },
  { value: 'brave', label: 'Brave Search', requiresKey: true, url: 'https://brave.com/search/api/' },
  { value: 'duckduckgo', label: 'DuckDuckGo', requiresKey: false, url: 'https://duckduckgo.com' }
]

const getEngineLabel = (kind: SearchEngineKind) => engineOptions.find(opt => opt.value === kind)?.label || kind

// Main Component
export default function SearchSettings() {
  const { settings, addSearchEngine, updateSearchEngine, removeSearchEngine, setDefaultEngine, setAutoDetect, getEngineApiKey } = useSearchStore()
  const [isAddingEngine, setIsAddingEngine] = useState(false)

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium mb-2">Web Search</h3>
        <p className="text-sm text-muted-foreground">
          Configure search engines for real-time information retrieval. The AI can automatically search when needed.
        </p>
      </div>

      <AutoDetectToggle checked={settings.autoDetectNeeded} onToggle={setAutoDetect} />

      <DefaultEngineSelector 
        engines={settings.engines} 
        defaultEngine={settings.defaultEngine} 
        onSetDefault={setDefaultEngine} 
      />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium">Configured Search Engines</h4>
          <button
            onClick={() => setIsAddingEngine(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Engine
          </button>
        </div>
        <div className="space-y-4">
          {settings.engines.map((engine, index) => (
            <SearchEngineCard 
              key={index} 
              engine={engine} 
              isDefault={engine.kind === settings.defaultEngine}
              onUpdate={(config) => updateSearchEngine(index, config)}
              onRemove={() => removeSearchEngine(index)}
              getApiKey={() => getEngineApiKey(engine.kind)}
            />
          ))}
        </div>
      </div>

      {isAddingEngine && (
        <AddEngineForm 
          onAdd={addSearchEngine} 
          onClose={() => setIsAddingEngine(false)} 
        />
      )}

      <HelpText />
    </div>
  )
}

// Sub-components for better structure

const AutoDetectToggle = ({ checked, onToggle }: { checked: boolean, onToggle: (enabled: boolean) => void }) => (
  <div className="flex items-start gap-3 p-4 border rounded-lg bg-background">
    <input
      type="checkbox"
      id="autoDetectSearch"
      checked={checked}
      onChange={(e) => onToggle(e.target.checked)}
      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
    />
    <div className="flex-1">
      <label htmlFor="autoDetectSearch" className="text-sm font-medium cursor-pointer">
        Auto-detect search necessity
      </label>
      <p className="text-xs text-muted-foreground mt-1">
        When enabled, the AI will automatically use a search tool when it deems it necessary.
      </p>
    </div>
  </div>
)

const DefaultEngineSelector = ({ engines, defaultEngine, onSetDefault }: { engines: SearchEngineConfig[], defaultEngine: SearchEngineKind, onSetDefault: (kind: SearchEngineKind) => void }) => (
  <div>
    <label className="text-sm font-medium mb-2 block">Default Search Engine</label>
    <select
      value={defaultEngine}
      onChange={(e) => onSetDefault(e.target.value as SearchEngineKind)}
      className="w-full p-2 border border-border rounded-lg bg-background text-foreground"
    >
      {engines.map((engine, index) => (
        <option key={index} value={engine.kind}>
          {getEngineLabel(engine.kind)}
        </option>
      ))}
    </select>
  </div>
)

const SearchEngineCard = ({ engine, isDefault, onUpdate, onRemove, getApiKey }: { engine: SearchEngineConfig, isDefault: boolean, onUpdate: (config: SearchEngineConfig) => void, onRemove: () => void, getApiKey: () => Promise<string | null> }) => {
  const [apiKey, setApiKey] = useState('')
  const [cx, setCx] = useState('cx' in engine ? engine.cx : '')
  const [showKey, setShowKey] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const checkConnection = async () => {
      if ('apiKey' in engine) {
        const key = await getApiKey()
        setIsConnected(!!key)
        setApiKey(key || '')
      } else {
        setIsConnected(true) // Engines without keys are always "connected"
      }
    }
    checkConnection()
  }, [engine, getApiKey])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    if ('apiKey' in engine) {
      onUpdate({ ...engine, apiKey: value })
    }
  }

  const handleCxChange = (value: string) => {
    setCx(value)
    if (engine.kind === 'google') {
      onUpdate({ ...engine, cx: value })
    }
  }

  return (
    <div className="border border-border rounded-lg bg-background transition-all duration-300">
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium text-md">{getEngineLabel(engine.kind)}</span>
          {isDefault && <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">Default</span>}
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-4 w-4" /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-600"><AlertTriangle className="h-4 w-4" /> Not Connected</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="p-4 border-t border-border space-y-3">
          {'apiKey' in engine && (
            <div>
              <label className="text-sm font-medium mb-1 block">API Key</label>
              <div className="relative">
                <input 
                  type={showKey ? 'text' : 'password'} 
                  value={apiKey}
                  onChange={e => handleApiKeyChange(e.target.value)}
                  placeholder="Enter API Key..."
                  className="w-full p-2 pr-10 border border-border rounded-lg bg-input text-foreground"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {engine.kind === 'google' && (
            <div>
              <label className="text-sm font-medium mb-1 block">Custom Search Engine ID (cx)</label>
              <input 
                type="text" 
                value={cx}
                onChange={e => handleCxChange(e.target.value)}
                placeholder="Enter CX..."
                className="w-full p-2 border border-border rounded-lg bg-input text-foreground"
              />
            </div>
          )}

          {engine.kind === 'duckduckgo' && (
            <p className="text-sm text-muted-foreground">DuckDuckGo does not require an API key.</p>
          )}
        </div>
      )}
    </div>
  )
}

const AddEngineForm = ({ onAdd, onClose }: { onAdd: (config: SearchEngineConfig) => Promise<void>, onClose: () => void }) => {
  const [newEngine, setNewEngine] = useState<{ kind: SearchEngineKind, apiKey?: string, cx?: string }>({ kind: 'tavily' })

  const handleAdd = async () => {
    const option = engineOptions.find(o => o.value === newEngine.kind)
    if (!option) return

    let config: SearchEngineConfig
    if (newEngine.kind === 'google') {
      if (!newEngine.apiKey || !newEngine.cx) { alert('API Key and CX are required for Google'); return }
      config = { kind: 'google', apiKey: newEngine.apiKey, cx: newEngine.cx }
    } else if (option.requiresKey) {
      if (!newEngine.apiKey) { alert('API Key is required'); return }
      config = { kind: newEngine.kind, apiKey: newEngine.apiKey } as SearchEngineConfig
    } else {
      config = { kind: 'duckduckgo' }
    }

    await onAdd(config)
    onClose()
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-4 bg-background">
      <h4 className="text-md font-medium">Add New Search Engine</h4>
      <select 
        value={newEngine.kind} 
        onChange={e => setNewEngine({ kind: e.target.value as SearchEngineKind })}
        className="w-full p-2 border border-border rounded-lg bg-input text-foreground"
      >
        {engineOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>

      {engineOptions.find(o => o.value === newEngine.kind)?.requiresKey && (
        <input 
          type="password" 
          placeholder="API Key"
          value={newEngine.apiKey || ''}
          onChange={e => setNewEngine(p => ({ ...p, apiKey: e.target.value }))}
          className="w-full p-2 border border-border rounded-lg bg-input text-foreground"
        />
      )}

      {newEngine.kind === 'google' && (
        <input 
          type="text" 
          placeholder="Custom Search Engine ID (cx)"
          value={newEngine.cx || ''}
          onChange={e => setNewEngine(p => ({ ...p, cx: e.target.value }))}
          className="w-full p-2 border border-border rounded-lg bg-input text-foreground"
        />
      )}

      <div className="flex gap-2">
        <button onClick={handleAdd} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Add Engine</button>
        <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg">Cancel</button>
      </div>
    </div>
  )
}

const HelpText = () => (
  <div className="text-xs text-muted-foreground space-y-2">
    <p><strong>Setup Instructions:</strong></p>
    <ul className="space-y-1 ml-4 list-disc">
      {engineOptions.filter(o => o.requiresKey).map(o => (
        <li key={o.value}><strong>{o.label}:</strong> Visit <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{o.url.split('//')[1]} <ExternalLink className="inline h-3 w-3" /></a></li>
      ))}
      <li><strong>DuckDuckGo:</strong> Free to use, limited to instant answers (not full web search).</li>
    </ul>
  </div>
)