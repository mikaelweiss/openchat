import Database from '@tauri-apps/plugin-sql'
import { conversationStore } from './conversationStore'
import { titleGenerationService } from '../services/titleGenerationService'
import { settings, SETTINGS_KEYS } from './settingsStore'

// Message Database
class MessageDatabase {
  private db: Database | null = null
  private readonly SCHEMA_VERSION = 3

  async init() {
    if (!this.db) {
      this.db = await Database.load('sqlite:open_chat.db')
      await this.createTable()
      await this.runMigrations()
    }
    return this.db
  }

  private async createTable() {
    const db = this.db!
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
        
        text TEXT,
        thinking TEXT,
        images JSON,
        audio JSON,
        files JSON,
        [references] JSON,
        
        input_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_tokens INTEGER,
        cached_tokens INTEGER,
        cost REAL,
        temperature REAL,
        max_tokens INTEGER,
        top_p REAL,
        top_k INTEGER,
        processing_time_ms INTEGER,
        
        previous_message_id INTEGER,
        provider TEXT,
        model TEXT,
        
        metadata JSON,
        created_at DATETIME,
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
        FOREIGN KEY (previous_message_id) REFERENCES messages (id) ON DELETE SET NULL
      )
    `)

    // Create schema version table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )
    `)
  }

  private async runMigrations() {
    const db = this.db!
    
    // Get current schema version
    const result = await db.select('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1') as { version: number }[]
    const currentVersion = result.length > 0 ? result[0].version : 0

    // Run migrations in sequence
    if (currentVersion < 1) {
      await this.migrate_v1()
    }
    if (currentVersion < 2) {
      await this.migrate_v2_add_sort_order()
    }
    if (currentVersion < 3) {
      await this.migrate_v3_add_multi_model_support()
    }

    // Update schema version
    if (currentVersion < this.SCHEMA_VERSION) {
      await db.execute('DELETE FROM schema_version')
      await db.execute('INSERT INTO schema_version (version) VALUES ($1)', [this.SCHEMA_VERSION])
    }
  }

  private async migrate_v1() {
    // This is the initial migration - table already created by createTable()
    console.log('Migration v1: Initial schema - already handled by createTable()')
  }

  private async migrate_v2_add_sort_order() {
    // Migration removed - sortOrder functionality no longer needed
    console.log('Migration v2: Skipped sortOrder migration (functionality removed)')
  }

  private async migrate_v3_add_multi_model_support() {
    const db = this.db!
    console.log('Migration v3: Adding multi-model support columns')
    
    try {
      // Add new columns
      await db.execute('ALTER TABLE messages ADD COLUMN previous_message_id INTEGER')
      await db.execute('ALTER TABLE messages ADD COLUMN provider TEXT')
      await db.execute('ALTER TABLE messages ADD COLUMN model TEXT')
      
      console.log('Migration v3: Added columns successfully')
      
      // Backfill previous_message_id for existing messages
      const existingMessages = await db.select(
        'SELECT id, conversation_id, created_at FROM messages ORDER BY conversation_id, created_at ASC'
      ) as Array<{id: number, conversation_id: number, created_at: string}>
      
      // Group messages by conversation
      const messagesByConversation = new Map<number, Array<{id: number, created_at: string}>>()
      for (const msg of existingMessages) {
        if (!messagesByConversation.has(msg.conversation_id)) {
          messagesByConversation.set(msg.conversation_id, [])
        }
        messagesByConversation.get(msg.conversation_id)!.push({
          id: msg.id,
          created_at: msg.created_at
        })
      }
      
      // Set previous_message_id for each message
      for (const messages of messagesByConversation.values()) {
        for (let i = 1; i < messages.length; i++) {
          const currentMessage = messages[i]
          const previousMessage = messages[i - 1]
          
          await db.execute(
            'UPDATE messages SET previous_message_id = $1 WHERE id = $2',
            [previousMessage.id, currentMessage.id]
          )
        }
      }
      
      // Migrate provider/model from conversation to existing messages
      const conversations = await db.select(
        'SELECT id, provider, model FROM conversations'
      ) as Array<{id: number, provider: string, model: string}>
      
      for (const conv of conversations) {
        if (conv.provider && conv.model) {
          await db.execute(
            'UPDATE messages SET provider = $1, model = $2 WHERE conversation_id = $3 AND role = "assistant"',
            [conv.provider, conv.model, conv.id]
          )
        }
      }
      
      console.log('Migration v3: Backfilled previous_message_id and provider/model data')
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (errorMessage.includes('duplicate column name')) {
        console.log('Migration v3: Columns already exist, skipping')
      } else {
        console.error('Migration v3 failed:', errorMessage)
        throw err
      }
    }
  }

  async addMessage(conversationId: number, message: CreateMessageInput): Promise<number> {
    const db = await this.init()
    const now = new Date().toISOString()
    
    const result = await db.execute(`
      INSERT INTO messages (
        conversation_id, role, text, thinking, images, audio, files, [references],
        input_tokens, output_tokens, reasoning_tokens, cached_tokens, cost,
        temperature, max_tokens, top_p, top_k, processing_time_ms,
        previous_message_id, provider, model, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `, [
      conversationId,
      message.role,
      message.text || null,
      message.thinking || null,
      message.images ? JSON.stringify(message.images) : null,
      message.audio ? JSON.stringify(message.audio) : null,
      message.files ? JSON.stringify(message.files) : null,
      message.references ? JSON.stringify(message.references) : null,
      message.input_tokens || null,
      message.output_tokens || null,
      message.reasoning_tokens || null,
      message.cached_tokens || null,
      message.cost || null,
      message.temperature || null,
      message.max_tokens || null,
      message.top_p || null,
      message.top_k || null,
      message.processing_time_ms || null,
      message.previous_message_id || null,
      message.provider || null,
      message.model || null,
      message.metadata ? JSON.stringify(message.metadata) : null,
      now
    ])
    
    // Update conversation timestamp
    await conversationStore.touchConversation(conversationId)
    
    // If this is the first user message, update the conversation title
    if (message.role === 'user' && message.text) {
      const allMessages = await this.getMessages(conversationId)
      const userMessages = allMessages.filter(msg => msg.role === 'user')
      
      if (userMessages.length === 1) {
        // This is the first user message, generate a smart title
        await this.generateConversationTitle(conversationId, message.text)
      }
    }
    
    return result.lastInsertId as number
  }

  async getMessages(conversationId: number) {
    const db = await this.init()
    
    const messages = await db.select(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId]
    ) as RawMessage[]
    
    // Parse JSON fields
    return messages.map(this.parseMessage)
  }

  async getMessagesGrouped(conversationId: number): Promise<MessageGroup[]> {
    const messages = await this.getMessages(conversationId)
    
    // Group messages by their relationships
    const messageGroups: MessageGroup[] = []
    const processedIds = new Set<number>()
    
    for (const message of messages) {
      if (processedIds.has(message.id)) continue
      
      // Check if this message has siblings (same previous_message_id)
      const siblings = messages.filter(m => 
        m.previous_message_id === message.previous_message_id &&
        m.previous_message_id !== null
      )
      
      if (siblings.length > 1) {
        // This is a parallel response group
        messageGroups.push({
          type: 'parallel',
          messages: siblings,
          previous_message_id: message.previous_message_id
        })
        siblings.forEach(sibling => processedIds.add(sibling.id))
      } else {
        // This is a single message
        messageGroups.push({
          type: 'single',
          messages: [message],
          previous_message_id: message.previous_message_id
        })
        processedIds.add(message.id)
      }
    }
    
    return messageGroups
  }

  async getMessage(id: number) {
    const db = await this.init()
    const result = await db.select(
      'SELECT * FROM messages WHERE id = $1',
      [id]
    ) as RawMessage[]
    
    return result[0] ? this.parseMessage(result[0]) : null
  }

  async updateMessage(id: number, updates: Partial<CreateMessageInput>) {
    const db = await this.init()
    const fields = []
    const values = []

    if (updates.text !== undefined) {
      fields.push('text = $' + (values.length + 1))
      values.push(updates.text)
    }
    if (updates.thinking !== undefined) {
      fields.push('thinking = $' + (values.length + 1))
      values.push(updates.thinking)
    }
    if (updates.images !== undefined) {
      fields.push('images = $' + (values.length + 1))
      values.push(updates.images ? JSON.stringify(updates.images) : null)
    }
    if (updates.audio !== undefined) {
      fields.push('audio = $' + (values.length + 1))
      values.push(updates.audio ? JSON.stringify(updates.audio) : null)
    }
    if (updates.files !== undefined) {
      fields.push('files = $' + (values.length + 1))
      values.push(updates.files ? JSON.stringify(updates.files) : null)
    }
    if (updates.references !== undefined) {
      fields.push('[references] = $' + (values.length + 1))
      values.push(updates.references ? JSON.stringify(updates.references) : null)
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = $' + (values.length + 1))
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }
    if (updates.previous_message_id !== undefined) {
      fields.push('previous_message_id = $' + (values.length + 1))
      values.push(updates.previous_message_id)
    }
    if (updates.provider !== undefined) {
      fields.push('provider = $' + (values.length + 1))
      values.push(updates.provider)
    }
    if (updates.model !== undefined) {
      fields.push('model = $' + (values.length + 1))
      values.push(updates.model)
    }

    values.push(id)

    return await db.execute(
      `UPDATE messages SET ${fields.join(', ')} WHERE id = $${values.length}`,
      values
    )
  }

  async deleteMessage(id: number) {
    const db = await this.init()
    return await db.execute('DELETE FROM messages WHERE id = $1', [id])
  }

  async deleteMessagesFromConversation(conversationId: number) {
    const db = await this.init()
    return await db.execute('DELETE FROM messages WHERE conversation_id = $1', [conversationId])
  }

  /**
   * Generate a smart conversation title using AI or fall back to text truncation
   */
  private async generateConversationTitle(conversationId: number, userMessage: string) {
    try {
      // Get the title generation model setting
      const titleGenerationModel = await settings.get<string | null>(SETTINGS_KEYS.TITLE_GENERATION_MODEL)
      
      // Get providers to create the config
      const providers = await settings.get<Record<string, any>>(SETTINGS_KEYS.PROVIDERS) || {}
      
      // Create config for title generation
      const config = await titleGenerationService.createConfigFromSettings(titleGenerationModel, providers)
      
      let title: string
      
      if (config) {
        // Use AI to generate the title
        console.log('Generating smart title using model:', titleGenerationModel)
        title = await titleGenerationService.generateTitle(userMessage, config)
      } else {
        // Fall back to simple truncation
        console.log('No title generation model configured, using text truncation')
        title = userMessage.length > 50 
          ? userMessage.substring(0, 47) + '...' 
          : userMessage
      }
      
      // Update the conversation title
      await conversationStore.updateConversationTitle(conversationId, title)
      
    } catch (error) {
      console.error('Failed to generate conversation title:', error)
      
      // Fall back to simple truncation on any error
      const fallbackTitle = userMessage.length > 50 
        ? userMessage.substring(0, 47) + '...' 
        : userMessage
      await conversationStore.updateConversationTitle(conversationId, fallbackTitle)
    }
  }

  private parseMessage(raw: RawMessage): Message {
    return {
      ...raw,
      images: raw.images ? JSON.parse(raw.images) : null,
      audio: raw.audio ? JSON.parse(raw.audio) : null,
      files: raw.files ? JSON.parse(raw.files) : null,
      references: raw.references ? JSON.parse(raw.references) : null,
      metadata: raw.metadata ? JSON.parse(raw.metadata) : null
    }
  }
}

// Export singleton instance
export const messageStore = new MessageDatabase()

// Types
export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  
  text?: string | null
  thinking?: string | null
  images?: MediaItem[] | null
  audio?: MediaItem[] | null
  files?: FileItem[] | null
  references?: Reference[] | null
  
  input_tokens?: number | null
  output_tokens?: number | null
  reasoning_tokens?: number | null
  cached_tokens?: number | null
  cost?: number | null
  temperature?: number | null
  max_tokens?: number | null
  top_p?: number | null
  top_k?: number | null
  processing_time_ms?: number | null
  
  previous_message_id?: number | null
  provider?: string | null
  model?: string | null
  
  metadata?: Record<string, any> | null
  created_at: string
}

export interface CreateMessageInput {
  role: 'user' | 'assistant' | 'system' | 'tool'
  text?: string
  thinking?: string
  images?: MediaItem[]
  audio?: MediaItem[]
  files?: FileItem[]
  references?: Reference[]
  input_tokens?: number
  output_tokens?: number
  reasoning_tokens?: number
  cached_tokens?: number
  cost?: number
  temperature?: number
  max_tokens?: number
  top_p?: number
  top_k?: number
  processing_time_ms?: number
  previous_message_id?: number
  provider?: string
  model?: string
  metadata?: Record<string, any>
}

interface RawMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string | null
  thinking: string | null
  images: string | null
  audio: string | null
  files: string | null
  references: string | null
  input_tokens: number | null
  output_tokens: number | null
  reasoning_tokens: number | null
  cached_tokens: number | null
  cost: number | null
  temperature: number | null
  max_tokens: number | null
  top_p: number | null
  top_k: number | null
  processing_time_ms: number | null
  previous_message_id: number | null
  provider: string | null
  model: string | null
  metadata: string | null
  created_at: string
}

export interface MediaItem {
  url?: string
  file_path?: string
  mime_type?: string
  generated?: boolean
  prompt?: string
  revised_prompt?: string
  voice?: string
  duration_seconds?: number
  transcript?: string
  language?: string
}

export interface FileItem {
  path: string
  name: string
  type: string
  size?: number
  content?: string // Base64 encoded content for sending to providers
}

export interface Reference {
  type: 'citation' | 'search' | 'link'
  url?: string
  title?: string
  snippet?: string
  source?: string
  start_pos?: number
  end_pos?: number
  timestamp?: string
  source_type?: 'news' | 'social' | 'web' | 'academic'
  domain?: string
  published_date?: string
}

export interface MessageGroup {
  type: 'single' | 'parallel'
  messages: Message[]
  previous_message_id?: number | null
}