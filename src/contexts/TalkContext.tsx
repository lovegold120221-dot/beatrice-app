import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useLiveAPI, TalkContext as ContextType } from '../hooks/useLiveAudio';

interface TalkContextValue {
  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;
  speaking: boolean;
  transcript: { role: 'jo' | 'beatrice', text: string, time: string, image?: string }[];
  detectedLanguage: { input: string, output: string, confidence: string } | null;
  lastGeneratedImage: string | null;
  activeContext: ContextType;
  setActiveContext: (ctx: ContextType) => void;
}

const TalkContext = createContext<TalkContextValue | undefined>(undefined);

export function TalkProvider({ children }: { children: ReactNode }) {
  const [activeContext, setActiveContextState] = useState<ContextType>(() => {
    return (localStorage.getItem('beatrice_active_context') as ContextType) || 'Work';
  });

  const talkAPI = useLiveAPI(activeContext);

  const setActiveContext = (ctx: ContextType) => {
    if (ctx === activeContext) return;
    
    setActiveContextState(ctx);
    localStorage.setItem('beatrice_active_context', ctx);
    
    // If currently connected, we force a reconnect to apply the new context
    if (talkAPI.connected) {
      talkAPI.disconnect();
      // Short delay to allow proper cleanup before reconnecting
      setTimeout(() => {
        talkAPI.connect();
      }, 500);
    }
  };

  const value: TalkContextValue = {
    ...talkAPI,
    activeContext,
    setActiveContext,
  };

  return (
    <TalkContext.Provider value={value}>
      {children}
    </TalkContext.Provider>
  );
}

export function useTalk() {
  const context = useContext(TalkContext);
  if (context === undefined) {
    throw new Error('useTalk must be used within a TalkProvider');
  }
  return context;
}
