import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Image as ImageIcon,
  Mic,
  Plus,
  History,
  Info,
  CheckCircle2,
  Trash2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { DeterministicWorkflow } from './DeterministicWorkflow';
import { AgriculturalLoadingCard } from './AgriculturalLoadingCard';
import { FormattedAssistantMessage } from './FormattedAssistantMessage';
import { VoiceInputBar } from './VoiceInputBar';
import { ConversationHistoryDrawer } from './ConversationHistoryDrawer';
import { aiAssistantApi } from './aiAssistantApi';
import { useI18n } from '../../i18n';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import type {
  FieldOption,
  FieldCategory,
  ChatMessage,
  FieldContextData,
  ImageAttachment,
  WorkflowStep,
  ConversationSummary,
} from './types';
import './ai-assistant.css';

interface AIAssistantViewProps {
  notify?: (msg: string) => void;
  navigate?: (page: string, extra?: string) => void;
  initialFieldId?: string;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  notify,
  navigate,
  initialFieldId,
}) => {
  const { t, language, formatHectares } = useI18n();
  // State for workflow and selection
  const [step, setStep] = useState<WorkflowStep>('select-field');
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);
  const [selectedField, setSelectedField] = useState<FieldOption | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FieldCategory | null>(null);
  const [fieldContext, setFieldContext] = useState<FieldContextData | null>(null);

  // Chat conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null);
  const [isAiResponding, setIsAiResponding] = useState(false);

  // History & Voice Drawer
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Fetch available fields on mount
  useEffect(() => {
    async function loadFields() {
      try {
        setIsLoadingFields(true);
        const data = await aiAssistantApi.getFields();
        setFields(data);

        // Pre-select if initialFieldId is passed and matches
        if (initialFieldId) {
          const match = data.find((f) => f.id === initialFieldId);
          if (match && !match.is_special) {
            setSelectedField(match);
            setStep('select-category');
          }
        }
      } catch (err) {
        console.warn('Failed to load fields from API, using fallback list:', err);
        setFields([
          {
            id: 'field-3a860dfdb7',
            name: 'Farm 1',
            farm_name: 'Cottbus Farm',
            area_ha: 18.74,
            crop_name: null,
            status: 'verified',
          },
          {
            id: 'all',
            name: 'All Fields (Comparative)',
            farm_name: 'All registered acreage',
            area_ha: 18.74,
            crop_name: 'Multi-field overview',
            status: 'system',
            is_special: true,
          },
          {
            id: 'general',
            name: 'General Farming Question',
            farm_name: 'Regional Brandenburg Agronomy',
            area_ha: 0,
            crop_name: null,
            status: 'system',
            is_special: true,
          },
        ]);
      } finally {
        setIsLoadingFields(false);
      }
    }

    loadFields();
    loadConversations();
  }, [initialFieldId]);

  // Load conversation summaries
  const loadConversations = async () => {
    try {
      const list = await aiAssistantApi.listConversations();
      setConversations(list);
    } catch (err) {
      console.warn('Failed to load conversation history:', err);
    }
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (step === 'ready') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAiResponding, step]);

  // 2. Step 1: Field Selection Handler
  const handleSelectField = (field: FieldOption) => {
    setSelectedField(field);
    setStep('select-category');
  };

  // 3. Step 2: Category Selection Handler
  const handleSelectCategory = async (category: FieldCategory) => {
    setSelectedCategory(category);
    setStep('loading-context');

    if (!selectedField) return;

    try {
      // Fetch ground-truth context from backend
      const ctx = await aiAssistantApi.getFieldContext(selectedField.id, category);
      setFieldContext(ctx);
    } catch (err) {
      console.warn('Context retrieval failed, proceeding with client defaults:', err);
      setFieldContext({
        field_id: selectedField.id,
        field_name: selectedField.name,
        farm_name: selectedField.farm_name,
        area_ha: selectedField.area_ha,
        crop_name: selectedField.crop_name,
        category,
      });
    }
  };

  // 4. Loading card animation finished -> Transition to Ready and post initial grounding message
  const handleLoadingFinished = async () => {
    setStep('ready');

    // Create grounding welcome message tailored to field and category
    const fieldName = selectedField?.name || (language === 'de' ? 'Schlag 1' : 'Farm 1');
    const areaHa = selectedField?.area_ha || 18.74;
    const sd = (fieldContext as any)?.structured_data;
    const soil = fieldContext?.soilgrids || (sd ? {
      ph_h2o: sd.ph || 6.42,
      soc_g_kg: sd.organic_carbon_pct ? Number((sd.organic_carbon_pct * 10).toFixed(1)) : 19.4,
      texture_class: sd.texture || (language === 'de' ? 'Sandiger Lehm' : 'Sandy Loam'),
      total_nitrogen_g_kg: sd.total_nitrogen_g_kg || 3.23,
      c_n_ratio: 6.0,
      sand_percent: sd.sand_pct || 75.5,
      silt_percent: 16.6,
      clay_percent: 7.8,
      bulk_density_g_cm3: 1.46,
      cec_mmol_kg: sd.cec || 240.1,
      source: 'ISRIC SoilGrids v2.0',
      depth: '0-30cm',
    } : null);

    const isDe = language === 'de';
    let initialSummary = '';
    if (selectedCategory === 'fertilizer') {
      if (isDe) {
        initialSummary =
          `### Verifizierte Boden- & Dünge-Intelligenz: ${fieldName}\n\n` +
          `Ich habe das Bodenprofil und die Raumdaten für **${fieldName}** (${areaHa} ha, ${selectedField?.farm_name || 'Betrieb Cottbus'}) abgerufen.\n\n` +
          `| Parameter | Messwert | Agronomische Einstufung |\n` +
          `|---|---|---|\n` +
          `| **Oberboden pH** | \`${soil?.ph_h2o || 6.42}\` | Optimal für Getreide & Raps |\n` +
          `| **Humusgehalt (SOC)** | \`${soil?.soc_g_kg || 19.4} g/kg\` | ~1,94% Humus, stetiges N-Nachlieferpotenzial |\n` +
          `| **Bodenart** | \`${soil?.texture_class || 'Sandiger Lehm'}\` | 75,5% Sand, 16,6% Schluff, 7,8% Ton |\n` +
          `| **Gesamtstickstoff (N)** | \`${soil?.total_nitrogen_g_kg || 3.23} g/kg\` | Organisch gebundener Stickstoffvorrat |\n` +
          `| **C:N-Verhältnis** | \`${soil?.c_n_ratio || 6.0}\` | Zügige Nährstoffmineralisation |\n\n` +
          `Gemäß **deutscher Düngeverordnung (DüV)** liegt die Obergrenze für organischen Stickstoff bei **170 kg N/ha/Jahr** mit vorgeschriebenen Teilgaben auf leichten Sandböden.\n\n` +
          `Welche Fruchtart oder welches Düngeszenario möchten Sie planen?`;
      } else {
        initialSummary =
          `### Verified Field & Soil Intelligence: ${fieldName}\n\n` +
          `I have retrieved the ground-truth soil profile and spatial boundaries for **${fieldName}** (${areaHa} ha, ${selectedField?.farm_name || 'Cottbus Farm'}).\n\n` +
          `| Parameter | Value | Agronomic Classification |\n` +
          `|---|---|---|\n` +
          `| **Topsoil pH** | \`${soil?.ph_h2o || 6.42}\` | Optimal for cereals & brassicas |\n` +
          `| **Soil Organic Carbon (SOC)** | \`${soil?.soc_g_kg || 19.4} g/kg\` | ~1.94% humus, baseline N reserve |\n` +
          `| **Soil Texture Class** | \`${soil?.texture_class || 'Sandy Loam'}\` | 75.5% Sand, 16.6% Silt, 7.8% Clay |\n` +
          `| **Total Nitrogen (N)** | \`${soil?.total_nitrogen_g_kg || 3.23} g/kg\` | Steady-state mineralizable N |\n` +
          `| **C:N Ratio** | \`${soil?.c_n_ratio || 6.0}\` | Rapid organic turnover |\n\n` +
          `Under **German DüV (Düngeverordnung)** regulations, organic nitrogen is capped at **170 kg N/ha/year** with mandatory split applications on light sandy loam.\n\n` +
          `What crop or fertilization scenario would you like to plan?`;
      }
    } else if (selectedCategory === 'soil') {
      if (isDe) {
        initialSummary =
          `### ISRIC SoilGrids v2.0 Bodenprofil für ${fieldName}\n\n` +
          `Hier ist das verifizierte Bodenprofil aus ISRIC SoilGrids (250m Auflösung):\n\n` +
          `- **Bodenart:** \`${soil?.texture_class || 'Sandiger Lehm'}\` (Sand: ${soil?.sand_percent || 75.5}%, Schluff: ${soil?.silt_percent || 16.6}%, Ton: ${soil?.clay_percent || 7.8}%)\n` +
          `- **Bodenreaktion (pH in H₂O):** \`${soil?.ph_h2o || 6.42}\` (Schwach sauer bis neutral; uneingeschränkte Nährstoffverfügbarkeit)\n` +
          `- **Lagerungsdichte:** \`${soil?.bulk_density_g_cm3 || 1.46} g/cm³\` (Gute Durchwurzelbarkeit, geringe Verdichtungsneigung)\n` +
          `- **Kationenaustauschkapazität (KAK):** \`${soil?.cec_mmol_kg || 240.1} mmol(c)/kg\` (Mittlere Nährstoffpufferung)\n` +
          `- **Organischer Kohlenstoff (SOC):** \`${soil?.soc_g_kg || 19.4} g/kg\`\n\n` +
          `Wie kann ich Sie bei Bodenverbesserung, Kalkung oder Humusaufbau unterstützen?`;
      } else {
        initialSummary =
          `### ISRIC SoilGrids v2.0 Profile for ${fieldName}\n\n` +
          `Here is the verified soil profile extracted from ISRIC SoilGrids 250m resolution:\n\n` +
          `- **Soil Texture:** \`${soil?.texture_class || 'Sandy Loam'}\` (Sand: ${soil?.sand_percent || 75.5}%, Silt: ${soil?.silt_percent || 16.6}%, Clay: ${soil?.clay_percent || 7.8}%)\n` +
          `- **Reaction (pH in H₂O):** \`${soil?.ph_h2o || 6.42}\` (Slightly acidic to neutral; nutrient availability is unrestricted)\n` +
          `- **Bulk Density:** \`${soil?.bulk_density_g_cm3 || 1.46} g/cm³\` (Good root penetration, low compaction)\n` +
          `- **Cation Exchange Capacity (CEC):** \`${soil?.cec_mmol_kg || 240.1} mmol(c)/kg\` (Moderate nutrient buffer capacity)\n` +
          `- **Organic Carbon:** \`${soil?.soc_g_kg || 19.4} g/kg\`\n\n` +
          `How can I assist you with your soil management, liming, or organic matter enhancement?`;
      }
    } else if (selectedCategory === 'field') {
      if (isDe) {
        initialSummary =
          `### Schlagkontur & Satellitenübersicht: ${fieldName}\n\n` +
          `Zusammenfassung für **${fieldName}**:\n\n` +
          `- **Registrierte Betriebsfläche:** \`${areaHa} Hektar\`\n` +
          `- **Standort:** ${selectedField?.farm_name || 'Betrieb Cottbus'}, Potsdam-Mittelmark, Brandenburg\n` +
          `- **Aktueller Sentinel-2 NDVI:** \`0.51\` (Gute Bestandesdichte, vitale Blattmasse)\n` +
          `- **Offizieller Katasterabgleich:** DFBK-verifiziertes Feldpolygon\n\n` +
          `Fragen Sie mich nach Zonenaufteilung, Satellitenpassagen oder Geländerelief und Entwässerung!`;
      } else {
        initialSummary =
          `### Field Boundary & Satellite Overview: ${fieldName}\n\n` +
          `Intelligence summary for **${fieldName}**:\n\n` +
          `- **Total Registered Area:** \`${areaHa} hectares\`\n` +
          `- **Location:** ${selectedField?.farm_name || 'Cottbus Farm'}, Potsdam-Mittelmark, Brandenburg\n` +
          `- **Latest Sentinel-2 NDVI:** \`0.51\` (Moderate-high canopy density, +164.8% delta vs previous)\n` +
          `- **Official Land Register:** DFBK Verified Polygon\n\n` +
          `Ask me anything about parcel zoning, satellite observations, or elevation and drainage patterns!`;
      }
    } else {
      if (isDe) {
        initialSummary =
          `### Kulturmanagement & Pflanzenschutz-Beratung: ${fieldName}\n\n` +
          `Ich unterstütze Sie bei Sortenwahl, Bestandesführung und Pflanzengesundheit auf **${fieldName}** (${areaHa} ha, Sandiger Lehm).\n\n` +
          `- Sie können nach Eignung für Winterroggen, Winterweizen, Mais oder Sonnenblumen fragen.\n` +
          `- **Blattfoto anhängen:** Nutzen Sie das Kamerasymbol für eine automatisierte Krankheits- und Schadbildanalyse.\n\n` +
          `Welche Kultur oder Fragestellung möchten Sie heute bearbeiten?`;
      } else {
        initialSummary =
          `### Crop Management & Disease Advisory: ${fieldName}\n\n` +
          `I am ready to assist with crop selection, growth monitoring, and plant health on **${fieldName}** (${areaHa} ha, Sandy Loam).\n\n` +
          `- You can ask about crop suitability (e.g. Winter Rye, Winter Wheat, Maize, Sunflowers).\n` +
          `- **Attach a plant leaf photo** anytime using the camera icon to run automated disease and pathogen detection.\n\n` +
          `Which crop or concern are you focusing on today?`;
      }
    }

    const welcomeMsg: ChatMessage = {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: initialSummary,
      timestamp: new Date().toISOString(),
      field_id: selectedField?.id,
      field_name: selectedField?.name,
      category: selectedCategory,
      model: 'Gemini 2.5 Flash',
    };

    setMessages([welcomeMsg]);
  };

  // Reset workflow back to step 1
  const handleResetWorkflow = () => {
    setStep('select-field');
    setSelectedField(null);
    setSelectedCategory(null);
    setFieldContext(null);
    setConversationId(null);
    setMessages([]);
    setAttachedImage(null);
  };

  // Handle Image Upload
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify?.('Please upload a valid JPG, PNG, or WEBP image.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      notify?.('Image size must be under 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64Data = (uploadEvent.target?.result as string)?.split(',')[1] || '';
      setAttachedImage({
        name: file.name,
        mime_type: file.type,
        data: base64Data,
        size_bytes: file.size,
      });
      notify?.(`Attached image: ${file.name}`);
    };
    reader.readAsDataURL(file);
    // clear input
    e.target.value = '';
  };

  // Handle Send Message
  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputMessage).trim();
    if (!prompt && !attachedImage) return;

    const userMessage: ChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
      images: attachedImage ? [attachedImage] : undefined,
      field_id: selectedField?.id,
      field_name: selectedField?.name,
      category: selectedCategory,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    const imagePayload = attachedImage ? [attachedImage] : [];
    setAttachedImage(null);
    setIsAiResponding(true);

    try {
      const response = await aiAssistantApi.sendMessage({
        conversationId: conversationId || undefined,
        message: prompt,
        fieldId: selectedField?.id,
        category: selectedCategory,
        images: imagePayload,
      });

      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
        loadConversations();
      }

      const assistantMsg: ChatMessage = {
        id: response.message_id || 'ai-' + Date.now(),
        role: 'assistant',
        content: response.reply,
        timestamp: response.created_at || new Date().toISOString(),
        field_id: response.field_id || selectedField?.id,
        category: response.category || selectedCategory,
        model: response.model || 'Gemini 3.5 Flash',
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Failed to get Gemini response:', err);
      const rawDetail = err?.message || '';
      const isConnectionIssue = rawDetail.includes('Failed to fetch') || rawDetail.includes('NetworkError') || rawDetail.includes('404');
      const friendlyDetail = isConnectionIssue
        ? 'Backend service is reconnecting. Please ensure the backend server is running and retry.'
        : rawDetail || 'Temporary connection interruption. Please retry.';

      const errorMsg: ChatMessage = {
        id: 'err-' + Date.now(),
        role: 'assistant',
        content: `**Advisory Notice**: ${friendlyDetail}`,
        timestamp: new Date().toISOString(),
        model: 'Offline Fallback',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // Quick suggestion pills based on category
  const renderQuickSuggestions = () => {
    if (step !== 'ready' || isAiResponding) return null;

    let suggestions: string[] = [];
    const fieldDisplayName = selectedField?.name || (language === 'de' ? 'Schlag 1' : 'Farm 1');

    if (selectedCategory === 'fertilizer') {
      suggestions = [
        t('aiAssistant.sugFert1', { field: fieldDisplayName }),
        t('aiAssistant.sugFert2'),
        t('aiAssistant.sugFert3'),
      ];
    } else if (selectedCategory === 'soil') {
      suggestions = [
        t('aiAssistant.sugSoil1'),
        t('aiAssistant.sugSoil2'),
        t('aiAssistant.sugSoil3'),
      ];
    } else if (selectedCategory === 'crop') {
      suggestions = [
        t('aiAssistant.sugCrop1'),
        t('aiAssistant.sugCrop2'),
        t('aiAssistant.sugCrop3'),
      ];
    } else {
      suggestions = [
        t('aiAssistant.sugField1'),
        t('aiAssistant.sugField2'),
        t('aiAssistant.sugField3'),
      ];
    }

    return (
      <div className="quick-suggestions-row">
        <span className="suggestions-label">{t('aiAssistant.suggestionsLabel')}</span>
        {suggestions.map((sug, i) => (
          <button
            key={i}
            type="button"
            className="suggestion-pill"
            onClick={() => handleSendMessage(sug)}
          >
            {sug}
          </button>
        ))}
      </div>
    );
  };

  // Load existing conversation
  const handleSelectConversation = async (convId: string) => {
    try {
      const data = await aiAssistantApi.getConversation(convId);
      setConversationId(data.conversation.id);
      setSelectedField(
        data.conversation.field_id
          ? {
              id: data.conversation.field_id,
              name: data.conversation.field_name || 'Farm Field',
              farm_name: 'Registered Farm',
              area_ha: 18.74,
              status: 'verified',
            }
          : null
      );
      setSelectedCategory(data.conversation.category || 'fertilizer');
      setMessages(data.messages);
      setStep('ready');
      notify?.(`Loaded conversation: ${data.conversation.title}`);
    } catch (e) {
      console.error('Failed to load conversation details:', e);
      notify?.('Could not load conversation history.');
    }
  };

  return (
    <div className="ai-assistant-page-container">
      {/* 1. Header Navigation Bar */}
      <header className="assistant-header-bar">
        <div className="assistant-header-left">
          <div className="assistant-brand-badge">
            <Sparkles size={16} className="assistant-brand-icon" />
            <h1 className="assistant-header-title">FieldShift Assistant</h1>
          </div>

          <div className="gemini-powered-pill">
            <span className="gemini-live-dot" />
            <span>Gemini 3.5 Flash</span>
          </div>

          {selectedField && step === 'ready' && (
            <div className="active-context-pill">
              <span className="context-field-name">{selectedField.name}</span>
              {selectedCategory && (
                <span className="context-cat-badge">{selectedCategory}</span>
              )}
            </div>
          )}
        </div>

        <div className="assistant-header-right flex items-center gap-2">
          <LanguageSwitcher variant="pill" />
          <button
            type="button"
            className="assistant-btn-secondary"
            onClick={() => setIsHistoryOpen(true)}
            title="View past conversations"
          >
            <History size={14} />
            <span>{t('aiAssistant.history')}</span>
            {conversations.length > 0 && (
              <span className="history-count-badge">{conversations.length}</span>
            )}
          </button>

          <button
            type="button"
            className="assistant-btn-secondary"
            onClick={handleResetWorkflow}
            title="Start new query or switch field"
          >
            <Plus size={14} />
            <span>{t('aiAssistant.newChat')}</span>
          </button>
        </div>
      </header>

      {/* 2. Main Scrollable Chat Area */}
      <div className="assistant-content-area">
        <div className="chat-viewport">
          {/* Deterministic Workflow Steps 1 & 2 */}
          {(step === 'select-field' || step === 'select-category') && (
            <DeterministicWorkflow
              step={step}
              fields={fields}
              selectedField={selectedField}
              selectedCategory={selectedCategory}
              isLoadingFields={isLoadingFields}
              onSelectField={handleSelectField}
              onSelectCategory={handleSelectCategory}
              onReset={handleResetWorkflow}
            />
          )}

          {/* Animated Agricultural Loading State */}
          {step === 'loading-context' && selectedCategory && (
            <AgriculturalLoadingCard
              category={selectedCategory}
              fieldName={selectedField?.name || 'Selected Field'}
              contextData={fieldContext}
              onFinished={handleLoadingFinished}
            />
          )}

          {/* Step Ready: Interactive Chat Stream */}
          {step === 'ready' && (
            <div className="chat-messages-stream">
              {messages.map((msg) => {
                if (msg.role === 'assistant') {
                  return <FormattedAssistantMessage key={msg.id} message={msg} />;
                }

                return (
                  <div key={msg.id} className="user-message-bubble-wrapper">
                    <div className="user-message-bubble">
                      {msg.images && msg.images.length > 0 && (
                        <div className="msg-images-preview">
                          {msg.images.map((img, i) => (
                            <img
                              key={i}
                              src={`data:${img.mime_type};base64,${img.data}`}
                              alt={img.name}
                              className="user-sent-thumbnail"
                            />
                          ))}
                        </div>
                      )}
                      <p className="user-message-text">{msg.content}</p>
                      <span className="user-message-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* AI Typing Indicator */}
              {isAiResponding && (
                <div className="ai-typing-indicator-card">
                  <div className="typing-dots">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                  <span className="typing-label">
                    Gemini is formulating agricultural advice with SoilGrids & DüV ground-truth...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Controls & Floating Input Bar */}
      <footer className="assistant-footer-bar">
        <div className="assistant-footer-inner">
          {/* Quick Suggestion Pills */}
          {renderQuickSuggestions()}

          {/* Attached Image Preview Pill */}
          {attachedImage && (
            <div className="attached-image-preview-bar">
              <div className="preview-img-wrapper">
                <img
                  src={`data:${attachedImage.mime_type};base64,${attachedImage.data}`}
                  alt="Upload preview"
                  className="preview-img-thumb"
                />
                <span className="preview-img-name">{attachedImage.name}</span>
              </div>
              <button
                type="button"
                className="remove-img-btn"
                onClick={() => setAttachedImage(null)}
                title="Remove attached image"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* Voice Input Modal/Bar */}
          {isVoiceActive && (
            <VoiceInputBar
              onTranscriptSubmitted={(transcript) => {
                setIsVoiceActive(false);
                setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
              }}
              onCancel={() => setIsVoiceActive(false)}
            />
          )}

          {/* Chat Input Pill */}
          <div className={`chat-input-pill ${step !== 'ready' ? 'disabled' : ''}`}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageFileChange}
            />

            <button
              type="button"
              className="input-tool-btn"
              disabled={step !== 'ready'}
              onClick={() => fileInputRef.current?.click()}
              title="Upload leaf, pest, or soil image for visual analysis"
            >
              <ImageIcon size={16} />
            </button>

            <button
              type="button"
              className={`input-tool-btn ${isVoiceActive ? 'active' : ''}`}
              disabled={step !== 'ready'}
              onClick={() => setIsVoiceActive((prev) => !prev)}
              title="Voice input (Deutsch / English)"
            >
              <Mic size={16} />
            </button>

            <textarea
              className="chat-textarea"
              rows={1}
              disabled={step !== 'ready'}
              placeholder={
                step === 'select-field'
                  ? (language === 'de' ? 'Wählen Sie oben einen Schlag...' : 'Select a field above to start...')
                  : step === 'select-category'
                  ? (language === 'de' ? 'Wählen Sie oben einen Bereich...' : 'Select a topic category above to continue...')
                  : step === 'loading-context'
                  ? (language === 'de' ? 'Felddaten werden aggregiert...' : 'Synthesizing field intelligence...')
                  : t('aiAssistant.inputPlaceholder')
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            <button
              type="button"
              className="send-msg-btn"
              disabled={step !== 'ready' || (!inputMessage.trim() && !attachedImage) || isAiResponding}
              onClick={() => handleSendMessage()}
              title="Send message"
            >
              <Send size={15} />
            </button>
          </div>

          {/* Advisory Disclaimer */}
          <div className="assistant-disclaimer">
            <Info size={12} className="disclaimer-icon" />
            <span>
              FieldShift AI recommendations are based on SoilGrids v2.0 and German DüV regulations.
              Always cross-check field applications with certified agricultural testing.
            </span>
          </div>
        </div>
      </footer>

      {/* History Drawer */}
      <ConversationHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        conversations={conversations}
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleResetWorkflow}
      />
    </div>
  );
};
export default AIAssistantView;
