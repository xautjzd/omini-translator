import { TranslationSettings, WordEntry, StorageData } from '@/types';

export class StorageService {
  private static instance: StorageService;
  
  private constructor() {}
  
  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // Default settings
  private getDefaultSettings(): TranslationSettings {
    return {
      llmConfig: {
        provider: {
          name: 'openai',
          baseUrl: 'https://api.openai.com',
          apiKey: '',
          model: 'gpt-3.5-turbo'
        },
        temperature: 0.3,
        maxTokens: 1000
      },
      defaultSourceLang: 'auto',
      defaultTargetLang: 'en',
      enableAutoTranslation: true,
      enableWordBook: true,
      popupPosition: 'bottom-right',
      enableContextMenu: true,
      enableShortcuts: true,
      shortcuts: {
        translate: 'Ctrl+T',
        toggleWordBook: 'Ctrl+B',
        fullPageTranslation: 'Ctrl+Shift+T'
      }
    };
  }

  // Promise wrapper for chrome.storage
  private async getFromStorage<T>(area: 'sync' | 'local', key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const storage = (globalThis as any).chrome?.storage?.[area];
      if (!storage) return resolve(undefined);
      storage.get([key], (result: any) => {
        if ((globalThis as any).chrome?.runtime?.lastError) {
          reject((globalThis as any).chrome.runtime.lastError);
        } else {
          resolve(result[key]);
        }
      });
    });
  }

  // Settings management
  async getSettings(): Promise<TranslationSettings> {
    console.log('StorageService: Getting settings...');
    try {
      const settings = await this.getFromStorage<TranslationSettings>('sync', 'settings');
      console.log('StorageService: Storage result:', settings);
      return settings || this.getDefaultSettings();
    } catch (error) {
      console.error('StorageService: Failed to get settings:', error);
      return this.getDefaultSettings();
    }
  }

  async saveSettings(settings: TranslationSettings): Promise<void> {
    try {
      const chromeStorage = (globalThis as any).chrome?.storage;
      if (!chromeStorage) {
        throw new Error('Chrome storage not available');
      }
      await chromeStorage.sync.set({ settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  async updateSettings(partialSettings: Partial<TranslationSettings>): Promise<void> {
    const currentSettings = await this.getSettings();
    const updatedSettings = { ...currentSettings, ...partialSettings };
    await this.saveSettings(updatedSettings);
  }

  // Word book management
  async getWordBook(): Promise<WordEntry[]> {
    try {
      const wordBook = await this.getFromStorage<WordEntry[]>('local', 'wordBook');
      return wordBook || [];
    } catch (error) {
      console.error('Failed to get word book:', error);
      return [];
    }
  }

  async saveWordBook(wordBook: WordEntry[]): Promise<void> {
    try {
      const chromeStorage = (globalThis as any).chrome?.storage;
      if (!chromeStorage) {
        throw new Error('Chrome storage not available');
      }
      await chromeStorage.local.set({ wordBook });
    } catch (error) {
      console.error('Failed to save word book:', error);
      throw error;
    }
  }

  async addWordToBook(word: WordEntry): Promise<void> {
    const wordBook = await this.getWordBook();
    
    // Check if word already exists
    const existingIndex = wordBook.findIndex(w => 
      w.word.toLowerCase() === word.word.toLowerCase() && 
      w.sourceLang === word.sourceLang &&
      w.targetLang === word.targetLang
    );

    if (existingIndex >= 0) {
      // Update existing word
      wordBook[existingIndex] = {
        ...wordBook[existingIndex],
        ...word,
        reviewCount: wordBook[existingIndex].reviewCount + 1,
        lastReviewedAt: Date.now()
      };
    } else {
      // Add new word
      wordBook.push(word);
    }

    await this.saveWordBook(wordBook);
  }

  async removeWordFromBook(wordId: string): Promise<void> {
    const wordBook = await this.getWordBook();
    const filteredWordBook = wordBook.filter(w => w.id !== wordId);
    await this.saveWordBook(filteredWordBook);
  }

  async updateWordInBook(wordId: string, updates: Partial<WordEntry>): Promise<void> {
    const wordBook = await this.getWordBook();
    const wordIndex = wordBook.findIndex(w => w.id === wordId);
    
    if (wordIndex >= 0) {
      wordBook[wordIndex] = { ...wordBook[wordIndex], ...updates };
      await this.saveWordBook(wordBook);
    }
  }

  async searchWordsInBook(query: string): Promise<WordEntry[]> {
    const wordBook = await this.getWordBook();
    const lowerQuery = query.toLowerCase();
    
    return wordBook.filter(word => 
      word.word.toLowerCase().includes(lowerQuery) ||
      word.translation.toLowerCase().includes(lowerQuery) ||
      word.explanation?.toLowerCase().includes(lowerQuery)
    );
  }

  // Statistics management
  async getStatistics() {
    try {
      const result = await chrome.storage.local.get(['statistics']);
      return result.statistics || {
        totalTranslations: 0,
        wordsLearned: 0,
        lastUsed: 0
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return {
        totalTranslations: 0,
        wordsLearned: 0,
        lastUsed: 0
      };
    }
  }

  async updateStatistics(updates: Partial<{ totalTranslations: number; wordsLearned: number; lastUsed: number }>) {
    const currentStats = await this.getStatistics();
    const updatedStats = { ...currentStats, ...updates };
    
    try {
      await chrome.storage.local.set({ statistics: updatedStats });
    } catch (error) {
      console.error('Failed to update statistics:', error);
    }
  }

  async incrementTranslationCount(): Promise<void> {
    const stats = await this.getStatistics();
    await this.updateStatistics({
      totalTranslations: stats.totalTranslations + 1,
      lastUsed: Date.now()
    });
  }

  async incrementWordsLearned(): Promise<void> {
    const stats = await this.getStatistics();
    await this.updateStatistics({
      wordsLearned: stats.wordsLearned + 1,
      lastUsed: Date.now()
    });
  }

  // Export/Import functionality
  async exportData(): Promise<StorageData> {
    const settings = await this.getSettings();
    const wordBook = await this.getWordBook();
    const statistics = await this.getStatistics();

    return {
      settings,
      wordBook,
      statistics
    };
  }

  async importData(data: StorageData): Promise<void> {
    try {
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
      if (data.wordBook) {
        await this.saveWordBook(data.wordBook);
      }
      if (data.statistics) {
        await chrome.storage.local.set({ statistics: data.statistics });
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  // Clear all data
  async clearAllData(): Promise<void> {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }
} 