import { baseUrl } from '../../services/apiClient';
import type {
  FieldOption,
  FieldContextData,
  ChatMessage,
  ConversationSummary,
  ImageAttachment,
  FieldCategory,
} from './types';

const API_BASE = `${baseUrl}/ai-assistant`;

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const urls = [
    `${API_BASE}${endpoint}`,
  ];
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        ...options,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }
      const errText = await response.text();
      lastError = new Error(`HTTP ${response.status}: ${errText}`);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to request ${endpoint}`);
}

export const aiAssistantApi = {
  async getFields(): Promise<FieldOption[]> {
    return fetchJson<FieldOption[]>('/fields');
  },

  async getFieldContext(fieldId: string, category?: FieldCategory): Promise<FieldContextData> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetchJson<FieldContextData>(`/fields/${encodeURIComponent(fieldId)}/context${query}`);
  },

  async listConversations(): Promise<ConversationSummary[]> {
    return fetchJson<ConversationSummary[]>('/conversations');
  },

  async getConversation(id: string): Promise<{
    conversation: ConversationSummary;
    messages: ChatMessage[];
  }> {
    return fetchJson(`/conversations/${encodeURIComponent(id)}`);
  },

  async sendMessage(params: {
    conversationId?: string;
    message: string;
    fieldId?: string | null;
    category?: FieldCategory | null;
    topic?: Exclude<FieldCategory, 'advisor'> | null;
    images?: ImageAttachment[];
  }): Promise<{
    conversation_id: string;
    message_id: string;
    reply: string;
    model: string;
    field_id?: string | null;
    category?: FieldCategory | null;
    created_at: string;
    grounded_data?: { sources?: string[]; unavailable?: string[]; [key: string]: unknown };
  }> {
    return fetchJson('/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: params.conversationId,
        message: params.message,
        field_id: params.fieldId,
        category: params.category,
        topic: params.topic ?? undefined,
        images: params.images || [],
      }),
    });
  },

  async sendVoiceAudio(audioBlob: Blob, language = 'de'): Promise<{
    text: string;
    confidence: number;
    detected_language: string;
  }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech.webm');
    formData.append('language', language);

    const urls = [`${API_BASE}/voice`];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        // try next
      }
    }
    throw new Error('Voice transcription request failed');
  },
};
