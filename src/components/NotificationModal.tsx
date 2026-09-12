import React from 'react';
import { NotificationItem } from '../types';
import { Bell, Check, Download, FileText, X } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base text-white">Campus Notices & Circulars</h3>
              <p className="text-xs text-slate-300">{notifications.length} official communications</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {notifications.some(n => !n.is_read) && (
              <button
                onClick={onMarkAllRead}
                className="text-xs text-amber-300 hover:text-amber-200 underline font-medium px-2 py-1 cursor-pointer"
              >
                Mark all as read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notices List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-100 bg-slate-50">
          {notifications.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Bell className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">No active notices at this time</p>
            </div>
          ) : (
            notifications.map(item => (
              <div
                key={item.id}
                className={`pt-3 first:pt-0 p-3 rounded-lg border transition-all ${
                  item.is_read ? 'bg-white border-slate-200' : 'bg-amber-50/40 border-amber-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      {!item.is_read && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      )}
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{item.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{item.body}</p>
                    <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                      <span>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="capitalize px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                        Target: {item.target_role.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {!item.is_read && (
                      <button
                        onClick={() => onMarkRead(item.id)}
                        className="p-1.5 text-xs text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Mark read"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[10px]">Read</span>
                      </button>
                    )}
                    {item.file_url && (
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-xs text-[#0f2744] hover:bg-sky-50 rounded border border-sky-200 transition-colors flex items-center gap-1"
                        title="Download attached circular"
                      >
                        <FileText className="w-3.5 h-3.5 text-sky-600" />
                        <span className="text-[10px] font-medium">Attachment</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
