import TelemetryDeck from '@telemetrydeck/sdk';
import { settings } from '../shared/settingsStore';
import { platformInfo, type PlatformInfo } from '../utils/platformInfo';

interface TelemetryConfig {
  appID: string;
  testMode?: boolean;
}

interface SessionData {
  startTime: number;
  messageCount: number;
  conversationCount: number;
}

class TelemetryService {
  private td: TelemetryDeck | null = null;
  private initialized = false;
  private sessionData: SessionData | null = null;
  private platformInfoData: PlatformInfo | null = null;

  private async getOrCreatePersistentUserId(): Promise<string> {
    try {
      // Try to get existing user ID from settings
      let userId = await settings.get('telemetryUserId') as string;
      
      if (!userId) {
        // Generate a new persistent user ID
        userId = 'user-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
        
        // Save it to settings for future sessions
        await settings.set('telemetryUserId', userId);
      }
      
      return userId;
    } catch (error) {
      console.warn('Failed to get/create persistent user ID, using session-based ID:', error);
      return 'session-' + Math.random().toString(36).substring(2, 15);
    }
  }

  public async initialize(config: TelemetryConfig): Promise<void> {
    try {
      // Get platform info first
      this.platformInfoData = await platformInfo.getPlatformInfo();
      
      // Initialize TelemetryDeck with temporary user ID - TelemetryDeck requires clientUser
      this.td = new TelemetryDeck({
        appID: config.appID,
        clientUser: 'initializing', // Temporary - will be updated immediately
        testMode: config.testMode || false,
      });
      
      this.initialized = true;
      console.log('TelemetryDeck initialized successfully');
      
      // Start a new session
      this.startSession();
      
      // Set persistent user ID asynchronously after initialization 
      this.setUserIdAsync();
    } catch (error) {
      console.warn('Failed to initialize TelemetryDeck:', error);
      this.initialized = false;
    }
  }

  private async setUserIdAsync(): Promise<void> {
    try {
      const persistentUserId = await this.getOrCreatePersistentUserId();
      if (this.td) {
        this.td.clientUser = persistentUserId;
        console.log('TelemetryDeck user ID set successfully');
      }
    } catch (error) {
      console.warn('Failed to set TelemetryDeck user ID:', error);
    }
  }

  private isReady(): boolean {
    return this.initialized && this.td !== null;
  }

  public async trackAppLaunched(): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      const metadata = this.getPlatformMetadata();
      await this.td!.signal('App.launched', metadata);
    } catch (error) {
      console.warn('Failed to track app launched:', error);
    }
  }

  public async trackNewConversation(provider: string, model: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Conversation.created', {
        provider,
        model,
      });
      this.incrementConversationCount();
    } catch (error) {
      console.warn('Failed to track new conversation:', error);
    }
  }

  public async trackMessageSent(provider: string, model: string, messageLength: number): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Message.sent', {
        provider,
        model,
        floatValue: messageLength,
      });
      this.incrementMessageCount();
    } catch (error) {
      console.warn('Failed to track message sent:', error);
    }
  }

  public async trackSettingsOpened(section: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Settings.opened', {
        section,
      });
    } catch (error) {
      console.warn('Failed to track settings opened:', error);
    }
  }

  public async trackProviderConfigured(provider: string, model: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Provider.configured', {
        provider,
        model,
      });
    } catch (error) {
      console.warn('Failed to track provider configured:', error);
    }
  }

  public async trackThemeChanged(theme: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Theme.changed', {
        theme,
      });
    } catch (error) {
      console.warn('Failed to track theme changed:', error);
    }
  }

  public async trackOnboardingCompleted(): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Onboarding.completed');
    } catch (error) {
      console.warn('Failed to track onboarding completed:', error);
    }
  }

  public async trackFeatureUsed(feature: string, details?: Record<string, string>): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Feature.used', {
        feature,
        ...details,
      });
    } catch (error) {
      console.warn('Failed to track feature used:', error);
    }
  }

  public async trackError(error: string, context?: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Error.occurred', {
        error,
        context: context || 'unknown',
      });
    } catch (error) {
      console.warn('Failed to track error:', error);
    }
  }

  public updateUser(userId: string): void {
    if (!this.isReady()) return;
    
    try {
      this.td!.clientUser = userId;
    } catch (error) {
      console.warn('Failed to update user:', error);
    }
  }

  // Session Management
  private startSession(): void {
    this.sessionData = {
      startTime: Date.now(),
      messageCount: 0,
      conversationCount: 0,
    };
  }

  public async trackSessionEnd(): Promise<void> {
    if (!this.isReady() || !this.sessionData) return;
    
    try {
      const duration = Math.round((Date.now() - this.sessionData.startTime) / 1000);
      await this.td!.signal('Session.ended', {
        floatValue: duration,
        messageCount: this.sessionData.messageCount.toString(),
        conversationCount: this.sessionData.conversationCount.toString(),
      });
    } catch (error) {
      console.warn('Failed to track session end:', error);
    }
  }

  public incrementMessageCount(): void {
    if (this.sessionData) {
      this.sessionData.messageCount++;
    }
  }

  public incrementConversationCount(): void {
    if (this.sessionData) {
      this.sessionData.conversationCount++;
    }
  }

  // Platform & App Info
  public async trackAppLaunchedWithInfo(): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      const metadata = this.getPlatformMetadata();
      await this.td!.signal('App.launched', metadata);
    } catch (error) {
      console.warn('Failed to track app launched with info:', error);
    }
  }

  private getPlatformMetadata(): Record<string, string> {
    if (!this.platformInfoData) return {};
    
    const metadata: Record<string, string> = {
      os: this.platformInfoData.os,
      osVersion: this.platformInfoData.osVersion,
      arch: this.platformInfoData.arch,
      appVersion: this.platformInfoData.appVersion,
    };

    if (this.platformInfoData.screenWidth) {
      metadata.screenWidth = this.platformInfoData.screenWidth.toString();
    }
    if (this.platformInfoData.screenHeight) {
      metadata.screenHeight = this.platformInfoData.screenHeight.toString();
    }
    if (this.platformInfoData.scaleFactor) {
      metadata.scaleFactor = this.platformInfoData.scaleFactor.toString();
    }

    return metadata;
  }

  public async trackKeyboardShortcut(shortcut: string, action: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Keyboard.shortcutUsed', {
        shortcut,
        action,
      });
    } catch (error) {
      console.warn('Failed to track keyboard shortcut:', error);
    }
  }

  public async trackModelSwitched(fromProvider: string, fromModel: string, toProvider: string, toModel: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Model.switched', {
        fromProvider,
        fromModel,
        toProvider,
        toModel,
      });
    } catch (error) {
      console.warn('Failed to track model switch:', error);
    }
  }

  public async trackConversationSearchUsed(resultCount: number): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Conversation.searched', {
        floatValue: resultCount,
      });
    } catch (error) {
      console.warn('Failed to track conversation search:', error);
    }
  }

  public async trackMessageCopied(): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Message.copied');
    } catch (error) {
      console.warn('Failed to track message copy:', error);
    }
  }

  // Performance Tracking
  public async trackAPIPerformance(provider: string, model: string, duration: number, success: boolean): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('API.performance', {
        provider,
        model,
        success: success.toString(),
        floatValue: duration,
      });
    } catch (error) {
      console.warn('Failed to track API performance:', error);
    }
  }

  public async trackAppStartupTime(duration: number): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('App.startupTime', {
        floatValue: duration,
      });
    } catch (error) {
      console.warn('Failed to track app startup time:', error);
    }
  }

  // Error Tracking
  public async trackAPIError(provider: string, model: string, type: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('API.error', {
        provider,
        model,
        type,
      });
    } catch (error) {
      console.warn('Failed to track API error:', error);
    }
  }

  public async trackRateLimitError(provider: string, model: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('API.rateLimit', {
        provider,
        model,
      });
    } catch (error) {
      console.warn('Failed to track rate limit error:', error);
    }
  }

  // User Journey
  public async trackProviderCount(count: number): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Providers.count', {
        floatValue: count,
      });
    } catch (error) {
      console.warn('Failed to track provider count:', error);
    }
  }

  public async trackProviderSwitch(fromProvider: string, toProvider: string): Promise<void> {
    if (!this.isReady()) return;
    
    try {
      await this.td!.signal('Provider.switched', {
        fromProvider,
        toProvider,
      });
    } catch (error) {
      console.warn('Failed to track provider switch:', error);
    }
  }
}

export const telemetryService = new TelemetryService();
export default telemetryService;