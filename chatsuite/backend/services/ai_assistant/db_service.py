import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Optional

from app.services.ai_assistant.schemas import (
    ChatMessage,
    ConversationDetail,
    ConversationSummary,
    ImageAttachment,
)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DATA_DIR / "ai_assistant.db"

class AIAssistantDB:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    selected_field_id TEXT,
                    selected_category TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    message TEXT NOT NULL,
                    attachments_json TEXT DEFAULT '[]',
                    category TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);")

    def create_conversation(
        self,
        title: Optional[str] = None,
        selected_field_id: Optional[str] = None,
        selected_category: Optional[str] = None,
    ) -> ConversationSummary:
        cid = f"conv-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        t = title or f"Consultation ({selected_category or 'General'})"

        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO conversations (id, title, selected_field_id, selected_category, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (cid, t, selected_field_id, selected_category, now, now),
            )

        return ConversationSummary(
            id=cid,
            title=t,
            selected_field_id=selected_field_id,
            selected_category=selected_category,
            message_count=0,
            created_at=now,
            updated_at=now,
        )

    def list_conversations(self) -> list[ConversationSummary]:
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT c.*, COUNT(m.id) as msg_count
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """
            ).fetchall()

            return [
                ConversationSummary(
                    id=r["id"],
                    title=r["title"],
                    selected_field_id=r["selected_field_id"],
                    selected_category=r["selected_category"],
                    message_count=r["msg_count"],
                    created_at=r["created_at"],
                    updated_at=r["updated_at"],
                )
                for r in rows
            ]

    def get_conversation(self, conversation_id: str) -> Optional[ConversationDetail]:
        with self._conn() as conn:
            c = conn.execute(
                "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()
            if not c:
                return None

            msg_rows = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
                (conversation_id,),
            ).fetchall()

            messages: list[ChatMessage] = []
            for m in msg_rows:
                attachments = []
                try:
                    att_data = json.loads(m["attachments_json"] or "[]")
                    for a in att_data:
                        attachments.append(ImageAttachment(**a))
                except Exception:
                    pass

                messages.append(
                    ChatMessage(
                        id=m["id"],
                        conversation_id=m["conversation_id"],
                        sender=m["sender"],
                        message=m["message"],
                        attachments=attachments,
                        category=m["category"],
                        created_at=m["created_at"],
                    )
                )

            return ConversationDetail(
                id=c["id"],
                title=c["title"],
                selected_field_id=c["selected_field_id"],
                selected_category=c["selected_category"],
                messages=messages,
                created_at=c["created_at"],
                updated_at=c["updated_at"],
            )

    def delete_conversation(self, conversation_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM conversations WHERE id = ?", (conversation_id,)
            )
            return cur.rowcount > 0

    def add_message(
        self,
        conversation_id: str,
        sender: str,
        message: str,
        attachments: Optional[list[ImageAttachment]] = None,
        category: Optional[str] = None,
    ) -> ChatMessage:
        mid = f"msg-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        att_list = [a.model_dump() for a in (attachments or [])]
        att_json = json.dumps(att_list)

        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO messages (id, conversation_id, sender, message, attachments_json, category, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (mid, conversation_id, sender, message, att_json, category, now),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )

        return ChatMessage(
            id=mid,
            conversation_id=conversation_id,
            sender=sender,  # type: ignore
            message=message,
            attachments=attachments or [],
            category=category,
            created_at=now,
        )

assistant_db = AIAssistantDB()
