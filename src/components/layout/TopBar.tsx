import React, { useState } from 'react';
import { Languages, Wifi, Mic, LogOut, User, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function TopBar() {
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [language, setLanguage] = useState('FR');
  const [hasGoogleToken, setHasGoogleToken] = useState(!!localStorage.getItem('beatrice_google_access_token'));
  const [isSyncing, setIsSyncing] = useState(false);

  React.useEffect(() => {
    const checkToken = () => {
      setHasGoogleToken(!!localStorage.getItem('beatrice_google_access_token'));
    };
    const interval = setInterval(checkToken, 2000);
    return () => clearInterval(interval);
  }, []);
  const userLanguages = [
    { code: 'FR', label: 'French (Executive Mode)' },
    { code: 'EN', label: 'English' },
    { code: 'NL', label: 'Dutch/Flemish' },
    { code: 'TL', label: 'Tagalog' },
  ];

  const handleLogout = () => {
    signOut(auth);
  };

  const handleConnectGoogle = async () => {
    try {
      setIsSyncing(true);
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      const { googleProvider } = await import('../../lib/firebase');
      const result = await signInWithPopup(auth, googleProvider);
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken && auth.currentUser) {
        localStorage.setItem('beatrice_google_access_token', credential.accessToken);
        
        // Securely store in Firestore profile for persistence and recovery
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          googleAccessToken: credential.accessToken,
          updatedAt: serverTimestamp()
        });
      }
      setProfileOpen(false);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('auth/unauthorized-domain')) {
        alert(`Domain not authorized. Add ${window.location.hostname} to Firebase Authorized Domains.`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="pt-8 px-6 pb-4 flex justify-between items-center bg-gradient-to-b from-black to-transparent z-10 w-full relative">
      <div className="flex flex-col">
        <h1 className="text-sm font-serif tracking-tight">Beatrice</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
          <span className="text-[10px] font-medium tracking-wide uppercase">Live</span>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => {
              setLangMenuOpen(!langMenuOpen);
              setProfileOpen(false);
            }}
            className="bg-[#D4AF37] text-black px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tighter hover:bg-[#D4AF37]/90 transition-colors"
          >
            {language}
          </button>
          
          <AnimatePresence>
            {langMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-full right-0 mt-2 w-64 glass-panel-heavy rounded-2xl p-3 shadow-2xl flex flex-col gap-1 border border-white/20 origin-top-right text-left z-50"
              >
                <div className="px-2 pb-2 mb-2 border-b border-white/10 flex flex-col gap-1 text-[9px] text-white/50 tracking-wider">
                  <span className="font-serif italic text-white/70 tracking-normal text-xs">Rooted in Jo Lernout:</span>
                  <span>EN • NL/BE</span>
                  <span className="mt-1 font-serif italic text-white/70 tracking-normal text-xs">Executive-ready in:</span>
                  <span>FR • TL & 200+ languages</span>
                </div>
                
                <div className="px-2 py-1 mb-1 text-[9px] text-white/40 uppercase tracking-widest">
                  Target Identity
                </div>
                {userLanguages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setLangMenuOpen(false);
                    }}
                    className={`px-2 py-1.5 text-xs rounded-md text-left transition-colors flex items-center justify-between ${language === lang.code ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                  >
                    <span>{lang.label}</span>
                    <span className="text-[9px] uppercase tracking-wider">{lang.code}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button 
            onClick={() => {
              setProfileOpen(!profileOpen);
              setLangMenuOpen(false);
            }}
            className="w-8 h-8 rounded-full glass-panel flex items-center justify-center text-white/70 hover:text-white transition-colors border-white/10"
          >
            {auth.currentUser?.photoURL ? (
              <img src={auth.currentUser.photoURL} alt="User" className="w-full h-full rounded-full" />
            ) : (
              <User size={14} />
            )}
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div 
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-full right-0 mt-2 w-48 glass-panel-heavy rounded-2xl p-2 shadow-2xl flex flex-col gap-1 border border-white/20 origin-top-right z-50 overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-white/5 mb-1">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest truncate">
                    {auth.currentUser?.email}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    localStorage.removeItem('beatrice_seen_about');
                    window.location.reload();
                  }}
                  className="flex items-center gap-3 px-3 py-2 text-xs text-white/70 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <Sparkles size={14} className="text-[#D4AF37]" />
                  <span>Our Vision</span>
                </button>
                <button 
                  onClick={handleConnectGoogle}
                  disabled={isSyncing}
                  className={`flex items-center gap-3 px-3 py-2 text-xs rounded-xl transition-colors ${isSyncing ? 'opacity-50 cursor-wait' : 'text-emerald-400 bg-emerald-400/5 hover:bg-emerald-400/10'}`}
                >
                  <Wifi size={14} className={isSyncing ? 'animate-pulse' : ''} />
                  <span>{isSyncing ? 'Syncing...' : hasGoogleToken ? 'Re-sync Google' : 'Sync Google Services'}</span>
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2 text-xs text-rose-400 hover:bg-rose-400/10 rounded-xl transition-colors"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
