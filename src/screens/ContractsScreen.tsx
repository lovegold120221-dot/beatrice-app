import React, { useState } from 'react';
import { PenTool, Mic, Edit3, Download, Play, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function ContractsScreen() {
  const [drafting, setDrafting] = useState(false);
  const [contractGenerated, setContractGenerated] = useState(false);

  const handleGenerate = () => {
    setDrafting(true);
    setTimeout(() => {
      setDrafting(false);
      setContractGenerated(true);
    }, 4000);
  };

  return (
    <div className="flex flex-col h-full px-4 pt-4 gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl tracking-tight text-white/90">Contracts</h2>
        <span className="text-[10px] uppercase tracking-wider text-rose-400/80 bg-rose-400/10 px-2 py-0.5 rounded-full border border-rose-400/20">Alpha Engine</span>
      </div>

      {!contractGenerated ? (
        <div className="flex flex-col gap-4">
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-4">
             <div className="flex items-center justify-between border-b border-white/10 pb-3">
               <h3 className="text-xs uppercase tracking-widest text-white/60">Dictate Terms</h3>
               <button className="w-8 h-8 rounded-full glass-panel-heavy flex items-center justify-center text-[#D4AF37] border-[#D4AF37]/30">
                 <Mic size={14} />
               </button>
             </div>
             
             <div className="flex flex-col gap-3">
               <div className="glass-panel-heavy rounded-lg p-3 text-sm text-white/80 font-light border-l-2 border-l-[#D4AF37]">
                 "Draft a simple Non-Disclosure Agreement under Belgian Law with Horizon Tech. Duration is 2 years. Mutual confidentiality."
               </div>
             </div>

             <button 
                onClick={handleGenerate}
                disabled={drafting}
                className="w-full mt-2 py-3 rounded-xl bg-[#D4AF37] text-black font-medium text-xs tracking-wide uppercase hover:bg-[#D4AF37]/90 transition-colors flex items-center justify-center gap-2"
              >
                {drafting ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <PenTool size={14} />
                  </motion.div>
                ) : (
                  <Play size={14} />
                )}
                <span>{drafting ? 'Drafting Clause by Clause...' : 'Generate Draft (Belgian Law)'}</span>
             </button>
          </div>
          
          <p className="text-[9px] text-white/40 text-center leading-relaxed px-4 uppercase tracking-widest">
            Beatrice is a drafting assistant. Human legal review is recommended before execution.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 h-full">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-xs text-white/70 uppercase tracking-widest">Draft Generated</span>
          </div>

          <div className="flex-1 glass-panel rounded-2xl p-5 overflow-y-auto hide-scrollbar border-[#D4AF37]/20 relative">
            <div className="absolute top-4 right-4 flex gap-2">
              <button className="p-2 glass-panel-heavy rounded-md text-white/50 hover:text-white transition-colors"><Edit3 size={12} /></button>
              <button className="p-2 glass-panel-heavy rounded-md text-white/50 hover:text-white transition-colors"><Download size={12} /></button>
            </div>

            <div className="font-serif text-white/90 leading-relaxed pr-12">
              <h1 className="text-xl mb-6 text-center">ACCORD DE CONFIDENTIALITÉ (NDA)</h1>
              
              <div className="text-xs space-y-4 font-light text-white/70">
                <p><strong>ENTRE LES SOUSSIGNÉS :</strong></p>
                <p>1. [Votre Société], inscrite à la BCE sous le numéro [Numéro], dont le siège social est situé à [Adresse]</p>
                <p>2. <strong>Horizon Tech</strong>, inscrite à la BCE sous le numéro [Numéro], dont le siège social est situé à [Adresse]</p>
                
                <h2 className="text-sm font-medium mt-6 text-white/90">ARTICLE 1 : OBJET</h2>
                <p>Le présent Accord vise à protéger la confidentialité des informations échangées entre les Parties dans le cadre de leurs discussions...</p>
                
                <h2 className="text-sm font-medium mt-6 text-white/90">ARTICLE 2 : DURÉE</h2>
                <p>Les obligations de confidentialité prévues au présent Accord produiront leurs effets pendant une durée de <strong>deux (2) ans</strong>...</p>
                
                <h2 className="text-sm font-medium mt-6 text-white/90">ARTICLE 3 : DROIT APPLICABLE (Belgique)</h2>
                <p>Le présent Accord est exclusivement régi par le droit belge. Tout litige relèvera de la compétence des tribunaux de Bruxelles.</p>
              </div>
            </div>
          </div>
          
          <button 
              onClick={() => setContractGenerated(false)}
              className="py-3 mt-2 glass-panel rounded-xl text-xs text-white/50 uppercase tracking-widest hover:bg-white/5"
            >
              Start New Draft
          </button>
        </div>
      )}
    </div>
  );
}
