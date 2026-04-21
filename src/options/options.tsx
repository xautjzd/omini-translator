import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TranslationSettings, WordEntry, LLMProvider } from '@/types';
import { LANGUAGES } from '@/utils';
import './options.css';

interface OptionsState {
  settings: TranslationSettings | null;
  wordBook: WordEntry[];
  statistics: {
    totalTranslations: number;
    wordsLearned: number;
    lastUsed: number;
  };
  isLoading: boolean;
  error: string | null;
  saveStatus: string | null;
}

const LLM_PROVIDERS: LLMProvider[] = [
  {
    name: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-5.4'
  },
  {
    name: 'claude',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-4-7-20251001'
  },
  {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat'
  },
  {
    name: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    apiKey: '',
    model: 'qwen-max'
  },
  {
    name: 'kimi',
    baseUrl: 'https://api.moonshot.cn',
    apiKey: '',
    model: 'kimi-k2.6'
  },
  {
    name: 'glm',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-5.1'
  },
  {
    name: 'minimax',
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: '',
    model: 'minimax-2.7'
  }
];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude (Anthropic)',
  deepseek: 'DeepSeek',
  qwen: 'Qwen (Alibaba)',
  kimi: 'Kimi (Moonshot)',
  glm: 'GLM (Zhipu AI)',
  minimax: 'MiniMax'
};

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'],
  claude: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  qwen: ['qwen3.6-plus', 'qwen3.5-plus'],
  kimi: ['kimi-k2.6', 'kimi-k2.5'],
  glm: ['glm-5.1', 'glm-5', 'glm-4.7'],
  minimax: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed']
};

const Options: React.FC = () => {
  const [state, setState] = useState<OptionsState>({
    settings: null,
    wordBook: [],
    statistics: {
      totalTranslations: 0,
      wordsLearned: 0,
      lastUsed: 0
    },
    isLoading: true,
    error: null,
    saveStatus: null
  });

  const [activeTab, setActiveTab] = useState<'general' | 'llm' | 'wordbook' | 'data'>('general');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await sendMessageToBackground({ type: 'GET_SETTINGS', payload: {} });
      if (response.success) {
        setState(prev => ({
          ...prev,
          settings: response.settings,
          isLoading: false
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to load settings',
        isLoading: false
      }));
    }
  };

  const sendMessageToBackground = (message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const chromeRuntime = (globalThis as any).chrome?.runtime;
      if (chromeRuntime) {
        chromeRuntime.sendMessage(message, (response: any) => {
          if (chromeRuntime.lastError) {
            reject(chromeRuntime.lastError);
          } else {
            resolve(response);
          }
        });
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  };

  const handleSaveSettings = async () => {
    if (!state.settings) return;

    try {
      const response = await sendMessageToBackground({
        type: 'UPDATE_SETTINGS',
        payload: { settings: state.settings }
      });

      if (response.success) {
        setState(prev => ({ ...prev, saveStatus: 'Settings saved successfully!' }));
        setTimeout(() => {
          setState(prev => ({ ...prev, saveStatus: null }));
        }, 3000);
      } else {
        setState(prev => ({ ...prev, error: response.error }));
      }
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to save settings' }));
    }
  };

  const updateSettings = (updates: Partial<TranslationSettings>) => {
    setState(prev => ({
      ...prev,
      settings: prev.settings ? { ...prev.settings, ...updates } : null
    }));
  };

  const updateLLMProvider = (provider: Partial<LLMProvider>) => {
    if (!state.settings) return;

    const updatedProvider = { ...state.settings.llmConfig.provider, ...provider };
    updateSettings({
      llmConfig: {
        ...state.settings.llmConfig,
        provider: updatedProvider
      }
    });
  };

  if (state.isLoading) {
    return (
      <div className="options-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="options-container">
        <div className="error-state">
          <p>Error: {state.error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="options-container">
      <div className="options-header">
        <h1>Omini Translator Settings</h1>
        <div className="save-section">
          {state.saveStatus && (
            <div className="save-status">{state.saveStatus}</div>
          )}
          <button className="save-button" onClick={handleSaveSettings}>
            Save Settings
          </button>
        </div>
      </div>

      <div className="options-layout">
        <div className="options-sidebar">
          <nav className="options-nav">
            <button
              className={`nav-item ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              className={`nav-item ${activeTab === 'llm' ? 'active' : ''}`}
              onClick={() => setActiveTab('llm')}
            >
              LLM Configuration
            </button>
            <button
              className={`nav-item ${activeTab === 'wordbook' ? 'active' : ''}`}
              onClick={() => setActiveTab('wordbook')}
            >
              Word Book
            </button>
            <button
              className={`nav-item ${activeTab === 'data' ? 'active' : ''}`}
              onClick={() => setActiveTab('data')}
            >
              Data Management
            </button>
          </nav>
        </div>

        <div className="options-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              <h2>General Settings</h2>

              <div className="setting-group">
                <h3>Language Settings</h3>
                <div className="setting-item">
                  <label>Default Source Language</label>
                  <select
                    value={state.settings?.defaultSourceLang || 'auto'}
                    onChange={(e) => updateSettings({ defaultSourceLang: e.target.value })}
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-item">
                  <label>Default Target Language</label>
                  <select
                    value={state.settings?.defaultTargetLang || 'en'}
                    onChange={(e) => updateSettings({ defaultTargetLang: e.target.value })}
                  >
                    {LANGUAGES.filter(lang => lang.code !== 'auto').map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="setting-group">
                <h3>Features</h3>
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={state.settings?.enableAutoTranslation || false}
                      onChange={(e) => updateSettings({ enableAutoTranslation: e.target.checked })}
                    />
                    Enable auto translation on text selection
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={state.settings?.enableWordBook || false}
                      onChange={(e) => updateSettings({ enableWordBook: e.target.checked })}
                    />
                    Enable word book functionality
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={state.settings?.enableContextMenu || false}
                      onChange={(e) => updateSettings({ enableContextMenu: e.target.checked })}
                    />
                    Enable context menu
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={state.settings?.enableShortcuts || false}
                      onChange={(e) => updateSettings({ enableShortcuts: e.target.checked })}
                    />
                    Enable keyboard shortcuts
                  </label>
                </div>
              </div>

              <div className="setting-group">
                <h3>Popup Position</h3>
                <div className="setting-item">
                  <label>Translation popup position</label>
                  <select
                    value={state.settings?.popupPosition || 'bottom-right'}
                    onChange={(e) => updateSettings({ popupPosition: e.target.value as any })}
                  >
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              </div>

              <div className="setting-group">
                <h3>Keyboard Shortcuts</h3>
                <div className="setting-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={state.settings?.enableShortcuts || false}
                      onChange={(e) => updateSettings({ enableShortcuts: e.target.checked })}
                    />
                    Enable keyboard shortcuts
                  </label>
                </div>
                {state.settings?.enableShortcuts && (
                  <div className="shortcuts-config">
                    <div className="setting-item">
                      <label>Translate shortcut</label>
                      <input
                        type="text"
                        value={state.settings?.shortcuts?.translate || 'Ctrl+T'}
                        onChange={(e) => {
                          if (state.settings) {
                            updateSettings({
                              shortcuts: {
                                ...state.settings.shortcuts,
                                translate: e.target.value
                              }
                            });
                          }
                        }}
                        placeholder="e.g., Ctrl+T"
                        className="shortcut-input"
                      />
                    </div>
                    <div className="setting-item">
                      <label>Toggle word book shortcut</label>
                      <input
                        type="text"
                        value={state.settings?.shortcuts?.toggleWordBook || 'Ctrl+B'}
                        onChange={(e) => {
                          if (state.settings) {
                            updateSettings({
                              shortcuts: {
                                ...state.settings.shortcuts,
                                toggleWordBook: e.target.value
                              }
                            });
                          }
                        }}
                        placeholder="e.g., Ctrl+B"
                        className="shortcut-input"
                      />
                    </div>
                    <div className="setting-item">
                      <label>Full page translation shortcut</label>
                      <input
                        type="text"
                        value={state.settings?.shortcuts?.fullPageTranslation || 'Ctrl+Shift+T'}
                        onChange={(e) => {
                          if (state.settings) {
                            updateSettings({
                              shortcuts: {
                                ...state.settings.shortcuts,
                                fullPageTranslation: e.target.value
                              }
                            });
                          }
                        }}
                        placeholder="e.g., Ctrl+Shift+T"
                        className="shortcut-input"
                      />
                    </div>
                    <div className="shortcuts-help">
                      <p><strong>Shortcut format:</strong> Use combinations like Ctrl+T, Alt+S, Ctrl+Shift+F, etc.</p>
                      <p><strong>Available modifiers:</strong> Ctrl, Alt, Shift, Meta (Cmd on Mac)</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'llm' && (
            <div className="settings-section">
              <h2>LLM Configuration</h2>

              <div className="setting-group">
                <h3>Provider Selection</h3>
                <div className="setting-item">
                  <label>LLM Provider</label>
                  <select
                    value={state.settings?.llmConfig.provider.name || 'openai'}
                    onChange={(e) => {
                      const provider = LLM_PROVIDERS.find(p => p.name === e.target.value);
                      if (provider) {
                        updateLLMProvider({
                          name: provider.name,
                          baseUrl: provider.baseUrl,
                          model: provider.model
                        });
                      }
                    }}
                  >
                    {LLM_PROVIDERS.map(provider => (
                      <option key={provider.name} value={provider.name}>
                        {PROVIDER_DISPLAY_NAMES[provider.name] || provider.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="setting-group">
                <h3>Provider Configuration</h3>
                <div className="setting-item">
                  <label>Base URL</label>
                  <input
                    type="url"
                    value={state.settings?.llmConfig.provider.baseUrl || ''}
                    onChange={(e) => updateLLMProvider({ baseUrl: e.target.value })}
                    placeholder="https://api.openai.com"
                  />
                </div>
                <div className="setting-item">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={state.settings?.llmConfig.provider.apiKey || ''}
                    onChange={(e) => updateLLMProvider({ apiKey: e.target.value })}
                    placeholder="Enter your API key"
                  />
                </div>
                <div className="setting-item">
                  <label>Model</label>
                  <select
                    value={state.settings?.llmConfig.provider.model || ''}
                    onChange={(e) => updateLLMProvider({ model: e.target.value })}
                  >
                    {(() => {
                      const currentProvider = state.settings?.llmConfig.provider.name || 'openai';
                      const models = PROVIDER_MODELS[currentProvider] || [];
                      return models.map(model => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ));
                    })()}
                  </select>
                  <input
                    type="text"
                    value={state.settings?.llmConfig.provider.model || ''}
                    onChange={(e) => updateLLMProvider({ model: e.target.value })}
                    placeholder="Or enter custom model name"
                    style={{ marginTop: '8px' }}
                  />
                </div>
              </div>

              <div className="setting-group">
                <h3>Model Parameters</h3>
                <div className="setting-item">
                  <label>Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={state.settings?.llmConfig.temperature || 0.3}
                    onChange={(e) => updateSettings({
                      llmConfig: {
                        ...state.settings!.llmConfig,
                        temperature: parseFloat(e.target.value)
                      }
                    })}
                  />
                </div>
                <div className="setting-item">
                  <label>Max Tokens</label>
                  <input
                    type="number"
                    min="1"
                    max="4000"
                    value={state.settings?.llmConfig.maxTokens || 1000}
                    onChange={(e) => updateSettings({
                      llmConfig: {
                        ...state.settings!.llmConfig,
                        maxTokens: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'wordbook' && (
            <div className="settings-section">
              <h2>Word Book</h2>
              <div className="wordbook-placeholder">
                <p>Word book management will be implemented here</p>
                <p>Features include:</p>
                <ul>
                  <li>View all saved words</li>
                  <li>Search and filter words</li>
                  <li>Edit word entries</li>
                  <li>Review and practice words</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="settings-section">
              <h2>Data Management</h2>
              <div className="data-management">
                <div className="setting-group">
                  <h3>Statistics</h3>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Total Translations</span>
                      <span className="stat-value">{state.statistics.totalTranslations}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Words Learned</span>
                      <span className="stat-value">{state.statistics.wordsLearned}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Last Used</span>
                      <span className="stat-value">
                        {state.statistics.lastUsed
                          ? new Date(state.statistics.lastUsed).toLocaleDateString()
                          : 'Never'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <div className="setting-group">
                  <h3>Data Export/Import</h3>
                  <div className="data-actions">
                    <button className="export-button">Export Data</button>
                    <button className="import-button">Import Data</button>
                  </div>
                </div>

                <div className="setting-group">
                  <h3>Reset Data</h3>
                  <button className="reset-button">Clear All Data</button>
                  <p className="warning-text">
                    This will permanently delete all your settings, word book, and statistics.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Initialize the options page
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Options />);
} 
