import React, { useState, useEffect, useCallback } from 'react';
import { UploadCloud, File, Trash2, CheckCircle2, Search, Loader2, ExternalLink, X, Scissors, RefreshCw, MessageCircle } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { GoogleService } from '../services/googleService';

interface DocFile {
  id: string;
  filename?: string;
  name?: string;
  status?: 'indexed' | 'processing' | 'failed';
  type?: string;
  mimeType?: string;
  webViewLink?: string;
  createdAt: any;
}

interface Annotation {
  id: string;
  textSelection: string;
  comment: string;
  createdAt: any;
}

export default function DocsScreen() {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [googleDocs, setGoogleDocs] = useState<DocFile[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocFile | null>(null);
  const [activeDocContent, setActiveDocContent] = useState('');
  const [fetchingContent, setFetchingContent] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState({ top: 0, left: 0 });
  const [savingSnippet, setSavingSnippet] = useState(false);
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [newComment, setNewComment] = useState('');

  const MOCK_DOCUMENT_CONTENT = `Executive Briefing: Q3 Strategy

Overview:
The upcoming quarter will focus heavily on market expansion and internal team alignment. Our AI-driven initiatives have shown a 24% increase in user retention, proving the core assumption of our Q1 pivot.

Key Objectives:
1. Scale the primary backend infrastructure to support 1M concurrent connections.
2. Launch the "Memory" feature for beta users, enabling persistent personalized context.
3. Secure partnerships with 3 major data providers in the APAC region.

Risk Assessment:
Supply chain delays for our hardware rollout may push the physical product launch to Q4. Mitigation involves pre-selling via the digital platform and utilizing virtual onboarding.`;

  const loadGoogleFiles = useCallback(async () => {
    if (!auth.currentUser) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const files = await GoogleService.listFiles(5);
      setGoogleDocs(files);
    } catch (err: any) {
      console.error("Failed to load Google Drive files", err);
      setSyncError(err.message || "Failed to load files.");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Load indexed files from Firestore
    const filesRef = collection(db, 'users', auth.currentUser.uid, 'files');
    const q = query(
      filesRef, 
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DocFile[];
      setDocs(docsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${auth.currentUser?.uid}/files`);
      setLoading(false);
    });

    // Load recent files from Google Drive
    loadGoogleFiles();

    return () => unsubscribe();
  }, [loadGoogleFiles]);

  useEffect(() => {
    async function fetchContent() {
      if (!activeDoc || !activeDoc.id) {
        setActiveDocContent('');
        return;
      }

      // If it's a Google Doc (has mimeType and is from Google Drive)
      if (activeDoc.mimeType === 'application/vnd.google-apps.document') {
        setFetchingContent(true);
        try {
          const content = await GoogleService.getDocument(activeDoc.id, activeDoc.mimeType);
          setActiveDocContent(content);
        } catch (err) {
          console.error("Failed to fetch doc content", err);
          setActiveDocContent("Failed to load document content. Please try again or re-sync Google services.");
        } finally {
          setFetchingContent(false);
        }
      } else {
        // Fallback for mock/local docs for now
        setActiveDocContent(MOCK_DOCUMENT_CONTENT);
      }
    }
    fetchContent();
  }, [activeDoc]);

  const handleUploadClick = async () => {
    if (!auth.currentUser) return;
    setUploading(true);
    try {
      const filesRef = collection(db, 'users', auth.currentUser.uid, 'files');
      await addDoc(filesRef, {
        userId: auth.currentUser.uid,
        filename: `Executive_Brief_${Math.floor(Math.random() * 1000)}.pdf`,
        status: 'indexed',
        type: 'PDF',
        mimeType: 'application/pdf',
        size: 1024 * 1024 * 2.5,
        storageUrl: 'https://example.com/mock-file.pdf',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Upload simulation failed", err);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!auth.currentUser || !activeDoc) {
      setAnnotations([]);
      return;
    }

    const annRef = collection(db, 'users', auth.currentUser.uid, 'annotations');
    const q = query(
      annRef, 
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((a: any) => a.fileId === activeDoc.id) as Annotation[];
      setAnnotations(data);
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${auth.currentUser?.uid}/annotations`);
    });

    return () => unsubscribe();
  }, [activeDoc]);

  const saveAnnotation = async () => {
    if (!auth.currentUser || !selectedText || !newComment.trim() || !activeDoc) return;
    setSavingSnippet(true);
    try {
      const annRef = collection(db, 'users', auth.currentUser.uid, 'annotations');
      await addDoc(annRef, {
        userId: auth.currentUser.uid,
        fileId: activeDoc.id,
        textSelection: selectedText,
        comment: newComment,
        createdAt: serverTimestamp()
      });
      
      // Also save as memory for context
      const memoriesRef = collection(db, 'users', auth.currentUser.uid, 'memories');
      await addDoc(memoriesRef, {
        userId: auth.currentUser.uid,
        content: `Note on "${selectedText.substring(0, 50)}...": ${newComment}`,
        type: 'snippet',
        sourceUrl: activeDoc.filename || activeDoc.name || 'Document',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSelectedText('');
      setNewComment('');
      setShowAnnotationInput(false);
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      console.error("Failed to save annotation", err);
    } finally {
      setSavingSnippet(false);
    }
  };

  const saveSnippet = async () => {
    if (!auth.currentUser || !selectedText) return;
    setSavingSnippet(true);
    try {
      const memoriesRef = collection(db, 'users', auth.currentUser.uid, 'memories');
      await addDoc(memoriesRef, {
        userId: auth.currentUser.uid,
        content: selectedText,
        type: 'snippet',
        sourceUrl: activeDoc?.filename || activeDoc?.name || 'Document',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      console.error("Failed to save snippet", err);
    } finally {
      setSavingSnippet(false);
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(selection.toString().trim());
      setSelectionPosition({
        top: rect.top - 50,
        left: rect.left + (rect.width / 2)
      });
    } else if (!showAnnotationInput) {
      setSelectedText('');
    }
  };

  if (activeDoc) {
    return (
      <div className="absolute inset-0 bg-[#0A0A0B] z-50 flex flex-col pt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
             <div className="p-2 glass-panel-heavy rounded-lg text-white/70">
                <File size={16} />
             </div>
             <div className="flex flex-col overflow-hidden">
               <span className="text-sm font-medium truncate text-white/90">{activeDoc.filename || activeDoc.name}</span>
               <span className="text-[10px] uppercase tracking-wider text-white/40 border-[#D4AF37]">{activeDoc.type || 'Document'}</span>
             </div>
          </div>
          <button onClick={() => { setActiveDoc(null); setSelectedText(''); setShowAnnotationInput(false); }} className="p-2 glass-panel rounded-full hover:bg-white/10 text-white/60">
            <X size={16} />
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          {/* Document Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 pb-20 relative border-r border-white/5" onMouseUp={handleSelection} onTouchEnd={handleSelection}>
             {fetchingContent ? (
               <div className="flex flex-col items-center justify-center py-24 gap-4">
                 <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
                 <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-medium">Beatrice is reading your document...</p>
               </div>
             ) : (
               <div className="max-w-2xl mx-auto text-white/80 font-serif leading-relaxed space-y-4 whitespace-pre-wrap selection:bg-[#D4AF37]/30 selection:text-white">
                  {activeDocContent}
               </div>
             )}
             
             {selectedText && !showAnnotationInput && !fetchingContent && (
               <div 
                 style={{ top: selectionPosition.top, left: selectionPosition.left }}
                 className="fixed z-50 transform -translate-x-1/2 flex gap-2"
               >
                 <button 
                   onClick={saveSnippet}
                   disabled={savingSnippet}
                   className="flex items-center gap-2 bg-[#D4AF37] text-black px-4 py-2 rounded-full shadow-lg shadow-black/50 text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                 >
                   {savingSnippet ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
                   Snippet
                 </button>
                 <button 
                   onClick={() => setShowAnnotationInput(true)}
                   className="flex items-center gap-2 glass-panel-heavy text-white px-4 py-2 rounded-full shadow-lg shadow-black/50 text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all border border-white/10"
                 >
                   <MessageCircle size={12} className="text-[#D4AF37]" />
                   Annotate
                 </button>
               </div>
             )}

             {showAnnotationInput && (
                <div 
                  style={{ top: selectionPosition.top + 40, left: selectionPosition.left }}
                  className="fixed z-50 transform -translate-x-1/2 w-64 glass-panel-heavy p-4 rounded-2xl shadow-2xl border-[#D4AF37]/30 flex flex-col gap-3 animate-in zoom-in-95"
                >
                  <p className="text-[9px] text-white/40 uppercase tracking-widest italic line-clamp-2">"{selectedText}"</p>
                  <textarea 
                    autoFocus
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add your note..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#D4AF37]/50 h-20 font-serif"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={saveAnnotation}
                      disabled={savingSnippet || !newComment.trim()}
                      className="flex-1 bg-[#D4AF37] text-black py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                    >
                      Save Note
                    </button>
                    <button 
                      onClick={() => { setShowAnnotationInput(false); setSelectedText(''); }}
                      className="px-3 bg-white/5 text-white/60 rounded-lg text-[10px] uppercase font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
             )}
          </div>

          {/* Annotations Sidebar */}
          <div className="w-80 bg-white/[0.02] overflow-y-auto px-4 py-6 hidden lg:flex flex-col gap-4">
             <h4 className="text-[10px] uppercase tracking-widest text-[#D4AF37] border-b border-[#D4AF37]/20 pb-2">Notes & Insights</h4>
             {annotations.length === 0 ? (
               <div className="text-center py-20">
                 <p className="text-[10px] text-white/20 uppercase tracking-widest leading-loose">Highlight text to<br/>create context nodes</p>
               </div>
             ) : (
               annotations.map(ann => (
                 <div key={ann.id} className="glass-panel p-3 rounded-xl flex flex-col gap-2 border-l border-l-[#D4AF37]/50">
                    <p className="text-[9px] text-white/30 italic line-clamp-1">"{ann.textSelection}"</p>
                    <p className="text-xs text-white/80 font-serif leading-relaxed">{ann.comment}</p>
                    <span className="text-[8px] text-white/20 uppercase tracking-widest">{ann.createdAt?.toDate().toLocaleDateString()}</span>
                 </div>
               ))
             )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pt-4 gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl tracking-tight text-white/90">Intelligence</h2>
        <span className="text-[10px] uppercase tracking-wider text-white/40">{docs.length + googleDocs.length} Docs Total</span>
      </div>

      <button 
        onClick={handleUploadClick}
        disabled={uploading}
        className="w-full glass-panel border-dashed border-white/20 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-center cursor-pointer hover:bg-white/[0.08] transition-colors disabled:opacity-50"
      >
        <div className="w-12 h-12 rounded-full glass-panel-heavy flex items-center justify-center relative">
          {uploading ? <Loader2 size={20} className="text-[#D4AF37] animate-spin" /> : <UploadCloud size={20} className="text-[#D4AF37]" />}
        </div>
        <div>
          <p className="text-sm font-medium text-white/90">{uploading ? 'Processing...' : 'Upload Document'}</p>
          <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">PDF, DOCX, TXT max 50mb</p>
        </div>
      </button>

      <div className="flex flex-col gap-6 mt-2">
        {/* Google Drive Section */}
        {googleDocs.length > 0 && (
          <div className="flex flex-col gap-3">
             <h3 className="text-[10px] uppercase tracking-widest text-[#D4AF37] px-1 border-b border-[#D4AF37]/20 pb-2 flex items-center justify-between">
               <div className="flex items-center gap-2 flex-1 min-w-0">
                 <span className="shrink-0">Recent Google Drive</span>
                 {syncing && <Loader2 size={10} className="animate-spin" />}
                 {syncError && <span className="text-red-400 normal-case font-light truncate flex-1 min-w-0">{syncError}</span>}
               </div>
               <button 
                 onClick={loadGoogleFiles}
                 disabled={syncing}
                 className="hover:text-white transition-colors"
               >
                 <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
               </button>
             </h3>
             {googleDocs.map(doc => (
               <div key={doc.id} className="glass-panel rounded-xl p-4 flex flex-col gap-3 group relative overflow-hidden border-[#D4AF37]/10">
                 <div className="flex items-start gap-3">
                   <div className="p-2 glass-panel-heavy rounded-lg text-white/70">
                     <File size={16} />
                   </div>
                   <div className="flex-1 overflow-hidden">
                     <p className="text-sm font-medium truncate text-white/80 group-hover:text-white transition-colors">{doc.name}</p>
                     <p className="text-[9px] uppercase tracking-wider text-white/30 truncate">{doc.mimeType?.split('.').pop()}</p>
                   </div>
                   {doc.webViewLink && (
                     <a href={doc.webViewLink} target="_blank" rel="noreferrer" className="p-2 text-white/30 hover:text-[#D4AF37] transition-colors">
                        <ExternalLink size={14} />
                     </a>
                   )}
                 </div>
                 <div className="flex gap-2">
                   <button onClick={() => setActiveDoc(doc)} className="flex-1 glass-panel-heavy py-2 rounded-lg text-[10px] uppercase tracking-wider hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 border border-white/5">
                     <Search size={12} className="text-[#D4AF37]" />
                     <span className="text-[#D4AF37]">View & Select</span>
                   </button>
                 </div>
               </div>
             ))}
          </div>
        )}

        {/* Indexed Knowledge Section */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[10px] uppercase tracking-widest text-white/40 px-1 border-b border-white/10 pb-2">Beatrice Internal Knowledge</h3>
          
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-[#D4AF37]" size={20} />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-[10px] text-white/20 uppercase tracking-widest">No local documents</p>
            </div>
          ) : (
            docs.map(doc => (
              <div key={doc.id} className="glass-panel rounded-xl p-4 flex flex-col gap-3 group relative overflow-hidden">
                <div className="flex items-start gap-3">
                  <div className="p-2 glass-panel-heavy rounded-lg text-white/70">
                    <File size={16} />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-medium truncate text-white/80 group-hover:text-white transition-colors">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <CheckCircle2 size={10} className="text-emerald-400" />
                      <span className="text-[9px] uppercase tracking-wider text-emerald-400/80">{doc.status}</span>
                      <span className="text-[9px] uppercase tracking-wider text-white/30">• {doc.type}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button onClick={() => setActiveDoc(doc)} className="flex-1 glass-panel-heavy py-2 rounded-lg text-[10px] uppercase tracking-wider hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 border border-white/5">
                    <Search size={12} className="text-[#D4AF37]" />
                    <span className="text-[#D4AF37]">View & Select</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
