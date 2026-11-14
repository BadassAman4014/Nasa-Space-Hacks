from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

AssistantCategory = Literal['crop', 'field', 'soil', 'fertilizer', 'all', 'general', 'advisor']

class ImageAttachment(BaseModel):
    name: Optional[str] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    content_type: Optional[str] = None
    data: Optional[str] = None
    base64_data: Optional[str] = None
    size_bytes: Optional[int] = None

    @property
    def resolved_base64(self) -> str:
        return self.data or self.base64_data or ""

    @property
    def resolved_mime_type(self) -> str:
        return self.mime_type or self.content_type or "image/jpeg"

class ChatMessage(BaseModel):
    id: str
    conversation_id: str
    sender: Literal['user', 'assistant', 'system']
    message: str
    attachments: list[ImageAttachment] = []
    category: Optional[str] = None
    created_at: str

class ConversationSummary(BaseModel):
    id: str
    title: str
    selected_field_id: Optional[str] = None
    selected_category: Optional[str] = None
    message_count: int = 0
    created_at: str
    updated_at: str

class ConversationDetail(BaseModel):
    id: str
    title: str
    selected_field_id: Optional[str] = None
    selected_category: Optional[str] = None
    messages: list[ChatMessage] = []
    created_at: str
    updated_at: str

class CreateConversationRequest(BaseModel):
    selected_field_id: Optional[str] = None
    selected_category: Optional[AssistantCategory] = None
    title: Optional[str] = None

class SendMessageRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str
    field_id: Optional[str] = None
    selected_field_id: Optional[str] = None
    category: Optional[str] = None
    selected_category: Optional[str] = None
    images: list[ImageAttachment] = []
    attachments: list[ImageAttachment] = []
    topic: Optional[Literal['crop', 'field', 'soil', 'fertilizer']] = None

class SendMessageResponse(BaseModel):
    conversation_id: str
    message_id: str
    reply: str
    model: str
    field_id: Optional[str] = None
    category: Optional[str] = None
    created_at: Optional[str] = None
    grounded_data: dict[str, Any] = {}

class FieldContextResponse(BaseModel):
    field_id: Optional[str] = None
    category: AssistantCategory
    context_text: str
    structured_data: dict[str, Any] = {}

class VoiceTranscriptionRequest(BaseModel):
    audio_base64: str
    language: str = "de-DE"

class VoiceTranscriptionResponse(BaseModel):
    text: str
    language: str
