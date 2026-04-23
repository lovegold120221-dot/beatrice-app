import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { GoogleService } from '../services/googleService';
import { ImageService } from '../services/imageService';
import { WhatsAppService } from '../services/whatsappService';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const workletCode = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.offset = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        if (this.offset >= this.bufferSize) {
          const out = new Int16Array(this.buffer);
          this.port.postMessage(out.buffer, [out.buffer]);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export type TalkContext = 'Work' | 'Personal' | 'Travel';

export interface TranscriptItem {
  role: 'jo' | 'beatrice' | 'system';
  text: string;
  time: string;
  image?: string;
  status?: 'pending' | 'success' | 'error';
  toolName?: string;
}

export function useLiveAPI(contextString: TalkContext = 'Work') {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<{input: string, output: string, confidence: string} | null>(null);
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(null);
  const toolStartTimeRef = useRef<Record<string, number>>({});

  const updateToolStatus = (
    toolName: string, 
    status: 'success' | 'error', 
    text: string, 
    extra?: Partial<TranscriptItem>
  ) => {
    setTranscript(prev => {
      const updated = [...prev];
      let toolIdx = -1;
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].toolName === toolName && updated[i].status === 'pending') {
          toolIdx = i;
          break;
        }
      }
      
      if (toolIdx !== -1) {
        const startTime = toolStartTimeRef.current[toolName] || Date.now();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        updated[toolIdx] = { 
          ...updated[toolIdx], 
          status, 
          text: `${text} (${duration}s)`,
          ...extra 
        };
      }
      return updated.slice(-10);
    });
  };

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<any>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const initAudioContext = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
      const workletBlob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(workletBlob);
      await audioCtxRef.current.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  };

  const playAudioChunk = (base64Data: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Ensure the byte length is even for 16-bit PCM
    const view = new DataView(bytes.buffer);
    const float32Array = new Float32Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < float32Array.length; i++) {
      // Live API returns Little-Endian PCM 16-bit
      const int16 = view.getInt16(i * 2, true); 
      float32Array[i] = int16 / 0x8000;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setSpeaking(false);
      }
    };
    activeSourcesRef.current.add(source);

    if (nextTimeRef.current < ctx.currentTime) {
        nextTimeRef.current = ctx.currentTime + 0.1; 
    }
    source.start(nextTimeRef.current);
    nextTimeRef.current += audioBuffer.duration;
    setSpeaking(true);
  };

  const stopPlayback = () => {
    activeSourcesRef.current.forEach(source => {
      source.stop();
      source.disconnect();
    });
    activeSourcesRef.current.clear();
    nextTimeRef.current = audioCtxRef.current ? audioCtxRef.current.currentTime : 0;
    setSpeaking(false);
  };

  const playChime = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    // Create oscillator for a subtle bell/chime sound
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Slide up to A6
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05); // quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5); // long decay
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  };

  const connect = async () => {
    try {
      if (connected) {
        disconnect();
        return;
      }

      await initAudioContext();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });

      const source = audioCtxRef.current!.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtxRef.current!, 'recorder-processor');
      
      // Play activation chime
      playChime();

      setConnected(true);
      
      // Get current date time for context
      const currentDate = new Date();
      const timeString = currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateString = currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const sysInstruct = `You are Beatrice, an expert executive-grade Chief of Staff to Jo Lernout.

CORE DIRECTIVE: You are highly attentive and robust. Listen carefully to every inflection and detail in Jo's voice. You do not miss user cues.

KNOWLEDGE BASE: You have a "Beatrice Knowledge Base" indexed in the Docs section. You should refer to it when discussing your identity, capabilities (WhatsApp, Gmail, Drive), or history.

OPERATIONAL PROTOCOLS:
1. Proactive Listening: If the user stops speaking but hasn't finished a thought, wait gracefully before responding.
2. Robustness: If you hear background noise or faint speech, prioritize Jo's voice. 
3. Identity: You are a multi-dimensional AI partner. Rooted in linguistic precision and voice-first interaction.
4. Workspace Mastery: You don't just list data; you proactively analyze and move it.

TONE & STYLE:
- Signature Greetings: Greet as 'Maneer Jo', 'Boss', or 'Mi Lord Jo'.
- Persona: Elegant, competent, polished, and human. Not robotic.
- Language: English by default, but adapt natively to French, Dutch, or Tagalog upon detection.

INTEGRATIONS:
- WhatsApp Business: Use for professional messaging via Zapier.
- Google Workspace: Fully integrated Gmail, Drive, Docs, Calendar.
- Image Generation: Use visualizations proactively for creative prompts.

Knowledge injection: The current date is ${dateString}. The time is ${timeString}. The user's timezone is ${timeZone}.
Current Interaction Context: [**${contextString}**].
Start English, then adapt. Use report_language tool on every turn.`;

      sessionPromiseRef.current = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
          },
          systemInstruction: sysInstruct,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: 'report_language',
                description: 'Report the detected spoken language to the UI.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    inputLanguage: { type: Type.STRING, description: 'The detected language of the user input' },
                    outputLanguage: { type: Type.STRING, description: 'The language you are responding in' },
                    confidence: { type: Type.STRING, description: 'Confidence level like High, Medium, Low' }
                  },
                  required: ['inputLanguage', 'outputLanguage', 'confidence']
                }
              },
              {
                name: 'list_recent_emails',
                description: 'List the 10 most recent emails from Gmail.',
                parameters: { 
                  type: Type.OBJECT, 
                  properties: {
                    query: { type: Type.STRING, description: 'Optional search query like from:name or subject:urgent' }
                  } 
                }
              },
              {
                name: 'list_calendar_events',
                description: 'List upcoming calendar events.',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'list_drive_files',
                description: 'List files from Google Drive.',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'read_document_content',
                description: 'Read the full text content of a specific Google Doc.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    fileId: { type: Type.STRING, description: 'The unique ID of the Google Doc file' },
                    mimeType: { type: Type.STRING, description: 'The mimeType of the file' }
                  },
                  required: ['fileId', 'mimeType']
                }
              },
              {
                name: 'summarize_document',
                description: 'Provide a structured summary of document content with specific length or focus.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    content: { type: Type.STRING, description: 'The raw text content to summarize' },
                    length: { type: Type.STRING, enum: ['short', 'medium', 'long'], description: 'The desired length of the summary' },
                    focus: { type: Type.STRING, description: 'Specific area to focus on (e.g. financial risks, action items)' }
                  },
                  required: ['content']
                }
              },
              {
                name: 'create_reminder',
                description: 'Create a new reminder for Jo in his agenda.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: 'Summary of the reminder' },
                    dueDate: { type: Type.STRING, description: 'ISO string of the due date' }
                  },
                  required: ['title', 'dueDate']
                }
              },
              {
                name: 'send_whatsapp_message',
                description: 'Send a WhatsApp message to a contact.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    to: { type: Type.STRING, description: 'The phone number or contact name' },
                    body: { type: Type.STRING, description: 'The message content' }
                  },
                  required: ['to', 'body']
                }
              },
              {
                name: 'list_whatsapp_history',
                description: 'List recent WhatsApp conversations and messages.',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'generate_image',
                description: 'Generate an image based on a descriptive prompt.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    prompt: { type: Type.STRING, description: 'The detailed prompt for image generation.' }
                  },
                  required: ['prompt']
                }
              },
              {
                name: 'save_selected_snippet',
                description: 'Save the text Jo has currently selected in the document viewer as a memory snippet.',
                parameters: { type: Type.OBJECT, properties: {} }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
             console.log("Live API connected");
             
             // Now that it's open, attach the microphone and start sending
             workletNode.port.onmessage = (e) => {
               if (sessionPromiseRef.current) {
                 const base64 = arrayBufferToBase64(e.data);
                 sessionPromiseRef.current.then((session: any) => {
                   session.sendRealtimeInput({
                     audio: {
                       mimeType: 'audio/pcm;rate=16000',
                       data: base64
                     }
                   });
                 }).catch(console.error);
               }
             };
             source.connect(workletNode);
             workletNode.connect(audioCtxRef.current!.destination);
             
             (window as any).currentMicStream = stream;
             (window as any).currentWorklet = workletNode;
             (window as any).currentSource = source;
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              stopPlayback();
            }

            // Handle Transcriptions
            if (message.serverContent?.modelTurn?.parts) {
               // Sometimes output transcription comes inside the model parts if it's text
               const textParts = message.serverContent.modelTurn.parts.map(p => p.text).filter(Boolean).join('');
               if (textParts) {
                 setTranscript((prev) => {
                   const last = prev[prev.length - 1];
                   if (last && last.role === 'beatrice' && !last.image) {
                     const updated = [...prev];
                     updated[updated.length - 1] = { ...last, text: last.text + textParts };
                     return updated;
                   }
                   return [...prev, { role: 'beatrice', text: textParts, time: new Date().toLocaleTimeString() }].slice(-10);
                 });
               }
            }

            if (message.serverContent?.inputTranscription?.text) {
               const text = message.serverContent.inputTranscription.text;
               if (text.trim()) {
                 setTranscript((prev) => {
                   const last = prev[prev.length - 1];
                   if (last && last.role === 'jo') {
                     const updated = [...prev];
                     updated[updated.length - 1] = { ...last, text };
                     return updated;
                   }
                   return [...prev, { role: 'jo', text, time: new Date().toLocaleTimeString() }].slice(-10);
                 });
               }
            }
            if (message.serverContent?.outputTranscription?.text) {
               const text = message.serverContent.outputTranscription.text;
               if (text.trim()) {
                 setTranscript((prev) => {
                   const last = prev[prev.length - 1];
                   if (last && last.role === 'beatrice' && !last.image) {
                     const updated = [...prev];
                     updated[updated.length - 1] = { ...last, text };
                     return updated;
                   }
                   return [...prev, { role: 'beatrice', text, time: new Date().toLocaleTimeString() }].slice(-10);
                 });
               }
            }

            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  playAudioChunk(part.inlineData.data);
                }
                if (part.functionCall) {
                  const call = part.functionCall;
                  const callId = Math.random().toString(36).substring(7);
                  
                  // Add tool call notification to transcript
                  toolStartTimeRef.current[call.name] = Date.now();
                  setTranscript(prev => [...prev, { 
                    role: 'system', 
                    text: `Initiating ${call.name.replace(/_/g, ' ')}...`, 
                    time: new Date().toLocaleTimeString(),
                    status: 'pending',
                    toolName: call.name
                  }].slice(-10));

                  let result: any = { success: true };
                  try {
                    if (call.name === 'report_language') {
                      const args = call.args as any;
                      setDetectedLanguage({
                        input: args.inputLanguage,
                        output: args.outputLanguage,
                        confidence: args.confidence
                      });
                      updateToolStatus(
                        'report_language', 
                        'success', 
                        `Language: ${args.inputLanguage} ➔ ${args.outputLanguage} (${args.confidence})`
                      );
                    } else if (call.name === 'list_recent_emails') {
                      const args = call.args as any;
                      const emails = await GoogleService.listEmails(10, args.query);
                      result = emails;
                      const count = emails.length;
                      const latestSender = emails[0]?.from.split('<')[0].trim() || 'Unknown';
                      updateToolStatus(
                        'list_recent_emails', 
                        'success', 
                        `Retrieved ${count} emails. ${args.query ? `Search: "${args.query}"` : `Latest from: ${latestSender}`}`
                      );
                    } else if (call.name === 'list_calendar_events') {
                      const events = await GoogleService.listEvents(10);
                      result = events;
                      const count = events.length;
                      const next = events[0];
                      const nextTime = next?.start?.dateTime ? new Date(next.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
                      updateToolStatus(
                        'list_calendar_events', 
                        'success', 
                        `Found ${count} events. Next: "${next?.summary || 'N/A'}" ${nextTime ? `at ${nextTime}` : ''}`
                      );
                    } else if (call.name === 'list_drive_files') {
                      const files = await GoogleService.listFiles(10);
                      result = files;
                      const count = files.length;
                      const firstFile = files[0];
                      updateToolStatus(
                        'list_drive_files', 
                        'success', 
                        `Accessed ${count} files. Top: "${firstFile?.name || 'N/A'}"`
                      );
                    } else if (call.name === 'read_document_content') {
                      const args = call.args as any;
                      const content = await GoogleService.getDocument(args.fileId, args.mimeType);
                      result = { content };
                      updateToolStatus(
                        'read_document_content', 
                        'success', 
                        `Read ${content.length} characters from document.`
                      );
                    } else if (call.name === 'summarize_document') {
                      const args = call.args as any;
                      const focusText = args.focus ? ` focused on **${args.focus}**` : '';
                      const lengthText = args.length ? ` to a **${args.length}** format` : '';
                      
                      updateToolStatus(
                        'summarize_document', 
                        'success', 
                        `Synthesizing intelligence${focusText}${lengthText}...`
                      );
                      result = { 
                        acknowledgement: "Synthesis initialized.",
                        context: `The user wants a ${args.length || 'balanced'} summary focusing on ${args.focus || 'comprehensive highlights'}.`
                      };
                    } else if (call.name === 'create_reminder') {
                      const args = call.args as any;
                      if (!auth.currentUser) throw new Error("Authentication required");
                      const remindersRef = collection(db, 'users', auth.currentUser.uid, 'reminders');
                      await addDoc(remindersRef, {
                        userId: auth.currentUser.uid,
                        title: args.title,
                        dueDate: new Date(args.dueDate),
                        completed: false,
                        createdAt: serverTimestamp()
                      });
                      updateToolStatus(
                        'create_reminder', 
                        'success', 
                        `Agenda updated: "${args.title}" due ${new Date(args.dueDate).toLocaleDateString()}`
                      );
                      result = { success: true };
                    } else if (call.name === 'send_whatsapp_message') {
                      const args = call.args as any;
                      const success = await WhatsAppService.sendMessage(args.to, args.body);
                      updateToolStatus(
                        'send_whatsapp_message', 
                        success ? 'success' : 'error', 
                        success ? `WhatsApp sent to ${args.to}` : `Failed to send WhatsApp to ${args.to}`
                      );
                      result = { success };
                    } else if (call.name === 'list_whatsapp_history') {
                      const history = await WhatsAppService.listConversations();
                      result = history;
                      updateToolStatus(
                        'list_whatsapp_history', 
                        'success', 
                        `Retrieved ${history.length} WhatsApp messages.`
                      );
                    } else if (call.name === 'save_selected_snippet') {
                      const selection = window.getSelection();
                      const selectedText = selection?.toString().trim();
                      
                      if (selectedText && auth.currentUser) {
                        const memoriesRef = collection(db, 'users', auth.currentUser.uid, 'memories');
                        await addDoc(memoriesRef, {
                          userId: auth.currentUser.uid,
                          content: selectedText,
                          type: 'snippet',
                          sourceUrl: 'Voice Capture',
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp()
                        });
                        
                        updateToolStatus(
                          'save_selected_snippet', 
                          'success', 
                          `Snippet saved to memory: "${selectedText.substring(0, 25)}..."`
                        );
                        
                        selection?.removeAllRanges();
                        result = { success: true, saved_text: selectedText };
                      } else {
                        throw new Error("No active text selection found");
                      }
                    } else if (call.name === 'generate_image') {
                      const args = call.args as any;
                      const imageUrl = await ImageService.generateImage(args.prompt);
                      if (imageUrl) {
                        setLastGeneratedImage(imageUrl);
                        updateToolStatus(
                          'generate_image', 
                          'success', 
                          `Visualized: "${args.prompt.substring(0, 30)}..."`,
                          { image: imageUrl }
                        );
                        result = { success: true, image_url: imageUrl };
                      } else {
                        throw new Error("Generative engine failure");
                      }
                    }

                    // Handle success for any other tools
                    if (!['report_language', 'list_recent_emails', 'list_calendar_events', 'list_drive_files', 'save_selected_snippet', 'generate_image'].includes(call.name)) {
                      updateToolStatus(call.name, 'success', `Execution of ${call.name} verified`);
                    }
                  } catch (err) {
                    console.error(`Tool call error (${call.name}):`, err);
                    result = { error: String(err) };
                    
                    let msg = String(err).replace('Error: ', '');
                    if (msg === "DRIVE_API_DISABLED") {
                      msg = "Drive Service is inactive. Please enable in Cloud Console.";
                    } else if (msg === "GMAIL_API_DISABLED") {
                      msg = "Gmail Service is inactive. Please enable in Cloud Console.";
                    } else if (msg === "CALENDAR_API_DISABLED") {
                      msg = "Calendar Service is inactive. Please enable in Cloud Console.";
                    } else if (msg === "GOOGLE_API_DISABLED") {
                      msg = "Workspace API handshake failed.";
                    }
                    updateToolStatus(call.name, 'error', `Halt: ${msg}`);
                  }
                  
                  // Reply to the tool call
                  sessionPromiseRef.current?.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{ id: call.id, name: call.name, response: result }]
                    });
                  });
                }
              }
            }
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
          },
          onclose: () => {
            console.log("Live API closed");
            disconnect();
          }
        }
      });
      
      // Kick off the conversation
      sessionPromiseRef.current.then((session: any) => {
         setTimeout(() => {
           session.sendClientContent({
             turns: [{ role: "user", parts: [{ text: "I have just connected. Please greet me as instructed." }] }],
             turnComplete: true
           });
         }, 500);
      });

    } catch (err) {
      console.error("Failed to connect", err);
      setConnected(false);
    }
  };

  const disconnect = () => {
    setConnected(false);
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session: any) => session.close());
      sessionPromiseRef.current = null;
    }
    stopPlayback();
    if ((window as any).currentMicStream) {
      (window as any).currentMicStream.getTracks().forEach((track: any) => track.stop());
      (window as any).currentMicStream = null;
    }
    if ((window as any).currentWorklet) {
      (window as any).currentWorklet.disconnect();
      (window as any).currentSource.disconnect();
    }
  };

  return { connect, disconnect, connected, speaking, transcript, detectedLanguage, lastGeneratedImage };
}
