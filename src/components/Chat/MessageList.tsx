import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, FileText, Image, Volume2 } from 'lucide-react'
import clsx from 'clsx'
import React, { useState, useEffect } from 'react'
import { type Message } from '../../shared/messageStore'
import { useSettings } from '../../hooks/useSettings'
import Lottie from 'react-lottie-player/dist/LottiePlayerLight'
import spinnerAnimation from '../../assets/spinner.json'
import EmptyState from '../EmptyState/EmptyState'
import { CitationBubble, CitationList } from './CitationBubble'

interface MessageListProps {
  messages?: Message[]
  isLoading?: boolean
  streamingMessage?: string
  streamingMessagesByModel?: Map<string, string>
  expectedModels?: Array<{provider: string, model: string}>
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void
}

interface CodeBlockProps {
  children: string
  className?: string
  isDark: boolean
}

function CodeBlock({ children, className, isDark }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : 'text'
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-xl glass-effect border border-border/20 opacity-0 group-hover:opacity-100 transition-all duration-200 elegant-hover text-muted-foreground hover:text-primary"
        title="Copy code"
      >
        {copied ? (
          <Check className="h-3 w-3 text-primary" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language}
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          border: '1px solid hsl(var(--border))',
          overflowX: 'hidden',
          wordWrap: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
          }
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}

function AttachmentDisplay({ attachments }: { attachments: { type: string; path: string; mimeType: string }[] | null }) {
  if (!attachments || attachments.length === 0) return null

  const getAttachmentIcon = (type: string) => {
    switch (type) {
      case 'image':
        return Image
      case 'audio':
        return Volume2
      default:
        return FileText
    }
  }

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {attachments.map((attachment, index) => {
        const Icon = getAttachmentIcon(attachment.type)
        const fileName = attachment.path.split('/').pop() || 'Unknown file'
        
        return (
          <div
            key={index}
            className="flex items-center gap-2 glass-effect border border-border/20 rounded-xl px-3 py-2 text-sm shadow-elegant"
          >
            <Icon className="h-4 w-4 text-primary" />
            <span className="truncate max-w-32 text-foreground/90" title={fileName}>
              {fileName}
            </span>
          </div>
        )
      })}
    </div>
  )
}


export default function MessageList({ messages = [], isLoading = false, streamingMessage = '', streamingMessagesByModel, expectedModels = [], scrollContainerRef, onScroll }: MessageListProps) {
  const [loadingMessage, setLoadingMessage] = useState('Assembling')
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const { userName } = useSettings()
  
  // Group messages by their relationships for side-by-side display
  const groupedMessages = React.useMemo(() => {
    const groups: Array<{ type: 'single' | 'parallel', messages: Message[], timestamp: string }> = []
    const processedIds = new Set<number>()
    
    // If we have expected models and are currently in a multi-model scenario,
    // we need to be more careful about grouping the most recent messages
    const hasActiveMultiModelSession = expectedModels.length > 1 && 
                                       ((streamingMessagesByModel?.size || 0) > 0 || isLoading)
    
    for (const message of messages) {
      if (processedIds.has(message.id)) continue
      
      // Check if this message has siblings (same previous_message_id)
      const siblings = messages.filter(m => 
        m.previous_message_id === message.previous_message_id &&
        m.previous_message_id !== null &&
        m.role === 'assistant' // Only group assistant responses
      )
      
      if (siblings.length > 1) {
        // This is a parallel response group - sort by created_at to ensure consistent order
        const sortedSiblings = siblings.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        groups.push({
          type: 'parallel',
          messages: sortedSiblings,
          timestamp: sortedSiblings[0].created_at
        })
        siblings.forEach(sibling => processedIds.add(sibling.id))
      } else if (hasActiveMultiModelSession && message.role === 'assistant') {
        // If we're in an active multi-model session and this is the most recent assistant message,
        // check if it's part of an ongoing parallel response by looking at timing
        const messageTime = new Date(message.created_at).getTime()
        const now = Date.now()
        const isRecent = (now - messageTime) < 10000 // Within last 10 seconds
        
        if (isRecent) {
          // This might be part of a parallel response - check for other recent assistant messages
          const recentAssistantMessages = messages.filter(m => 
            m.role === 'assistant' && 
            Math.abs(new Date(m.created_at).getTime() - messageTime) < 5000 && // Within 5 second window
            !processedIds.has(m.id)
          )
          
          if (recentAssistantMessages.length > 1) {
            // Multiple recent messages - group as parallel
            const sortedRecent = recentAssistantMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            groups.push({
              type: 'parallel',
              messages: sortedRecent,
              timestamp: sortedRecent[0].created_at
            })
            recentAssistantMessages.forEach(m => processedIds.add(m.id))
          } else {
            // Single recent message - but if we're expecting more models, wait
            groups.push({
              type: 'single',
              messages: [message],
              timestamp: message.created_at
            })
            processedIds.add(message.id)
          }
        } else {
          // Older message - treat as single
          groups.push({
            type: 'single',
            messages: [message],
            timestamp: message.created_at
          })
          processedIds.add(message.id)
        }
      } else {
        // This is a single message
        groups.push({
          type: 'single',
          messages: [message],
          timestamp: message.created_at
        })
        processedIds.add(message.id)
      }
    }
    
    // Sort groups by timestamp to maintain chronological order
    return groups.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [messages, expectedModels, streamingMessagesByModel, isLoading])
  
  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }
  
  // Detect if we're in dark mode
  const isDark = document.documentElement.classList.contains('dark')
  
  useEffect(() => {
    if (!isLoading) return

    const verbs = [
      'Architecting', 'Assembling', 'Brewing', 'Calculating', 'Calibrating', 'Cerebrating', 'Channeling', 'Coalescing', 'Composing', 'Conceptualizing', 'Conjuring', 'Contemplating', 'Crafting', 'Crystallizing', 'Cultivating', 'Curating', 'Deciphering', 'Deliberating', 'Discovering', 'Distilling', 'Emanating', 'Envisioning', 'Exploring', 'Extrapolating', 'Forging', 'Forming', 'Germinating', 'Harmonizing', 'Herding', 'Imagining', 'Incubating', 'Inferring', 'Innovating', 'Manifesting', 'Materializing', 'Musing', 'Orchestrating', 'Parsing', 'Percolating', 'Philosophizing', 'Pioneering', 'Pondering', 'Puttering', 'Rationalizing', 'Refining', 'Sculpting', 'Stewing', 'Strategizing', 'Sussing', 'Synthesizing', 'Theorizing', 'Untangling', 'Unveiling', 'Weaving', 'Working'
    ]

    const pickRandom = () => {
      const next = verbs[Math.floor(Math.random() * verbs.length)]
      setLoadingMessage(next)
    }

    // Pick immediately, then at interval
    pickRandom()
    const interval = setInterval(pickRandom, 2500)
    return () => clearInterval(interval)
  }, [isLoading])
  
  const extractCitations = (text: string) => {
    const citationMap = new Map<number, { number: number, url: string, domain?: string }>()
    const citationRegex = /\[(\d+)\]\((https?:\/\/[^\s)]+)\)/g
    const xmlCitationRegex = /<citation number="(\d+)" url="(https?:\/\/[^\s"]+)"( domain="([^"]+)")?\/>/g
    const simpleCitationRegex = /\[(\d+)\]/g
    
    // Handle markdown citations [1](url)
    let match
    while ((match = citationRegex.exec(text)) !== null) {
      const citation = {
        number: parseInt(match[1]),
        url: match[2],
        domain: new URL(match[2]).hostname.replace(/^www\./, '')
      }
      citationMap.set(citation.number, citation)
    }
    
    // Handle XML citations
    while ((match = xmlCitationRegex.exec(text)) !== null) {
      const citation = {
        number: parseInt(match[1]),
        url: match[2],
        domain: match[4] || new URL(match[2]).hostname.replace(/^www\./, '')
      }
      citationMap.set(citation.number, citation)
    }
    
    // Handle simple citations [1] by mapping to search results
    const numbers = new Set<number>()
    while ((match = simpleCitationRegex.exec(text)) !== null) {
      const number = parseInt(match[1])
      // Only add if not already handled by other formats
      if (!citationMap.has(number)) {
        numbers.add(number)
      }
    }
    
    // Map simple citations to search result URLs
    // More robust pattern that accounts for any content between Title and URL lines
    const resultRegex = /\*\*Result (\d+):\*\*\n\*\*Title:\*\* [^\n]*\n\*\*URL:\*\* (https?:\/\/[^\s\n]+)/g
    while ((match = resultRegex.exec(text)) !== null) {
      const number = parseInt(match[1])
      if (numbers.has(number)) {
        const url = match[2]
        const citation = {
          number,
          url,
          domain: new URL(url).hostname.replace(/^www\./, '')
        }
        citationMap.set(number, citation)
      }
    }
    
    // Fallback: if we still have unmapped simple citations, extract all URLs from the search results section
    if (numbers.size > 0 && citationMap.size < numbers.size) {
      // Look for the search results section
      const resultsSectionMatch = text.match(/Found \d+ search result.*?:\n\n(.*?)\n---\n/s);
      if (resultsSectionMatch) {
        const resultsSection = resultsSectionMatch[1];
        // Extract all URLs from result blocks
        const urlPattern = /\*\*Result (\d+):\*\*\n\*\*Title:\*\* [^\n]*\n\*\*URL:\*\* (https?:\/\/[^\s\n]+)/g;
        const urlMatches: { number: number; url: string }[] = [];
        let urlMatch;
        while ((urlMatch = urlPattern.exec(resultsSection)) !== null) {
          urlMatches.push({
            number: parseInt(urlMatch[1]),
            url: urlMatch[2]
          });
        }
        
        // Map any remaining simple citations
        for (const number of numbers) {
          if (!citationMap.has(number)) {
            const urlMatch = urlMatches.find(m => m.number === number);
            if (urlMatch) {
              const citation = {
                number,
                url: urlMatch.url,
                domain: new URL(urlMatch.url).hostname.replace(/^www\./, '')
              }
              citationMap.set(number, citation);
            }
          }
        }
      }
    }
    
    // Convert map to array and sort by number
    return Array.from(citationMap.values()).sort((a, b) => a.number - b.number)
  }

  const markdownComponents = {
    code: ({ inline, className, children }: any) => {
      // Force inline rendering for short code snippets without newlines
      const codeText = String(children)
      const isActuallyInline = inline || (!className && !codeText.includes('\n') && codeText.length < 100)
      
      if (isActuallyInline) {
        return (
          <code className="glass-effect border border-border/20 px-2 py-1 rounded-lg text-sm shadow-elegant font-mono text-primary/90">
            {children}
          </code>
        )
      }
      
      return (
        <CodeBlock className={className} isDark={isDark}>
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      )
    },
    
    // Handle links specially to catch citations
    a: ({ href, children }: any) => {
      // Check if this is a citation link
      const childText = typeof children === 'string' ? children : (children?.props?.children || String(children))
      const citationMatch = /^\[?(\d+)\]?$/.exec(childText)
      
      if (citationMatch && href) {
        const number = parseInt(citationMatch[1])
        try {
          const domain = new URL(href).hostname.replace(/^www\./, '')
          return (
            <CitationBubble
              key={`citation-link-${number}`}
              number={number}
              url={href}
              domain={domain}
              isInline
            />
          )
        } catch {
          // Fallback if URL parsing fails
          return (
            <CitationBubble
              key={`citation-link-${number}`}
              number={number}
              url={href}
              isInline
            />
          )
        }
      }
      
      // Regular link
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors duration-200"
        >
          {children}
        </a>
      )
    },
    
    text: ({ children }: any) => {
      // Ensure children is a string
      const textContent = typeof children === 'string' ? children : String(children)
      const parts: React.ReactNode[] = []
      let lastIndex = 0
      
      // Handle XML citations, simple citations, and multi-citations
      const xmlRegex = /<citation number="(\d+)" url="(https?:\/\/[^\s"]+)"( domain="([^"]+)")?\/>/g
      const simpleCitationRegex = /\[(\d+)\](?!\()/g // Simple [1] not followed by (
      const multiCitationRegex = /\[(\d+(?:\s*,\s*\d+)*)\]/g // [1, 2, 3] format
      
      // Get the full message text to search for results
      const fullMessageText = textContent
      
      // Helper function to find URL for a citation number
      const findUrlForCitation = (number: number): { url?: string, domain?: string } => {
        // More robust pattern that accounts for any content between Title and URL lines
        const resultRegex = new RegExp(`\\*\\*Result ${number}:\\*\\*\\n\\*\\*Title:\\*\\* [^\\n]*\\n\\*\\*URL:\\*\\* (https?:\\/\\/[^\\s\\n]+)`, 'g')
        const resultMatch = resultRegex.exec(fullMessageText)
        if (resultMatch) {
          const url = resultMatch[1]
          try {
            return {
              url,
              domain: new URL(url).hostname.replace(/^www\./, '')
            }
          } catch {
            return { url }
          }
        }
        
        // Fallback: look for the search results section and extract all URLs
        const resultsSectionMatch = fullMessageText.match(/Found \d+ search result.*?:\n\n(.*?)\n---\n/s)
        if (resultsSectionMatch) {
          const resultsSection = resultsSectionMatch[1]
          // Extract all URLs from result blocks
          const urlPattern = new RegExp(`\\*\\*Result ${number}:\\*\\*\\n\\*\\*Title:\\*\\* [^\\n]*\\n\\*\\*URL:\\*\\* (https?:\\/\\/[^\\s\\n]+)`, 'g')
          const urlMatch = urlPattern.exec(resultsSection)
          if (urlMatch) {
            const url = urlMatch[1]
            try {
              return {
                url,
                domain: new URL(url).hostname.replace(/^www\./, '')
              }
            } catch {
              return { url }
            }
          }
        }
        
        return {}
      }
      
      // Collect all citation matches with their positions
      const allMatches: Array<{
        index: number,
        length: number,
        type: 'xml' | 'simple' | 'multi',
        numbers?: number[],
        number?: number,
        url?: string,
        domain?: string
      }> = []
      
      // Find XML citations
      let match: RegExpExecArray | null
      while ((match = xmlRegex.exec(textContent)) !== null) {
        allMatches.push({
          index: match.index,
          length: match[0].length,
          type: 'xml',
          number: parseInt(match[1]),
          url: match[2],
          domain: match[4] || new URL(match[2]).hostname.replace(/^www\./, '')
        })
      }
      
      // Find multi-citations [1, 2, 3]
      multiCitationRegex.lastIndex = 0
      while ((match = multiCitationRegex.exec(textContent)) !== null) {
        const numbers = match[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n))
        if (numbers.length > 1) {
          allMatches.push({
            index: match.index,
            length: match[0].length,
            type: 'multi',
            numbers: numbers
          })
        }
      }
      
      // Find simple single citations [1]
      simpleCitationRegex.lastIndex = 0
      while ((match = simpleCitationRegex.exec(textContent)) !== null) {
        // Skip if this is part of a multi-citation we already found
        const isPartOfMulti = allMatches.some(m => 
          m.type === 'multi' && 
          match!.index >= m.index && 
          match!.index < m.index + m.length
        )
        
        if (!isPartOfMulti) {
          const number = parseInt(match[1])
          const { url, domain } = findUrlForCitation(number)
          
          allMatches.push({
            index: match.index,
            length: match[0].length,
            type: 'simple',
            number: number,
            url,
            domain
          })
        }
      }
      
      // Sort matches by position and process them
      allMatches.sort((a, b) => a.index - b.index)
      
      for (const citation of allMatches) {
        // Add text before the citation
        if (citation.index > lastIndex) {
          parts.push(textContent.slice(lastIndex, citation.index))
        }
        
        if (citation.type === 'multi' && citation.numbers) {
          // Handle multi-citations [1, 2, 3]
          parts.push('[')
          citation.numbers.forEach((number, index) => {
            if (index > 0) parts.push(', ')
            const { url, domain } = findUrlForCitation(number)
            parts.push(
              <CitationBubble
                key={`citation-multi-${citation.index}-${number}`}
                number={number}
                url={url}
                domain={domain}
                isInline
              />
            )
          })
          parts.push(']')
        } else {
          // Handle single citations
          parts.push(
            <CitationBubble
              key={`citation-${citation.type}-${citation.index}`}
              number={citation.number!}
              url={citation.url}
              domain={citation.domain}
              isInline
            />
          )
        }
        
        lastIndex = citation.index + citation.length
      }
      
      // Add remaining text
      if (lastIndex < textContent.length) {
        parts.push(textContent.slice(lastIndex))
      }
      
      return <>{parts}</>
    },
    // Enhanced styling for other markdown elements
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mb-4 pb-2 border-b border-border">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-bold mb-3 pb-1 border-b border-border">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-semibold mb-2">{children}</h3>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary pl-4 py-2 my-4 bg-secondary/50 rounded-r">
        {children}
      </blockquote>
    ),
    table: ({ children }: any) => (
      <div className="my-4 overflow-hidden">
        <table className="w-full border border-border rounded-lg table-auto">
          {children}
        </table>
      </div>
    ),
    th: ({ children }: any) => (
      <th className="border border-border px-3 py-2 bg-secondary font-semibold text-left break-words">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-border px-3 py-2 break-words">{children}</td>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside my-2 space-y-1 ml-6">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="ml-2">{children}</li>
    ),
  }
  
  // Show empty state if no messages and not loading
  if (groupedMessages.length === 0 && !isLoading && !streamingMessage) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          type="empty-chat"
          title="Start a conversation"
          description="Type a message below to begin chatting with AI"
        />
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto p-6 space-y-8 min-w-0 elegant-scrollbar overscroll-contain"
    >
      {groupedMessages.map((group, groupIndex) => {
        if (group.type === 'single') {
          const message = group.messages[0]
          return (
            <div key={message.id} className="w-full max-w-[950px] mx-auto elegant-fade-in">
              <div className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-semibold text-foreground/95">
                    {message.role === 'user' ? (userName || 'You') : 'Assistant'}
                  </span>
                  <span className="text-xs text-muted-foreground/70 font-medium">
                    {format(new Date(message.created_at), 'h:mm a')}
                  </span>
                </div>
                
                {/* Show file attachments */}
                <AttachmentDisplay attachments={
                  message.images?.map(img => ({ type: 'image', path: img.file_path || img.url || '', mimeType: img.mime_type || 'image/*' })) ||
                  message.audio?.map(audio => ({ type: 'audio', path: audio.file_path || audio.url || '', mimeType: audio.mime_type || 'audio/*' })) ||
                  message.files?.map(file => ({ type: 'file', path: file.path, mimeType: file.type })) ||
                  null
                } />
                
                <div className={clsx(
                  'prose prose-sm dark:prose-invert max-w-none break-words selection:bg-primary/20 p-4 rounded-2xl relative group',
                  message.role === 'user' ? 'message-bubble-user' : 'message-bubble-assistant'
                )}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {message.text || ''}
                  </ReactMarkdown>
                  
                  {message.role === 'assistant' && (
                    <CitationList citations={extractCitations(message.text || '')} />
                  )}
                  
                  <button
                    onClick={() => copyToClipboard(message.text || '', message.id.toString())}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary p-1.5 rounded-lg elegant-hover"
                    title="Copy message"
                  >
                  {copiedMessageId === message.id.toString() ? (
                    <>
                      <Check className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                    </>
                  )}
                  </button>
                </div>
              </div>
            </div>
          )
        } else {
          // Parallel responses - display side by side
          const firstMessage = group.messages[0]
          return (
            <div key={`group-${groupIndex}`} className="w-full max-w-[1200px] mx-auto elegant-fade-in">
              <div className="space-y-3">
                <div className="parallel-responses-header">
                  <span className="font-semibold text-foreground/95">Assistant</span>
                  <span className="parallel-count-badge">
                    {group.messages.length} models
                  </span>
                  <span className="text-xs text-muted-foreground/70 font-medium ml-auto">
                    {format(new Date(firstMessage.created_at), 'h:mm a')}
                  </span>
                </div>
                
                {/* Side by side responses */}
                <div className="comparison-grid">
                  {group.messages.map((message) => (
                    <div key={message.id} className="comparison-response min-w-0">
                      <div className="flex items-center justify-between p-3 pb-0 group">
                        <span className="model-badge truncate">
                          {message.provider}/{message.model}
                        </span>
                        <button
                          onClick={() => copyToClipboard(message.text || '', message.id.toString())}
                          className="opacity-0 group-hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary p-1.5 rounded-lg elegant-hover"
                          title="Copy message"
                        >
                        {copiedMessageId === message.id.toString() ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                        </button>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words selection:bg-primary/20 p-3 pt-2">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {message.text || ''}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
                
              </div>
            </div>
          )
        }
      })}
      
      {/* Streaming messages */}
      {((streamingMessagesByModel && streamingMessagesByModel.size > 1) || (expectedModels.length > 1 && isLoading)) && (
        <div className="w-full max-w-[1200px] mx-auto elegant-fade-in">
          <div className="space-y-3">
            <div className="parallel-responses-header">
              <span className="font-semibold text-foreground/95">Assistant</span>
              <span className="parallel-count-badge">
                {(() => {
                  if (expectedModels.length > 0) {
                    // Count only models that haven't completed yet
                    const activeModels = expectedModels.filter(expectedModel => {
                      const modelKey = `${expectedModel.provider}:${expectedModel.model}`
                      const isStreaming = streamingMessagesByModel ? 
                        Array.from(streamingMessagesByModel.entries())
                          .some(([id]) => id.startsWith(modelKey)) : false
                      const hasCompleted = messages.some(msg => 
                        msg.role === 'assistant' && 
                        msg.provider === expectedModel.provider && 
                        msg.model === expectedModel.model &&
                        msg.previous_message_id === messages.filter(m => m.role === 'user').slice(-1)[0]?.id
                      )
                      return isStreaming || !hasCompleted
                    })
                    return activeModels.length
                  }
                  return streamingMessagesByModel?.size || 1
                })()} {(() => {
                  const count = expectedModels.length > 0 ? 
                    expectedModels.filter(expectedModel => {
                      const modelKey = `${expectedModel.provider}:${expectedModel.model}`
                      const isStreaming = streamingMessagesByModel ? 
                        Array.from(streamingMessagesByModel.entries())
                          .some(([id]) => id.startsWith(modelKey)) : false
                      const hasCompleted = messages.some(msg => 
                        msg.role === 'assistant' && 
                        msg.provider === expectedModel.provider && 
                        msg.model === expectedModel.model &&
                        msg.previous_message_id === messages.filter(m => m.role === 'user').slice(-1)[0]?.id
                      )
                      return isStreaming || !hasCompleted
                    }).length : streamingMessagesByModel?.size || 1
                  return count === 1 ? 'model' : 'models'
                })()}
              </span>
              <span className="text-xs text-muted-foreground/70 font-medium ml-auto">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            {(expectedModels.length > 1 || (streamingMessagesByModel && streamingMessagesByModel.size > 1)) ? (
              /* Multiple responses - display side by side */
              <div className="comparison-grid">
                {expectedModels.length > 0 ? (
                  /* Show expected models with loading states for those not streaming yet */
                  expectedModels.map((expectedModel, index) => {
                    const modelKey = `${expectedModel.provider}:${expectedModel.model}`
                    const streamingContent = streamingMessagesByModel ? 
                      Array.from(streamingMessagesByModel.entries())
                        .find(([id]) => id.startsWith(modelKey))?.[1] : undefined
                    const isStreaming = streamingContent !== undefined
                    
                    // Check if this model has already completed (saved as a message)
                    const hasCompleted = messages.some(msg => 
                      msg.role === 'assistant' && 
                      msg.provider === expectedModel.provider && 
                      msg.model === expectedModel.model &&
                      msg.previous_message_id === messages.filter(m => m.role === 'user').slice(-1)[0]?.id
                    )
                    
                    // Only show loading if the model hasn't started streaming AND hasn't completed
                    const shouldShowLoading = !isStreaming && !hasCompleted
                    
                    // If the model has completed, don't show it in the streaming section at all
                    if (hasCompleted && !isStreaming) {
                      return null
                    }
                    
                    return (
                      <div key={`${modelKey}:${index}`} className="comparison-response min-w-0">
                        <div className="flex items-center justify-between p-3 pb-0 group">
                          <span className="model-badge truncate">
                            {expectedModel.provider}/{expectedModel.model}
                          </span>
                          {isStreaming && (
                            <button
                              onClick={() => copyToClipboard(streamingContent, `streaming-${modelKey}`)}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary p-1.5 rounded-lg elegant-hover"
                              title="Copy message"
                            >
                            {copiedMessageId === `streaming-${modelKey}` ? (
                              <>
                                <Check className="h-3 w-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy
                              </>
                            )}
                            </button>
                          )}
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words selection:bg-primary/20 p-3 pt-2">
                          {isStreaming ? (
                            <>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                              >
                                {streamingContent}
                              </ReactMarkdown>
                              <div className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 rounded-full" />
                            </>
                          ) : shouldShowLoading ? (
                            /* Show loading state only for models that haven't started yet */
                            <div className="flex items-center gap-3">
                              <Lottie
                                animationData={spinnerAnimation}
                                loop
                                play
                                style={{ width: 22, height: 22 }}
                              />
                              <span className="text-sm text-foreground/80 shimmer-loading-text font-medium">{loadingMessage}...</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  }).filter(Boolean)
                ) : (
                  /* Fallback: original streaming display if no expected models provided */
                  streamingMessagesByModel && Array.from(streamingMessagesByModel.entries()).map(([modelId, content]) => {
                    const [provider, modelWithSuffix] = modelId.split(':')
                    // Handle both format: 'provider:model' and 'provider:model#2'
                    const model = modelWithSuffix?.includes('#') ? modelWithSuffix.split('#')[0] : modelWithSuffix
                    const suffix = modelWithSuffix?.includes('#') ? modelWithSuffix.split('#')[1] : ''
                    return (
                      <div key={modelId} className="comparison-response min-w-0">
                        <div className="flex items-center justify-between p-3 pb-0 group">
                          <span className="model-badge truncate">
                            {provider}/{model}{suffix ? `#${suffix}` : ''}
                          </span>
                          <button
                            onClick={() => copyToClipboard(content, `streaming-${modelId}`)}
                            className="opacity-0 group-hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary p-1.5 rounded-lg elegant-hover"
                            title="Copy message"
                          >
                          {copiedMessageId === `streaming-${modelId}` ? (
                            <>
                              <Check className="h-3 w-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copy
                            </>
                          )}
                          </button>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words selection:bg-primary/20 p-3 pt-2">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {content}
                          </ReactMarkdown>
                          <div className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 rounded-full" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              /* Single streaming response - use traditional layout */
              streamingMessagesByModel && Array.from(streamingMessagesByModel.entries()).map(([modelId, content]) => {
                return (
                  <div key={modelId} className="message-bubble-assistant prose prose-sm dark:prose-invert max-w-none break-words selection:bg-primary/20 p-4 rounded-2xl relative group">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {content}
                    </ReactMarkdown>
                    <div className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 rounded-full" />
                    
                    <button
                      onClick={() => copyToClipboard(content, `streaming-${modelId}`)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary p-1.5 rounded-lg elegant-hover"
                      title="Copy message"
                    >
                    {copiedMessageId === `streaming-${modelId}` ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
      
      {/* Single streaming message display */}
      {((streamingMessage && (!streamingMessagesByModel || streamingMessagesByModel.size === 0)) || 
        (streamingMessagesByModel && streamingMessagesByModel.size === 1 && expectedModels.length <= 1)) && (
        <div className="w-full max-w-[950px] mx-auto elegant-fade-in">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="font-semibold text-foreground/95">Assistant</span>
              <span className="text-xs text-muted-foreground/70 font-medium">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <div className="message-bubble-assistant prose prose-sm dark:prose-invert max-w-none break-words selection:bg-primary/20 p-4 rounded-2xl relative group">
              {(() => {
                const content = streamingMessage || 
                  (streamingMessagesByModel && streamingMessagesByModel.size === 1 ? 
                   Array.from(streamingMessagesByModel.values())[0] : '')
                return (
                  <>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {content}
                    </ReactMarkdown>
                    <CitationList citations={extractCitations(content)} />
                  </>
                )
              })()}
              <div className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 rounded-full" />
              
              <button
                onClick={() => {
                  const content = streamingMessage || 
                    (streamingMessagesByModel && streamingMessagesByModel.size === 1 ? 
                     Array.from(streamingMessagesByModel.values())[0] : '')
                  copyToClipboard(content, 'streaming')
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary p-1.5 rounded-lg elegant-hover"
                title="Copy message"
              >
                {copiedMessageId === 'streaming' ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading indicator - show when loading and no streaming started yet, but hide in multi-model mode */}
      {isLoading && !streamingMessage && (!streamingMessagesByModel || streamingMessagesByModel.size === 0) && expectedModels.length <= 1 && (
        <div className="w-full max-w-[950px] mx-auto elegant-fade-in">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="font-semibold text-foreground/95">Assistant</span>
            </div>

            <div className="message-bubble-assistant p-4 rounded-2xl flex items-center gap-3">
              <Lottie
                animationData={spinnerAnimation}
                loop
                play
                style={{ width: 22, height: 22 }}
              />
              <span className="text-sm text-foreground/80 shimmer-loading-text font-medium">{loadingMessage}...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}