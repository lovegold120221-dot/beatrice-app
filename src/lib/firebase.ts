import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import localConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: localConfig.apiKey,
  authDomain: localConfig.authDomain,
  projectId: localConfig.projectId,
  storageBucket: localConfig.storageBucket,
  messagingSenderId: localConfig.messagingSenderId,
  appId: localConfig.appId,
  measurementId: localConfig.measurementId,
};

console.log('Firebase Init Details:', {
  hasApiKey: !!firebaseConfig.apiKey,
  keyPrefix: firebaseConfig.apiKey?.substring(0, 5),
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, localConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

// Scopes for Google Services Integration
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly'); 
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly'); 
googleProvider.addScope('https://www.googleapis.com/auth/documents.readonly'); 
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/presentations.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly'); 
googleProvider.addScope('https://www.googleapis.com/auth/contacts.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export function handleFirestoreError(err: unknown, operationType: FirestoreErrorInfo['operationType'], path: string | null): never {
  if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
    const currentUser = auth.currentUser;
    const errorInfo: FirestoreErrorInfo = {
      error: err.message,
      operationType,
      path,
      authInfo: {
        userId: currentUser?.uid || '',
        email: currentUser?.email || '',
        emailVerified: currentUser?.emailVerified || false,
        isAnonymous: currentUser?.isAnonymous || false,
        providerInfo: currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        })) || []
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw err;
}
