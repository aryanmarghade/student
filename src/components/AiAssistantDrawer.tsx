import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../lib/api';
import { Sparkles, X, Send, Database, CheckCircle2, AlertTriangle, ArrowRight, Bot } from 'lucide-react';

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

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ isOpen, onClose, user }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: user.role === 'admin'
        ? `Hello, Administrator ${user.full_name.split(' ')[0]}. I am your Grounded Institutional AI Assistant. I can query real college-wide metrics across all departments, class performance, unassigned faculty, and audit trails.`
        : user.role === 'teacher'
        ? `Hello, Professor ${user.full_name.split(' ')[0]}. I am your Academic Analytics Assistant. I answer strictly from institutional database records for your assigned classes. You can ask for class toppers, subject averages, regression forecasts, or identify struggling students.`
        : `Hello, ${user.full_name.split(' ')[0]}. I am your Academic Records Assistant. I can help you review your assessment scores, forecast next semester targets, or summarize your official semester grades.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const adminSuggestions = [
    'Which department has the lowest average this semester?',
    'How many teachers have no class assigned right now?',
    'Show college-wide academic overview statistics',
    'Summarize recent institutional audit log actions'
  ];

  const teacherSuggestions = [
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

  const suggestions = user.role === 'admin'
    ? adminSuggestions
    : user.role === 'teacher'
    ? teacherSuggestions
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
    setIsLoading(true);

    try {
      const response = user.role === 'admin'
        ? await api.askAdminAi(query)
        : user.role === 'teacher'
        ? await api.askTeacherAi(query)
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

                {/* Grounding Audit: Tool calls executed */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                    <p className="font-semibold text-slate-600 flex items-center gap-1 mb-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Grounded Tool Execution:
                    </p>
                    {msg.toolCalls.map((tc, idx) => (
                      <div key={idx} className="bg-slate-100 rounded p-2 text-slate-700 font-mono text-[10px] mb-1">
                        <span className="font-bold text-[#0f2744]">{tc.name}</span>({JSON.stringify(tc.args)})
                      </div>
                    ))}
                  </div>
                )}
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
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Suggested Queries:</p>
          <div className="flex flex-wrap gap-1.5">
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
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={user.role === 'teacher' ? 'Ask about assigned classes, toppers, predictions...' : 'Ask about your marks, SGPA, next score...'}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0f2744] focus:border-transparent bg-slate-50 text-slate-900"
            />
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
