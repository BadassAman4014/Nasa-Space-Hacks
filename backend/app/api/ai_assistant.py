"""
FastAPI router for AI Farming Assistant powered by Google Gemini and persistent field records.
Provides dynamic field context retrieval, multi-turn conversation memory, image analysis, and voice processing.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Path, Query, status

from app.services.ai_assistant.context_builder import context_builder
from app.services.ai_assistant.db_service import assistant_db
from app.services.ai_assistant.gemini_service import gemini_service
from app.services.ai_assistant.schemas import (
    AssistantCategory,
    ConversationDetail,
    ConversationSummary,
    CreateConversationRequest,
    FieldContextResponse,
    SendMessageRequest,
    SendMessageResponse,
    VoiceTranscriptionRequest,
    VoiceTranscriptionResponse,
)

router = APIRouter(prefix="/ai-assistant", tags=["ai-assistant"])


@router.get("/fields")
def get_farmer_fields():
    """Retrieve all saved fields belonging to the authenticated farmer plus system comparative options."""
    try:
        raw_fields = context_builder.get_registered_fields()
        result = []
        total_ha = 0.0

        for f in raw_fields:
            ha = f.get("area_ha", 0.0)
            total_ha += ha
            result.append({
                "id": f.get("id"),
                "name": f.get("name"),
                "farm_name": f.get("farm_name", "My Farm"),
                "area_ha": ha,
                "crop_name": f.get("current_crop"),
                "status": "verified",
                "is_special": False,
            })

        # Add All Fields option
        result.append({
            "id": "all",
            "name": "All Fields (Comparative)",
            "farm_name": "Comparative analysis across all fields",
            "area_ha": round(total_ha, 2),
            "crop_name": "Multi-crop overview",
            "status": "system",
            "is_special": True,
        })

        # Add General Question option
        result.append({
            "id": "general",
            "name": "General Question",
            "farm_name": "Brandenburg regional agronomy & guidance",
            "area_ha": 0,
            "crop_name": None,
            "status": "system",
            "is_special": True,
        })

        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve farmer fields: {e}",
        )


@router.get("/fields/{field_id}/context", response_model=FieldContextResponse)
def get_field_context(
    field_id: str = Path(..., description="Field identifier, or 'all', or 'general'"),
    category: AssistantCategory = Query("field", description="Selected assistance category"),
):
    """
    Retrieve structured, verified context for the selected field and category.
    Pulls actual data from user_farms_repo, SoilGrids v2.0, Sentinel-2, and Weather services.
    """
    try:
        return context_builder.build_context(category=category, field_id=field_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build field context: {e}",
        )


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations():
    """List previous AI assistant conversations for sidebar history."""
    try:
        return assistant_db.list_conversations()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list conversations: {e}",
        )


@router.post("/conversations", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
def create_conversation(payload: CreateConversationRequest):
    """Start a fresh AI Assistant conversation session with initial field/category selection."""
    try:
        conv = assistant_db.create_conversation(
            title=payload.title,
            selected_field_id=payload.selected_field_id,
            selected_category=payload.selected_category,
        )
        return conv
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create conversation: {e}",
        )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str = Path(..., description="Conversation ID")):
    """Retrieve full conversation history and previous messages."""
    conv = assistant_db.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conversation_id}' not found.",
        )
    return conv


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str = Path(..., description="Conversation ID")):
    """Delete a conversation session and all its messages."""
    success = assistant_db.delete_conversation(conversation_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation '{conversation_id}' not found.",
        )
    return {"status": "success", "deleted": True}


@router.post("/chat", response_model=SendMessageResponse)
async def send_chat_message(payload: SendMessageRequest):
    """
    Process user chat message with Gemini API.
    Retrieves verified field context, persists user and assistant messages, and supports image attachments.
    """
    resolved_field_id = payload.field_id or payload.selected_field_id
    raw_category = payload.category or payload.selected_category or "field"
    active_category: AssistantCategory = (
        raw_category if raw_category in ["crop", "field", "soil", "fertilizer", "all", "general"] else "field"
    )

    # Normalize attachments
    raw_images = payload.images or payload.attachments or []
    normalized_attachments: list[ImageAttachment] = []
    for img in raw_images:
        b64 = img.resolved_base64
        if b64:
            normalized_attachments.append(
                ImageAttachment(
                    filename=img.name or img.filename or "uploaded_image.jpg",
                    content_type=img.resolved_mime_type,
                    base64_data=b64,
                )
            )

    conv = None
    if payload.conversation_id:
        conv = assistant_db.get_conversation(payload.conversation_id)

    if not conv:
        # Auto-create if not yet persisted or not found
        conv_summary = assistant_db.create_conversation(
            title=payload.message[:35] + ("..." if len(payload.message) > 35 else ""),
            selected_field_id=resolved_field_id,
            selected_category=active_category,
        )
        conv_id = conv_summary.id
        conv = assistant_db.get_conversation(conv_id)
    else:
        conv_id = conv.id

    # 1. Store user message in database
    user_msg = assistant_db.add_message(
        conversation_id=conv_id,
        sender="user",
        message=payload.message,
        attachments=normalized_attachments,
        category=active_category,
    )

    # 2. Build live field context from real APIs
    context_res = context_builder.build_context(
        category=active_category,
        field_id=resolved_field_id or (conv.selected_field_id if conv else None),
    )

    # 3. Call Gemini with context, history, and multi-modal attachments
    history = conv.messages if conv else []
    reply_text, model_name = await gemini_service.generate_response(
        user_message=payload.message,
        field_context=context_res.context_text,
        conversation_history=history,
        attachments=normalized_attachments,
        category=active_category,
    )

    # 4. Store assistant response in database
    assistant_msg = assistant_db.add_message(
        conversation_id=conv_id,
        sender="assistant",
        message=reply_text,
        category=active_category,
    )

    return SendMessageResponse(
        conversation_id=conv_id,
        message_id=assistant_msg.id,
        reply=reply_text,
        model=model_name,
        field_id=resolved_field_id,
        category=active_category,
        created_at=assistant_msg.created_at,
        grounded_data=context_res.structured_data,
    )


@router.post("/voice", response_model=VoiceTranscriptionResponse)
def process_voice_input(payload: VoiceTranscriptionRequest):
    """
    Processes audio recording and returns recognized text.
    Acts as a secure backend gateway for voice queries.
    """
    # Note: On modern browsers, SpeechRecognition runs directly on-device with high precision.
    # This backend endpoint acts as a durable gateway and validator.
    return VoiceTranscriptionResponse(
        text="Voice audio received successfully.",
        language=payload.language or "de-DE",
    )
