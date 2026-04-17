import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { apiClient } from '../../utils/api';
import { isSymlinkEntry, joinPath, splitFilePath } from './utils';

export interface FileItem {
  name: string;
  type: 'file' | 'folder' | 'symlink';
  size?: string;
  modified?: string;
}

interface CreateFileManagerHandlersDeps {
  renamingFile: string | null;
  currentPath: string;
  serverId?: number | null;
  selectedFile: FileItem | null;
  fileContent: string;
  canWriteFiles: boolean;
  canUseFileManager: boolean;
  createEntryType: 'file' | 'folder';
  createEntryName: string;
  renameValue: string;
  deleteEntryTarget: FileItem | null;
  loadFiles: (path: string) => Promise<void>;
  getFileMutationErrorMessage: (action: string, error: any) => Promise<string>;
  setCurrentPath: Dispatch<SetStateAction<string>>;
  setSelectedFile: Dispatch<SetStateAction<FileItem | null>>;
  setFileContent: Dispatch<SetStateAction<string>>;
  setIsFileDirty: Dispatch<SetStateAction<boolean>>;
  setFileError: Dispatch<SetStateAction<string | null>>;
  setFileLoading: Dispatch<SetStateAction<boolean>>;
  setSavingFile: Dispatch<SetStateAction<boolean>>;
  setFilesError: Dispatch<SetStateAction<string | null>>;
  setPendingFilePath: Dispatch<SetStateAction<string | null>>;
  setActiveTab: Dispatch<SetStateAction<'filemanager' | 'backup' | 'sftp' | 'gameconfig' | 'terminal'>>;
  setRenamingFile: Dispatch<SetStateAction<string | null>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  setDeleteEntryTarget: Dispatch<SetStateAction<FileItem | null>>;
  setShowDeleteEntryModal: Dispatch<SetStateAction<boolean>>;
  setDeleteEntryLoading: Dispatch<SetStateAction<boolean>>;
  setCreateEntryType: Dispatch<SetStateAction<'file' | 'folder'>>;
  setCreateEntryName: Dispatch<SetStateAction<string>>;
  setCreateEntryError: Dispatch<SetStateAction<string | null>>;
  setShowCreateEntryModal: Dispatch<SetStateAction<boolean>>;
  setCreateEntryLoading: Dispatch<SetStateAction<boolean>>;
}

export const createFileManagerHandlers = (deps: CreateFileManagerHandlersDeps) => {
  const {
    renamingFile,
    currentPath,
    serverId,
    selectedFile,
    fileContent,
    canWriteFiles,
    canUseFileManager,
    createEntryType,
    createEntryName,
    renameValue,
    deleteEntryTarget,
    loadFiles,
    getFileMutationErrorMessage,
    setCurrentPath,
    setSelectedFile,
    setFileContent,
    setIsFileDirty,
    setFileError,
    setFileLoading,
    setSavingFile,
    setFilesError,
    setPendingFilePath,
    setActiveTab,
    setRenamingFile,
    setRenameValue,
    setDeleteEntryTarget,
    setShowDeleteEntryModal,
    setDeleteEntryLoading,
    setCreateEntryType,
    setCreateEntryName,
    setCreateEntryError,
    setShowCreateEntryModal,
    setCreateEntryLoading,
  } = deps;

  const handleFileClick = async (file: FileItem) => {
    if (renamingFile) return;

    if (file.type === 'folder') {
      if (file.name === '..') {
        const pathParts = currentPath.split('/').filter((p) => p);
        pathParts.pop();
        setCurrentPath('/' + pathParts.join('/'));
      } else {
        setCurrentPath(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`);
      }
      setSelectedFile(null);
      setFileContent('');
      setIsFileDirty(false);
    } else {
      if (isSymlinkEntry(file)) {
        setSelectedFile(null);
        setFileContent('');
        setIsFileDirty(false);
        setFileError('Symbolic links cannot be opened from the panel.');
        return;
      }
      if (!serverId) return;
      setSelectedFile(file);
      setFileContent('');
      setIsFileDirty(false);
      setFileError(null);
      setFileLoading(true);
      try {
        const filePath = joinPath(currentPath, file.name);
        const content = await apiClient.readServerFile(serverId, filePath);
        setFileContent(content ?? '');
      } catch (error: any) {
        setFileError(error?.response?.data?.error || error?.message || 'Failed to load file');
      } finally {
        setFileLoading(false);
      }
    }
  };

  const handleSaveFile = async () => {
    if (!canWriteFiles) return;
    if (!serverId || !selectedFile) return;
    setSavingFile(true);
    setFileError(null);
    setFilesError(null);
    try {
      const filePath = joinPath(currentPath, selectedFile.name);
      await apiClient.updateServerFile(serverId, filePath, fileContent);
      setIsFileDirty(false);
      await loadFiles(currentPath);
    } catch (error: any) {
      const message = await getFileMutationErrorMessage('save file', error);
      setFileError(message);
      setFilesError(message);
    } finally {
      setSavingFile(false);
    }
  };

  const handleOpenFileManagerAtPath = (path: string) => {
    if (!canUseFileManager) return;
    const { normalized, directory } = splitFilePath(path);
    setPendingFilePath(normalized);
    setActiveTab('filemanager');
    setSelectedFile(null);
    setFileContent('');
    setIsFileDirty(false);
    setFileError(null);
    setFilesError(null);
    if (currentPath !== directory) {
      setCurrentPath(directory);
    }
  };

  const handleRenameFile = (file: FileItem, event: MouseEvent) => {
    event.stopPropagation();
    if (file.name === '..') return;
    if (isSymlinkEntry(file)) {
      setFilesError('Symbolic links cannot be renamed from the panel.');
      return;
    }
    setRenamingFile(file.name);
    setRenameValue(file.name);
  };

  const handleRenameConfirm = async (event: MouseEvent) => {
    if (!canWriteFiles) return;
    event.stopPropagation();
    if (!serverId) return;
    if (renamingFile && renameValue.trim()) {
      setFilesError(null);
      setFileError(null);
      try {
        const from = joinPath(currentPath, renamingFile);
        const to = joinPath(currentPath, renameValue.trim());
        await apiClient.renameServerPath(serverId, from, to);
        await loadFiles(currentPath);
        if (selectedFile?.name === renamingFile) {
          setSelectedFile({ ...selectedFile, name: renameValue.trim() });
        }
      } catch (error: any) {
        const message = await getFileMutationErrorMessage('rename file or folder', error);
        setFilesError(message);
        setFileError(message);
      }
    }
    setRenamingFile(null);
    setRenameValue('');
  };

  const handleRenameCancel = (event: MouseEvent) => {
    event.stopPropagation();
    setRenamingFile(null);
    setRenameValue('');
  };

  const handleDeleteFile = async (file: FileItem, event: MouseEvent) => {
    if (!canWriteFiles) return;
    event.stopPropagation();
    if (file.name === '..') return;
    if (!serverId) return;
    if (isSymlinkEntry(file)) {
      setFilesError('Symbolic links cannot be deleted from the panel.');
      return;
    }
    setDeleteEntryTarget(file);
    setShowDeleteEntryModal(true);
  };

  const confirmDeleteEntry = async () => {
    if (!canWriteFiles) return;
    if (!serverId || !deleteEntryTarget) return;
    setDeleteEntryLoading(true);
    setFilesError(null);
    setFileError(null);
    try {
      const path = joinPath(currentPath, deleteEntryTarget.name);
      await apiClient.deleteServerPaths(serverId, [path]);
      await loadFiles(currentPath);
      if (selectedFile?.name === deleteEntryTarget.name) {
        setSelectedFile(null);
        setFileContent('');
        setIsFileDirty(false);
      }
      setShowDeleteEntryModal(false);
      setDeleteEntryTarget(null);
    } catch (error: any) {
      const message = await getFileMutationErrorMessage('delete file or folder', error);
      setFilesError(message);
      setFileError(message);
    } finally {
      setDeleteEntryLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!canWriteFiles) return;
    setCreateEntryType('folder');
    setCreateEntryName('');
    setCreateEntryError(null);
    setShowCreateEntryModal(true);
  };

  const handleCreateFile = async () => {
    if (!canWriteFiles) return;
    setCreateEntryType('file');
    setCreateEntryName('');
    setCreateEntryError(null);
    setShowCreateEntryModal(true);
  };

  const submitCreateEntry = async () => {
    if (!canWriteFiles) return;
    if (!serverId) return;
    const name = createEntryName.trim();
    if (!name) {
      setCreateEntryError('Name is required.');
      return;
    }
    if (name === '.' || name === '..') {
      setCreateEntryError('This name is not allowed.');
      return;
    }
    setCreateEntryLoading(true);
    setFilesError(null);
    setFileError(null);
    setCreateEntryError(null);
    try {
      if (createEntryType === 'folder') {
        await apiClient.createServerDirectory(serverId, currentPath, name);
      } else {
        await apiClient.createServerFile(serverId, currentPath, name, '');
      }
      await loadFiles(currentPath);
      setShowCreateEntryModal(false);
      setCreateEntryName('');
    } catch (error: any) {
      const message = await getFileMutationErrorMessage(
        createEntryType === 'folder' ? 'create folder' : 'create file',
        error
      );
      setCreateEntryError(message);
    } finally {
      setCreateEntryLoading(false);
    }
  };

  const handleDownloadFile = async () => {
    if (!serverId || !selectedFile) return;
    if (isSymlinkEntry(selectedFile)) {
      setFileError('Symbolic links cannot be downloaded from the panel.');
      return;
    }
    try {
      const filePath = joinPath(currentPath, selectedFile.name);
      const { blob, filename } = await apiClient.downloadServerFile(serverId, filePath);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || selectedFile.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setFileError(error?.response?.data?.error || error?.message || 'Failed to download file');
    }
  };

  return {
    handleFileClick,
    handleSaveFile,
    handleOpenFileManagerAtPath,
    handleRenameFile,
    handleRenameConfirm,
    handleRenameCancel,
    handleDeleteFile,
    confirmDeleteEntry,
    handleCreateFolder,
    handleCreateFile,
    submitCreateEntry,
    handleDownloadFile,
  };
};
