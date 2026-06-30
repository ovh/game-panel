import {
  Check,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Home,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type { DragEvent, MouseEvent } from 'react';
import { lazy, Suspense, useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AppButton, AppInput } from '../../src/ui/components';
import { useCoarsePointer } from '../../src/ui/utils/useCoarsePointer';

// Lazily loaded so CodeMirror (editor + 7 language grammars) is only fetched when a
// file is actually opened for editing, not on initial app load.
const CodeEditor = lazy(() => import('./CodeEditor').then((m) => ({ default: m.CodeEditor })));

interface FileItem {
  name: string;
  type: 'file' | 'folder' | 'symlink';
  size?: string;
}

export interface UploadQueueItem {
  id: string;
  name: string;
  progress: number;
  error?: string;
  done: boolean;
}

interface FileRoot {
  key: string;
  containerPath: string;
}

interface FileManagerTabProps {
  borderColor: string;
  contentBg: string;
  hoverBg: string;
  inputBg: string;
  inputBorder: string;
  textPrimary: string;
  textSecondary: string;
  currentPath: string;
  setCurrentPath: (path: string) => void;
  currentRoot: string;
  availableRoots: FileRoot[];
  setCurrentRoot: (root: string) => void;
  loadFiles: (path: string) => void;
  handleCreateFolder: () => void;
  handleCreateFile: () => void;
  handleCopyPath: () => void;
  canWriteFiles: boolean;
  copyPathSuccess: boolean;
  filesLoading: boolean;
  filesError: string | null;
  files: FileItem[];
  selectedFile: FileItem | null;
  setSelectedFile: (file: FileItem | null) => void;
  selectedItems: string[];
  renamingFile: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  handleFileClick: (file: FileItem) => void;
  handleFileDoubleClick: (file: FileItem) => void;
  handleDeleteSelected: () => void;
  handleMoveEntries: (names: string[], targetDir: string) => void;
  handleRenameConfirm: (...args: any[]) => void;
  handleRenameCancel: (...args: any[]) => void;
  handleRenameFile: (file: FileItem, event: MouseEvent<HTMLButtonElement>) => void;
  handleDeleteFile: (file: FileItem, event: MouseEvent<HTMLButtonElement>) => void;
  handleDownloadPath: (file: FileItem, event: MouseEvent<HTMLButtonElement>) => void;
  handleDownloadSelected: () => void;
  fileLoading: boolean;
  fileContent: string;
  setFileContent: (content: string) => void;
  isFileDirty: boolean;
  setIsFileDirty: (dirty: boolean) => void;
  fileError: string | null;
  savingFile: boolean;
  handleSaveFile: () => void;
  handleDownloadFile: () => void;
  handleCopyContent: () => void;
  copyContentSuccess: boolean;
  onUploadFiles?: (files: File[]) => void;
  uploadQueue?: UploadQueueItem[];
}

export function FileManagerTab({
  borderColor,
  contentBg,
  hoverBg,
  inputBg,
  inputBorder,
  textPrimary,
  textSecondary,
  currentPath,
  setCurrentPath,
  currentRoot,
  availableRoots,
  setCurrentRoot,
  loadFiles,
  handleCreateFolder,
  handleCreateFile,
  handleCopyPath,
  canWriteFiles,
  copyPathSuccess,
  filesLoading,
  filesError,
  files,
  selectedFile,
  setSelectedFile,
  selectedItems,
  renamingFile,
  renameValue,
  setRenameValue,
  handleFileClick,
  handleFileDoubleClick,
  handleDeleteSelected,
  handleMoveEntries,
  handleRenameConfirm,
  handleRenameCancel,
  handleRenameFile,
  handleDeleteFile,
  handleDownloadPath,
  handleDownloadSelected,
  fileLoading,
  fileContent,
  setFileContent,
  isFileDirty,
  setIsFileDirty,
  fileError,
  savingFile,
  handleSaveFile,
  handleDownloadFile,
  handleCopyContent,
  copyContentSuccess,
  onUploadFiles,
  uploadQueue,
}: FileManagerTabProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (canWriteFiles && onUploadFiles && acceptedFiles.length > 0) {
        onUploadFiles(acceptedFiles);
      }
    },
    [canWriteFiles, onUploadFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: !canWriteFiles || !onUploadFiles,
  });

  const closeEditorModal = () => {
    setSelectedFile(null);
    setFileContent('');
    setIsFileDirty(false);
  };

  // On touch devices double-click doesn't fire reliably (iOS double-tap zooms instead), so files
  // open on a single tap; folders already open on click. Native drag is also unsupported there.
  const isTouch = useCoarsePointer();

  // ── Internal drag-and-drop to move entries between folders ──────────────────────────────
  // Uses a custom mime so react-dropzone (which only reacts to OS "Files" drags) stays inert.
  const MOVE_MIME = 'application/x-gp-move';
  const [dragSourceName, setDragSourceName] = useState<string | null>(null);
  const [dropTargetName, setDropTargetName] = useState<string | null>(null);

  const parentDir = '/' + currentPath.split('/').filter(Boolean).slice(0, -1).join('/');

  const clearDrag = () => {
    setDragSourceName(null);
    setDropTargetName(null);
  };

  const handleRowDragStart = (file: FileItem) => (event: DragEvent) => {
    if (!canWriteFiles || file.name === '..') return;
    setDragSourceName(file.name);
    event.dataTransfer.setData(MOVE_MIME, file.name);
    event.dataTransfer.effectAllowed = 'move';
  };

  // A folder row (or "..") accepts a drop as long as something is being dragged onto a different row.
  const canDropOn = (file: FileItem) =>
    canWriteFiles && !!dragSourceName && dragSourceName !== file.name;

  const handleRowDragOver = (file: FileItem) => (event: DragEvent) => {
    if (!canDropOn(file)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTargetName !== file.name) setDropTargetName(file.name);
  };

  const handleRowDragLeave = (file: FileItem) => (event: DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropTargetName((prev) => (prev === file.name ? null : prev));
  };

  const handleRowDrop = (file: FileItem) => (event: DragEvent) => {
    if (!canDropOn(file)) return;
    event.preventDefault();
    event.stopPropagation();
    const source = dragSourceName;
    clearDrag();
    if (!source) return;
    const targetDir = file.name === '..' ? parentDir : (currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`);
    // Move the whole selection when the dragged row is part of it; otherwise just the dragged row.
    const names = (selectedItems.includes(source) ? selectedItems : [source]).filter(
      (n) => n !== file.name && n !== '..'
    );
    if (names.length === 0) return;
    handleMoveEntries(names, targetDir);
  };

  return (
    <div className="h-full flex flex-col" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Toolbar */}
      <div
        className={`h-[52px] px-3 border-b ${borderColor} ${contentBg} flex items-center gap-1 flex-shrink-0`}
      >
        {availableRoots.length > 1 && (
          <select
            value={currentRoot}
            onChange={(e) => setCurrentRoot(e.target.value)}
            className="h-[30px] flex-shrink-0 rounded border border-gray-700 bg-gray-800 px-2 text-xs text-gray-300 outline-none cursor-pointer hover:border-gray-500"
          >
            {availableRoots.map((r) => (
              <option key={r.key} value={r.key}>{r.containerPath}</option>
            ))}
          </select>
        )}

        <div className="gp-path-breadcrumb hide-scrollbar flex flex-1 items-center gap-0.5 min-w-0 overflow-x-auto whitespace-nowrap px-2 h-[30px] rounded border border-gray-700 bg-gray-800/50">
          <AppButton
            tone="ghost"
            onClick={() => setCurrentPath('/')}
            className="flex h-6 w-6 min-w-0 !min-h-0 flex-shrink-0 items-center justify-center rounded p-0 transition-colors hover:bg-gray-700 text-[var(--color-cyan-400)]"
            title="Root"
          >
            <Home className="w-3.5 h-3.5" />
          </AppButton>
          {currentPath === '/' && (
            <span className={`text-xs font-medium px-1 leading-none ${textPrimary}`}>/</span>
          )}
          {currentPath !== '/' &&
            currentPath
              .split('/')
              .filter(Boolean)
              .map((segment, idx, arr) => {
                const segmentPath = '/' + arr.slice(0, idx + 1).join('/');
                const isLast = idx === arr.length - 1;
                return (
                  <span key={segmentPath} className="flex items-center gap-0.5 flex-shrink-0">
                    <ChevronRight className="w-2.5 h-2.5 text-gray-600" />
                    {isLast ? (
                      <span className={`text-xs font-medium px-1 leading-none ${textPrimary}`}>
                        {segment}
                      </span>
                    ) : (
                      <AppButton
                        tone="ghost"
                        onClick={() => setCurrentPath(segmentPath)}
                        className="min-w-0 !min-h-0 text-xs px-1 py-0.5 rounded transition-colors leading-none hover:bg-gray-700 text-[var(--color-cyan-400)]"
                      >
                        {segment}
                      </AppButton>
                    )}
                  </span>
                );
              })}
        </div>

        <div className="ml-1 flex items-center gap-0.5 flex-shrink-0">
          <AppButton
            tone="ghost"
            onClick={() => loadFiles(currentPath)}
            className="h-7 w-7 min-w-0 !min-h-0 rounded p-0 transition-colors hover:bg-gray-700 text-gray-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </AppButton>
          <AppButton
            tone="ghost"
            onClick={handleCreateFolder}
            disabled={!canWriteFiles}
            className={`h-7 w-7 min-w-0 !min-h-0 rounded p-0 transition-colors ${
              canWriteFiles ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'
            }`}
            title="New Folder"
          >
            <FolderPlus className="w-3 h-3" />
          </AppButton>
          <AppButton
            tone="ghost"
            onClick={handleCreateFile}
            disabled={!canWriteFiles}
            className={`h-7 w-7 min-w-0 !min-h-0 rounded p-0 transition-colors ${
              canWriteFiles ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'
            }`}
            title="New File"
          >
            <FilePlus className="w-3 h-3" />
          </AppButton>
          {onUploadFiles && (
            <AppButton
              tone="ghost"
              onClick={canWriteFiles ? open : undefined}
              disabled={!canWriteFiles}
              className={`h-7 w-7 min-w-0 !min-h-0 rounded p-0 transition-colors ${
                canWriteFiles ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'
              }`}
              title="Upload files"
            >
              <Upload className="w-3 h-3" />
            </AppButton>
          )}
          {selectedItems.length > 0 && (
            <AppButton
              tone="ghost"
              onClick={handleDownloadSelected}
              className="h-7 min-w-0 !min-h-0 rounded px-2 py-0 transition-colors hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 text-[11px] font-medium flex items-center gap-1"
              title={`Download ${selectedItems.length} selected`}
            >
              <Download className="w-3 h-3" />
              {selectedItems.length}
            </AppButton>
          )}
          {selectedItems.length > 0 && canWriteFiles && (
            <AppButton
              tone="ghost"
              onClick={handleDeleteSelected}
              className="h-7 min-w-0 !min-h-0 rounded px-2 py-0 transition-colors hover:bg-red-500/20 text-red-400 hover:text-red-300 text-[11px] font-medium flex items-center gap-1"
              title={`Delete ${selectedItems.length} selected`}
            >
              <Trash2 className="w-3 h-3" />
              {selectedItems.length}
            </AppButton>
          )}
          <AppButton
            tone="ghost"
            onClick={handleCopyPath}
            className={`h-7 w-7 min-w-0 !min-h-0 rounded p-0 transition-all ${
              copyPathSuccess ? 'bg-green-500/20 text-green-400' : 'hover:bg-gray-700 text-gray-400 hover:text-white'
            }`}
            title={copyPathSuccess ? 'Copied!' : 'Copy path'}
          >
            {copyPathSuccess ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </AppButton>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-2.5 relative">
        {isDragActive && canWriteFiles && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-lg m-1 pointer-events-none">
            <div className="text-center text-blue-400">
              <Upload className="w-10 h-10 mx-auto mb-2" />
              <p className="font-medium text-sm">Drop files to upload</p>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {filesLoading && <div className={`text-sm px-2 py-1 ${textSecondary}`}>Loading files...</div>}
          {filesError && <div className="text-sm px-2 py-1 text-red-400">{filesError}</div>}

          {!filesLoading &&
            files.map((file, index) => {
              const isParentNav = file.name === '..';
              const isSelected = !isParentNav && selectedItems.includes(file.name);

              if (isParentNav) {
                const isDropTarget = dropTargetName === '..';
                return (
                  <div
                    key={index}
                    className={`w-full flex h-9 items-center gap-2 px-2 rounded-md cursor-pointer select-none transition-colors ${
                      isDropTarget ? 'bg-[#0050D7]/20 border border-[var(--color-cyan-400)]' : hoverBg
                    }`}
                    onClick={() => handleFileDoubleClick(file)}
                    onDragOver={handleRowDragOver(file)}
                    onDragLeave={handleRowDragLeave(file)}
                    onDrop={handleRowDrop(file)}
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 rotate-180" />
                    <span className={`text-[14px] ${textSecondary}`}>..</span>
                  </div>
                );
              }

              const isFolder = file.type === 'folder';
              const isDropTarget = isFolder && dropTargetName === file.name;
              // Native HTML5 drag is unsupported on touch and interferes with taps there, so disable it.
              const isDraggable = canWriteFiles && file.type !== 'symlink' && renamingFile !== file.name && !isTouch;
              // Touch: single tap opens both folders and files. Desktop: click folders, double-click files.
              const openOnClick = isFolder || isTouch;
              return (
                <div
                  key={index}
                  draggable={isDraggable}
                  className={`group w-full flex h-9 items-center gap-1.5 px-2 rounded-md select-none transition-colors ${
                    isDropTarget
                      ? 'bg-[#0050D7]/20 border border-[var(--color-cyan-400)] ring-1 ring-[var(--color-cyan-400)]'
                      : isSelected
                        ? 'bg-[#0050D7]/20 border border-[var(--color-cyan-400)]'
                        : hoverBg
                  } ${isFolder || isTouch ? 'cursor-pointer' : 'cursor-default'} ${dragSourceName === file.name ? 'opacity-50' : ''}`}
                  onClick={openOnClick ? () => handleFileDoubleClick(file) : undefined}
                  onDoubleClick={!openOnClick ? () => handleFileDoubleClick(file) : undefined}
                  onDragStart={isDraggable ? handleRowDragStart(file) : undefined}
                  onDragEnd={isDraggable ? clearDrag : undefined}
                  onDragOver={isFolder ? handleRowDragOver(file) : undefined}
                  onDragLeave={isFolder ? handleRowDragLeave(file) : undefined}
                  onDrop={isFolder ? handleRowDrop(file) : undefined}
                >
                  {renamingFile === file.name ? (
                    /* Rename mode — full row */
                    <div
                      className="flex flex-1 items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <AppInput
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameConfirm(e as any);
                          if (e.key === 'Escape') handleRenameCancel(e as any);
                        }}
                        className={`h-7 min-h-0 flex-1 ${inputBg} border ${inputBorder} rounded px-2 py-0 text-sm ${textPrimary} outline-none ring-0 shadow-none [--ods-theme-outline-color:transparent] focus:outline-none focus:ring-0 focus:shadow-none`}
                        autoFocus
                      />
                      <AppButton
                        tone="ghost"
                        onClick={handleRenameConfirm}
                        disabled={!canWriteFiles}
                        className={`h-7 w-7 min-w-0 !min-h-0 flex-shrink-0 rounded-md border-none bg-transparent p-0 transition-colors ${
                          canWriteFiles ? 'text-green-400 hover:bg-green-500/10 hover:text-green-300' : 'text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </AppButton>
                      <AppButton
                        tone="ghost"
                        onClick={handleRenameCancel}
                        className="h-7 w-7 min-w-0 !min-h-0 flex-shrink-0 rounded-md border-none bg-transparent p-0 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </AppButton>
                    </div>
                  ) : (
                    <>
                      {/* Checkbox */}
                      <div
                        className={`w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center rounded border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#0050D7] border-[var(--color-cyan-400)]'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                        onClick={(e) => { e.stopPropagation(); handleFileClick(file); }}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>

                      {/* Icon */}
                      {file.type === 'folder' ? (
                        <Folder className="w-3.5 h-3.5 text-[var(--color-cyan-400)] flex-shrink-0" />
                      ) : file.type === 'symlink' ? (
                        <FileText className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      )}

                      {/* Name */}
                      <span className={`flex-1 min-w-0 truncate text-[14px] leading-tight ${textPrimary}`}>
                        {file.name}
                      </span>

                      {/* Badges */}
                      {file.type === 'symlink' && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300 flex-shrink-0">
                          Symlink
                        </span>
                      )}
                      {file.type === 'file' && (
                        <span className={`text-[11px] leading-none flex-shrink-0 ${textSecondary}`}>
                          {file.size}
                        </span>
                      )}

                      {/* Hover actions */}
                      <div
                        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <AppButton
                          tone="ghost"
                          onClick={(e) => handleDownloadPath(file, e)}
                          disabled={file.type === 'symlink'}
                          className={`h-7 w-6 min-w-0 !min-h-0 rounded-md border-none bg-transparent p-0 transition-colors ${
                            file.type !== 'symlink'
                              ? 'hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300'
                              : 'text-gray-600 cursor-not-allowed'
                          }`}
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </AppButton>
                        <AppButton
                          tone="ghost"
                          onClick={(e) => handleRenameFile(file, e)}
                          disabled={!canWriteFiles || file.type === 'symlink'}
                          className={`h-7 w-6 min-w-0 !min-h-0 rounded-md border-none bg-transparent p-0 transition-colors ${
                            canWriteFiles && file.type !== 'symlink'
                              ? 'hover:bg-blue-500/20 text-blue-400 hover:text-blue-300'
                              : 'text-gray-600 cursor-not-allowed'
                          }`}
                          title="Rename"
                        >
                          <Edit2 className="w-3 h-3" />
                        </AppButton>
                        <AppButton
                          tone="ghost"
                          onClick={(e) => handleDeleteFile(file, e)}
                          disabled={!canWriteFiles || file.type === 'symlink'}
                          className={`h-7 w-6 min-w-0 !min-h-0 rounded-md border-none bg-transparent p-0 transition-colors ${
                            canWriteFiles && file.type !== 'symlink'
                              ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300'
                              : 'text-gray-600 cursor-not-allowed'
                          }`}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </AppButton>
                      </div>

                      {file.type === 'folder' && (
                        <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                      )}
                    </>
                  )}
                </div>
              );
            })}
        </div>

        {canWriteFiles && onUploadFiles && !isDragActive && (
          <div className="flex items-center justify-center gap-1.5 mt-3 mb-1 text-[11px] text-gray-600 select-none pointer-events-none">
            <Upload className="w-3 h-3" />
            <span>Drag &amp; drop files here to upload</span>
          </div>
        )}
      </div>

      {/* Upload queue */}
      {uploadQueue && uploadQueue.length > 0 && (
        <div className={`border-t ${borderColor} px-3 py-1.5 space-y-1 max-h-28 overflow-y-auto flex-shrink-0`}>
          {uploadQueue.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs min-w-0">
              <Upload className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <span className={`flex-1 truncate ${item.error ? 'text-red-400' : textPrimary}`}>
                {item.name}
              </span>
              {item.error ? (
                <span className="text-red-400 flex-shrink-0 text-[10px]">Failed</span>
              ) : item.done ? (
                <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
              ) : (
                <span className="text-gray-400 flex-shrink-0 tabular-nums">{item.progress}%</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {selectedFile && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div
            className={`flex h-full md:h-[calc(100vh-2rem)] w-full max-w-7xl flex-col rounded-none md:rounded-xl border ${borderColor} ${contentBg} shadow-2xl overflow-hidden`}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className={`flex flex-shrink-0 items-center justify-between border-b ${borderColor} px-4 py-3`}>
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-[var(--color-cyan-400)]" />
                <span className={`truncate text-sm font-medium ${textPrimary}`}>
                  {selectedFile.name}
                </span>
                {isFileDirty && (
                  <span className="flex-shrink-0 text-xs text-amber-400">• unsaved</span>
                )}
              </div>
              <div className="ml-4 flex flex-shrink-0 items-center gap-1.5">
                <AppButton
                  onClick={handleCopyContent}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors bg-gray-700 hover:bg-gray-600 text-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copyContentSuccess ? 'Copied' : 'Copy'}
                </AppButton>
                <AppButton
                  onClick={handleDownloadFile}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors bg-gray-700 hover:bg-gray-600 text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </AppButton>
                <AppButton
                  onClick={handleSaveFile}
                  disabled={!canWriteFiles || !isFileDirty || savingFile}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
                    canWriteFiles && isFileDirty && !savingFile
                      ? 'bg-[var(--gp-primary-700)] hover:bg-[var(--gp-primary-600)] text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingFile ? 'Saving...' : 'Save'}
                </AppButton>
                <AppButton
                  tone="ghost"
                  onClick={closeEditorModal}
                  className={`h-8 w-8 flex items-center justify-center rounded p-0 transition-colors hover:bg-gray-700 ${textSecondary} hover:text-red-400`}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </AppButton>
              </div>
            </div>

            {/* Modal content */}
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
              {fileLoading ? (
                <div className={`p-4 text-sm ${textSecondary}`}>Loading file...</div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <Suspense
                    fallback={<div className={`p-4 text-sm ${textSecondary}`}>Loading editor…</div>}
                  >
                    <CodeEditor
                      value={fileContent}
                      onChange={(value) => {
                        setFileContent(value);
                        setIsFileDirty(true);
                      }}
                      filename={selectedFile.name}
                      readOnly={!canWriteFiles}
                    />
                  </Suspense>
                </div>
              )}
              {fileError && (
                <div className="flex-shrink-0 border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                  {fileError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
