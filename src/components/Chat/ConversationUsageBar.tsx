import { useMemo } from 'react'
import { Zap, DollarSign, MessageSquare, Clock } from 'lucide-react'
import { type Message } from '../../shared/messageStore'
import { tokenService } from '../../services/tokenService'
import clsx from 'clsx'

interface ConversationUsageBarProps {
  messages: Message[]
  className?: string
  showDetails?: boolean
}

export default function ConversationUsageBar({ 
  messages, 
  className = '',
  showDetails = true 
}: ConversationUsageBarProps) {
  
  const stats = useMemo(() => {
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalReasoningTokens = 0
    let totalCachedTokens = 0
    let totalCost = 0
    let messageCount = 0
    let totalProcessingTime = 0
    
    messages.forEach(message => {
      if (message.role === 'assistant') {
        totalInputTokens += message.input_tokens || 0
        totalOutputTokens += message.output_tokens || 0
        totalReasoningTokens += message.reasoning_tokens || 0
        totalCachedTokens += message.cached_tokens || 0
        totalCost += message.cost || 0
        totalProcessingTime += message.processing_time_ms || 0
      }
      messageCount++
    })
    
    const totalTokens = totalInputTokens + totalOutputTokens + totalReasoningTokens
    const avgResponseTime = messages.filter(m => m.role === 'assistant' && m.processing_time_ms).length > 0
      ? totalProcessingTime / messages.filter(m => m.role === 'assistant' && m.processing_time_ms).length
      : 0
    
    return {
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalReasoningTokens,
      totalCachedTokens,
      totalCost,
      messageCount,
      avgResponseTime
    }
  }, [messages])
  
  // Don't show if no data
  if (stats.totalTokens === 0 && stats.totalCost === 0) {
    return null
  }
  
  return (
    <div className={clsx(
      "flex items-center justify-between px-4 py-2 bg-secondary/30 border-b border-border/50",
      className
    )}>
      <div className="flex items-center gap-4 text-sm">
        {/* Message count */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>{stats.messageCount} messages</span>
        </div>
        
        {/* Token count */}
        {stats.totalTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-blue-500" />
            <span className="font-medium">{stats.totalTokens.toLocaleString()}</span>
            <span className="text-muted-foreground">tokens</span>
            {showDetails && stats.totalInputTokens > 0 && stats.totalOutputTokens > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({stats.totalInputTokens.toLocaleString()} in / {stats.totalOutputTokens.toLocaleString()} out
                {stats.totalCachedTokens > 0 && ` / ${stats.totalCachedTokens.toLocaleString()} cached`}
                {stats.totalReasoningTokens > 0 && ` / ${stats.totalReasoningTokens.toLocaleString()} reasoning`})
              </span>
            )}
          </div>
        )}
        
        {/* Cost */}
        {stats.totalCost > 0 && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="font-medium">{tokenService.formatCost(stats.totalCost)}</span>
          </div>
        )}
        
        {/* Average response time */}
        {showDetails && stats.avgResponseTime > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{(stats.avgResponseTime / 1000).toFixed(1)}s avg</span>
          </div>
        )}
      </div>
    </div>
  )
}