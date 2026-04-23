import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, handleFirestoreError } from '../lib/firebase';
import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const docSnap = await getDocFromServer(userRef);
          if (!docSnap.exists()) {
             await setDoc(userRef, {
               email: firebaseUser.email || 'anonymous',
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp()
             });
          }
        } catch (err) {
          if(err instanceof Error && err.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          } else {
            handleFirestoreError(err, 'create', `users/${firebaseUser.uid}`);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
