import { collection, query, orderBy, limit, onSnapshot, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: any;
  status: 'sent' | 'received' | 'failed';
  contactName?: string;
}

export class WhatsAppService {
  private static zapierSendUrl = import.meta.env.VITE_ZAPIER_WHATSAPP_SEND_URL;
  private static zapierHistoryUrl = import.meta.env.VITE_ZAPIER_WHATSAPP_HISTORY_URL;

  /**
   * Sends a message via Zapier Webhook which should trigger a WhatsApp Business action.
   */
  static async sendMessage(to: string, body: string): Promise<boolean> {
    if (!this.zapierSendUrl) {
      console.warn("ZAPIER_WHATSAPP_SEND_URL not configured. Message will be simulated in Firestore only.");
    }

    try {
      if (this.zapierSendUrl) {
        const response = await fetch(this.zapierSendUrl, {
          method: 'POST',
          body: JSON.stringify({ 
            recipient_phone: to, 
            message_text: body, 
            sender_identity: 'Beatrice Intelligence',
            timestamp: new Date().toISOString() 
          }),
          headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error("Zapier failed to send message");
      }

      // Record in local Firestore for UI visibility
      if (auth.currentUser) {
        const waRef = collection(db, 'users', auth.currentUser.uid, 'whatsapp_messages');
        await addDoc(waRef, {
          userId: auth.currentUser.uid,
          from: 'Me',
          to,
          body,
          status: 'sent',
          timestamp: serverTimestamp()
        });
      }
      return true;
    } catch (err) {
      console.error("WhatsApp Send Error:", err);
      return false;
    }
  }

  /**
   * Fetches recent WhatsApp conversations. 
   * In a real Zapier setup, you would have a Zap that pushes new messages into Firestore.
   * This method queries that Firestore collection.
   */
  static getMessages(callback: (messages: WhatsAppMessage[]) => void) {
    if (!auth.currentUser) return () => {};

    const waRef = collection(db, 'users', auth.currentUser.uid, 'whatsapp_messages');
    const q = query(
      waRef, 
      where('userId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WhatsAppMessage[];
      callback(messages);
    });
  }

  /**
   * Model-accessible tool to fetch history
   */
  static async listConversations(): Promise<WhatsAppMessage[]> {
    if (!auth.currentUser) return [];
    // For the tool call, we do a one-time fetch
    // Real history might come from a Zapier GET if they support it, but Firestore is the source of truth for the app
    return new Promise((resolve) => {
      const unsubscribe = this.getMessages((messages) => {
        unsubscribe();
        resolve(messages);
      });
    });
  }
}
