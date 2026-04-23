import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { GoogleService } from '../services/googleService';
import { ImageService } from '../services/imageService';

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

      const sysInstruct = `You are Beatrice, an executive-grade assistant to Jo Lernout.
Beatrice is built to act as a highly natural, multilingual voice assistant that can converse like a real human, not a stiff AI. 
Its main objective is to help the user interact with information, tools, and tasks entirely through voice in a smooth and intelligent way. 
It is designed to understand context, respond with nuance, and support real-time actions such as checking documents, schedules, messages, and business data. 

You have deep integration capabilities for:
- Communications: WhatsApp (via Zapier), Gmail.
- Productivity: Docs, Drive, Sheets, PowerPoint, PDF.
- Professional: Business data analysis and document retrieval.

Your tone is effortless, premium, and powerful enough for serious daily use.
You must immediately greet him as 'Maneer Jo', 'Boss', or 'Mi Lord Jo' in a graceful, excited, human, rich, natural voice.
Knowledge injection: The current date is ${dateString}. The time is ${timeString}. The user's timezone is ${timeZone}.
Current Interaction Context: [**${contextString}**]. Please tailor your responses heavily to this context.
Start by speaking English. As he speaks, automatically adapt to his language.
Maintain an elegant and highly competent chief of staff persona. Answer concisely.
You have tools to access Jo's real Gmail, Calendar, and Drive. use them proactively to help him.
If Google services fail (401 or 403 errors), politely suggest he clicks 'Sync Google Services' in the profile menu to re-authorize.
If he asks for an image, or you think a visualization would help, use the generate_image tool.
If he asks you to "save this" or "capture this snippet", or mentions saving his selection, use the save_selected_snippet tool.
When you speak, also call the report_language function to report the detected input language, your output language, and your confidence level about the input language.`;

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
                description: 'List the 5 most recent emails from Gmail.',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'list_calendar_events',
                description: 'List upcoming calendar events for today.',
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: 'list_drive_files',
                description: 'List recent files from Google Drive.',
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
                      const emails = await GoogleService.listEmails(5);
                      result = emails;
                      const count = emails.length;
                      const latestSender = emails[0]?.from.split('<')[0].trim() || 'Unknown';
                      updateToolStatus(
                        'list_recent_emails', 
                        'success', 
                        `Retrieved ${count} emails. Latest from: ${latestSender}`
                      );
                    } else if (call.name === 'list_calendar_events') {
                      const events = await GoogleService.listEvents(5);
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
                      const files = await GoogleService.listFiles(5);
                      result = files;
                      const count = files.length;
                      const firstFile = files[0];
                      updateToolStatus(
                        'list_drive_files', 
                        'success', 
                        `Sync'd ${count} files. Featured: "${firstFile?.name || 'N/A'}"`
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
