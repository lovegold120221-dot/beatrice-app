import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Mail, Lock, LogIn, Loader2, Chrome } from 'lucide-react';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await signInWithPopup(auth, googleProvider);
      
      // Extract the Google Access Token for calling Google APIs (Gmail, Drive, etc.)
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        // Save the token securely to be used across the applet
        localStorage.setItem('beatrice_google_access_token', credential.accessToken);
        
        // Sync to Firestore for persistence across services
        const userRef = doc(db, 'users', result.user.uid);
        await setDoc(userRef, {
          googleAccessToken: credential.accessToken,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      
    } catch (err: any) {
      console.error(err);
      
      if (err.message?.includes('auth/unauthorized-domain')) {
         setError(`ACTION REQUIRED: You must add this URL to your Firebase Authorized Domains.\n\nContext:\n1. Go to Firebase Console -> Authentication -> Settings -> Authorized Domains\n2. Add this exact domain: ${window.location.hostname}`);
      } else if (err.message?.includes('auth/internal-error')) {
         setError('INTERNAL ERROR:\nThis is usually caused by requesting OAuth scopes (like Gmail or Drive) that are not enabled in your Google Cloud Consent Screen. I have temporarily disabled them so you can log in!');
      } else {
         setError(err.message || 'Failed to authenticate with Google');
      }
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || `Failed to ${isLogin ? 'log in' : 'create account'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black relative items-center justify-center p-6 text-white overflow-hidden">
      {/* Decorative Blur */}
      <div className="absolute top-1/4 -right-20 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-[80px]"></div>
      <div className="absolute -bottom-10 -left-20 w-80 h-80 bg-[#D4AF37]/5 rounded-full blur-[100px]"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-panel-heavy rounded-3xl p-8 border border-white/10 shadow-2xl relative z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37]/30 to-black p-[1px] shadow-[0_0_30px_rgba(212,175,55,0.2)]">
             <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
               <Mic className="text-[#D4AF37]" size={24} />
             </div>
          </div>
        </div>
        
        <h1 className="text-2xl font-serif text-center mb-1">Beatrice</h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] text-center mb-8">Executive Assistant</p>

        <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider text-white/50 pl-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                placeholder="jo.lernout@example.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mb-2">
            <label className="text-[10px] uppercase tracking-wider text-white/50 pl-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-400 text-xs text-left whitespace-pre-wrap bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#D4AF37] text-black rounded-xl py-3 text-xs uppercase tracking-widest font-bold hover:bg-[#D4AF37]/90 transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {isLogin ? 'Sign In' : 'Create Context'}
          </button>
        </form>

        <div className="relative flex items-center justify-center mb-6 mt-6">
          <div className="absolute inset-x-0 h-px bg-white/10"></div>
          <span className="relative bg-[#111] px-4 text-[10px] uppercase tracking-wider text-white/40">Or connect via</span>
        </div>

        <button 
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full bg-white text-black rounded-xl py-3 text-xs font-semibold hover:bg-white/90 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <Chrome size={16} />
          Continue with Google
        </button>

        <div className="mt-8 text-center">
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-white/50 hover:text-[#D4AF37] transition-colors"
          >
            {isLogin ? "Don't have an executive profile? Create one" : "Already have a profile? Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
