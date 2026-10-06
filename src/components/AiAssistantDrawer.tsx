import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { api } from '../lib/api';
import { Sparkles, X, Send, Database, ArrowRight, Bot, ChevronDown, ChevronUp, Users, BookOpen, GraduationCap, AtSign } from 'lucide-react';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  toolCalls?: any[];
  resolvedIntent?: string;
  error?: boolean;
}

interface MentionOption {
  type: 'class' | 'student';
  id: string;
  label: string;
  subLabel: string;
  classId?: string;
  rollNumber?: string;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ isOpen, onClose, user }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: user.role === 'admin'
        ? `Hello, Administrator ${user.full_name.split(' ')[0]}. I am your Grounded Institutional AI Assistant. I can query real college-wide metrics across all departments, class performance, unassigned faculty, and audit trails.`
        : user.role === 'teacher'
        ? `Hello, Professor ${user.full_name.split(' ')[0]}. I am your Academic Analytics Assistant. You can ask for class toppers, subject averages, regression forecasts, or type @ to select a class or student to inspect their performance.`
        : user.role === 'placement'
        ? `Hello, Placement Officer ${user.full_name.split(' ')[0]}. I am your Placement & Career Intelligence Assistant. I can query student profile strengths, resume and portfolio tracking, hackathon participations, and placement readiness.`
        : `Hello, ${user.full_name.split(' ')[0]}. I am your Academic Records Assistant. I can help you review your assessment scores, forecast next semester targets, or summarize your official semester grades.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Mention State
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [filteredMentions, setFilteredMentions] = useState<MentionOption[]>([]);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load teacher classes and students for @ mention dropdown
  useEffect(() => {
    if (!isOpen) return;

    const loadMentions = async () => {
      try {
        if (user.role === 'teacher') {
          const assignRes = await api.getTeacherAssignmentsList();
          const activeAssignments = assignRes.active || [];
          
          const classOptions: MentionOption[] = activeAssignments.map(a => ({
            type: 'class',
            id: a.class_id,
            label: a.className || 'Class',
            subLabel: `${a.subjectName || ''} (${a.semesterName || ''})`,
            classId: a.class_id
          }));

          const studentPromises = activeAssignments.slice(0, 5).map(a => api.getClassStudents(a.class_id).catch(() => null));
          const studentResponses = await Promise.all(studentPromises);
          
          const studentMap = new Map<string, MentionOption>();
          studentResponses.forEach((res, idx) => {
            if (res && res.students) {
              const cls = activeAssignments[idx];
              res.students.forEach((s: any) => {
                if (!studentMap.has(s.id)) {
                  studentMap.set(s.id, {
                    type: 'student',
                    id: s.id,
                    label: s.full_name,
                    subLabel: `${s.roll_number || 'Roll N/A'} • ${cls?.className || 'Assigned Class'}`,
                    classId: cls?.class_id,
                    rollNumber: s.roll_number
                  });
                }
              });
            }
          });

          setMentionOptions([...classOptions, ...Array.from(studentMap.values())]);
        } else if (user.role === 'admin') {
          const [classes, users] = await Promise.all([
            api.getAdminClasses().catch(() => []),
            api.getAdminUsers().catch(() => [])
          ]);

          const classOptions: MentionOption[] = (classes || []).map((c: any) => ({
            type: 'class',
            id: c.id,
            label: c.name,
            subLabel: `${c.department_name || c.departmentName || 'Dept'} • Year ${c.year || 1}`,
            classId: c.id
          }));

          const studentOptions: MentionOption[] = (users || [])
            .filter((u: any) => u.role === 'student')
            .slice(0, 30)
            .map((s: any) => ({
              type: 'student',
              id: s.id,
              label: s.full_name,
              subLabel: `${s.roll_number || 'Enrolled'} • ${s.class_name || 'Student'}`,
              classId: s.class_id,
              rollNumber: s.roll_number
            }));

          setMentionOptions([...classOptions, ...studentOptions]);
        }
      } catch (err) {
        console.error('Failed to load mention options:', err);
      }
    };

    loadMentions();
  }, [isOpen, user.role]);

  // Handle input change and detect @
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputQuery(val);

    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1 && !textBeforeCursor.slice(lastAtIdx).includes(' ')) {
      const q = textBeforeCursor.slice(lastAtIdx + 1).toLowerCase();
      setMentionQuery(q);
      
      const filtered = mentionOptions.filter(m => 
        m.label.toLowerCase().includes(q) || 
        m.subLabel.toLowerCase().includes(q) ||
        (m.rollNumber && m.rollNumber.toLowerCase().includes(q))
      );

      setFilteredMentions(filtered);
      setShowMentionMenu(filtered.length > 0);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMention = (option: MentionOption) => {
    const cursor = inputRef.current?.selectionStart || inputQuery.length;
    const textBeforeCursor = inputQuery.slice(0, cursor);
    const textAfterCursor = inputQuery.slice(cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');

    if (lastAtIdx !== -1) {
      const prefix = textBeforeCursor.slice(0, lastAtIdx);
      const inserted = `@${option.label} `;
      setInputQuery(`${prefix}${inserted}${textAfterCursor}`);
      setShowMentionMenu(false);

      if (option.type === 'class') {
        setSelectedClassFilter(option.id);
      }

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newPos = prefix.length + inserted.length;
          inputRef.current.setSelectionRange(newPos, newPos);
        }
      }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionMenu && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev + 1) % filteredMentions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev - 1 + filteredMentions.length) % filteredMentions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(filteredMentions[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionMenu(false);
      }
    }
  };

  const adminSuggestions = [
    'Which department has the lowest average this semester?',
    'How many teachers have no class assigned right now?',
    'Show college-wide academic overview statistics',
    'Summarize recent institutional audit log actions'
  ];

  const teacherSuggestions = [
    'How is @Aryan performing in my class?',
    'Who is the topper in my class?',
    'Which students are struggling in my class?',
    'What is the overall average score for my class?',
    'Predict next score for my students'
  ];

  const studentSuggestions = [
    "What is my overall assessment average?",
    "Predict my next score based on past marks",
    "Summarize my completed semester reports"
  ];

  const placementSuggestions = [
    "Summarize placement readiness and profile strength",
    "How many students have uploaded active resumes and portfolios?",
    "Show student project and hackathon participation statistics"
  ];

  const suggestions = user.role === 'admin'
    ? adminSuggestions
    : user.role === 'teacher'
    ? teacherSuggestions
    : user.role === 'placement'
    ? placementSuggestions
    : studentSuggestions;

  const handleSend = async (queryToSend?: string) => {
    const query = (queryToSend || inputQuery).trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setShowMentionMenu(false);
    setIsLoading(true);

    try {
      const response = user.role === 'admin'
        ? await api.askAdminAi(query)
        : user.role === 'teacher'
        ? await api.askTeacherAi(query)
        : user.role === 'placement'
        ? await api.askPlacementAi(query)
        : await api.askStudentAi(query);

      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: response.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolCalls: response.toolCallsExecuted,
        resolvedIntent: response.resolvedIntent
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: err.message || 'An error occurred while querying the database. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between border-b border-[#1e3a5f]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight text-white flex items-center gap-1.5">
                Academic AI Assistant
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  Grounded
                </span>
              </h3>
              <p className="text-xs text-slate-300">Strictly verified database queries</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grounding Policy Disclaimer */}
        <div className="bg-amber-50/80 px-4 py-2 border-b border-amber-200/60 text-[11px] text-amber-900 flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span>
            <strong>Zero-Hallucination Policy:</strong> Answers are retrieved strictly via SQL/tool execution. Predictive scores use linear regression on recorded marks.
          </span>
        </div>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#0f2744] text-white rounded-br-none shadow-sm'
                    : msg.error
                    ? 'bg-red-50 text-red-900 border border-red-200 rounded-bl-none'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 opacity-70 text-[10px] font-semibold tracking-wider uppercase">
                  {msg.sender === 'user' ? 'You' : <><Bot className="w-3 h-3 text-amber-600" /> Vission AI</>}
                  <span>• {msg.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center space-x-2 text-slate-500 text-xs bg-white p-3 rounded-lg border border-slate-200 w-fit">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce"></div>
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.4s]"></div>
              <span>Querying institutional database records...</span>
            </div>
          )}
        </div>

        {/* Suggested Queries */}
        <div className="p-3 bg-white border-t border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Suggested Queries</p>
            <button
              type="button"
              onClick={() => setShowSuggestions(prev => !prev)}
              className="text-slate-500 hover:text-[#0f2744] hover:bg-slate-100 p-1 rounded-md transition-colors flex items-center gap-1 text-[11px] font-medium cursor-pointer"
              title={showSuggestions ? "Hide suggestions" : "Show suggestions"}
            >
              <span className="text-[10px] text-slate-400">{showSuggestions ? 'Hide' : 'Show'}</span>
              {showSuggestions ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
          {showSuggestions && (
            <div className="flex flex-wrap gap-1.5 transition-all duration-200">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  disabled={isLoading}
                  onClick={() => handleSend(s)}
                  className="text-[11px] bg-slate-100 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200 transition-all text-left flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <span>{s}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input Bar & @ Mention Dropdown Popup */}
        <div className="p-3 bg-white border-t border-slate-200 relative">
          {showMentionMenu && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden z-50 max-h-56 overflow-y-auto animate-fade-in">
              <div className="p-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1">
                  <AtSign className="w-3.5 h-3.5 text-amber-600" /> Select Class or Student
                </span>
                <span className="text-[10px] font-normal text-slate-400">Press ↑↓ to navigate, Enter to select</span>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredMentions.map((opt, idx) => (
                  <button
                    key={`${opt.type}_${opt.id}_${idx}`}
                    type="button"
                    onClick={() => handleSelectMention(opt)}
                    className={`w-full text-left p-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      idx === selectedMentionIndex ? 'bg-amber-50 text-slate-900' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-md shrink-0 ${
                        opt.type === 'class' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {opt.type === 'class' ? <BookOpen className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span>{opt.label}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                            opt.type === 'class' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {opt.type}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{opt.subLabel}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputQuery}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  user.role === 'teacher'
                    ? 'Type @ to select a class or student to inspect performance...'
                    : user.role === 'admin'
                    ? 'Type @ to inspect a class or student, or ask college stats...'
                    : user.role === 'placement'
                    ? 'Ask about placement readiness, resumes, portfolios...'
                    : 'Ask about your marks, SGPA, next score...'
                }
                disabled={isLoading}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0f2744] focus:border-transparent bg-slate-50 text-slate-900"
              />
            </div>
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="p-2.5 bg-[#0f2744] text-white rounded-lg hover:bg-[#163354] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
