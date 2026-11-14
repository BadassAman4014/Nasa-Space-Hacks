import React, { useMemo, useState } from 'react';
import { Copy, Check, Sprout, Info, TriangleAlert, Database } from 'lucide-react';
import type { ChatMessage } from './types';
import {
  classify,
  parseReply,
  riskLevelOf,
  splitCalloutSource,
  type Block,
  type ListBlock,
  type ListItem,
  type Section,
  type TableBlock,
} from './responseParser';
import { renderInline, RiskBadge, sanitizeRawText } from './richText';
import { TopicIcon, TOPIC_META } from './semantics';
import { formatTime, prettyModel } from './format';

interface FormattedAssistantMessageProps {
  message: ChatMessage;
}

/* ------------------------------------------------------------------ */
/* Lists                                                                */
/* ------------------------------------------------------------------ */

const isKeyed = (items: ListItem[]) =>
  items.length > 0 && items.filter((i) => i.key).length >= Math.ceil(items.length / 2);

const ChildList: React.FC<{ item: ListItem }> = ({ item }) => {
  if (item.children.length === 0) return null;
  if (item.childrenOrdered) return <Steps items={item.children} nested />;
  if (isKeyed(item.children)) return <Facts items={item.children} nested />;
  return <Bullets items={item.children} nested />;
};

const Steps: React.FC<{ items: ListItem[]; nested?: boolean }> = ({ items, nested }) => (
  <ol className={`fs-steps${nested ? ' fs-steps--nested' : ''}`}>
    {items.map((item, i) => (
      <li key={i} className="fs-step">
        <span className="fs-step__n" aria-hidden="true">
          {i + 1}
        </span>
        <div className="fs-step__body">
          {item.key && <div className="fs-step__key">{renderInline(item.key)}</div>}
          {item.value && <div className="fs-step__val">{renderInline(item.value, { badges: true })}</div>}
          <ChildList item={item} />
        </div>
      </li>
    ))}
  </ol>
);

const Bullets: React.FC<{ items: ListItem[]; nested?: boolean }> = ({ items, nested }) => (
  <ul className={`fs-bullets${nested ? ' fs-bullets--nested' : ''}`}>
    {items.map((item, i) => (
      <li key={i} className="fs-bullet">
        <span className="fs-dot" aria-hidden="true" />
        <div>
          {item.key ? (
            <>
              <strong>{renderInline(item.key)}</strong>
              {item.value ? <> {renderInline(item.value, { badges: true })}</> : null}
            </>
          ) : (
            renderInline(item.value, { badges: true })
          )}
          <ChildList item={item} />
        </div>
      </li>
    ))}
  </ul>
);

const Facts: React.FC<{ items: ListItem[]; nested?: boolean }> = ({ items, nested }) => (
  <ul className={`fs-facts${nested ? ' fs-facts--nested' : ''}`}>
    {items.map((item, i) => {
      const topic = classify(item.key);
      const isGroup = Boolean(item.key) && !item.value && item.children.length > 0;
      const isPlain = !item.key;
      const cls = ['fs-fact', isGroup && 'fs-fact--group', isPlain && 'fs-fact--plain']
        .filter(Boolean)
        .join(' ');
      return (
        <li key={i} className={cls}>
          <span className="fs-fact__lead">
            {topic ? <TopicIcon topic={topic} /> : <span className="fs-dot" aria-hidden="true" />}
          </span>
          {item.key && <div className="fs-fact__key">{renderInline(item.key)}</div>}
          {item.value && <div className="fs-fact__val">{renderInline(item.value, { badges: true })}</div>}
          {item.children.length > 0 && (
            <div className="fs-fact__sub">
              <ChildList item={item} />
            </div>
          )}
        </li>
      );
    })}
  </ul>
);

const ListView: React.FC<{ block: ListBlock }> = ({ block }) => {
  if (block.ordered) return <Steps items={block.items} />;
  if (isKeyed(block.items)) return <Facts items={block.items} />;
  return <Bullets items={block.items} />;
};

/* ------------------------------------------------------------------ */
/* Tables                                                               */
/* ------------------------------------------------------------------ */

const NUMERIC_CELL = /^[`~≈<>±]*[-+−]?\d[\d.,]*\s*(?:%|[A-Za-zµ°²³/.\-]+)?`*$/;
const LEVEL_HEADER = /risk|severity|priority|urgency|level|rating/i;

const DataTable: React.FC<{ block: TableBlock }> = ({ block }) => {
  const numericCols = block.header.map(
    (_, c) =>
      c > 0 &&
      block.rows.length > 0 &&
      block.rows.every((r) => NUMERIC_CELL.test((r[c] ?? '').trim()))
  );

  return (
    <div className="fs-table-wrap" role="region" aria-label="Data table" tabIndex={0}>
      <table className="fs-table">
        <thead>
          <tr>
            {block.header.map((h, i) => (
              <th key={i} scope="col" className={numericCols[i] ? 'is-num' : undefined}>
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const plain = cell.replace(/[`*]/g, '').trim();
                const level = LEVEL_HEADER.test(block.header[c] ?? '') ? riskLevelOf(plain) : null;
                return (
                  <td
                    key={c}
                    data-label={block.header[c]?.replace(/[`*]/g, '')}
                    className={numericCols[c] ? 'is-num' : undefined}
                  >
                    {level ? (
                      <RiskBadge level={level}>{plain}</RiskBadge>
                    ) : (
                      renderInline(cell, { badges: true })
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Notes (blockquotes)                                                  */
/* ------------------------------------------------------------------ */

const Note: React.FC<{ text: string }> = ({ text }) => {
  const { body, source } = splitCalloutSource(text);
  const stripped = body.replace(/^\*([^*][\s\S]*[^*])\*$/, '$1');
  const isCaution = /^\W*(warning|caution|achtung|important|attention)\b/i.test(stripped);
  const Icon = isCaution ? TriangleAlert : Info;
  return (
    <div className={`fs-note fs-note--${isCaution ? 'caution' : 'info'}`}>
      <Icon size={15} strokeWidth={2} aria-hidden={true} className="fs-note__ico" />
      <div className="fs-note__body">
        <p>{renderInline(stripped)}</p>
        {source && (
          <p className="fs-note__source">
            <Database size={12} aria-hidden={true} />
            <span>{renderInline(source)}</span>
          </p>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */

const BlockView: React.FC<{
  block: Block;
  prev?: Block;
  isLastOfMessage: boolean;
}> = ({ block, prev, isLastOfMessage }) => {
  switch (block.type) {
    case 'paragraph': {
      const isAsk = isLastOfMessage && /\?\s*$/.test(block.text);
      const isLeadIn = /[:：]\s*$/.test(block.text);
      const after = prev && (prev.type === 'list' || prev.type === 'table');
      const cls = ['fs-p', isAsk && 'fs-p--ask', isLeadIn && 'fs-p--leadin', after && !isAsk && 'fs-p--support']
        .filter(Boolean)
        .join(' ');
      return <p className={cls}>{renderInline(block.text)}</p>;
    }
    case 'list':
      return <ListView block={block} />;
    case 'table':
      return <DataTable block={block} />;
    case 'callout':
      return <Note text={block.text} />;
    case 'heading':
      return <h5 className="fs-subtitle">{renderInline(block.text)}</h5>;
    default:
      return null;
  }
};

const SectionView: React.FC<{ section: Section; isLastSection: boolean }> = ({
  section,
  isLastSection,
}) => {
  const topic = section.topic;
  const isAlert = topic === 'warning' || topic === 'risk';
  const tone = topic ? TOPIC_META[topic].tone : null;

  const body = section.blocks.map((block, i) => (
    <BlockView
      key={i}
      block={block}
      prev={section.blocks[i - 1]}
      isLastOfMessage={isLastSection && i === section.blocks.length - 1}
    />
  ));

  const title = section.title ? (
    <h4 className="fs-sec__title">
      {topic && <TopicIcon topic={topic} />}
      <span>{renderInline(section.title)}</span>
    </h4>
  ) : null;

  return (
    <section
      className={['fs-sec', isAlert && `fs-alert fs-alert--${tone}`].filter(Boolean).join(' ')}
    >
      {title}
      {body}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Message                                                              */
/* ------------------------------------------------------------------ */

export const FormattedAssistantMessage: React.FC<FormattedAssistantMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);

  const isContextSummary = message.id.startsWith('welcome-');
  const isError = /offline/i.test(message.model ?? '');

  const parsed = useMemo(
    () => parseReply(message.content, { allowLead: !isContextSummary && !isError }),
    [message.content, isContextSummary, isError]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable (insecure context): leave the button unchanged */
    }
  };

  const model = prettyModel(message.model);
  const time = formatTime(message.timestamp);

  return (
    <article
      id={`fs-msg-${message.id}`}
      className={`fs-msg fs-msg--assistant${isError ? ' fs-msg--error' : ''}`}
      aria-label="Assistant message"
    >
      <header className="fs-msg__head">
        <span className="fs-avatar" aria-hidden="true">
          <Sprout size={13} strokeWidth={2.2} />
        </span>
        <span className="fs-msg__name">{isError ? 'Connection problem' : 'FieldShift'}</span>
        {model && <span className="fs-chip fs-chip--quiet">{model}</span>}
        {time && <time className="fs-msg__time">{time}</time>}
      </header>

      <div className="fs-msg__body">
        {isError ? (
          <div className="fs-notice" role="alert">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden={true} />
            <p>{renderInline(sanitizeRawText(message.content))}</p>
          </div>
        ) : (
          <>
            {parsed.title && <h3 className="fs-msg__title">{renderInline(parsed.title)}</h3>}

            {parsed.lead && (
              <div className="fs-lead">
                <span className="fs-lead__ico" aria-hidden="true">
                  <Sprout size={15} strokeWidth={2.2} />
                </span>
                <p>{renderInline(parsed.lead)}</p>
              </div>
            )}

            {parsed.sections.map((section, i) => (
              <SectionView
                key={i}
                section={section}
                isLastSection={i === parsed.sections.length - 1}
              />
            ))}
          </>
        )}
      </div>

      {!isError && (
        <footer className="fs-msg__foot">
          <button type="button" className="fs-ghost-btn" onClick={handleCopy} aria-label="Copy response">
            {copied ? <Check size={13} aria-hidden={true} /> : <Copy size={13} aria-hidden={true} />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </footer>
      )}
    </article>
  );
};