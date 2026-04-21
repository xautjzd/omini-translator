import { TranslationRequest, TranslationResponse, LLMConfig } from '@/types';

// Abstract base class for LLM services (Interface Segregation Principle)
export abstract class LLMService {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract translate(request: TranslationRequest): Promise<TranslationResponse>;

  // Template method pattern for common validation
  protected validateRequest(request: TranslationRequest): void {
    if (!request.text || request.text.trim().length === 0) {
      throw new Error('Translation text cannot be empty');
    }
    if (!request.targetLang) {
      throw new Error('Target language is required');
    }
  }

  protected buildTranslationPrompt(request: TranslationRequest): string {
    return `Please translate the following text from ${request.sourceLang || 'auto-detect'} to ${request.targetLang}.

Text to translate: "${request.text}"

Please provide the response in the following JSON format:
{
  "translatedText": "the translated text in target language",
  "pronunciation": "pronunciation guide for the SOURCE text (if applicable)",
  "phonetic": "IPA phonetic transcription for the SOURCE text (if applicable)",
  "partOfSpeech": "part of speech for the SOURCE text (if it's a single word)",
  "examples": ["example sentence 1 in source language", "example sentence 2 in source language"],
  "explanation": "brief explanation of the source word's usage or meaning (in target language)",
  "sourceLang": "detected or provided source language code",
  "targetLang": "${request.targetLang}"
}

Important:
- If the source text is a single word or short phrase, include its pronunciation and phonetic transcription
- Provide example sentences showing how to use the SOURCE word/phrase in context (in source language)
- The explanation should help understand the source word's meaning and usage

Context: ${request.context || 'No additional context provided'}`;
  }

  protected parseResponse(response: string): TranslationResponse {
    console.log('LLMService: Raw response:', response);
    
    try {
      // Clean up the response - remove markdown code blocks and extra whitespace
      let cleanResponse = response.trim();
      
      // Remove markdown code blocks (```json ... ``` or ``` ... ```)
      cleanResponse = cleanResponse.replace(/^```(?:json)?\s*\n?/i, '');
      cleanResponse = cleanResponse.replace(/\n?```\s*$/i, '');
      cleanResponse = cleanResponse.trim();
      
      // Try to parse as JSON
      const parsed = JSON.parse(cleanResponse);
      console.log('LLMService: Parsed JSON:', parsed);
      
      return {
        originalText: '',
        translatedText: parsed.translatedText || parsed.translation || '',
        pronunciation: parsed.pronunciation,
        phonetic: parsed.phonetic,
        partOfSpeech: parsed.partOfSpeech,
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
        explanation: parsed.explanation,
        sourceLang: parsed.sourceLang || 'auto',
        targetLang: parsed.targetLang || 'en'
      };
    } catch (error) {
      console.log('LLMService: JSON parsing failed, attempting fallback parsing');
      
      // Enhanced fallback parsing for non-JSON responses
      const lines = response.split('\n').map(line => line.trim()).filter(line => line);
      
      // Try to extract information from structured text
      let translatedText = '';
      let pronunciation = '';
      let phonetic = '';
      let partOfSpeech = '';
      let examples: string[] = [];
      let explanation = '';
      
      for (const line of lines) {
        if (line.toLowerCase().includes('translation:') || line.toLowerCase().includes('translated:')) {
          translatedText = line.split(':').slice(1).join(':').trim();
        } else if (line.toLowerCase().includes('pronunciation:')) {
          pronunciation = line.split(':').slice(1).join(':').trim();
        } else if (line.toLowerCase().includes('phonetic:')) {
          phonetic = line.split(':').slice(1).join(':').trim();
        } else if (line.toLowerCase().includes('part of speech:')) {
          partOfSpeech = line.split(':').slice(1).join(':').trim();
        } else if (line.toLowerCase().includes('example:')) {
          examples.push(line.split(':').slice(1).join(':').trim());
        } else if (line.toLowerCase().includes('explanation:')) {
          explanation = line.split(':').slice(1).join(':').trim();
        }
      }
      
      // If no structured data found, use the first substantial line as translation
      if (!translatedText) {
        // Skip common prefixes and find the actual translation
        for (const line of lines) {
          if (line.length > 3 && 
              !line.toLowerCase().includes('translate') && 
              !line.toLowerCase().includes('translation') &&
              !line.toLowerCase().includes('here') &&
              !line.toLowerCase().includes('result')) {
            translatedText = line;
            break;
          }
        }
        
        // If still no translation found, use the entire response
        if (!translatedText) {
          translatedText = response.trim();
        }
      }
      
      console.log('LLMService: Fallback parsing result:', { translatedText, pronunciation, phonetic });
      
      return {
        originalText: '',
        translatedText: translatedText || response.trim(),
        pronunciation: pronunciation || undefined,
        phonetic: phonetic || undefined,
        partOfSpeech: partOfSpeech || undefined,
        examples: examples.length > 0 ? examples : undefined,
        explanation: explanation || undefined,
        sourceLang: 'auto',
        targetLang: 'en'
      };
    }
  }
}

// Factory pattern for creating LLM services (Open/Closed Principle)
export class LLMServiceFactory {
  static createService(config: LLMConfig): LLMService {
    switch (config.provider.name.toLowerCase()) {
      case 'openai':
        return new OpenAIService(config);
      case 'claude':
        return new ClaudeService(config);
      case 'deepseek':
        return new DeepSeekService(config);
      case 'qwen':
        return new QwenService(config);
      case 'kimi':
      case 'moonshot':
        return new KimiService(config);
      case 'glm':
      case 'chatglm':
      case 'zhipu':
        return new GLMService(config);
      case 'minimax':
        return new MiniMaxService(config);
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider.name}`);
    }
  }
}

// OpenAI service implementation
export class OpenAIService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    // Validate API key
    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('OpenAI API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Provide accurate translations with additional linguistic information when helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.choices[0].message.content);
    translationResponse.originalText = request.text;
    
    return translationResponse;
  }
}

// Claude service implementation
export class ClaudeService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    // Validate API key
    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('Claude API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.provider.apiKey,
        'Anthropic-Version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        max_tokens: this.config.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Claude API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.content[0].text);
    translationResponse.originalText = request.text;
    
    return translationResponse;
  }
}

// DeepSeek service implementation
export class DeepSeekService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    // Validate API key
    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('DeepSeek API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Provide accurate translations with additional linguistic information when helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your DeepSeek API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.choices[0].message.content);
    translationResponse.originalText = request.text;
    
    return translationResponse;
  }
}

// Qwen service implementation
export class QwenService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('Qwen API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/compatible-mode/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Provide accurate translations with additional linguistic information when helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Qwen API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.choices[0].message.content);
    translationResponse.originalText = request.text;

    return translationResponse;
  }
}

// Kimi (Moonshot AI) service implementation
export class KimiService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('Kimi API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Provide accurate translations with additional linguistic information when helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Kimi API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Kimi API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.choices[0].message.content);
    translationResponse.originalText = request.text;

    return translationResponse;
  }
}

// GLM (ChatGLM/Zhipu AI) service implementation
export class GLMService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('GLM API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Provide accurate translations with additional linguistic information when helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your GLM API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`GLM API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.choices[0].message.content);
    translationResponse.originalText = request.text;

    return translationResponse;
  }
}

// MiniMax service implementation
export class MiniMaxService extends LLMService {
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    if (!this.config.provider.apiKey || this.config.provider.apiKey.trim() === '') {
      throw new Error('MiniMax API key is not configured. Please add your API key in the extension settings.');
    }

    const prompt = this.buildTranslationPrompt(request);

    const response = await fetch(`${this.config.provider.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.provider.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Provide accurate translations with additional linguistic information when helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your MiniMax API key in settings.');
      } else if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`MiniMax API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    const translationResponse = this.parseResponse(data.choices[0].message.content);
    translationResponse.originalText = request.text;

    return translationResponse;
  }
} 