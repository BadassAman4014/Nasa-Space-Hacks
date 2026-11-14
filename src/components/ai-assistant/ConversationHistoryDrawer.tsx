import React from 'react';
import { X, MessageSquare, Plus, Clock, MapPin, ChevronRight } from 'lucide-react';
import type { ConversationSummary } from './types';

interface ConversationHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationHistoryDrawer: React.FC<ConversationHistoryDrawerProps> = ({
  isOpen,
  onClose,
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}) => {
  if (!isOpen) return null;

  return (
    <div className="history-drawer-overlay animate-fade-in" onClick={onClose}>
      <aside
        className="history-drawer-panel animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title-row">
            <MessageSquare size={16} className="drawer-title-icon" />
            <h3 className="drawer-title">Conversation History</h3>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} title="Close drawer">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-actions-bar">
          <button
            type="button"
            className="drawer-new-chat-btn"
            onClick={() => {
              onNewConversation();
              onClose();
            }}
          >
            <Plus size={14} />
            <span>New Conversation</span>
          </button>
        </div>

        <div className="drawer-conversations-list">
          {conversations.length === 0 ? (
            <div className="drawer-empty-state">
              <Clock size={24} className="drawer-empty-icon" />
              <p className="drawer-empty-title">No previous conversations</p>
              <p className="drawer-empty-sub">
                Completed queries about your fields and soil will appear here.
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === currentConversationId;
              const dateStr = new Date(conv.updated_at || conv.created_at).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <button
                  key={conv.id}
                  type="button"
                  className={`drawer-conv-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onClose();
                  }}
                >
                  <div className="conv-item-top">
                    <span className="conv-title">{conv.title || 'Farming Consultation'}</span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </div>
                  <div className="conv-item-meta">
                    {conv.field_name && (
                      <span className="conv-field-badge">
                        <MapPin size={10} className="inline mr-1" />
                        {conv.field_name}
                      </span>
                    )}
                    {conv.category && (
                      <span className="conv-category-badge">{conv.category}</span>
                    )}
                    <span className="conv-date">{dateStr}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
