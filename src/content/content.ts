import { ExtensionMessage, TextSelection, TranslationSettings } from '@/types';
import { getTextSelection, calculatePopupPosition, debounce, isValidText } from '@/utils';
import './content.css';

// Add immediate console log to verify script loading
console.log('🔥 Omini Translator: Content script loading...', document.readyState, window.location.href);

class ContentScript {
  private settings: TranslationSettings | null = null;
  private translationPopup: HTMLElement | null = null;
  private isPopupVisible = false;
  private currentSelection: TextSelection | null = null;
  private selectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private translationCache: Map<string, any> = new Map();
  private popupTemplate: HTMLElement | null = null;
  private initialized = false;

  constructor() {
    console.log('🔥 Omini Translator: ContentScript constructor called');
    this.initWhenReady();
  }

  private initWhenReady(): void {
    if (document.readyState === 'loading') {
      console.log('🔥 Omini Translator: Document still loading, waiting...');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('🔥 Omini Translator: DOMContentLoaded, initializing...');
        this.init();
      });
    } else {
      console.log('🔥 Omini Translator: Document ready, initializing immediately...');
      this.init();
    }
  }

  private async init(): Promise<void> {
    if (this.initialized) {
      console.log('🔥 Omini Translator: Already initialized, skipping...');
      return;
    }

    console.log('🔥 Omini Translator: Starting content script initialization...');
    
    try {
      // Pre-create popup template for better performance
      this.preCreatePopupTemplate();
      
      // Load settings
      await this.loadSettings();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Setup message listener
      this.setupMessageListener();
      
      this.initialized = true;
      console.log('🔥 Omini Translator: Content script initialized successfully');
      
      // Send a ready signal to background (if needed for debugging)
      try {
        const response = await this.sendMessageToBackground({ type: 'PING', payload: {} });
        console.log('🔥 Omini Translator: Background script connection verified:', response);
      } catch (error) {
        console.warn('🔥 Omini Translator: Could not verify background connection:', error);
      }
      
    } catch (error) {
      console.error('🔥 Omini Translator: Failed to initialize content script:', error);
      // Don't throw - allow the script to continue functioning partially
    }
  }

  private preCreatePopupTemplate(): void {
    this.popupTemplate = document.createElement('div');
    this.popupTemplate.className = 'omini-translator-popup';
    this.popupTemplate.innerHTML = `
      <div class="omini-translator-popup-content">
        <div class="omini-translator-popup-header">
          <span class="omini-translator-popup-title">Omini Translator</span>
          <button class="omini-translator-popup-close" type="button">×</button>
        </div>
        <div class="omini-translator-popup-body">
          <div class="omini-translator-loading">Translating...</div>
        </div>
      </div>
    `;
    
    // Pre-attach close event listener
    const closeButton = this.popupTemplate.querySelector('.omini-translator-popup-close');
    closeButton?.addEventListener('click', () => this.hideTranslationPopup());
  }

  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${text}:${sourceLang}:${targetLang}`;
  }

  private async loadSettings(): Promise<void> {
    try {
      console.log('🔥 Omini Translator: Loading settings...');
      const response = await this.sendMessageToBackground({
        type: 'GET_SETTINGS',
        payload: {}
      });
      console.log('🔥 Omini Translator: Settings response:', response);
      if (response && response.success && response.settings) {
        this.settings = response.settings;
        console.log('🔥 Omini Translator: Settings loaded successfully:', this.settings);
        console.log('🔥 Omini Translator: Enable shortcuts:', this.settings?.enableShortcuts);
        console.log('🔥 Omini Translator: Shortcuts config:', this.settings?.shortcuts);
      } else {
        console.error('🔥 Omini Translator: Failed to load settings - invalid response:', response);
      }
    } catch (error) {
      console.error('🔥 Omini Translator: Failed to load settings:', error);
    }
  }

  private setupEventListeners(): void {
    // Hide popup when clicking elsewhere
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    
    // Keyboard shortcuts (keep these for manual shortcuts)
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // Add a global keydown listener for debugging
    document.addEventListener('keydown', (event) => {
      const key = this.getKeyString(event);
      console.log('🔥 Global keydown:', key, 'Event:', event);
    });
    
    // Window resize
    window.addEventListener('resize', this.handleWindowResize.bind(this));
    
    // Auto-translation on text selection
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  }

  private setupMessageListener(): void {
    // Listen for messages from background script
    const chromeRuntime = (globalThis as any).chrome?.runtime;
    if (chromeRuntime) {
      chromeRuntime.onMessage.addListener(this.handleMessage.bind(this));
    }
  }

  private handleMessage(message: ExtensionMessage, sender: any, sendResponse: (response: any) => void): boolean {
    console.log('🔥 Content script received message:', message);
    
    // Handle the message asynchronously
    (async () => {
      try {
        switch (message.type) {
          case 'PING':
            // Simple ping response to check if content script is alive
            console.log('🔥 Content script: PING received, responding...');
            sendResponse({ success: true, message: 'pong' });
            break;
          case 'SHOW_TRANSLATION':
            await this.handleShowTranslation(message.payload);
            sendResponse({ success: true });
            break;
          case 'FULL_PAGE_TRANSLATE':
            await this.handleFullPageTranslation();
            sendResponse({ success: true });
            break;
          case 'UPDATE_SETTINGS':
            this.settings = message.payload.settings;
            sendResponse({ success: true });
            break;
          default:
            console.warn('🔥 Content script: Unknown message type:', message.type);
            sendResponse({ success: false, error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('🔥 Content script error handling message:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    })();
    
    return true; // Indicates async response
  }

  private async handleShowTranslation(payload: any): Promise<void> {
    console.log('🔥 Content script handling SHOW_TRANSLATION:', payload);
    
    try {
      // Get current selection to position popup
      const selection = getTextSelection();
      console.log('🔥 Selection for SHOW_TRANSLATION:', selection);
      
      if (selection && selection.text && selection.rect) {
        this.currentSelection = {
          text: selection.text,
          rect: selection.rect,
          context: selection.context
        };
        
        // Create and show popup with the translation using optimized template
        this.hideTranslationPopup();
        
        // Use the same optimized popup creation as showTranslationPopup
        this.translationPopup = this.popupTemplate!.cloneNode(true) as HTMLElement;
        
        // Re-attach event listeners since cloneNode doesn't copy them
        const closeButton = this.translationPopup.querySelector('.omini-translator-popup-close');
        closeButton?.addEventListener('click', () => this.hideTranslationPopup());
        
        document.body.appendChild(this.translationPopup);
        this.positionPopup();
        
        // Make popup visible immediately
        this.isPopupVisible = true;
        
        // Display the translation directly
        if (payload && payload.translation) {
          console.log('🔥 Displaying translation:', payload.translation);
          this.displayTranslation(payload.translation);
        } else {
          console.log('🔥 No translation data, showing error');
          this.showErrorState('No translation data received');
        }
      } else {
        console.log('🔥 No valid selection found for SHOW_TRANSLATION');
      }
    } catch (error) {
      console.error('🔥 Error in handleShowTranslation:', error);
    }
  }

  private handleDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.omini-translator-popup')) {
      this.hideTranslationPopup();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    console.log('🔥 Omini Translator: Key pressed:', event.key, 'Ctrl:', event.ctrlKey, 'Shift:', event.shiftKey, 'Alt:', event.altKey);
    console.log('🔥 Omini Translator: Settings:', this.settings);
    console.log('🔥 Omini Translator: Enable shortcuts:', this.settings?.enableShortcuts);
    
    if (!this.settings?.enableShortcuts) {
      console.log('🔥 Omini Translator: Shortcuts disabled, returning');
      return;
    }
    
    const { shortcuts } = this.settings;
    const key = this.getKeyString(event);
    console.log('🔥 Omini Translator: Generated key string:', key);
    console.log('🔥 Omini Translator: Expected translate key:', shortcuts.translate);
    
    if (key === shortcuts.translate) {
      console.log('🔥 Omini Translator: Translate shortcut matched!');
      event.preventDefault();
      this.handleShortcutTranslate();
    } else if (key === shortcuts.fullPageTranslation) {
      console.log('🔥 Omini Translator: Full page translation shortcut matched!');
      event.preventDefault();
      this.handleFullPageTranslation();
    } else if (key === shortcuts.toggleWordBook) {
      console.log('🔥 Omini Translator: Toggle word book shortcut matched!');
      event.preventDefault();
      this.handleToggleWordBook();
    } else {
      console.log('🔥 Omini Translator: No shortcut matched for key:', key);
    }
  }

  private getKeyString(event: KeyboardEvent): string {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    if (event.metaKey) parts.push('Meta');
    parts.push(event.key);
    return parts.join('+');
  }

  private handleWindowResize(): void {
    if (this.isPopupVisible && this.currentSelection) {
      this.positionPopup();
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    console.log('🔥 Omini Translator: Mouse up event');
    console.log('🔥 Omini Translator: Settings loaded:', !!this.settings);
    console.log('🔥 Omini Translator: Auto translation enabled:', this.settings?.enableAutoTranslation);
    
    // Don't trigger on our own popup
    const target = event.target as HTMLElement;
    if (target.closest('.omini-translator-popup')) {
      console.log('🔥 Omini Translator: Mouse up on popup, ignoring');
      return;
    }
    
    // Only trigger if auto translation is enabled
    if (!this.settings?.enableAutoTranslation) {
      console.log('🔥 Omini Translator: Auto translation disabled, settings:', this.settings);
      return;
    }
    
    console.log('🔥 Omini Translator: Auto translation enabled, checking text selection...');
    
    // Use debounce to avoid multiple triggers
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }
    
    this.selectionTimeout = setTimeout(() => {
      console.log('🔥 Omini Translator: Handling text selection after mouseup');
      this.handleTextSelection();
    }, 300);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    console.log('🔥 Omini Translator: Key up event:', event.key);
    
    // Only trigger for navigation keys that might change selection
    const navigationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!navigationKeys.includes(event.key)) {
      return;
    }
    
    // Only trigger if auto translation is enabled
    if (!this.settings?.enableAutoTranslation) {
      console.log('🔥 Omini Translator: Auto translation disabled');
      return;
    }
    
    // Use debounce to avoid multiple triggers
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }
    
    this.selectionTimeout = setTimeout(() => {
      this.handleTextSelection();
    }, 300);
  }

  private handleSelectionChange(): void {
    console.log('🔥 Omini Translator: Selection change event');
    
    // Only trigger if auto translation is enabled
    if (!this.settings?.enableAutoTranslation) {
      console.log('🔥 Omini Translator: Auto translation disabled');
      return;
    }
    
    // Use debounce to avoid multiple triggers
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }
    
    this.selectionTimeout = setTimeout(() => {
      this.handleTextSelection();
    }, 500); // Longer delay for selection change as it fires more frequently
  }

  private async handleShortcutTranslate(): Promise<void> {
    console.log('🔥 Omini Translator: Handling shortcut translate...');
    
    // First try to get current selection
    const selection = getTextSelection();
    if (selection && selection.text && isValidText(selection.text) && selection.rect) {
      console.log('🔥 Omini Translator: Using selected text:', selection.text);
      this.currentSelection = {
        text: selection.text,
        rect: selection.rect,
        context: selection.context
      };
      await this.showTranslationPopup();
    } else {
      // No selection, show input dialog
      console.log('🔥 Omini Translator: No selection, showing input dialog');
      this.showTranslationInputDialog();
    }
  }

  private handleToggleWordBook(): void {
    // Open word book in options page
    const chromeRuntime = (globalThis as any).chrome?.runtime;
    if (chromeRuntime) {
      chromeRuntime.sendMessage({
        type: 'OPEN_WORD_BOOK',
        payload: {}
      });
    }
  }

  private showTranslationInputDialog(): void {
    const text = prompt('Enter text to translate:');
    if (text && text.trim()) {
      // Create a fake selection at cursor position
      const rect = this.getCursorRect();
      this.currentSelection = {
        text: text.trim(),
        rect: rect,
        context: ''
      };
      this.showTranslationPopup();
    }
  }

  private getCursorRect(): DOMRect {
    // Get cursor position or use center of screen as fallback
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }
    }
    
    // Fallback to center of screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    return new DOMRect(centerX, centerY, 0, 0);
  }

  private async handleTextSelection(): Promise<void> {
    console.log('🔥 Omini Translator: Handling text selection...');
    console.log('🔥 Omini Translator: Current settings:', this.settings);
    console.log('🔥 Omini Translator: Auto translation enabled:', this.settings?.enableAutoTranslation);
    
    try {
      const selection = getTextSelection();
      console.log('🔥 Omini Translator: Selection result:', {
        text: selection?.text,
        hasRect: !!selection?.rect,
        rectSize: selection?.rect ? `${selection.rect.width}x${selection.rect.height}` : 'none',
        context: selection?.context?.substring(0, 50) + '...'
      });
      
      if (!selection || !selection.text || !isValidText(selection.text) || !selection.rect) {
        console.log('🔥 Omini Translator: No valid selection, hiding popup. Reasons:', {
          noSelection: !selection,
          noText: !selection?.text,
          invalidText: selection?.text ? !isValidText(selection.text) : 'no text',
          noRect: !selection?.rect
        });
        this.hideTranslationPopup();
        return;
      }

      // Don't translate if selection is too long (probably not a word or phrase)
      if (selection.text.length > 200) {
        console.log('🔥 Omini Translator: Selection too long, hiding popup. Length:', selection.text.length);
        this.hideTranslationPopup();
        return;
      }

      console.log('🔥 Omini Translator: Valid selection detected:', {
        text: selection.text,
        length: selection.text.length,
        rect: selection.rect
      });
      
      this.currentSelection = {
        text: selection.text,
        rect: selection.rect,
        context: selection.context
      };

      console.log('🔥 Omini Translator: About to show translation popup...');
      await this.showTranslationPopup();
    } catch (error) {
      console.error('🔥 Error in handleTextSelection:', error);
    }
  }

  private async showTranslationPopup(): Promise<void> {
    if (!this.currentSelection) return;

    // Save a local reference to prevent race conditions
    const selection = this.currentSelection;

    try {
      // Hide existing popup (this clears this.currentSelection)
      this.hideTranslationPopup();

      // Restore the selection after hiding
      this.currentSelection = selection;

      // Create popup element from template (faster than createElement)
      this.translationPopup = this.popupTemplate!.cloneNode(true) as HTMLElement;

      // Re-attach event listeners since cloneNode doesn't copy them
      const closeButton = this.translationPopup.querySelector('.omini-translator-popup-close');
      closeButton?.addEventListener('click', () => this.hideTranslationPopup());

      document.body.appendChild(this.translationPopup);

      // Position popup immediately
      this.positionPopup();

      // Show loading state
      this.showLoadingState();

      // Make popup visible immediately
      this.isPopupVisible = true;

      // Check cache first
      const cacheKey = this.getCacheKey(
        selection.text,
        this.settings?.defaultSourceLang || 'auto',
        this.settings?.defaultTargetLang || 'en'
      );

      const cachedResult = this.translationCache.get(cacheKey);
      if (cachedResult) {
        console.log('🔥 Omini Translator: Using cached translation');
        this.displayTranslation(cachedResult);
        return;
      }

      // Request translation
      console.log('🔥 Omini Translator: Requesting translation for:', selection.text);
      const startTime = performance.now();

      const response = await this.sendMessageToBackground({
        type: 'TRANSLATE',
        payload: {
          text: selection.text,
          context: selection.context,
          sourceLang: this.settings?.defaultSourceLang,
          targetLang: this.settings?.defaultTargetLang
        }
      });

      const endTime = performance.now();
      console.log(`🔥 Omini Translator: Translation took ${endTime - startTime}ms`);
      
      // Display translation
      if (response && response.success) {
        // Cache the result
        this.translationCache.set(cacheKey, response.translation);
        
        // Limit cache size to prevent memory issues
        if (this.translationCache.size > 50) {
          const firstKey = this.translationCache.keys().next().value;
          if (firstKey) {
            this.translationCache.delete(firstKey);
          }
        }
        
        this.displayTranslation(response.translation);
      } else {
        this.showErrorState(response?.error || 'Translation failed');
      }
    } catch (error) {
      console.error('🔥 Failed to show translation popup:', error);
      this.showErrorState(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private createPopupElement(): HTMLElement {
    // Use the optimized template-based approach
    const popup = this.popupTemplate!.cloneNode(true) as HTMLElement;
    
    // Re-attach event listeners
    const closeButton = popup.querySelector('.omini-translator-popup-close');
    closeButton?.addEventListener('click', () => this.hideTranslationPopup());

    return popup;
  }

  private positionPopup(): void {
    if (!this.translationPopup || !this.currentSelection?.rect) return;

    // Save local reference to prevent race conditions
    const selectionRect = this.currentSelection.rect;

    // Use requestAnimationFrame for smooth positioning
    requestAnimationFrame(() => {
      if (!this.translationPopup) return;

      const popupRect = this.translationPopup.getBoundingClientRect();
      const position = calculatePopupPosition(
        selectionRect,
        popupRect.width || 320,
        popupRect.height || 200,
        this.settings?.popupPosition || 'bottom-right'
      );

      this.translationPopup.style.left = `${position.x}px`;
      this.translationPopup.style.top = `${position.y}px`;
    });
  }

  private showLoadingState(): void {
    if (!this.translationPopup) return;

    const body = this.translationPopup.querySelector('.omini-translator-popup-body');
    if (body) {
      body.innerHTML = '<div class="omini-translator-loading">Translating...</div>';
    }
  }

  private showErrorState(message: string): void {
    if (!this.translationPopup) return;

    const body = this.translationPopup.querySelector('.omini-translator-popup-body');
    if (body) {
      // Check if this is an API key configuration error
      const isApiKeyError = message.toLowerCase().includes('api key');
      const isConnectionError = message.toLowerCase().includes('receiving end does not exist') || 
                              message.toLowerCase().includes('extension background script');
      
      let errorHtml = '';
      
      if (isApiKeyError) {
        errorHtml = `
          <div class="omini-translator-error">
            <div class="error-title">⚠️ API Key Required</div>
            <div class="error-message">${message}</div>
            <div class="error-actions">
              <button class="omini-translator-btn error-action-btn" onclick="chrome.runtime.openOptionsPage()">
                Open Settings
              </button>
            </div>
          </div>
        `;
      } else if (isConnectionError) {
        errorHtml = `
          <div class="omini-translator-error">
            <div class="error-title">🔌 Connection Error</div>
            <div class="error-message">${message}</div>
            <div class="error-actions">
              <button class="omini-translator-btn error-action-btn" onclick="window.location.reload()">
                Reload Page
              </button>
            </div>
          </div>
        `;
      } else {
        errorHtml = `
          <div class="omini-translator-error">
            <div class="error-title">❌ Translation Error</div>
            <div class="error-message">${message}</div>
          </div>
        `;
      }
      
      body.innerHTML = errorHtml;
    }
  }

  private displayTranslation(translation: any): void {
    if (!this.translationPopup || !translation) return;

    const body = this.translationPopup.querySelector('.omini-translator-popup-body');
    if (!body) return;

    const html = `
      <div class="omini-translator-translation">
        <div class="omini-translator-original">${translation.originalText || ''}</div>
        <div class="omini-translator-result">
          <div class="omini-translator-text">${translation.translatedText || ''}</div>
          ${translation.phonetic ? `<div class="omini-translator-phonetic">${translation.phonetic}</div>` : ''}
          ${translation.pronunciation ? `<div class="omini-translator-pronunciation">${translation.pronunciation}</div>` : ''}
          ${translation.partOfSpeech ? `<div class="omini-translator-pos">${translation.partOfSpeech}</div>` : ''}
          ${translation.explanation ? `<div class="omini-translator-explanation">${translation.explanation}</div>` : ''}
        </div>
        ${translation.examples && translation.examples.length > 0 ? `
          <div class="omini-translator-examples">
            <div class="omini-translator-examples-title">Examples:</div>
            ${translation.examples.map((example: string) => `<div class="omini-translator-example">${example}</div>`).join('')}
          </div>
        ` : ''}
        <div class="omini-translator-actions">
          <button class="omini-translator-btn omini-translator-btn-save" type="button">Save to Word Book</button>
          <button class="omini-translator-btn omini-translator-btn-speak" type="button">Speak</button>
        </div>
      </div>
    `;

    body.innerHTML = html;

    // Add event listeners
    const saveButton = body.querySelector('.omini-translator-btn-save');
    const speakButton = body.querySelector('.omini-translator-btn-speak');

    saveButton?.addEventListener('click', () => this.saveToWordBook(translation));
    speakButton?.addEventListener('click', () => this.speakText(translation.translatedText));
  }

  private async saveToWordBook(translation: any): Promise<void> {
    if (!this.settings?.enableWordBook) return;

    try {
      await this.sendMessageToBackground({
        type: 'SAVE_WORD',
        payload: {
          word: translation.originalText,
          translation: translation.translatedText,
          pronunciation: translation.pronunciation,
          phonetic: translation.phonetic,
          partOfSpeech: translation.partOfSpeech,
          examples: translation.examples,
          explanation: translation.explanation,
          sourceLang: translation.sourceLang,
          targetLang: translation.targetLang
        }
      });

      // Show success feedback
      this.showSaveSuccessMessage();
    } catch (error) {
      console.error('Failed to save word to book:', error);
    }
  }

  private showSaveSuccessMessage(): void {
    const saveButton = this.translationPopup?.querySelector('.omini-translator-btn-save');
    if (saveButton) {
      const originalText = saveButton.textContent;
      saveButton.textContent = 'Saved!';
      saveButton.classList.add('saved');
      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.classList.remove('saved');
      }, 2000);
    }
  }

  private speakText(text: string): void {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.settings?.defaultTargetLang || 'en';
      speechSynthesis.speak(utterance);
    }
  }

  private hideTranslationPopup(): void {
    if (this.translationPopup) {
      this.translationPopup.remove();
      this.translationPopup = null;
    }
    this.isPopupVisible = false;
    this.currentSelection = null;
  }

  private async handleFullPageTranslation(): Promise<void> {
    // This is a placeholder for full page translation
    console.log('🔥 Full page translation requested');
    
    try {
      const pageText = document.body.textContent || '';
      const chunks = this.splitTextIntoChunks(pageText, 1000);
      
      for (const chunk of chunks) {
        if (isValidText(chunk)) {
          const response = await this.sendMessageToBackground({
            type: 'TRANSLATE',
            payload: {
              text: chunk,
              sourceLang: this.settings?.defaultSourceLang,
              targetLang: this.settings?.defaultTargetLang
            }
          });
          
          console.log('🔥 Translated chunk:', response.translation);
        }
      }
    } catch (error) {
      console.error('🔥 Failed to translate page:', error);
    }
  }

  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxLength) {
        currentChunk += sentence + '. ';
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence + '. ';
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  private sendMessageToBackground(message: ExtensionMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log('🔥 Content script: Sending message to background:', message);
      
      const chromeRuntime = (globalThis as any).chrome?.runtime;
      if (!chromeRuntime) {
        console.error('🔥 Content script: Chrome runtime not available');
        reject(new Error('Chrome runtime not available'));
        return;
      }

      try {
        chromeRuntime.sendMessage(message, (response: any) => {
          console.log('🔥 Content script: Received response:', response);
          
          if (chromeRuntime.lastError) {
            console.error('🔥 Content script: Chrome runtime error:', chromeRuntime.lastError);
            
            // Handle specific error cases
            if (chromeRuntime.lastError.message?.includes('Receiving end does not exist')) {
              reject(new Error('Extension background script is not responding. Please reload the extension.'));
            } else {
              reject(new Error(chromeRuntime.lastError.message || 'Communication error'));
            }
          } else if (!response) {
            console.error('🔥 Content script: No response received');
            reject(new Error('No response from background script'));
          } else if (!response.success) {
            console.error('🔥 Content script: Background error:', response.error);
            reject(new Error(response.error || 'Background operation failed'));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.error('🔥 Content script: Exception sending message:', error);
        reject(error);
      }
    });
  }
}

// Global error handler to prevent script crashes
window.addEventListener('error', (event) => {
  console.error('🔥 Omini Translator: Global error caught:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🔥 Omini Translator: Unhandled promise rejection:', event.reason);
});

// Initialize content script with error handling
try {
  console.log('🔥 Omini Translator: Creating ContentScript instance...');
  new ContentScript();
} catch (error) {
  console.error('🔥 Omini Translator: Failed to create ContentScript instance:', error);
} 