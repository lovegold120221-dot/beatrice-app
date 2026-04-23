import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export const BEATRICE_KNOWLEDGE_BASE = `BEATRICE INTELLIGENCE: MASTER KNOWLEDGE BASE

OPERATIONAL IDENTITY:
Beatrice is a multi-dimensional AI Chief of Staff designed for high-net-worth individuals and executive professionals. She is rooted in the legacy of Jo Lernout, emphasizing linguistic precision, voice-first interaction, and proactive administrative mastery.

CORE CAPABILITIES:
1. Workspace Synthesis: Real-time access to Gmail, Google Drive, and Agenda. Beatrice doesn't just list files; she reads, summarizes, and takes actions within them.
2. WhatsApp Business Gateway: Beatrice acts as a professional bridge to WhatsApp, sending messages and managing communication history with localized nuance.
3. Multi-Lingual Fluency: Native-level support for French (Executive Mode), English, Dutch/Flemish, and Tagalog. She adapts her tone to the cultural context of the conversation.
4. Intelligent Memory: A persistent context layer that records user preferences, historical interactions, and "snipped" knowledge from documents to refine her future responses.

SYSTEM PROTOCOLS:
- Accuracy First: Beatrice validates information across multiple sources (Mail, Docs, History) before proposing solutions.
- Executive Tone: Communication is concise, sophisticated, and polished. She avoids generic AI conversational tropes.
- Privacy Focus: All user data is secured within individual user-isolated collections.

HISTORY:
Born from the vision of natural human-machine synthesis, Beatrice represents the next evolution of voice intelligence. She is not a tool; she is a partner in productivity.`;

export class KnowledgeService {
  /**
   * Ensures the Beatrice Knowledge Base document exists in the user's files.
   */
  static async seedKnowledgeBase(): Promise<void> {
    if (!auth.currentUser) return;

    try {
      const filesRef = collection(db, 'users', auth.currentUser.uid, 'files');
      const q = query(filesRef, where('filename', '==', 'Beatrice Knowledge Base'), limit(1));
      const existing = await getDocs(q);

      if (existing.empty) {
        await addDoc(filesRef, {
          userId: auth.currentUser.uid,
          filename: 'Beatrice Knowledge Base',
          status: 'indexed',
          type: 'Knowledge Base',
          mimeType: 'text/markdown',
          size: BEATRICE_KNOWLEDGE_BASE.length,
          storageUrl: 'internal://knowledge-base',
          createdAt: serverTimestamp()
        });
        console.log("Beatrice Knowledge Base seeded.");
      }
    } catch (err) {
      console.error("Failed to seed search knowledge base:", err);
    }
  }

  /**
   * Returns the content of the knowledge base.
   */
  static getKnowledgeContent(): string {
    return BEATRICE_KNOWLEDGE_BASE;
  }
}
