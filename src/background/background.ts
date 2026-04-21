import { ExtensionMessage, TranslationRequest, WordEntry, LLMConfig } from '@/types';
import { LLMServiceFactory } from '@/services/LLMService';
import { StorageService } from '@/services/StorageService';
import { generateId } from '@/utils';

class BackgroundScript {
  private storageService: StorageService;

  constructor() {
    this.storageService = StorageService.getInstance();
    this.init();
  }

  private init(): void {
    console.log('Background: Initializing background script...');
    
    // Setup message listeners
    this.setupMessageListeners();
    console.log('Background: Message listeners setup complete');
    
    // Setup context menu
    this.setupContextMenu();
    console.log('Background: Context menu setup complete');
    
    // Setup extension icon click handler
    this.setupActionHandler();
    console.log('Background: Action handler setup complete');
    
    console.log('Background: Omini Translator background script initialized successfully');
  }

  private setupMessageListeners(): void {
    console.log('Background: Setting up message listeners...');
    // Listen for messages from content scripts and popup
    const chromeRuntime = (globalThis as any).chrome?.runtime;
    if (chromeRuntime) {
      chromeRuntime.onMessage.addListener((message: ExtensionMessage, sender: any, sendResponse: (response: any) => void) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Important: indicate async response
      });
      console.log('Background: Message listener added successfully');
    } else {
      console.error('Background: Chrome runtime not available');
    }
  }

  private setupContextMenu(): void {
    const chromeContextMenus = (globalThis as any).chrome?.contextMenus;
    if (chromeContextMenus) {
      chromeContextMenus.removeAll(() => {
        chromeContextMenus.create({
          id: 'translate-selection',
          title: 'Translate "%s"',
          contexts: ['selection'],
          documentUrlPatterns: ['http://*/*', 'https://*/*']
        });

        chromeContextMenus.create({
          id: 'translate-page',
          title: 'Translate this page',
          contexts: ['page'],
          documentUrlPatterns: ['http://*/*', 'https://*/*']
        });

        chromeContextMenus.create({
          id: 'open-wordbook',
          title: 'Open Word Book',
          contexts: ['page', 'selection'],
          documentUrlPatterns: ['http://*/*', 'https://*/*']
        });
      });

      chromeContextMenus.onClicked.addListener(this.handleContextMenuClick.bind(this));
    }
  }

  private setupActionHandler(): void {
    const chromeAction = (globalThis as any).chrome?.action;
    if (chromeAction) {
      chromeAction.onClicked.addListener(this.handleActionClick.bind(this));
    }
  }

  private handleMessage(
    message: ExtensionMessage,
    sender: any,
    sendResponse: (response: any) => void
  ): void {
    (async () => {
      try {
        switch (message.type) {
          case 'TRANSLATE':
            await this.handleTranslateRequest(message.payload, sendResponse);
            break;
          case 'SAVE_WORD':
            await this.handleSaveWordRequest(message.payload, sendResponse);
            break;
          case 'GET_SETTINGS':
            await this.handleGetSettingsRequest(sendResponse);
            break;
          case 'UPDATE_SETTINGS':
            await this.handleUpdateSettingsRequest(message.payload, sendResponse);
            break;
          case 'FULL_PAGE_TRANSLATE':
            await this.handleFullPageTranslateRequest(sender, sendResponse);
            break;
          case 'OPEN_WORD_BOOK':
            await this.handleOpenWordBookRequest(sendResponse);
            break;
          case 'PING':
            sendResponse({ success: true, message: 'pong' });
            break;
          default:
            console.error('Background: Unknown message type:', message.type);
            sendResponse({ error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('Background: Error handling message:', error);
        sendResponse({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    })();
  }

  private async handleTranslateRequest(
    payload: TranslationRequest,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const settings = await this.storageService.getSettings();
      const llmService = LLMServiceFactory.createService(settings.llmConfig);
      
      const translationResponse = await llmService.translate(payload);
      
      // Update statistics
      await this.storageService.incrementTranslationCount();
      
      sendResponse({
        success: true,
        translation: translationResponse
      });
    } catch (error) {
      console.error('Translation error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed'
      });
    }
  }

  private async handleSaveWordRequest(
    payload: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const wordEntry: WordEntry = {
        id: generateId(),
        word: payload.word,
        translation: payload.translation,
        pronunciation: payload.pronunciation,
        phonetic: payload.phonetic,
        partOfSpeech: payload.partOfSpeech,
        examples: payload.examples || [],
        explanation: payload.explanation,
        sourceLang: payload.sourceLang,
        targetLang: payload.targetLang,
        addedAt: Date.now(),
        reviewCount: 0,
        masteryLevel: 0
      };

      await this.storageService.addWordToBook(wordEntry);
      await this.storageService.incrementWordsLearned();

      sendResponse({
        success: true,
        wordEntry: wordEntry
      });
    } catch (error) {
      console.error('Save word error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save word'
      });
    }
  }

  private async handleGetSettingsRequest(
    sendResponse: (response: any) => void
  ): Promise<void> {
    console.log('Background: Handling GET_SETTINGS request');
    try {
      const settings = await this.storageService.getSettings();
      console.log('Background: Settings loaded:', settings);
      sendResponse({
        success: true,
        settings: settings
      });
    } catch (error) {
      console.error('Background: Get settings error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get settings'
      });
    }
  }

  private async handleUpdateSettingsRequest(
    payload: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      await this.storageService.updateSettings(payload.settings);
      
      // Notify all content scripts about settings update
      this.notifyContentScripts({
        type: 'UPDATE_SETTINGS',
        payload: { settings: payload.settings }
      });

      sendResponse({
        success: true
      });
    } catch (error) {
      console.error('Update settings error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update settings'
      });
    }
  }

  private async handleFullPageTranslateRequest(
    sender: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      // Send message to content script to start page translation
      if (sender.tab?.id) {
        const chromeTabs = (globalThis as any).chrome?.tabs;
        if (chromeTabs) {
          chromeTabs.sendMessage(sender.tab.id, {
            type: 'FULL_PAGE_TRANSLATE',
            payload: {}
          });
        }
      }

      sendResponse({
        success: true
      });
    } catch (error) {
      console.error('Full page translate error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to translate page'
      });
    }
  }

  private async handleOpenWordBookRequest(
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const chromeTabs = (globalThis as any).chrome?.tabs;
      if (chromeTabs) {
        chromeTabs.create({
          url: 'options.html#wordbook'
        });
      }
    } catch (error) {
      console.error('Open word book error:', error);
    }
  }

  private async handleContextMenuClick(
    info: any,
    tab?: any
  ): Promise<void> {
    console.log('🔥 Background: Context menu clicked:', info, tab);
    try {
      switch (info.menuItemId) {
        case 'translate-selection':
          console.log('🔥 Background: Translate selection clicked, selectionText:', info.selectionText, 'tabId:', tab?.id);
          if (info.selectionText && tab?.id) {
            await this.translateSelection(info.selectionText, tab.id);
          } else {
            console.error('🔥 Background: Missing selectionText or tabId');
          }
          break;
        case 'translate-page':
          console.log('🔥 Background: Translate page clicked');
          if (tab?.id) {
            await this.translatePage(tab.id);
          }
          break;
        case 'open-wordbook':
          console.log('🔥 Background: Open wordbook clicked');
          await this.openWordBook();
          break;
        default:
          console.log('🔥 Background: Unknown menu item:', info.menuItemId);
      }
    } catch (error) {
      console.error('🔥 Background: Context menu click error:', error);
    }
  }

  private async translateSelection(selectionText: string, tabId: number): Promise<void> {
    console.log('🔥 Background: translateSelection called with:', selectionText, tabId);
    try {
      console.log('🔥 Background: Getting settings...');
      const settings = await this.storageService.getSettings();
      console.log('🔥 Background: Settings retrieved:', settings);
      
      console.log('🔥 Background: Creating LLM service...');
      const llmService = LLMServiceFactory.createService(settings.llmConfig);
      console.log('🔥 Background: LLM service created');
      
      console.log('🔥 Background: Requesting translation...');
      const translationResponse = await llmService.translate({
        text: selectionText,
        sourceLang: settings.defaultSourceLang,
        targetLang: settings.defaultTargetLang
      });
      console.log('🔥 Background: Translation response:', translationResponse);
      
      // Send translation result to content script with improved error handling
      const chromeTabs = (globalThis as any).chrome?.tabs;
      if (chromeTabs) {
        console.log('🔥 Background: Sending SHOW_TRANSLATION message to tab:', tabId);
        
        // First check if the tab still exists and is accessible
        try {
          await new Promise<void>((resolve, reject) => {
            chromeTabs.get(tabId, (tab: any) => {
              if (chromeTabs.lastError) {
                console.error('🔥 Background: Tab not found:', chromeTabs.lastError);
                reject(new Error(`Tab ${tabId} not found: ${chromeTabs.lastError.message}`));
                return;
              }
              
              if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                console.error('🔥 Background: Cannot inject into system page:', tab?.url);
                reject(new Error(`Cannot inject content script into system page: ${tab?.url}`));
                return;
              }
              
              console.log('🔥 Background: Tab is valid:', tab.url);
              resolve();
            });
          });
          
          // Try to inject content script if needed
          try {
            await new Promise<void>((resolve, reject) => {
              chromeTabs.sendMessage(tabId, { type: 'PING' }, (response: any) => {
                if (chromeTabs.lastError) {
                  console.log('🔥 Background: Content script not responding, attempting injection...');
                  // Content script not responding, try to inject it
                  const chromeScripting = (globalThis as any).chrome?.scripting;
                  if (chromeScripting) {
                    chromeScripting.executeScript({
                      target: { tabId: tabId },
                      files: ['content.js']
                    }, () => {
                      if (chromeScripting.lastError) {
                        console.error('🔥 Background: Failed to inject content script:', chromeScripting.lastError);
                        reject(new Error(`Failed to inject content script: ${chromeScripting.lastError.message}`));
                      } else {
                        console.log('🔥 Background: Content script injected successfully');
                        resolve();
                      }
                    });
                  } else {
                    reject(new Error('Chrome scripting API not available'));
                  }
                } else {
                  console.log('🔥 Background: Content script already active');
                  resolve();
                }
              });
            });
          } catch (injectionError) {
            console.error('🔥 Background: Content script injection failed:', injectionError);
            throw injectionError;
          }
          
          // Now send the translation message
          await new Promise<void>((resolve, reject) => {
            chromeTabs.sendMessage(tabId, {
              type: 'SHOW_TRANSLATION',
              payload: {
                translation: translationResponse
              }
            }, (response: any) => {
              console.log('🔥 Background: Content script response:', response);
              if (chromeTabs.lastError) {
                console.error('🔥 Background: Error sending message to content script:', chromeTabs.lastError);
                reject(new Error(`Failed to send message: ${chromeTabs.lastError.message}`));
              } else {
                console.log('🔥 Background: Translation sent successfully');
                resolve();
              }
            });
          });
          
        } catch (communicationError) {
          console.error('🔥 Background: Communication with content script failed:', communicationError);
          
          // Fallback: show notification or alternative UI
          const chromeNotifications = (globalThis as any).chrome?.notifications;
          if (chromeNotifications) {
            chromeNotifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Omini Translator',
              message: `Translation: "${translationResponse.translatedText}"`
            });
          }
        }
      } else {
        console.error('🔥 Background: Chrome tabs API not available');
      }
      
      await this.storageService.incrementTranslationCount();
      console.log('🔥 Background: Translation count incremented');
    } catch (error) {
      console.error('🔥 Background: Context menu translation error:', error);
      
      // Show error notification as fallback
      const chromeNotifications = (globalThis as any).chrome?.notifications;
      if (chromeNotifications) {
        chromeNotifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Omini Translator - Error',
          message: `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
  }

  private async translatePage(tabId: number): Promise<void> {
    try {
      const chromeTabs = (globalThis as any).chrome?.tabs;
      if (chromeTabs) {
        chromeTabs.sendMessage(tabId, {
          type: 'FULL_PAGE_TRANSLATE',
          payload: {}
        });
      }
    } catch (error) {
      console.error('Page translation error:', error);
    }
  }

  private async openWordBook(): Promise<void> {
    try {
      const chromeTabs = (globalThis as any).chrome?.tabs;
      if (chromeTabs) {
        chromeTabs.create({
          url: 'options.html#wordbook'
        });
      }
    } catch (error) {
      console.error('Open word book error:', error);
    }
  }

  private async handleActionClick(tab: any): Promise<void> {
    try {
      // When extension icon is clicked, open popup or options page
      const chromeAction = (globalThis as any).chrome?.action;
      if (chromeAction) {
        chromeAction.setPopup({ popup: 'popup.html' });
      }
    } catch (error) {
      console.error('Action click error:', error);
    }
  }

  private notifyContentScripts(message: ExtensionMessage): void {
    const chromeTabs = (globalThis as any).chrome?.tabs;
    if (chromeTabs) {
      chromeTabs.query({}, (tabs: any[]) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chromeTabs.sendMessage(tab.id, message).catch(() => {
              // Ignore errors for tabs that don't have content scripts
            });
          }
        });
      });
    }
  }
}

// Initialize background script
new BackgroundScript(); 