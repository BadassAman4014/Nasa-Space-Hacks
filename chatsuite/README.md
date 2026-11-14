# FieldShiftAI ChatSuite

Complete standalone package containing the frontend components, visual language CSS, API client, data models, and backend endpoints for the FieldShift AI Farming Assistant Chatbot.

## Structure
- rontend/:
  - AIAssistantView.tsx: Main chat orchestrator component
  - i-assistant.css: Full stylesheet applying the Dribbble-inspired palette and responsive mobile chatbot aesthetic
  - DeterministicWorkflow.tsx: Welcome, Field Selection, and Category Selection workflow
  - AgriculturalLoadingCard.tsx: Context configuration and ground-truth loading card
  - FormattedAssistantMessage.tsx: Markdown parsing, tables, and sage-tinted recommendations
  - VoiceInputBar.tsx: Multi-language voice recording & speech recognition interface
  - ConversationHistoryDrawer.tsx: History drawer for past consultation sessions
  - 	ypes.ts: TypeScript interfaces and data definitions
  - iAssistantApi.ts: Client API layer
- ackend/:
  - pi/ai_assistant.py: FastAPI route definitions
  - services/ai_assistant/: Context builders, database persistence, schemas, and Gemini integration
