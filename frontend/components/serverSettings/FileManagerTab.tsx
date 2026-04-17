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
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { MouseEvent, SetStateAction } from 'react';
import { AppButton, AppInput, AppTextarea } from '../../src/ui/components';

interface FileItem {
  name: string;
  type: 'file' | 'folder' | 'symlink';
  size?: string;
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
  renamingFile: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  handleFileClick: (file: FileItem) => void;
  handleRenameConfirm: (...args: any[]) => void;
  handleRenameCancel: (...args: any[]) => void;
  handleRenameFile: (file: FileItem, event: MouseEvent<HTMLButtonElement>) => void;
  handleDeleteFile: (file: FileItem, event: MouseEvent<HTMLButtonElement>) => void;
  isEditorExpanded: boolean;
  setIsEditorExpanded: (value: SetStateAction<boolean>) => void;
  handleCopyContent: () => void;
  copyContentSuccess: boolean;
  handleDownloadFile: () => void;
  handleSaveFile: () => void;
  isFileDirty: boolean;
  savingFile: boolean;
  setSelectedFile: (file: FileItem | null) => void;
  fileLoading: boolean;
  fileContent: string;
  setFileContent: (content: string) => void;
  setIsFileDirty: (dirty: boolean) => void;
  fileError: string | null;
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
  renamingFile,
  renameValue,
  setRenameValue,
  handleFileClick,
  handleRenameConfirm,
  handleRenameCancel,
  handleRenameFile,
  handleDeleteFile,
  isEditorExpanded,
  setIsEditorExpanded,
  handleCopyContent,
  copyContentSuccess,
  handleDownloadFile,
  handleSaveFile,
  isFileDirty,
  savingFile,
  setSelectedFile,
  fileLoading,
  fileContent,
  setFileContent,
  setIsFileDirty,
  fileError,
}: FileManagerTabProps) {
  return (
    <div className="h-full flex flex-col md:flex-row">
      <div
        className={`w-full ${!isEditorExpanded ? 'md:w-1/2' : ''} md:border-r ${borderColor} flex flex-col ${
          selectedFile ? (isEditorExpanded ? 'hidden' : 'hidden md:flex') : 'flex'
        }`}
      >
        <div
          className={`h-[52px] px-3 border-b ${borderColor} ${contentBg} flex items-center gap-1`}
        >
          <div
            className={`gp-path-breadcrumb hide-scrollbar flex flex-1 items-center gap-0.5 min-w-0 overflow-x-auto whitespace-nowrap px-2 h-[30px] rounded border border-gray-700 bg-gray-800/50`}
          >
            <AppButton
              tone="ghost"
              onClick={() => setCurrentPath('/')}
              className={`flex h-6 w-6 min-w-0 !min-h-0 flex-shrink-0 items-center justify-center rounded p-0 transition-colors hover:bg-gray-700 text-[var(--color-cyan-400)]`}
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
                      <ChevronRight className={`w-2.5 h-2.5 text-gray-600`} />
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
                canWriteFiles
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                  : 'text-gray-600 cursor-not-allowed'
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
                canWriteFiles
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title="New File"
            >
              <FilePlus className="w-3 h-3" />
            </AppButton>
            <AppButton
              tone="ghost"
              onClick={handleCopyPath}
              className={`h-7 w-7 min-w-0 !min-h-0 rounded p-0 transition-all ${
                copyPathSuccess
                  ? 'bg-green-500/20 text-green-400'
                  : 'hover:bg-gray-700 text-gray-400 hover:text-white'
              }`}
              title={copyPathSuccess ? 'Copied!' : 'Copy path'}
            >
              {copyPathSuccess ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </AppButton>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5">
          <div className="space-y-0.5">
            {filesLoading && <div className={`text-sm ${textSecondary}`}>Loading files...</div>}
            {filesError && <div className="text-sm text-red-400">{filesError}</div>}
            {!filesLoading &&
              files.map((file, index) => (
                <div
                  key={index}
                  className={`group w-full flex h-9 items-center gap-1.5 px-2.5 py-0 rounded-md transition-colors ${
                    selectedFile?.name === file.name && !renamingFile
                      ? 'bg-[#0050D7]/20 border border-[var(--color-cyan-400)]'
                      : `${hoverBg} cursor-pointer`
                  }`}
                  onClick={() => handleFileClick(file)}
                >
                  {file.type === 'folder' ? (
                    <Folder className="w-3.5 h-3.5 text-[var(--color-cyan-400)] flex-shrink-0" />
                  ) : file.type === 'symlink' ? (
                    <FileText className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  )}

                  {renamingFile === file.name ? (
                    <div
                      className="flex-1 flex items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <AppInput
                        type="text"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleRenameConfirm(event as any);
                          if (event.key === 'Escape') handleRenameCancel(event as any);
                        }}
                        className={`h-8 min-h-0 flex-1 ${inputBg} border ${inputBorder} rounded px-2 py-0 text-sm ${textPrimary} outline-none ring-0 shadow-none [--ods-theme-outline-color:transparent] focus:outline-none focus:ring-0 focus:shadow-none`}
                        autoFocus
                      />
                      <AppButton
                        tone="ghost"
                        onClick={handleRenameConfirm}
                        disabled={!canWriteFiles}
                        className={`h-8 w-8 min-w-0 !min-h-0 flex-shrink-0 rounded-md border-none bg-transparent p-0 transition-colors ${
                          canWriteFiles
                            ? 'text-green-400 hover:bg-green-500/10 hover:text-green-300'
                            : 'text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </AppButton>
                      <AppButton
                        tone="ghost"
                        onClick={handleRenameCancel}
                        className="h-8 w-8 min-w-0 !min-h-0 flex-shrink-0 rounded-md border-none bg-transparent p-0 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      >
                        <XCircle className="w-4 h-4" />
                      </AppButton>
                    </div>
                  ) : (
                    <>
                      <span className={`flex-1 text-left text-[13px] leading-tight ${textPrimary}`}>
                        {file.name}
                      </span>
                      {file.type === 'symlink' && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                          Symlink
                        </span>
                      )}
                      {file.size && (
                        <span className={`text-[11px] leading-none ${textSecondary}`}>
                          {file.size}
                        </span>
                      )}

                      {file.name !== '..' && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <AppButton
                            tone="ghost"
                            onClick={(event) => handleRenameFile(file, event)}
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
                            onClick={(event) => handleDeleteFile(file, event)}
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
                      )}

                      {file.type === 'folder' && file.name !== '..' && (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      <div
        className={`w-full ${isEditorExpanded && selectedFile ? 'md:w-full' : 'md:w-1/2'} flex flex-col ${selectedFile ? 'flex' : 'hidden md:flex'}`}
      >
        <div
          className={`${isEditorExpanded ? 'min-h-[52px] px-3 py-2' : 'h-[52px] px-3'} border-b ${borderColor} ${contentBg} flex ${isEditorExpanded ? 'flex-col gap-2' : 'items-center'}`}
        >
          {selectedFile && (
            <div className="w-full flex flex-wrap gap-2 justify-start">
              <AppButton
                onClick={() => setIsEditorExpanded((prev) => !prev)}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors bg-gray-600 hover:bg-gray-500 text-white"
                title={isEditorExpanded ? 'Reduce editor size' : 'Expand editor size'}
              >
                {isEditorExpanded ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
                {isEditorExpanded ? 'Reduce' : 'Expand'}
              </AppButton>
              <AppButton
                onClick={handleCopyContent}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors bg-gray-600 hover:bg-gray-500 text-white"
              >
                <Copy className="w-4 h-4" />
                {copyContentSuccess ? 'Copied!' : 'Copy'}
              </AppButton>
              <AppButton
                onClick={handleDownloadFile}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors bg-gray-600 hover:bg-gray-500 text-white"
              >
                <Download className="w-4 h-4" />
                Download
              </AppButton>
              <AppButton
                onClick={handleSaveFile}
                disabled={!canWriteFiles || !isFileDirty || savingFile}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                  canWriteFiles
                    ? 'bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                {savingFile ? 'Saving...' : 'Save'}
              </AppButton>
            </div>
          )}
          {isEditorExpanded && (
            <div className="flex items-center gap-2 min-w-0 w-full">
              <AppButton
                onClick={() => setSelectedFile(null)}
                className={`md:hidden p-1 ${textSecondary} hover:text-[var(--color-cyan-400)]`}
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </AppButton>
              <FileText className="w-4 h-4 text-[var(--color-cyan-400)] flex-shrink-0" />
              <span className={`text-sm font-medium ${textPrimary} truncate`}>
                {selectedFile?.name || 'No file selected'}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden p-4">
          {selectedFile ? (
            fileLoading ? (
              <div className={`text-sm ${textSecondary}`}>Loading file...</div>
            ) : (
              <AppTextarea
                value={fileContent}
                onChange={(event) => {
                  setFileContent(event.target.value);
                  setIsFileDirty(true);
                }}
                className={`w-full h-full ${inputBg} border ${inputBorder} rounded p-3 font-mono text-sm ${textPrimary} focus:outline-none focus:border-[var(--color-cyan-400)] resize-none`}
                placeholder="File content will appear here..."
              />
            )
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <FileText className={`w-16 h-16 mx-auto mb-3 ${textSecondary}`} />
                <p className={`${textSecondary}`}>Select a file to edit</p>
              </div>
            </div>
          )}
          {fileError && <div className="mt-3 text-sm text-red-400">{fileError}</div>}
        </div>
      </div>
    </div>
  );
}



