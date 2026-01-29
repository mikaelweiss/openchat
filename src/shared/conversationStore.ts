import Database from '@tauri-apps/plugin-sql'

// Conversation Database
class ConversationDatabase {
  private db: Database | null = null
  private listeners = new Set<() => void>()

  async init() {
    if (!this.db) {
      this.db = await Database.load('sqlite:open_chat.db')
      await this.createTable()
    }
    return this.db
  }

  private async createTable() {
    if (!this.db) return
    
    // Create schema_version table for migration tracking
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )
    `)
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        is_favorite BOOLEAN DEFAULT FALSE,
        settings TEXT, -- JSON string for conversation-specific settings
        created_at DATETIME,
        updated_at DATETIME
      )
    `)
    
    // Run migrations only if needed
    await this.runMigrations()
  }

  private async runMigrations() {
    if (!this.db) return
    
    try {
      // Get current schema version
      const versionResult = await this.db.select(`SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`) as any[]
      const currentVersion = versionResult.length > 0 ? versionResult[0].version : 0
      
      // Migration 1: Add settings column (version 1)
      if (currentVersion < 1) {
        try {
          await this.db.execute(`ALTER TABLE conversations ADD COLUMN settings TEXT`)
          await this.db.execute(`INSERT OR REPLACE INTO schema_version (version) VALUES (1)`)
          console.log('Migration 1: Added settings column to conversations table')
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          if (errorMessage.includes('duplicate column name')) {
            // Column already exists, just update version
            await this.db.execute(`INSERT OR REPLACE INTO schema_version (version) VALUES (1)`)
            console.log('Migration 1: Settings column already exists, updated version')
          } else {
            console.error('Migration 1 failed:', errorMessage)
          }
        }
      }
      
      // Future migrations can be added here with version checks
      // if (currentVersion < 2) { ... }
      
    } catch (err) {
      console.error('Failed to run migrations:', err)
    }
  }

  // Listener management
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener())
  }

  async createConversation(title: string, provider: string, model: string, systemPrompt?: string, settings?: string) {
    const db = await this.init()
    const now = new Date().toISOString()
    const result = await db.execute(
      'INSERT INTO conversations (title, provider, model, system_prompt, settings, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [title, provider, model, systemPrompt || null, settings || null, now, now]
    )
    this.notifyListeners()
    return result.lastInsertId
  }

  async getConversations() {
    const db = await this.init()
    const conversations = await db.select(
      'SELECT * FROM conversations ORDER BY updated_at DESC'
    ) as any[]
    
    // Convert SQLite integers to booleans for is_favorite
    return conversations.map(conv => ({
      ...conv,
      is_favorite: Boolean(conv.is_favorite)
    })) as Conversation[]
  }

  async getConversation(id: number) {
    const db = await this.init()
    const result = await db.select(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    ) as any[]
    
    if (result[0]) {
      return {
        ...result[0],
        is_favorite: Boolean(result[0].is_favorite)
      } as Conversation
    }
    return null
  }

  async updateConversation(id: number, updates: Partial<Pick<Conversation, 'title' | 'provider' | 'model' | 'system_prompt' | 'is_favorite' | 'settings'>>) {
    const db = await this.init()
    const fields = []
    const values = []

    if (updates.title !== undefined) {
      fields.push('title = $' + (values.length + 1))
      values.push(updates.title)
    }
    if (updates.provider !== undefined) {
      fields.push('provider = $' + (values.length + 1))
      values.push(updates.provider)
    }
    if (updates.model !== undefined) {
      fields.push('model = $' + (values.length + 1))
      values.push(updates.model)
    }
    if (updates.system_prompt !== undefined) {
      fields.push('system_prompt = $' + (values.length + 1))
      values.push(updates.system_prompt)
    }
    if (updates.is_favorite !== undefined) {
      fields.push('is_favorite = $' + (values.length + 1))
      values.push(updates.is_favorite)
    }
    if (updates.settings !== undefined) {
      fields.push('settings = $' + (values.length + 1))
      values.push(updates.settings)
    }

    fields.push('updated_at = $' + (values.length + 1))
    values.push(new Date().toISOString())
    values.push(id)

    const result = await db.execute(
      `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${values.length}`,
      values
    )
    this.notifyListeners()
    return result
  }

  async deleteConversation(id: number) {
    const db = await this.init()
    const result = await db.execute('DELETE FROM conversations WHERE id = $1', [id])
    this.notifyListeners()
    return result
  }

  async touchConversation(id: number) {
    const db = await this.init()
    const now = new Date().toISOString()
    const result = await db.execute(
      'UPDATE conversations SET updated_at = $1 WHERE id = $2',
      [now, id]
    )
    this.notifyListeners()
    return result
  }

  async updateConversationTitle(id: number, title: string) {
    const db = await this.init()
    const now = new Date().toISOString()
    const result = await db.execute(
      'UPDATE conversations SET title = $1, updated_at = $2 WHERE id = $3',
      [title, now, id]
    )
    this.notifyListeners()
    return result
  }

  async toggleConversationFavorite(id: number) {
    const db = await this.init()
    const result = await db.execute(
      'UPDATE conversations SET is_favorite = NOT is_favorite WHERE id = $1',
      [id]
    )
    this.notifyListeners()
    return result
  }
}

// Export singleton instance
export const conversationStore = new ConversationDatabase()

// Types
export interface Conversation {
  id: number
  title: string
  provider: string
  model: string
  system_prompt: string | null
  is_favorite: boolean
  settings: string | null // JSON string for conversation-specific settings
  created_at: string
  updated_at: string
}