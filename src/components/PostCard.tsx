import React from 'react';
import { PostItem, StudentProfile } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { Download, ExternalLink, Image as ImageIcon, FileText, PlayCircle } from 'lucide-react';

interface PostCardProps {
  post: PostItem;
  student: StudentProfile | null;
  onDelete?: (id: string) => void;
  viewerRole: 'student' | 'teacher';
}

export const PostCard: React.FC<PostCardProps> = ({ post, student, onDelete, viewerRole }) => {
  const getAttachmentUrl = (attachmentId: string) => {
    if (viewerRole === 'student') {
      return `/api/student/post-attachments/${attachmentId}/file`;
    } else {
      return `/api/teacher/students/${post.student_id}/post-attachments/${attachmentId}/file`;
    }
  };

  const downloadAttachment = async (attachmentId: string, fileName: string) => {
    try {
      const token = localStorage.getItem('vission_academy_jwt');
      const url = getAttachmentUrl(attachmentId);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('File download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      alert('Unable to open attachment.');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-[#0f2744]">
            {student?.profile_photo_url ? (
              <img src={student.profile_photo_url} alt={student.full_name} className="w-full h-full object-cover" />
            ) : (
              student?.full_name?.substring(0, 1) || 'S'
            )}
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm leading-tight">{student?.full_name || 'Student'}</h4>
            <p className="text-[11px] text-slate-500">{student?.className} • {student?.departmentName}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5 rounded"
          >
            Delete
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base">{post.title}</h3>
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-800 rounded-full">
            {post.category}
          </span>
        </div>
        
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{post.description}</p>
        
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {post.tags.map((tag, i) => (
              <span key={i} className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {post.external_link && (
          <a
            href={post.external_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {post.external_link}
          </a>
        )}
      </div>

      {/* Attachments */}
      {post.attachments && post.attachments.length > 0 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {post.attachments.map((att) => {
              const isImage = att.file_type === 'image';
              const isVideo = att.file_type === 'video';
              
              if (isImage) {
                return (
                  <div key={att.id} className="relative rounded-lg overflow-hidden border border-slate-200 group bg-slate-50 cursor-pointer h-40" onClick={() => downloadAttachment(att.id, att.file_name)}>
                     <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-8 h-8 mb-2" />
                        <span className="text-[10px] truncate max-w-[80%]">{att.file_name}</span>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="text-white text-xs font-bold bg-black/60 px-3 py-1.5 rounded-lg">View Image</span>
                        </div>
                     </div>
                  </div>
                );
              }
              
              if (isVideo) {
                return (
                  <div key={att.id} className="relative rounded-lg overflow-hidden border border-slate-200 group bg-slate-900 cursor-pointer h-40" onClick={() => downloadAttachment(att.id, att.file_name)}>
                     <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <PlayCircle className="w-10 h-10 text-white opacity-80 mb-2" />
                        <span className="text-[10px] text-white truncate max-w-[80%]">{att.file_name}</span>
                     </div>
                  </div>
                );
              }

              // PDF / PPT / Others
              return (
                <div key={att.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors" onClick={() => downloadAttachment(att.id, att.file_name)}>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 bg-white rounded shadow-sm flex items-center justify-center flex-shrink-0 text-red-500">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-[11px] font-bold text-slate-700 truncate">{att.file_name}</p>
                      <p className="text-[9px] text-slate-500 uppercase">{att.file_type}</p>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
