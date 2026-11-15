import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Database, AlertCircle, Loader2, Image as ImageIcon, Mic, MicOff, MapPin, Layers, HelpCircle, RotateCcw, Repeat, MessageCircleMore, Sparkles } from 'lucide-react';
import { aiAssistantApi } from '../ai-assistant/aiAssistantApi';
import type { FieldOption, FieldCategory, ImageAttachment } from '../ai-assistant/types';

type Topic = Exclude<FieldCategory, 'advisor'>;
type Step = 'field' | 'topic' | 'chat';

interface Line {
  id: string;
  role: 'bot' | 'user' | 'assistant';
  content: string;
  image?: string;
  unavailable?: string[];
  failed?: boolean;
}

const TOPICS: { id: Topic | 'any'; label: string }[] = [
  { id: 'crop', label: 'Crop' },
  { id: 'field', label: 'Field' },
  { id: 'soil', label: 'Soil' },
  { id: 'fertilizer', label: 'Fertilizer' },
  { id: 'any', label: 'Just ask' },
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const GREETING = 'Hello, I am your AI Advisor. I only use the data you point me to, and I name the source of every answer.';

// Minimal, safe renderer: **bold** and bullet lines. No raw HTML.
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function AdvisorText({ text }: { text: string }) {
  const lines = text.split('\n').filter((l, i, arr) => l.trim() !== '' || (i > 0 && arr[i - 1].trim() !== ''));
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (/^Sources?:/i.test(trimmed)) {
          return (
            <div key={i} className="mt-1 flex items-start gap-1.5 text-[11px] font-semibold text-slate-500">
              <Database size={12} className="mt-0.5 shrink-0" />
              <span>{trimmed}</span>
            </div>
          );
        }
        const bullet = trimmed.match(/^[*•-]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-[#1fa35b]">•</span>
              <span>{renderInline(bullet[1])}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

const chipClass =
  'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:border-[#1fa35b] hover:bg-emerald-50';

export function AdvisorDrawer({ onOpenFields }: { onOpenFields?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('field');
  const [lines, setLines] = useState<Line[]>([]);
  const [fields, setFields] = useState<FieldOption[] | null>(null); // null = not requested yet
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FieldOption | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<ImageAttachment | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recogRef = useRef<any>(null);

  const speechSupported =
    typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const push = useCallback((l: Omit<Line, 'id'>) => {
    setLines((prev) => [...prev, { ...l, id: `${l.role}-${Date.now()}-${prev.length}` }]);
  }, []);

  const loadFields = useCallback(async () => {
    setFieldsError(null);
    try {
      setFields(await aiAssistantApi.getFields());
    } catch {
      setFields([]);
      setFieldsError('I could not load your fields right now.');
    }
  }, []);

  const startOver = useCallback(() => {
    setStep('field');
    setLines([{ id: 'greet', role: 'bot', content: GREETING }]);
    setSelected(null);
    setTopic(null);
    setConversationId(undefined);
    setImage(null);
    setImageError(null);
    setInput('');
    setFields(null);
    loadFields();
  }, [loadFields]);

  // Nothing is fetched until the farmer opens the drawer. Opening it is the farmer's request.
  const openDrawer = () => {
    setOpen(true);
    if (lines.length === 0) startOver();
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, busy, step, fields]);

  useEffect(() => () => recogRef.current?.stop?.(), []);

  // ----- Step 1: field -----
  const chooseField = (f: FieldOption) => {
    setSelected(f);
    setConversationId(undefined); // new field = new conversation, so no context from another field leaks in
    push({ role: 'user', content: f.id === 'all' ? 'All my fields' : f.id === 'general' ? 'General question' : `Field: ${f.name}` });
    if (f.id === 'general') {
      setStep('chat');
      push({ role: 'bot', content: 'Ask your general farming question. I will answer from general knowledge for Brandenburg, not from your field data.' });
    } else {
      setStep('topic');
      push({
        role: 'bot',
        content: f.id === 'all' ? 'What do you want to compare across your fields?' : 'What do you need help with?',
      });
    }
  };

  const matchTypedField = (text: string): FieldOption | null => {
    const t = text.trim().toLowerCase();
    if (!t || !fields) return null;
    if (/^(all|all fields|everything)$/.test(t)) return fields.find((f) => f.id === 'all') ?? null;
    if (/^(general|general question)$/.test(t)) return fields.find((f) => f.id === 'general') ?? null;
    return fields.find((f) => !f.is_special && (f.name.toLowerCase() === t || f.name.toLowerCase().includes(t))) ?? null;
  };

  // ----- Step 2: topic -----
  const chooseTopic = (t: Topic | 'any') => {
    setTopic(t === 'any' ? null : t);
    push({ role: 'user', content: TOPICS.find((x) => x.id === t)?.label ?? '' });
    setStep('chat');
    push({ role: 'bot', content: 'Ask your question. You can type, attach a photo, or use the microphone.' });
  };

  // ----- Step 3: chat -----
  const send = async (text: string) => {
    const message = text.trim();
    if ((!message && !image) || busy || !selected) return;
    const attached = image;
    setInput('');
    setImage(null);
    push({ role: 'user', content: message || 'Photo attached', image: attached ? attached.data : undefined });
    setBusy(true);
    try {
      const res = await aiAssistantApi.sendMessage({
        conversationId,
        message: message || 'Please look at this photo of my crop or field.',
        fieldId: selected.id,
        category: 'advisor',
        topic,
        images: attached ? [attached] : undefined,
      });
      setConversationId(res.conversation_id);
      push({
        role: 'assistant',
        content: res.reply,
        unavailable: res.grounded_data?.unavailable,
        failed: res.model === 'unavailable',
      });
    } catch {
      push({ role: 'assistant', content: 'The AI Advisor is not reachable right now. Please try again shortly.', failed: true });
    } finally {
      setBusy(false);
    }
  };

  const handleTyped = (text: string) => {
    if (step === 'field') {
      const t = text.trim();
      if (!t) return;
      setInput('');
      const match = matchTypedField(t);
      if (match) chooseField(match);
      else {
        push({ role: 'user', content: t });
        push({ role: 'bot', content: `I could not find a field called "${t}". Please pick one of the options below.` });
      }
      return;
    }
    if (step === 'chat') send(text);
  };

  const changeField = () => {
    setStep('field');
    setSelected(null);
    setTopic(null);
    setConversationId(undefined);
    push({ role: 'bot', content: 'Which field do you want to ask about now?' });
    if (fields === null) loadFields();
  };

  // ----- Image -----
  const onPickImage = (file: File | undefined) => {
    setImageError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setImageError('Please use a JPG, PNG or WebP photo.');
    if (file.size > MAX_IMAGE_BYTES) return setImageError('The photo is larger than 4 MB. Please choose a smaller one.');
    const reader = new FileReader();
    reader.onload = () =>
      setImage({ name: file.name, mime_type: file.type, data: String(reader.result), size_bytes: file.size });
    reader.onerror = () => setImageError('Could not read that photo.');
    reader.readAsDataURL(file);
  };

  // ----- Voice (browser speech recognition; audio never goes to our server) -----
  const toggleVoice = () => {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || 'de-DE';
    r.interimResults = false;
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<any>).map((x) => x[0].transcript).join(' ');
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    r.start();
  };

  const inputEnabled = step === 'field' ? fields !== null : step === 'chat';
  const placeholder =
    step === 'field' ? 'Type a field name, or pick below' : step === 'topic' ? 'Pick a topic below' : 'Ask your question...';

  return (
    <>
      {!open && (
        <button
          onClick={openDrawer}
          aria-label="Open AI Advisor: Hi! Ask me Anything"
          title="Open AI Advisor"
          className="advisor-launch fixed right-5 top-5 z-[1200] flex items-center gap-2.5 rounded-full border border-emerald-600/20 bg-white py-2 pl-2 pr-4 text-[#166534] shadow-xl"
        >
          <span className="advisor-launch-icon relative flex h-9 w-9 items-center justify-center rounded-full bg-[#1fa35b] text-white">
            <MessageCircleMore size={19} strokeWidth={2.2} />
            <Sparkles size={10} className="absolute -right-0.5 -top-0.5 text-amber-300" fill="currentColor" />
          </span>
          <span className="text-left text-xs font-extrabold leading-tight">
            Hi!, <span className="font-semibold text-slate-600">Ask me Anything</span>
          </span>
        </button>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label="AI Advisor"
          className="fixed bottom-0 right-0 top-0 z-[1200] flex w-full max-w-[420px] flex-col border-l border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#1fa35b]">
                <Bot size={20} />
              </div>
              <div className="leading-tight">
                <h2 className="text-sm font-extrabold text-slate-900">AI Advisor</h2>
                <p className="text-[11px] font-semibold text-slate-500">
                  {selected ? (selected.id === 'all' ? 'All fields' : selected.id === 'general' ? 'General question' : selected.name) : 'No field chosen yet'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={startOver}
                aria-label="New conversation"
                title="New conversation"
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close AI Advisor"
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              {lines.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="ml-8 flex flex-col items-end gap-1.5 self-end">
                    {m.image && <img src={m.image} alt="Attached" className="max-h-32 rounded-xl border border-slate-200" />}
                    <div className="rounded-2xl rounded-br-md bg-[#1fa35b] px-3 py-2 text-xs font-semibold text-white">{m.content}</div>
                  </div>
                ) : (
                  <div
                    key={m.id}
                    className={`mr-6 rounded-2xl rounded-bl-md border px-3 py-2.5 text-xs font-medium leading-relaxed text-slate-800 ${
                      m.failed ? 'border-red-200 bg-red-50' : m.role === 'bot' ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <AdvisorText text={m.content} />
                    {m.unavailable && m.unavailable.length > 0 && !m.failed && (
                      <details className="mt-2 text-[10px] text-slate-500">
                        <summary className="flex cursor-pointer items-center gap-1 font-bold">
                          <AlertCircle size={11} /> Data the advisor did not have
                        </summary>
                        <ul className="mt-1 list-disc pl-4">
                          {m.unavailable.map((u) => (
                            <li key={u}>{u}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )
              )}

              {/* Step 1: choose field */}
              {step === 'field' && (
                <div className="flex flex-col gap-2">
                  <div className="mr-6 rounded-2xl rounded-bl-md border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs font-medium text-slate-800">
                    Which field do you want to ask about?
                  </div>
                  {fields === null && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <Loader2 size={14} className="animate-spin" /> Loading your fields...
                    </div>
                  )}
                  {fieldsError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                      {fieldsError}{' '}
                      <button className="underline" onClick={loadFields}>
                        Try again
                      </button>
                    </div>
                  )}
                  {fields && fields.filter((f) => !f.is_special).length === 0 && !fieldsError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                      You have no registered fields yet. Add a field, or ask a general question.
                      {onOpenFields && (
                        <button
                          className="mt-2 block rounded-lg bg-white px-3 py-1.5 font-bold text-amber-900 shadow-sm"
                          onClick={() => {
                            setOpen(false);
                            onOpenFields();
                          }}
                        >
                          Open the Fields page
                        </button>
                      )}
                    </div>
                  )}
                  {fields &&
                    fields
                      .filter((f) => !(f.id === 'all' && fields.filter((x) => !x.is_special).length === 0))
                      .map((f) => (
                        <button key={f.id} onClick={() => chooseField(f)} className={chipClass}>
                          {f.id === 'all' ? <Layers size={15} /> : f.id === 'general' ? <HelpCircle size={15} /> : <MapPin size={15} />}
                          <span className="flex flex-col">
                            <span>{f.name}</span>
                            {!f.is_special && (
                              <span className="text-[10px] font-medium text-slate-500">
                                {f.farm_name}
                                {f.crop_name ? ` · ${f.crop_name}` : ''}
                                {f.area_ha ? ` · ${f.area_ha} ha` : ''}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                </div>
              )}

              {/* Step 2: choose topic */}
              {step === 'topic' && (
                <div className="flex flex-wrap gap-2">
                  {TOPICS.map((t) => (
                    <button key={t.id} onClick={() => chooseTopic(t.id)} className={chipClass}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {busy && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Checking your field data...
                </div>
              )}

              {step === 'chat' && !busy && lines.some((l) => l.role === 'assistant') && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={changeField} className={chipClass}>
                    <Repeat size={13} /> Change field
                  </button>
                  <button onClick={startOver} className={chipClass}>
                    <RotateCcw size={13} /> New conversation
                  </button>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <footer className="border-t border-slate-200 px-4 py-3">
            {image && (
              <div className="mb-2 flex items-center gap-2">
                <img src={image.data} alt="Preview" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                <div className="flex-1 text-[10px] font-medium text-slate-500">
                  Photos are sent to Google Gemini to answer your question.
                </div>
                <button onClick={() => setImage(null)} aria-label="Remove photo" className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
                  <X size={14} />
                </button>
              </div>
            )}
            {imageError && <div className="mb-2 text-[11px] font-semibold text-red-700">{imageError}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTyped(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={fileRef}
                type="file"
                accept={IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  onPickImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={step !== 'chat' || busy}
                aria-label="Attach photo"
                title="Attach photo"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ImageIcon size={16} />
              </button>
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={!inputEnabled || busy}
                  aria-label={listening ? 'Stop recording' : 'Speak your question'}
                  title={listening ? 'Stop recording' : 'Speak your question'}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border disabled:opacity-40 ${
                    listening ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                disabled={!inputEnabled || busy}
                maxLength={1000}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-[#1fa35b] disabled:bg-slate-50"
              />
              <button
                type="submit"
                disabled={!inputEnabled || busy || (!input.trim() && !image)}
                aria-label="Send"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1fa35b] text-white hover:bg-[#188a4c] disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
            <p className="mt-2 text-[10px] font-medium leading-snug text-slate-400">
              Guidance only. It is not legal advice and makes no profit promises. When unsure, consult a local agronomist.
            </p>
          </footer>
        </aside>
      )}
    </>
  );
}
