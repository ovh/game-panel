import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import { formatBytes } from './utils';
import type { FileItem } from './fileManagerHandlers';

interface UseFileManagerStateArgs {
  activeTab: string;
  isOpen: boolean;
  serverId?: number | null;
}

export function useFileManagerState({ activeTab, isOpen, serverId }: UseFileManagerStateArgs) {
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isFileDirty, setIsFileDirty] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copyPathSuccess, setCopyPathSuccess] = useState(false);
  const [copyContentSuccess, setCopyContentSuccess] = useState(false);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [showCreateEntryModal, setShowCreateEntryModal] = useState(false);
  const [createEntryType, setCreateEntryType] = useState<'file' | 'folder'>('folder');
  const [createEntryName, setCreateEntryName] = useState('');
  const [createEntryError, setCreateEntryError] = useState<string | null>(null);
  const [createEntryLoading, setCreateEntryLoading] = useState(false);
  const [showDeleteEntryModal, setShowDeleteEntryModal] = useState(false);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<FileItem | null>(null);
  const [deleteEntryLoading, setDeleteEntryLoading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([{ name: '..', type: 'folder' }]);

  const loadFiles = async (path: string) => {
    if (!serverId) return;
    setFilesLoading(true);
    setFilesError(null);
    try {
      const result = await apiClient.listServerFiles(serverId, path);
      const entries: FileItem[] = result.entries.map((entry) => {
        const isDir = entry.type === 'dir';
        const isSymlink = entry.type === 'symlink';
        return {
          name: entry.name,
          type: isDir ? 'folder' : isSymlink ? 'symlink' : 'file',
          size: isDir ? undefined : formatBytes(entry.size),
          modified: entry.modifiedAt,
        };
      });

      const withParent =
        result.path !== '/' ? [{ name: '..', type: 'folder' as const }, ...entries] : entries;
      setFiles(withParent);
    } catch (error: any) {
      setFilesError(error?.response?.data?.error || error?.message || 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPath('/');
    setSelectedFile(null);
    setFileContent('');
    setIsFileDirty(false);
    setIsEditorExpanded(false);
    setPendingFilePath(null);
    setFilesError(null);
    setFileError(null);
  }, [isOpen]);

  useEffect(() => {
    if (activeTab !== 'filemanager' || !selectedFile) {
      setIsEditorExpanded(false);
    }
  }, [activeTab, selectedFile]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== 'filemanager') return;
    if (!serverId) return;
    void loadFiles(currentPath);
  }, [isOpen, activeTab, currentPath, serverId]);

  return {
    currentPath,
    setCurrentPath,
    selectedFile,
    setSelectedFile,
    fileContent,
    setFileContent,
    isFileDirty,
    setIsFileDirty,
    pendingFilePath,
    setPendingFilePath,
    renamingFile,
    setRenamingFile,
    renameValue,
    setRenameValue,
    copyPathSuccess,
    setCopyPathSuccess,
    copyContentSuccess,
    setCopyContentSuccess,
    isEditorExpanded,
    setIsEditorExpanded,
    filesLoading,
    fileLoading,
    setFileLoading,
    fileError,
    setFileError,
    filesError,
    setFilesError,
    savingFile,
    setSavingFile,
    showCreateEntryModal,
    setShowCreateEntryModal,
    createEntryType,
    setCreateEntryType,
    createEntryName,
    setCreateEntryName,
    createEntryError,
    setCreateEntryError,
    createEntryLoading,
    setCreateEntryLoading,
    showDeleteEntryModal,
    setShowDeleteEntryModal,
    deleteEntryTarget,
    setDeleteEntryTarget,
    deleteEntryLoading,
    setDeleteEntryLoading,
    files,
    setFiles,
    loadFiles,
  };
}
