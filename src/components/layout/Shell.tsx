import React, { ReactNode } from 'react';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import { TabKey } from '../../App';
import { motion, AnimatePresence } from 'motion/react';

interface ShellProps {
  children: ReactNode;
  currentTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export default function Shell({ children, currentTab, onTabChange }: ShellProps) {
  return (
    <div className="w-full h-full flex flex-col absolute inset-0">
      <div className="absolute top-0 left-0 right-0 z-20">
        <TopBar />
      </div>
      
      <main className="flex-1 overflow-y-auto hide-scrollbar pt-[88px] pb-20 relative z-10 w-full px-6 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full min-h-full pb-8 flex flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <BottomNav currentTab={currentTab} onTabChange={onTabChange} />
      </div>
      
      {/* Home indicator bar (iOS flair) */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/20 rounded-full z-30 pointer-events-none"></div>
    </div>
  );
}
