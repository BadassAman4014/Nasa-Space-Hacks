import React, { useState } from 'react';
import { Copy, Check, Sparkles, Cpu, Info } from 'lucide-react';
import type { ChatMessage } from './types';

interface FormattedAssistantMessageProps {
  message: ChatMessage;
}

export const FormattedAssistantMessage: React.FC<FormattedAssistantMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Copy clean plain text without formatting symbols
    const cleanContent = sanitizeRawText(message.content)
      .replace(/[*#`_]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    navigator.clipboard.writeText(cleanContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Cleans stray artifacts, raw LaTeX fragments, internal IDs, and unparsed escapes from raw text.
   */
  const sanitizeRawText = (raw: string): string => {
    if (!raw) return '';
    return raw
      // Replace common LaTeX expressions like $\text{C}_{\text{org}}$ or $\text{K}_2\text{O}$
      .replace(/\$\\text\{C\}_(?:\{)?(?:\\text\{)?org\}?(?:\})?\$/gi, 'Corg')
      .replace(/\$\\text\{K\}_2\\text\{O\}\$/gi, 'K₂O')
      .replace(/\$\\text\{P\}_2\\text\{O\}_5\$/gi, 'P₂O₅')
      .replace(/\$\\text\{([A-Za-z0-9\s]+)\}\$/g, '$1')
      .replace(/\$([A-Za-z0-9_\-+]+)\$/g, '$1')
      // Strip internal database field IDs like ( field-1a06dfdb7 ) or (field-xxxx)
      .replace(/\(\s*field-[a-z0-9\-]+\s*\)/gi, '')
      // Remove escaped asterisks, underscores, and hashes
      .replace(/\\+\*/g, '*')
      .replace(/\\+_/g, '_')
      .replace(/\\+#/g, '#')
      // Remove standalone divider lines
      .replace(/^\s*[-*_]{3,}\s*$/gm, '---')
      // Remove stray trailing conversational prompts like "*Are you planning...*"
      .replace(/\n+\*?(?:Are you planning|Would you like|Do you have any questions|Feel free to ask)[^\n]*\??\*?$/gi, '');
  };

  /**
   * Renders inline markdown: bold, italic, bold-italic, code spans, numbers.
   */
  const renderInlineMarkdown = (text: string): React.ReactNode => {
    const cleanText = sanitizeRawText(text);

    // Regex to split by bold-italic (***text***), bold (**text**), italic (*text* or _text_), or inline code (`code`)
    const regex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^*\n]+?\*|`[^`]+`|_[^_\n]+?_)/g;
    const parts = cleanText.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Bold + Italic: ***text***
      if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
        return (
          <strong key={index} className="ai-msg-strong">
            <em>{part.slice(3, -3)}</em>
          </strong>
        );
      }

      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={index} className="ai-msg-strong">
            {part.slice(2, -2)}
          </strong>
        );
      }

      // Italic: *text* (or _text_)
      if (
        (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
      ) {
        return (
          <em key={index} className="ai-msg-italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      // Inline code: `text`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={index} className="ai-msg-code">
            {part.slice(1, -1)}
          </code>
        );
      }

      // Clean any stray single asterisk at boundaries if left unmatched
      const sanitizedPart = part.replace(/(?:^\*|\*$)/g, '');
      return sanitizedPart;
    });
  };

  const renderFormattedContent = (content: string) => {
    const lines = content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1);
        elements.push(
          <div key={`table-${elements.length}`} className="ai-table-container">
            <table className="ai-markdown-table">
              <thead>
                <tr>
                  {header.map((cell, idx) => (
                    <th key={idx}>{renderInlineMarkdown(cell.trim())}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{renderInlineMarkdown(cell.trim())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
      inTable = false;
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Table row detected
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        inTable = true;
        // Check if separator line (|---|---|)
        if (/^\|(\s*[-:]+\s*\|)+$/.test(trimmed)) {
          return;
        }
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        tableRows.push(cells);
        return;
      } else if (inTable) {
        flushTable();
      }

      // Horizontal dividers (--- or ***)
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        elements.push(<hr key={idx} className="ai-msg-divider" />);
        return;
      }

      // Blockquotes (> Quote or note)
      if (trimmed.startsWith('>')) {
        const quoteText = trimmed.replace(/^>\s*/, '');
        elements.push(
          <div key={idx} className="ai-msg-callout">
            <Info size={14} className="callout-icon flex-shrink-0 mt-0.5" />
            <div className="callout-text">{renderInlineMarkdown(quoteText)}</div>
          </div>
        );
        return;
      }

      // Headers (H1 to H6) - strip all # characters cleanly
      const headerMatch = trimmed.match(/^(#{1,6})[\s\u00A0]*(.*)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2].replace(/^#+\s*/, '').trim();
        if (!text) return;

        if (level === 1) {
          elements.push(
            <h2 key={idx} className="ai-msg-h1">
              {renderInlineMarkdown(text)}
            </h2>
          );
        } else if (level === 2) {
          elements.push(
            <h3 key={idx} className="ai-msg-h2">
              {renderInlineMarkdown(text)}
            </h3>
          );
        } else if (level === 3) {
          elements.push(
            <h4 key={idx} className="ai-msg-h3">
              {renderInlineMarkdown(text)}
            </h4>
          );
        } else {
          // H4, H5, H6 rendered as clean bold subheaders without ANY hashes
          elements.push(
            <div key={idx} className="ai-msg-bullet ai-msg-subheading">
              <span className="bullet-dot">•</span>
              <strong className="ai-msg-strong">{renderInlineMarkdown(text)}</strong>
            </div>
          );
        }
        return;
      }

      // Bullet points (- or * or • or +)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ') || trimmed.startsWith('+ ')) {
        const bulletContent = trimmed.replace(/^[-*•+]\s+/, '');
        elements.push(
          <div key={idx} className="ai-msg-bullet">
            <span className="bullet-dot">•</span>
            <div className="bullet-text">{renderInlineMarkdown(bulletContent)}</div>
          </div>
        );
        return;
      }

      // Numbered lists (1. or 2.)
      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numberedMatch) {
        elements.push(
          <div key={idx} className="ai-msg-bullet numbered">
            <span className="bullet-num">{numberedMatch[1]}.</span>
            <div className="bullet-text">{renderInlineMarkdown(numberedMatch[2])}</div>
          </div>
        );
        return;
      }

      // Empty line / paragraph break
      if (trimmed === '') {
        elements.push(<div key={idx} className="ai-msg-spacer" />);
        return;
      }

      // Standard paragraph
      elements.push(
        <p key={idx} className="ai-msg-paragraph">
          {renderInlineMarkdown(line)}
        </p>
      );
    });

    if (inTable) {
      flushTable();
    }

    return elements;
  };

  return (
    <div className="assistant-message-card">
      <div className="assistant-header-row">
        <div className="assistant-identity">
          <div className="ai-icon-badge">
            <Sparkles size={13} />
          </div>
          <span className="assistant-name">Gemini Farming Assistant</span>
          {message.model && (
            <span className="assistant-model-tag">
              <Cpu size={10} className="inline mr-1" />
              {message.model}
            </span>
          )}
        </div>

        <div className="assistant-actions">
          <button
            type="button"
            className="copy-msg-btn"
            onClick={handleCopy}
            title="Copy recommendations"
          >
            {copied ? <Check size={13} className="copy-check-icon" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      <div className="assistant-body-content">{renderFormattedContent(message.content)}</div>

      <div className="assistant-footer-meta">
        <span className="msg-timestamp">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {message.category && (
          <span className="msg-category-tag">Topic: {message.category}</span>
        )}
      </div>
    </div>
  );
};
