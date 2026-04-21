// LLM Provider types
export interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LLMConfig {
  provider: LLMProvider;
  temperature: number;
  maxTokens: number;
}

// Translation types
export interface TranslationRequest {
  text: string;
  sourceLang?: string;
  targetLang: string;
  context?: string;
}

export interface TranslationResponse {
  originalText: string;
  translatedText: string;
  pronunciation?: string;
  phonetic?: string;
  partOfSpeech?: string;
  examples?: string[];
  explanation?: string;
  sourceLang: string;
  targetLang: string;
}

// Word Book types
export interface WordEntry {
  id: string;
  word: string;
  translation: string;
  pronunciation?: string;
  phonetic?: string;
  partOfSpeech?: string;
  examples?: string[];
  explanation?: string;
  sourceLang: string;
  targetLang: string;
  addedAt: number;
  lastReviewedAt?: number;
  reviewCount: number;
  masteryLevel: number; // 0-5
}

// Settings types
export interface TranslationSettings {
  llmConfig: LLMConfig;
  defaultSourceLang: string;
  defaultTargetLang: string;
  enableAutoTranslation: boolean;
  enableWordBook: boolean;
  popupPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  enableContextMenu: boolean;
  enableShortcuts: boolean;
  shortcuts: {
    translate: string;
    toggleWordBook: string;
    fullPageTranslation: string;
  };
}

// Message types for extension communication
export interface ExtensionMessage {
  type: 'TRANSLATE' | 'SAVE_WORD' | 'GET_SETTINGS' | 'UPDATE_SETTINGS' | 'FULL_PAGE_TRANSLATE' | 'SHOW_TRANSLATION' | 'OPEN_WORD_BOOK' | 'PING';
  payload: any;
}

// Selection types
export interface TextSelection {
  text: string;
  rect: DOMRect;
  context?: string;
}

// Popup types
export interface PopupPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TranslationPopupProps {
  selection: TextSelection;
  position: PopupPosition;
  onClose: () => void;
  onSaveWord: (word: WordEntry) => void;
}

// Language types
export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

// Error types
export interface TranslationError {
  code: string;
  message: string;
  details?: any;
}

// Storage types
export interface StorageData {
  settings: TranslationSettings;
  wordBook: WordEntry[];
  statistics: {
    totalTranslations: number;
    wordsLearned: number;
    lastUsed: number;
  };
} 