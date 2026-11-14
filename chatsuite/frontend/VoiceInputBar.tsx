import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, X, Globe, Check } from 'lucide-react';
import { aiAssistantApi } from './aiAssistantApi';

interface VoiceInputBarProps {
  onTranscriptSubmitted: (transcript: string) => void;
  onCancel: () => void;
}

export const VoiceInputBar: React.FC<VoiceInputBarProps> = ({
  onTranscriptSubmitted,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState<'de-DE' | 'en-US'>('de-DE');
  const [isProcessingBackend, setIsProcessingBackend] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Check for Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          let currentFinal = '';

          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              currentFinal += result[0].transcript + ' ';
            } else {
              currentInterim += result[0].transcript;
            }
          }

          setTranscript(currentFinal + currentInterim);
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition error:', event.error);
          if (event.error === 'not-allowed') {
            setErrorMessage('Microphone access denied. Please enable microphone permissions in your browser.');
            setIsRecording(false);
          }
        };

        recognition.onend = () => {
          // If still recording state is desired, keep it
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Speech recognition start failed, using fallback:', err);
        fallbackToMediaRecorder();
      }
    } else {
      fallbackToMediaRecorder();
    }

    return () => {
      stopAllRecording();
    };
  }, [language]);

  const fallbackToMediaRecorder = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage('Voice input is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          setIsProcessingBackend(true);
          try {
            const langCode = language.startsWith('de') ? 'de' : 'en';
            const res = await aiAssistantApi.sendVoiceAudio(audioBlob, langCode);
            if (res.text) {
              setTranscript(res.text);
            }
          } catch (e: any) {
            console.error('Backend voice processing failed:', e);
            setErrorMessage('Could not transcribe audio via backend.');
          } finally {
            setIsProcessingBackend(false);
          }
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (err: any) {
      console.warn('getUserMedia error:', err);
      setErrorMessage('Microphone access denied or unavailable.');
      setIsRecording(false);
    }
  };

  const stopAllRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopAllRecording();
    } else {
      setErrorMessage(null);
      setIsRecording(true);
      // restarts on language effect or manual
    }
  };

  const handleSend = () => {
    stopAllRecording();
    if (transcript.trim()) {
      onTranscriptSubmitted(transcript.trim());
    } else {
      onCancel();
    }
  };

  return (
    <div className="voice-input-container animate-fade-in-up">
      <div className="voice-header-row">
        <div className="voice-status-indicator">
          <span className={`voice-pulse-dot ${isRecording ? 'active' : ''}`} />
          <span className="voice-status-text">
            {isRecording
              ? 'Listening to speech...'
              : isProcessingBackend
              ? 'Transcribing audio...'
              : 'Voice recorded (editable below)'}
          </span>
        </div>

        <div className="voice-lang-selector">
          <Globe size={13} className="text-slate-500" />
          <button
            type="button"
            className={`lang-btn ${language === 'de-DE' ? 'active' : ''}`}
            onClick={() => setLanguage('de-DE')}
            title="German (Brandenburg standard)"
          >
            DE (Deutsch)
          </button>
          <span className="lang-sep">/</span>
          <button
            type="button"
            className={`lang-btn ${language === 'en-US' ? 'active' : ''}`}
            onClick={() => setLanguage('en-US')}
            title="English"
          >
            EN
          </button>
        </div>

        <button
          type="button"
          className="voice-close-btn"
          onClick={() => {
            stopAllRecording();
            onCancel();
          }}
          title="Cancel voice input"
        >
          <X size={15} />
        </button>
      </div>

      {errorMessage ? (
        <div className="voice-error-alert">{errorMessage}</div>
      ) : (
        <div className="voice-transcription-preview">
          <textarea
            className="voice-text-editor"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={
              isRecording
                ? language === 'de-DE'
                  ? 'Sprechen Sie jetzt (z.B. "Wie viel Stickstoff braucht mein Winterweizen auf Farm 1?")...'
                  : 'Speak now (e.g. "What fertilizer should I apply for winter wheat on Farm 1?")...'
                : 'Click to edit your transcription before submitting...'
            }
            rows={2}
          />
        </div>
      )}

      <div className="voice-actions-row">
        <button
          type="button"
          className={`voice-mic-toggle-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          title={isRecording ? 'Pause microphone' : 'Resume microphone'}
        >
          {isRecording ? <Mic size={16} /> : <MicOff size={16} />}
          <span>{isRecording ? 'Stop Recording' : 'Record Again'}</span>
        </button>

        <div className="voice-right-actions">
          <button
            type="button"
            className="voice-cancel-btn"
            onClick={() => {
              stopAllRecording();
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="voice-submit-btn"
            disabled={!transcript.trim() || isProcessingBackend}
            onClick={handleSend}
          >
            <Send size={14} className="inline mr-1" />
            Use in Chat
          </button>
        </div>
      </div>
    </div>
  );
};
