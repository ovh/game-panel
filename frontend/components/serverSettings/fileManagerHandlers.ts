import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { apiClient } from '../../utils/api';
import { isSymlinkEntry, joinPath, splitFilePath } from './utils';
import type { SettingsTab } from './access';

export interface FileItem {
  name: string;
  type: 'file' | 'folder' | 'symlink';
  size?: string;
  modified?: string;
}

interface CreateFileManagerHandlersDeps {
  renamingFile: string | null;
  currentPath: string;
  currentRoot: string;
  serverId?: number | null;
  selectedFile: FileItem | null;
  fileContent: string;
  canWriteFiles: boolean;
  canUseFileManager: boolean;
  createEntryType: 'file' | 'folder';
  createEntryName: string;
  renameValue: string;
  deleteEntryTarget: FileItem | null;
  selectedItems: string[];
  deleteMultiNames: string[] | null;
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
  setActiveTab: Dispatch<SetStateAction<SettingsTab>>;
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
  setSelectedItems: Dispatch<SetStateAction<string[]>>;
  setDeleteMultiNames: Dispatch<SetStateAction<string[] | null>>;
}

export const createFileManagerHandlers = (deps: CreateFileManagerHandlersDeps) => {
  const {
    renamingFile,
    currentPath,
    currentRoot,
    serverId,
    selectedFile,
    fileContent,
    canWriteFiles,
    canUseFileManager,
    createEntryType,
    createEntryName,
    renameValue,
    deleteEntryTarget,
    selectedItems,
    deleteMultiNames,
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
    setSelectedItems,
    setDeleteMultiNames,
  } = deps;

  // Checkbox click: toggle selection only (never navigates)
  const handleFileClick = (file: FileItem) => {
    if (renamingFile || file.name === '..') return;
    setSelectedItems((prev) =>
      prev.includes(file.name) ? prev.filter((n) => n !== file.name) : [...prev, file.name]
    );
  };

  // Double click: navigate into folder or open file in editor
  const handleFileDoubleClick = async (file: FileItem) => {
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
        const content = await apiClient.readServerFile(serverId, filePath, currentRoot);
        setFileContent(content ?? '');
      } catch (error: any) {
        setFileError(error?.response?.data?.error || error?.message || 'Failed to load file');
      } finally {
        setFileLoading(false);
      }
    }
  };

  const handleDeleteSelected = () => {
    if (!canWriteFiles || selectedItems.length === 0) return;
    setDeleteMultiNames([...selectedItems]);
    setShowDeleteEntryModal(true);
  };

  // Move one or more entries from the current directory into targetDir (a sibling/child folder or
  // the parent). Backed by the rename route, which uses fs.rename and moves whole subtrees.
  const handleMoveEntries = async (names: string[], targetDir: string) => {
    if (!canWriteFiles || !serverId) return;
    const movable = names.filter((name) => name && name !== '..');
    if (movable.length === 0) return;
    setFilesError(null);
    setFileError(null);
    try {
      for (const name of movable) {
        const from = joinPath(currentPath, name);
        const to = joinPath(targetDir, name);
        if (from === to) continue;
        await apiClient.renameServerPath(serverId, from, to, currentRoot);
      }
      await loadFiles(currentPath);
      setSelectedItems((prev) => prev.filter((n) => !movable.includes(n)));
    } catch (error: any) {
      const message = await getFileMutationErrorMessage('move file or folder', error);
      setFilesError(message);
      setFileError(message);
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
      await apiClient.updateServerFile(serverId, filePath, fileContent, currentRoot);
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
        await apiClient.renameServerPath(serverId, from, to, currentRoot);
        await loadFiles(currentPath);
        if (selectedFile?.name === renamingFile) {
          setSelectedFile({ ...selectedFile, name: renameValue.trim() });
        }
        setSelectedItems((prev) =>
          prev.map((n) => (n === renamingFile ? renameValue.trim() : n))
        );
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
    if (!serverId) return;
    setDeleteEntryLoading(true);
    setFilesError(null);
    setFileError(null);
    try {
      if (deleteMultiNames && deleteMultiNames.length > 0) {
        const paths = deleteMultiNames.map((name) => joinPath(currentPath, name));
        await apiClient.deleteServerPaths(serverId, paths, currentRoot);
        await loadFiles(currentPath);
        if (selectedFile && deleteMultiNames.includes(selectedFile.name)) {
          setSelectedFile(null);
          setFileContent('');
          setIsFileDirty(false);
        }
        setSelectedItems((prev) => prev.filter((n) => !deleteMultiNames.includes(n)));
      } else if (deleteEntryTarget) {
        const path = joinPath(currentPath, deleteEntryTarget.name);
        await apiClient.deleteServerPaths(serverId, [path], currentRoot);
        await loadFiles(currentPath);
        if (selectedFile?.name === deleteEntryTarget.name) {
          setSelectedFile(null);
          setFileContent('');
          setIsFileDirty(false);
        }
        setSelectedItems((prev) => prev.filter((n) => n !== deleteEntryTarget.name));
      }
      setShowDeleteEntryModal(false);
      setDeleteEntryTarget(null);
      setDeleteMultiNames(null);
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
        await apiClient.createServerDirectory(serverId, currentPath, name, currentRoot);
      } else {
        await apiClient.createServerFile(serverId, currentPath, name, '', currentRoot);
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
      const { blob, filename } = await apiClient.downloadServerFile(serverId, filePath, currentRoot);
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

  const handleDownloadPath = async (file: FileItem, event: MouseEvent) => {
    event.stopPropagation();
    if (!serverId) return;
    if (isSymlinkEntry(file)) {
      setFilesError('Symbolic links cannot be downloaded from the panel.');
      return;
    }
    try {
      const path = joinPath(currentPath, file.name);
      const { blob, filename } = await apiClient.downloadServerPath(serverId, path, currentRoot);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setFilesError(error?.response?.data?.error || error?.message || 'Failed to download');
    }
  };

  const handleDownloadSelected = async () => {
    if (!serverId || selectedItems.length === 0) return;
    for (let i = 0; i < selectedItems.length; i++) {
      const name = selectedItems[i];
      try {
        const path = joinPath(currentPath, name);
        const { blob, filename } = await apiClient.downloadServerPath(serverId, path, currentRoot);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        if (i < selectedItems.length - 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 400));
        }
      } catch {
        // continue with remaining items
      }
    }
  };

  return {
    handleFileClick,
    handleFileDoubleClick,
    handleDeleteSelected,
    handleMoveEntries,
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
    handleDownloadPath,
    handleDownloadSelected,
  };
};
