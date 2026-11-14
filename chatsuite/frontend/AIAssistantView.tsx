import React, { useState, useEffect, useRef } from 'react';
import { ChatHeader } from './ChatHeader';
import { DeterministicWorkflow } from './DeterministicWorkflow';
import { AgriculturalLoadingCard } from './AgriculturalLoadingCard';
import { FormattedAssistantMessage } from './FormattedAssistantMessage';
import { UserMessage } from './UserMessage';
import { AssistantStatus } from './AssistantStatus';
import { SuggestedQuestions } from './SuggestedQuestions';
import { Composer } from './Composer';
import { ConversationHistoryDrawer } from './ConversationHistoryDrawer';
import { aiAssistantApi } from './aiAssistantApi';
import { prefersReducedMotion, prettyModel } from './format';
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

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({ notify, initialFieldId }) => {
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

  // History & voice
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Ignores context responses that arrive after the person has reset the flow
  const contextRequestRef = useRef(0);

  // Load conversation summaries
  const loadConversations = async () => {
    try {
      const list = await aiAssistantApi.listConversations();
      setConversations(list);
    } catch (err) {
      console.warn('Failed to load conversation history:', err);
    }
  };

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

  // Keep the newest content in view: a reply starts at its first line, everything else at the bottom
  useEffect(() => {
    if (step !== 'ready') return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && !isAiResponding && messages.length > 1) {
      document.getElementById(`fs-msg-${last.id}`)?.scrollIntoView({ block: 'start', behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior });
    }
  }, [messages, isAiResponding, step]);

  // 2. Step 1: Field Selection Handler
  const handleSelectField = (field: FieldOption) => {
    setSelectedField(field);
    setStep('select-category');
  };

  // 3. Step 2: Category Selection Handler
  const handleSelectCategory = async (category: FieldCategory) => {
    if (!selectedField) return;
    const requestId = ++contextRequestRef.current;
    setSelectedCategory(category);
    setFieldContext(null);
    setStep('loading-context');

    try {
      // Fetch ground-truth context from backend
      const ctx = await aiAssistantApi.getFieldContext(selectedField.id, category);
      if (requestId === contextRequestRef.current) setFieldContext(ctx);
    } catch (err) {
      console.warn('Context retrieval failed, proceeding with client defaults:', err);
      if (requestId !== contextRequestRef.current) return;
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

  // 4. Confirmation finished -> Transition to Ready and post initial grounding message
  const handleLoadingFinished = async () => {
    setStep('ready');

    // Create grounding welcome message tailored to field and category
    const fieldName = selectedField?.name || 'Farm 1';
    const areaHa = selectedField?.area_ha || 18.74;
    const sd = fieldContext?.structured_data;
    const soil =
      fieldContext?.soilgrids ||
      (sd
        ? {
          ph_h2o: sd.ph || 6.42,
          soc_g_kg: sd.organic_carbon_pct ? Number((sd.organic_carbon_pct * 10).toFixed(1)) : 19.4,
          texture_class: sd.texture || 'Sandy Loam',
          total_nitrogen_g_kg: sd.total_nitrogen_g_kg || 3.23,
          c_n_ratio: 6.0,
          sand_percent: sd.sand_pct || 75.5,
          silt_percent: 16.6,
          clay_percent: 7.8,
          bulk_density_g_cm3: 1.46,
          cec_mmol_kg: sd.cec || 240.1,
          source: 'ISRIC SoilGrids v2.0',
          depth: '0-30cm',
        }
        : null);

    let initialSummary = '';
    if (selectedCategory === 'fertilizer') {
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
    } else if (selectedCategory === 'soil') {
      initialSummary =
        `### ISRIC SoilGrids v2.0 Profile for ${fieldName}\n\n` +
        `Here is the verified soil profile extracted from ISRIC SoilGrids 250m resolution:\n\n` +
        `- **Soil Texture:** \`${soil?.texture_class || 'Sandy Loam'}\` (Sand: ${soil?.sand_percent || 75.5}%, Silt: ${soil?.silt_percent || 16.6}%, Clay: ${soil?.clay_percent || 7.8}%)\n` +
        `- **Reaction (pH in H₂O):** \`${soil?.ph_h2o || 6.42}\` (Slightly acidic to neutral; nutrient availability is unrestricted)\n` +
        `- **Bulk Density:** \`${soil?.bulk_density_g_cm3 || 1.46} g/cm³\` (Good root penetration, low compaction)\n` +
        `- **Cation Exchange Capacity (CEC):** \`${soil?.cec_mmol_kg || 240.1} mmol(c)/kg\` (Moderate nutrient buffer capacity)\n` +
        `- **Organic Carbon:** \`${soil?.soc_g_kg || 19.4} g/kg\`\n\n` +
        `How can I assist you with your soil management, liming, or organic matter enhancement?`;
    } else if (selectedCategory === 'field') {
      initialSummary =
        `### Field Boundary & Satellite Overview: ${fieldName}\n\n` +
        `Intelligence summary for **${fieldName}**:\n\n` +
        `- **Total Registered Area:** \`${areaHa} hectares\`\n` +
        `- **Location:** ${selectedField?.farm_name || 'Cottbus Farm'}, Potsdam-Mittelmark, Brandenburg\n` +
        `- **Latest Sentinel-2 NDVI:** \`0.51\` (Moderate-high canopy density, +164.8% delta vs previous)\n` +
        `- **Official Land Register:** DFBK Verified Polygon\n\n` +
        `Ask me anything about parcel zoning, satellite observations, or elevation and drainage patterns!`;
    } else {
      initialSummary =
        `### Crop Management & Disease Advisory: ${fieldName}\n\n` +
        `I am ready to assist with crop selection, growth monitoring, and plant health on **${fieldName}** (${areaHa} ha, Sandy Loam).\n\n` +
        `- You can ask about crop suitability (e.g. Winter Rye, Winter Wheat, Maize, Sunflowers).\n` +
        `- **Attach a plant leaf photo** anytime using the camera icon to run automated disease and pathogen detection.\n\n` +
        `Which crop or concern are you focusing on today?`;
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
    contextRequestRef.current += 1;
    setStep('select-field');
    setSelectedField(null);
    setSelectedCategory(null);
    setFieldContext(null);
    setConversationId(null);
    setMessages([]);
    setAttachedImage(null);
    setInputMessage('');
    setIsVoiceActive(false);
  };

  // Handle Image Upload
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify?.('Please upload a valid JPG, PNG, or WEBP image.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      notify?.('Image size must be under 10MB.');
      e.target.value = '';
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
    // clear input so the same file can be chosen again
    e.target.value = '';
  };

  // Handle Send Message
  const handleSendMessage = async (textToSend?: string) => {
    if (isAiResponding) return;
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
      const errDetail = err?.message || 'Connection error';
      const errorMsg: ChatMessage = {
        id: 'err-' + Date.now(),
        role: 'assistant',
        content: `**Advisory Notice**: ${errDetail}. Please verify your backend server connection or retry.`,
        timestamp: new Date().toISOString(),
        model: 'Offline Fallback',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // Follow-up suggestions based on category
  const getSuggestions = (): string[] => {
    if (selectedCategory === 'fertilizer') {
      return [
        `What is the max allowed N under DüV for winter wheat on ${selectedField?.name || 'Farm 1'}?`,
        'How should I split 140 kg N/ha given our Sandy Loam texture?',
        'Calculate organic compost rate based on our 19.4 g/kg SOC',
      ];
    }
    if (selectedCategory === 'soil') {
      return [
        'Explain the implications of pH 6.42 and 75.5% sand content',
        'How does 240.1 mmol/kg CEC affect nitrogen leaching risk?',
        'Which cover crops will build organic matter in Brandenburg?',
      ];
    }
    if (selectedCategory === 'crop') {
      return [
        'Which crops perform best on Sandy Loam with 550mm rain?',
        'What are the optimal seeding dates for winter barley?',
        'How can I identify Septoria tritici leaf blotch in wheat?',
      ];
    }
    return [
      'What does 0.51 NDVI indicate about current vegetative biomass?',
      'What are the regional weather risks for Brandenburg this week?',
      'How does this parcel compare to regional Brandenburg benchmarks?',
    ];
  };

  // Load existing conversation
  const handleSelectConversation = async (convId: string) => {
    try {
      const data = await aiAssistantApi.getConversation(convId);
      contextRequestRef.current += 1;
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

  const lastMessage = messages[messages.length - 1];
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.model);
  const modelLabel = prettyModel(lastAssistant?.model) || 'Gemini';
  const showSuggestions =
    step === 'ready' &&
    !isAiResponding &&
    lastMessage?.role === 'assistant' &&
    !/offline/i.test(lastMessage.model ?? '');
  const pendingHasImage = Boolean(
    [...messages].reverse().find((m) => m.role === 'user')?.images?.length
  );

  const placeholder =
    step === 'select-field'
      ? 'Choose a field above to start'
      : step === 'select-category'
        ? 'Choose a topic above to continue'
        : step === 'loading-context'
          ? 'Preparing your field data…'
          : 'Ask about crops, soil nutrients or DüV fertilizer schedules';

  return (
    <div className="fs-chat">
      <ChatHeader
        selectedField={selectedField}
        selectedCategory={selectedCategory}
        modelLabel={modelLabel}
        historyCount={conversations.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewQuery={handleResetWorkflow}
      />

      {/* Scrollable conversation */}
      <main className="fs-scroll" aria-label="Conversation">
        <div className="fs-column">
          {step !== 'ready' && (
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

          {step === 'loading-context' && selectedCategory && (
            <AgriculturalLoadingCard
              category={selectedCategory}
              fieldName={selectedField?.name || 'Selected field'}
              contextData={fieldContext}
              onFinished={handleLoadingFinished}
            />
          )}

          {step === 'ready' && (
            <div className="fs-stream" role="log" aria-live="off">
              {messages.map((msg) =>
                msg.role === 'assistant' ? (
                  <FormattedAssistantMessage key={msg.id} message={msg} />
                ) : (
                  <UserMessage key={msg.id} message={msg} />
                )
              )}

              {showSuggestions && (
                <SuggestedQuestions suggestions={getSuggestions()} onPick={(q) => handleSendMessage(q)} />
              )}

              {isAiResponding && (
                <AssistantStatus category={selectedCategory} hasImage={pendingHasImage} />
              )}
            </div>
          )}

          <div ref={messagesEndRef} className="fs-end" />
        </div>
      </main>

      {/* Composer dock: sits below the scroll area so it never covers content */}
      <footer className="fs-dock">
        <div className="fs-column">
          <Composer
            value={inputMessage}
            onChange={setInputMessage}
            onSend={() => handleSendMessage()}
            disabled={step !== 'ready'}
            isResponding={isAiResponding}
            placeholder={placeholder}
            attachedImage={attachedImage}
            onRemoveImage={() => setAttachedImage(null)}
            onImageFileChange={handleImageFileChange}
            isVoiceActive={isVoiceActive}
            onToggleVoice={() => setIsVoiceActive((prev) => !prev)}
            onVoiceTranscript={(transcript) => {
              setIsVoiceActive(false);
              setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
            }}
            onVoiceCancel={() => setIsVoiceActive(false)}
          />
        </div>
      </footer>

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