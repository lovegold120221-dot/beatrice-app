import React, { useState, useEffect } from 'react';
import { Mail, MessageCircle, AlertCircle, CheckCircle2, BrainCircuit, Loader2, Scissors, Search } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { GoogleService } from '../services/googleService';

interface Memory {
  id: string;
  content: string;
  type: 'preference' | 'fact' | 'summary' | 'email' | 'whatsapp' | 'snippet';
  createdAt: any;
  from?: string;
  subject?: string;
  body?: string;
}

export default function MemoryScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [emails, setEmails] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All Context');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // Load local Firestore memories
    const memoriesRef = collection(db, 'users', auth.currentUser.uid, 'memories');
    const q = query(
      memoriesRef, 
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Memory[];
      setMemories(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${auth.currentUser?.uid}/memories`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync emails specifically when search query changes
  useEffect(() => {
    if (!auth.currentUser) return;

    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        // If query is empty, just list recent 5. Otherwise, search.
        const messages = await GoogleService.listEmails(searchQuery ? 20 : 5, searchQuery);
        const emailMemories = messages.map((m: any) => ({
          id: m.id,
          content: m.snippet,
          subject: m.subject,
          from: m.from,
          body: m.body,
          type: 'email' as const,
          createdAt: { toDate: () => new Date() } // placeholder for display
        }));
        setEmails(emailMemories);
      } catch (err) {
        console.error("Failed to sync Gmail", err);
      } finally {
        setSearchingRemote(false);
      }
    }, searchQuery ? 500 : 0);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const combinedMemories = [...emails, ...memories].sort((a, b) => {
     const dateA = a.createdAt?.toDate?.() || new Date(0);
     const dateB = b.createdAt?.toDate?.() || new Date(0);
     return dateB.getTime() - dateA.getTime();
  });

  const filteredMemories = combinedMemories.filter(m => {
    // Search keyword check
    const matchesSearch = searchQuery === '' || 
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.subject?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.from?.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    // Type filter check
    if (filter === 'All Context') return true;
    if (filter === 'Emails') return m.type === 'email';
    if (filter === 'WhatsApp') return m.type === 'whatsapp';
    if (filter === 'Snippets') return m.type === 'snippet';
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail size={12} className="text-[#D4AF37]" />;
      case 'whatsapp': return <MessageCircle size={12} className="text-[#D4AF37]" />;
      case 'summary': return <BrainCircuit size={12} className="text-[#D4AF37]" />;
      case 'snippet': return <Scissors size={12} className="text-[#D4AF37]" />;
      default: return <AlertCircle size={12} className="text-[#D4AF37]" />;
    }
  };

  return (
    <div className="flex flex-col h-full px-4 pt-4 gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl tracking-tight text-white/90">Memory</h2>
        <span className="text-[10px] uppercase tracking-wider text-white/40">Real-time Sync</span>
      </div>

      <div className="relative">
        {searchingRemote ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37] animate-spin" size={14} />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
        )}
        <input 
          type="text" 
          placeholder="Search keywords, names, or topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full glass-panel pl-10 pr-4 py-3 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30 transition-all font-serif"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
        {['All Context', 'Emails', 'WhatsApp', 'Snippets'].map((f) => (
          <button 
            key={f} 
            onClick={() => setFilter(f)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider border transition-all ${filter === f ? 'border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10' : 'border-white/10 text-white/50 glass-panel'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-[#D4AF37]" size={24} />
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="text-center py-12 glass-panel rounded-2xl border-dashed border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-widest">No memories indexed yet</p>
          </div>
        ) : (
          filteredMemories.map((memory, idx) => (
            <div key={memory.id + idx} className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                {getIcon(memory.type)}
                <h3 className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-medium">
                  {memory.type === 'email' ? 'Inbox Synthesis' : memory.type === 'whatsapp' ? 'WhatsApp Sync' : memory.type === 'snippet' ? 'Document Snippet' : 'Memory Entry'}
                </h3>
              </div>
              
              {memory.type === 'email' && (
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 mb-1">
                   <p className="text-[10px] text-white/60 font-semibold truncate">{memory.from}</p>
                   <p className="text-[11px] text-white/90 font-medium truncate">{memory.subject}</p>
                </div>
              )}

              <p className="text-sm font-serif leading-relaxed text-white/80">
                {memory.type === 'email' && expandedIds.has(memory.id) ? (memory.body || memory.content) : memory.content}
              </p>
              
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-white/40" />
                  <span className="text-[10px] text-white/50 uppercase tracking-wider">
                    {memory.createdAt?.toDate?.() ? memory.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                  </span>
                </div>
                {memory.type === 'email' && (
                  <button 
                    onClick={() => toggleExpand(memory.id)}
                    className="text-[10px] uppercase tracking-widest text-[#D4AF37] hover:text-white transition-colors flex items-center gap-1"
                  >
                    {expandedIds.has(memory.id) ? 'Collapse' : 'Show Full Email'}
                    <p className="text-[8px] transform rotate-90">{expandedIds.has(memory.id) ? '◀' : '▶'}</p>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
