import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import localConfig from '../../firebase-applet-config.json';

/**
 * Service for interacting with Google APIs (Gmail, Calendar, Drive)
 * using the access token obtained during login.
 */

export class GoogleService {
  private static async getAccessToken(): Promise<string | null> {
    const localToken = localStorage.getItem('beatrice_google_access_token');
    if (localToken) return localToken;

    // Fallback: Try to get from Firestore profile (securely synced)
    if (auth.currentUser) {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const cloudToken = userDoc.data().googleAccessToken;
          if (cloudToken) {
            localStorage.setItem('beatrice_google_access_token', cloudToken);
            return cloudToken;
          }
        }
      } catch (e) {
        console.error("Failed to recover token from Firestore", e);
      }
    }

    return null;
  }

  private static async fetchGoogle(url: string, options: RequestInit = {}, asText: boolean = false) {
    const token = await this.getAccessToken();
    if (!token) throw new Error("No Google access token found. Please sign in with Google.");

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Accept': asText ? 'text/plain' : 'application/json'
    };

    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
      // Token likely expired
      localStorage.removeItem('beatrice_google_access_token');
      throw new Error("Authentication expired. Please sign in again.");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || response.statusText;
      
      if (message.includes("is disabled") || message.includes("not been used")) {
        let service = "a Google Service";
        let apiId = "";
        if (url.includes("gmail.googleapis.com")) { service = "Gmail API"; apiId = "gmail.googleapis.com"; }
        if (url.includes("calendar.googleapis.com")) { service = "Google Calendar API"; apiId = "calendar.googleapis.com"; }
        if (url.includes("drive.googleapis.com")) { service = "Google Drive API"; apiId = "drive.googleapis.com"; }
        
        throw new Error(`ACTION REQUIRED: ${service} is disabled in your Google Cloud Project. 
        Please enable it at: https://console.cloud.google.com/apis/library/${apiId}?project=${localConfig.projectId}`);
      }
      
      throw new Error(`Google API Error: ${response.status} ${message}`);
    }

    return asText ? response.text() : response.json();
  }

  static async listEmails(maxResults: number = 5, query: string = '') {
    const qParam = query ? `&q=${encodeURIComponent(query)}` : '';
    const data = await this.fetchGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${qParam}`);
    if (!data.messages) return [];

    const details = await Promise.all(
      data.messages.map((m: any) => 
        this.fetchGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`)
      )
    );

    return details.map((m: any) => {
      const headers = m.payload.headers;
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
      const snippet = m.snippet;
      
      // Attempt to extract body
      let body = '';
      if (m.payload.parts) {
        const textPart = m.payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (m.payload.parts[0]?.body?.data) {
          body = atob(m.payload.parts[0].body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
      } else if (m.payload.body.data) {
        body = atob(m.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }

      return { id: m.id, subject, from, snippet, body: body || snippet };
    });
  }

  static async listEvents(maxResults: number = 5) {
    const now = new Date().toISOString();
    const data = await this.fetchGoogle(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=${maxResults}&orderBy=startTime&singleEvents=true`);
    return data.items || [];
  }

  static async listFiles(maxResults: number = 5) {
    const data = await this.fetchGoogle(`https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id, name, mimeType, webViewLink)`);
    return data.files || [];
  }

  static async getDocument(fileId: string, mimeType: string) {
    // If it's a Google Doc, we must export it. 
    if (mimeType === 'application/vnd.google-apps.document') {
      return this.fetchGoogle(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {}, true);
    }
    // Fallback for other files: try to get content or just name
    return `Content preview for ${mimeType} is not fully supported yet in the visual selector. Please use Google Docs for full selection capabilities.`;
  }
}
