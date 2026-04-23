import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Users, ArrowRight, MessageCircle, Loader2, Bell, CheckCircle2, Plus, X } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { GoogleService } from '../services/googleService';
import { db, auth, handleFirestoreError } from '../lib/firebase';

interface Reminder {
  id: string;
  title: string;
  dueDate: any;
  completed: boolean;
}

export default function AgendaScreen() {
  const [events, setEvents] = useState<any[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;

    async function loadEvents() {
      try {
        const items = await GoogleService.listEvents(10);
        setEvents(items);
      } catch (err: any) {
        console.error("Failed to load calendar events", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();

    // Sync Reminders
    const remindersRef = collection(db, 'users', auth.currentUser.uid, 'reminders');
    const q = query(
      remindersRef, 
      where('userId', '==', auth.currentUser.uid),
      orderBy('dueDate', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Reminder[];
      setReminders(data);
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${auth.currentUser?.uid}/reminders`);
    });

    return () => unsubscribe();
  }, []);

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newReminderTitle.trim()) return;

    try {
      const remindersRef = collection(db, 'users', auth.currentUser.uid, 'reminders');
      await addDoc(remindersRef, {
        userId: auth.currentUser.uid,
        title: newReminderTitle,
        dueDate: Timestamp.fromDate(new Date(Date.now() + 3600000)), // 1 hour from now default
        completed: false,
        createdAt: serverTimestamp()
      });
      setNewReminderTitle('');
      setShowAddReminder(false);
    } catch (err) {
      console.error("Failed to add reminder", err);
    }
  };

  const toggleReminder = async (reminder: Reminder) => {
    if (!auth.currentUser) return;
    try {
      const ref = doc(db, 'users', auth.currentUser.uid, 'reminders', reminder.id);
      await updateDoc(ref, { completed: !reminder.completed });
    } catch (err) {
      console.error("Failed to toggle reminder", err);
    }
  };

  const setEventReminder = async (event: any) => {
    if (!auth.currentUser) return;
    try {
      const remindersRef = collection(db, 'users', auth.currentUser.uid, 'reminders');
      const eventTime = event.start?.dateTime ? new Date(event.start.dateTime) : new Date();
      await addDoc(remindersRef, {
        userId: auth.currentUser.uid,
        title: `Reminder: ${event.summary}`,
        dueDate: Timestamp.fromDate(new Date(eventTime.getTime() - 15 * 60000)), // 15 mins before
        completed: false,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to set event reminder", err);
    }
  };

  const upNext = events[0];

  return (
    <div className="flex flex-col h-full px-4 pt-4 gap-6 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl tracking-tight text-white/90">Agenda</h2>
        <button 
          onClick={() => setShowAddReminder(true)}
          className="p-2 glass-panel rounded-full text-[#D4AF37] hover:bg-white/10 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {showAddReminder && (
        <div className="glass-panel p-4 rounded-2xl border-[#D4AF37]/30 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-[#D4AF37]">New Task Reminder</span>
            <button onClick={() => setShowAddReminder(false)} className="text-white/40 hover:text-white"><X size={14} /></button>
          </div>
          <form onSubmit={handleAddReminder} className="flex gap-2">
            <input 
              autoFocus
              type="text" 
              placeholder="What should Beatrice remind you?"
              value={newReminderTitle}
              onChange={(e) => setNewReminderTitle(e.target.value)}
              className="flex-1 bg-transparent border-b border-white/10 text-xs py-2 focus:outline-none focus:border-[#D4AF37]/50 text-white"
            />
            <button type="submit" className="px-4 py-2 bg-[#D4AF37] text-black text-[10px] font-bold rounded-lg uppercase tracking-wider">Save</button>
          </form>
        </div>
      )}

      {/* Reminders Row */}
      {reminders.filter(r => !r.completed).length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-[10px] uppercase tracking-widest text-white/40 px-1 flex items-center gap-2">
            <Bell size={10} /> Active Reminders
          </h3>
          <div className="flex overflow-x-auto gap-3 hide-scrollbar pb-2">
            {reminders.filter(r => !r.completed).map(reminder => (
              <div 
                key={reminder.id} 
                onClick={() => toggleReminder(reminder)}
                className="shrink-0 w-48 glass-panel p-4 rounded-2xl flex flex-col gap-2 border-l-2 border-l-[#D4AF37] hover:bg-white/5 cursor-pointer transition-all"
              >
                <p className="text-xs font-medium text-white/90 line-clamp-1">{reminder.title}</p>
                <span className="text-[9px] text-white/40 uppercase tracking-wider">
                  Due {reminder.dueDate?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[#D4AF37]" size={24} />
        </div>
      ) : error ? (
        <div className="glass-panel-heavy rounded-3xl p-6 border-rose-400/20 text-center">
           <p className="text-xs text-rose-400">Please sign in with Google to view your real agenda.</p>
        </div>
      ) : upNext ? (
        <div className="glass-panel-heavy rounded-3xl p-6 relative overflow-hidden border-[#D4AF37]/20">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CalendarIcon size={100} />
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse"></span>
              <span className="text-[10px] uppercase tracking-wider text-[#D4AF37] font-medium">Up Next</span>
            </div>
            <button 
              onClick={() => setEventReminder(upNext)}
              className="text-[10px] uppercase tracking-wider text-white/40 hover:text-[#D4AF37] flex items-center gap-1 transition-colors"
            >
              <Bell size={10} />
              Remind Me
            </button>
          </div>
          
          <h3 className="font-serif text-2xl leading-tight mb-2 truncate pr-12">{upNext.summary}</h3>
          
          <div className="flex flex-col gap-2 mb-6">
            <div className="flex items-center gap-2 text-white/60">
              <Clock size={12} />
              <span className="text-xs font-light tracking-wide">
                {upNext.start?.dateTime ? new Date(upNext.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day'}
              </span>
            </div>
            {upNext.attendees && (
              <div className="flex items-center gap-2 text-white/60">
                <Users size={12} />
                <span className="text-xs font-light tracking-wide truncate max-w-[200px]">
                  {upNext.attendees.map((a: any) => a.displayName || a.email).join(', ')}
                </span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-white/50 leading-relaxed font-light mb-4 italic">
              "Beatrice is ready to prepare you for this session."
            </p>
            <button className="w-full glass-panel py-3 rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-white/10 transition-colors border-white/5 text-[#D4AF37]">
              <MessageCircle size={14} />
              <span>Prepare for this meeting</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 glass-panel rounded-2xl border-dashed border-white/10">
           <p className="text-xs text-white/30 uppercase tracking-widest">No upcoming events</p>
        </div>
      )}

      {/* Timeline of remaining events with individual reminder buttons */}
      {!loading && !error && events.length > 1 && (
        <div className="flex flex-col gap-3 mt-2">
           <h3 className="text-[10px] uppercase tracking-widest text-white/40 px-1 border-b border-white/10 pb-2">Later Today</h3>
           <div className="flex flex-col gap-0 relative">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-white/10" />
              {events.slice(1).map((event, idx) => (
                <div key={idx} className="flex items-start gap-4 relative py-3 group">
                   <div className="w-8 h-8 rounded-full glass-panel-heavy flex items-center justify-center shrink-0 z-10 border border-white/10">
                     <span className="text-[9px] text-white/50 text-center leading-tight">
                       {event.start?.dateTime ? new Date(event.start.dateTime).getHours() : 'All'}h
                     </span>
                   </div>
                   <div className="flex-1 glass-panel rounded-xl p-4 border border-white/5 hover:border-[#D4AF37]/30 transition-colors relative">
                     <div className="flex items-center justify-between">
                       <h4 className="text-sm font-medium mb-1 truncate">{event.summary}</h4>
                       <button 
                        onClick={() => setEventReminder(event)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-[#D4AF37] text-white/40 transition-all"
                       >
                         <Bell size={12} />
                       </button>
                     </div>
                     {event.location && <span className="text-[10px] text-white/40 font-light truncate block">{event.location}</span>}
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

    </div>
  );
}
