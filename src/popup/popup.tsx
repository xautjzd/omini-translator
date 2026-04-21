import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TranslationSettings, WordEntry, TranslationResponse } from '@/types';
import { LANGUAGES } from '@/utils';
import './popup.css';

interface PopupState {
  settings: TranslationSettings | null;
  wordBook: WordEntry[];
  statistics: {
    totalTranslations: number;
    wordsLearned: number;
    lastUsed: number;
  };
  isLoading: boolean;
  error: string | null;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    settings: null,
    wordBook: [],
    statistics: {
      totalTranslations: 0,
      wordsLearned: 0,
      lastUsed: 0
    },
    isLoading: true,
    error: null
  });

  const [activeTab, setActiveTab] = useState<'translate' | 'wordbook' | 'settings'>('translate');
  const [translationText, setTranslationText] = useState('');
  const [translationResult, setTranslationResult] = useState<TranslationResponse | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      console.log('Popup: Loading settings...');
      const response = await sendMessageToBackground({ type: 'GET_SETTINGS', payload: {} });
      console.log('Popup: Settings response:', response);
      
      if (response && response.success) {
        setState(prev => ({
          ...prev,
          settings: response.settings,
          isLoading: false
        }));
      } else {
        const errorMessage = response?.error || 'Unknown error occurred';
        console.error('Popup: Failed to load settings:', errorMessage);
        setState(prev => ({
          ...prev,
          error: `Failed to load settings: ${errorMessage}`,
          isLoading: false
        }));
      }
    } catch (error) {
      console.error('Popup: Exception loading settings:', error);
      setState(prev => ({
        ...prev,
        error: `Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false
      }));
    }
  };

  const sendMessageToBackground = (message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      console.log('Popup: Sending message to background:', message);
      const chromeRuntime = (globalThis as any).chrome?.runtime;
      if (!chromeRuntime) {
        console.error('Popup: Chrome runtime not available');
        reject(new Error('Chrome runtime not available'));
        return;
      }
      
      chromeRuntime.sendMessage(message, (response: any) => {
        console.log('Popup: Received response:', response);
        if (chromeRuntime.lastError) {
          console.error('Popup: Chrome runtime error:', chromeRuntime.lastError);
          reject(chromeRuntime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  };

  const handleTranslate = async () => {
    if (!translationText.trim() || !state.settings) return;

    setIsTranslating(true);
    setTranslationResult(null);

    try {
      const response = await sendMessageToBackground({
        type: 'TRANSLATE',
        payload: {
          text: translationText,
          sourceLang: state.settings.defaultSourceLang,
          targetLang: state.settings.defaultTargetLang
        }
      });

      if (response.success) {
        setTranslationResult(response.translation);
      } else {
        setState(prev => ({ ...prev, error: response.error }));
      }
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Translation failed' }));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveWord = async (translation: TranslationResponse) => {
    if (!state.settings?.enableWordBook) return;

    try {
      const response = await sendMessageToBackground({
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

      if (response.success) {
        // Show success message
        alert('Word saved to book!');
      }
    } catch (error) {
      console.error('Failed to save word:', error);
    }
  };

  const openOptionsPage = () => {
    const chromeTabs = (globalThis as any).chrome?.tabs;
    if (chromeTabs) {
      chromeTabs.create({ url: 'options.html' });
    }
  };

  if (state.isLoading) {
    return (
      <div className="popup-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="popup-container">
        <div className="error-state">
          <p>Error: {state.error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1 className="popup-title">Omini Translator</h1>
        <div className="popup-tabs">
          <button
            className={`tab-button ${activeTab === 'translate' ? 'active' : ''}`}
            onClick={() => setActiveTab('translate')}
          >
            Translate
          </button>
          <button
            className={`tab-button ${activeTab === 'wordbook' ? 'active' : ''}`}
            onClick={() => setActiveTab('wordbook')}
          >
            Word Book
          </button>
          <button
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
      </div>

      <div className="popup-content">
        {activeTab === 'translate' && (
          <div className="translate-tab">
            <div className="translate-form">
              <div className="language-selector">
                <select
                  value={state.settings?.defaultSourceLang || 'auto'}
                  onChange={(e) => {
                    if (state.settings) {
                      setState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings!,
                          defaultSourceLang: e.target.value
                        }
                      }));
                    }
                  }}
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <span className="arrow">→</span>
                <select
                  value={state.settings?.defaultTargetLang || 'en'}
                  onChange={(e) => {
                    if (state.settings) {
                      setState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings!,
                          defaultTargetLang: e.target.value
                        }
                      }));
                    }
                  }}
                >
                  {LANGUAGES.filter(lang => lang.code !== 'auto').map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-input">
                <textarea
                  value={translationText}
                  onChange={(e) => setTranslationText(e.target.value)}
                  placeholder="Enter text to translate..."
                  rows={4}
                />
              </div>

              <button
                className="translate-button"
                onClick={handleTranslate}
                disabled={isTranslating || !translationText.trim()}
              >
                {isTranslating ? 'Translating...' : 'Translate'}
              </button>
            </div>

            {translationResult && (
              <div className="translation-result">
                <div className="result-header">
                  <h3>Translation Result</h3>
                  <button
                    className="save-button"
                    onClick={() => handleSaveWord(translationResult)}
                  >
                    Save to Book
                  </button>
                </div>
                <div className="result-content">
                  <div className="translated-text">{translationResult.translatedText}</div>
                  {translationResult.phonetic && (
                    <div className="phonetic">/{translationResult.phonetic}/</div>
                  )}
                  {translationResult.pronunciation && (
                    <div className="pronunciation">{translationResult.pronunciation}</div>
                  )}
                  {translationResult.partOfSpeech && (
                    <div className="part-of-speech">{translationResult.partOfSpeech}</div>
                  )}
                  {translationResult.explanation && (
                    <div className="explanation">{translationResult.explanation}</div>
                  )}
                  {translationResult.examples && translationResult.examples.length > 0 && (
                    <div className="examples">
                      <h4>Examples:</h4>
                      {translationResult.examples.map((example, index) => (
                        <div key={index} className="example">{example}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'wordbook' && (
          <div className="wordbook-tab">
            <div className="wordbook-header">
              <h3>Word Book</h3>
              <button className="open-full-wordbook" onClick={openOptionsPage}>
                View All
              </button>
            </div>
            <div className="wordbook-content">
              <p>Recent words will appear here...</p>
              <p className="wordbook-hint">
                Click "View All" to see your complete word book
              </p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-tab">
            <h3>API Configuration</h3>
            
            {(!state.settings?.llmConfig?.provider?.apiKey || state.settings.llmConfig.provider.apiKey === '') && (
              <div className="api-key-warning">
                <p>⚠️ API Key not configured. Please configure your API key to use translation features.</p>
              </div>
            )}
            
            <div className="setting-group">
              <label htmlFor="provider-select">AI Provider:</label>
              <select
                id="provider-select"
                value={state.settings?.llmConfig?.provider?.name || 'openai'}
                onChange={(e) => {
                  if (state.settings) {
                    const providerName = e.target.value;
                    const baseUrl = providerName === 'openai' ? 'https://api.openai.com' :
                                  providerName === 'deepseek' ? 'https://api.deepseek.com' :
                                  providerName === 'claude' ? 'https://api.anthropic.com' :
                                  'https://dashscope.aliyuncs.com';
                    
                    const model = providerName === 'openai' ? 'gpt-4.1' :
                                 providerName === 'deepseek' ? 'deepseek-chat' :
                                 providerName === 'claude' ? 'claude-3-haiku-20240307' :
                                 'qwen-turbo';
                    
                    setState(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings!,
                        llmConfig: {
                          ...prev.settings!.llmConfig,
                          provider: {
                            ...prev.settings!.llmConfig.provider,
                            name: providerName,
                            baseUrl: baseUrl,
                            model: model
                          }
                        }
                      }
                    }));
                  }
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek (Recommended)</option>
                <option value="claude">Claude</option>
                <option value="qwen">Qwen</option>
              </select>
            </div>
            
            <div className="setting-group">
              <label htmlFor="api-key">API Key:</label>
              <input
                id="api-key"
                type="password"
                placeholder="Enter your API key"
                value={state.settings?.llmConfig?.provider?.apiKey || ''}
                onChange={(e) => {
                  if (state.settings) {
                    setState(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings!,
                        llmConfig: {
                          ...prev.settings!.llmConfig,
                          provider: {
                            ...prev.settings!.llmConfig.provider,
                            apiKey: e.target.value
                          }
                        }
                      }
                    }));
                  }
                }}
              />
            </div>
            
            <div className="setting-group">
              <label>
                <input
                  type="checkbox"
                  checked={state.settings?.enableAutoTranslation || false}
                  onChange={(e) => {
                    if (state.settings) {
                      setState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings!,
                          enableAutoTranslation: e.target.checked
                        }
                      }));
                    }
                  }}
                />
                Enable Auto Translation
              </label>
            </div>
            
            <div className="setting-group">
              <label>
                <input
                  type="checkbox"
                  checked={state.settings?.enableWordBook || false}
                  onChange={(e) => {
                    if (state.settings) {
                      setState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings!,
                          enableWordBook: e.target.checked
                        }
                      }));
                    }
                  }}
                />
                Enable Word Book
              </label>
            </div>
            
            <button
              className="save-settings-btn"
              onClick={async () => {
                try {
                  await sendMessageToBackground({
                    type: 'UPDATE_SETTINGS',
                    payload: { settings: state.settings }
                  });
                  alert('Settings saved successfully!');
                } catch (error) {
                  alert('Failed to save settings');
                }
              }}
            >
              Save Settings
            </button>
            
            <div className="api-key-help">
              <h4>How to get API Keys:</h4>
              <ul>
                <li><strong>DeepSeek (Recommended)</strong>: Visit <a href="https://platform.deepseek.com/" target="_blank">platform.deepseek.com</a> - Free tier available</li>
                <li><strong>OpenAI</strong>: Visit <a href="https://platform.openai.com/" target="_blank">platform.openai.com</a></li>
                <li><strong>Claude</strong>: Visit <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a></li>
                <li><strong>Qwen</strong>: Visit <a href="https://dashscope.aliyuncs.com/" target="_blank">dashscope.aliyuncs.com</a></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Initialize the popup
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
} 