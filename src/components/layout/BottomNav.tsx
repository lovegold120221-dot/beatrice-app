import React from 'react';
import { Mic, FileText, Calendar, BrainCircuit, Briefcase } from 'lucide-react';
import { TabKey } from '../../App';
import { motion } from 'motion/react';

interface BottomNavProps {
  currentTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export default function BottomNav({ currentTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="h-20 bg-[#080808] border-t border-white/10 flex items-center justify-around px-4 pb-2 w-full">
      <div className="flex flex-col items-center gap-1 opacity-100 cursor-pointer" onClick={() => onTabChange('talk')}>
        <div className={`w-5 h-5 rounded-full border-2 ${currentTab === 'talk' ? 'border-[#D4AF37]' : 'border-white'} flex items-center justify-center`}>
          {currentTab === 'talk' && <div className="w-1.5 h-1.5 bg-[#D4AF37] rounded-full"></div>}
        </div>
        <span className={`text-[9px] uppercase tracking-tighter ${currentTab === 'talk' ? 'font-bold text-[#D4AF37]' : ''}`}>Talk</span>
      </div>
      <div className={`flex flex-col items-center gap-1 cursor-pointer ${currentTab === 'docs' ? 'opacity-100' : 'opacity-30'}`} onClick={() => onTabChange('docs')}>
        <div className={`w-5 h-5 border-2 ${currentTab === 'docs' ? 'border-[#D4AF37]' : 'border-white'} rounded-sm flex items-center justify-center`}>
           {currentTab === 'docs' && <div className="w-2 h-0.5 bg-[#D4AF37] rounded-full"></div>}
        </div>
        <span className={`text-[9px] uppercase tracking-tighter ${currentTab === 'docs' ? 'font-bold text-[#D4AF37]' : ''}`}>Docs</span>
      </div>
      <div className={`flex flex-col items-center gap-1 cursor-pointer ${currentTab === 'agenda' ? 'opacity-100' : 'opacity-30'}`} onClick={() => onTabChange('agenda')}>
        <div className="w-5 h-5 flex flex-col gap-0.5 justify-center">
          <div className={`h-1 w-full ${currentTab === 'agenda' ? 'bg-[#D4AF37]' : 'bg-white'} rounded-full`}></div>
          <div className={`h-1 w-full ${currentTab === 'agenda' ? 'bg-[#D4AF37]' : 'bg-white'} rounded-full`}></div>
          <div className={`h-1 w-full ${currentTab === 'agenda' ? 'bg-[#D4AF37]' : 'bg-white'} rounded-full`}></div>
        </div>
        <span className={`text-[9px] uppercase tracking-tighter ${currentTab === 'agenda' ? 'font-bold text-[#D4AF37]' : ''}`}>Agenda</span>
      </div>
      <div className={`flex flex-col items-center gap-1 cursor-pointer ${currentTab === 'memory' ? 'opacity-100' : 'opacity-30'}`} onClick={() => onTabChange('memory')}>
        <div className={`w-5 h-5 border-2 ${currentTab === 'memory' ? 'border-[#D4AF37] border-dashed' : 'border-white'} rounded-full`}></div>
        <span className={`text-[9px] uppercase tracking-tighter ${currentTab === 'memory' ? 'font-bold text-[#D4AF37]' : ''}`}>Memory</span>
      </div>
      <div className={`flex flex-col items-center gap-1 cursor-pointer ${currentTab === 'contracts' ? 'opacity-100' : 'opacity-30'}`} onClick={() => onTabChange('contracts')}>
        <div className={`w-5 h-5 ${currentTab === 'contracts' ? 'bg-[#D4AF37]' : 'bg-white'} rounded-sm flex items-center justify-center text-black`}>
          <span className="text-[10px] font-bold">+</span>
        </div>
        <span className={`text-[9px] uppercase tracking-tighter ${currentTab === 'contracts' ? 'font-bold text-[#D4AF37]' : ''}`}>Legal</span>
      </div>
    </nav>
  );
}
