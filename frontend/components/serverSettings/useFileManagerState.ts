import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../utils/api';
import { formatBytes } from './utils';
import type { FileItem } from './fileManagerHandlers';

export interface FileRoot {
  key: string;
  containerPath: string;
}

// Last File Manager position (root + path) per server, so reopening the File
// Manager later lands back where the user left off instead of resetting to the
// root. Persisted in localStorage to survive full page reloads.
const FILE_MANAGER_POSITIONS_KEY = 'gp_filemanager_positions';
const DEFAULT_POSITION = { root: 'data', path: '/' };

interface FileManagerPosition {
  root: string;
  path: string;
}

function readSavedPositions(): Record<string, FileManagerPosition> {
  try {
    const raw = localStorage.getItem(FILE_MANAGER_POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, FileManagerPosition>) : {};
  } catch {
    return {};
  }
}

function readSavedPosition(serverId?: number | null): FileManagerPosition {
  if (serverId == null) return { ...DEFAULT_POSITION };
  const saved = readSavedPositions()[String(serverId)];
  if (saved && typeof saved.root === 'string' && typeof saved.path === 'string') {
    return { root: saved.root, path: saved.path };
  }
  return { ...DEFAULT_POSITION };
}

function writeSavedPosition(serverId: number, position: FileManagerPosition): void {
  try {
    const positions = readSavedPositions();
    positions[String(serverId)] = position;
    localStorage.setItem(FILE_MANAGER_POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    // Ignore persistence failures (private mode, quota exceeded, …).
  }
}

interface UseFileManagerStateArgs {
  activeTab: string;
  isOpen: boolean;
  serverId?: number | null;
  containerConfigSaveCount?: number;
}

export function useFileManagerState({ activeTab, isOpen, serverId, containerConfigSaveCount = 0 }: UseFileManagerStateArgs) {
  const [currentPath, setCurrentPath] = useState('/');
  const [currentRoot, setCurrentRoot] = useState('data');
  const [availableRoots, setAvailableRoots] = useState<FileRoot[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isFileDirty, setIsFileDirty] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copyPathSuccess, setCopyPathSuccess] = useState(false);
  const [copyContentSuccess, setCopyContentSuccess] = useState(false);
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
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [deleteMultiNames, setDeleteMultiNames] = useState<string[] | null>(null);

  // When restoring a saved position whose root differs from the current one,
  // changing the root triggers the path-reset effect below. This ref tells that
  // effect to land on the saved path instead of resetting to '/'.
  const pendingRestoreRef = useRef<FileManagerPosition | null>(null);

  const loadFiles = async (path: string) => {
    if (!serverId) return;
    setFilesLoading(true);
    setFilesError(null);
    try {
      const result = await apiClient.listServerFiles(serverId, path, currentRoot);
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
    // Restore the last position for this server instead of resetting to root.
    const saved = readSavedPosition(serverId);
    if (saved.root === currentRoot) {
      pendingRestoreRef.current = null;
    } else {
      // Root differs → setCurrentRoot triggers the path-reset effect; flag the
      // restore so it lands on the saved path rather than '/'.
      pendingRestoreRef.current = saved;
      setCurrentRoot(saved.root);
    }
    setCurrentPath(saved.path);
    setSelectedFile(null);
    setFileContent('');
    setIsFileDirty(false);
    setPendingFilePath(null);
    setFilesError(null);
    setFileError(null);
    setSelectedItems([]);
    setDeleteMultiNames(null);
    // currentRoot is read to decide whether a root change is needed, but must
    // not retrigger this effect (that would re-restore mid-navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, serverId]);

  useEffect(() => {
    if (!isOpen || !serverId) return;
    apiClient.listServerFileRoots(serverId).then((res) => {
      setAvailableRoots(res.roots);
      if (res.roots.length > 0 && !res.roots.find((r) => r.key === currentRoot)) {
        setCurrentRoot(res.roots[0].key);
      }
    }).catch(() => {
      setAvailableRoots([]);
    });
  }, [isOpen, serverId, containerConfigSaveCount]);

  useEffect(() => {
    const pending = pendingRestoreRef.current;
    // A restore targeting this root keeps the saved path; any other root change
    // (user switching roots) resets to '/'.
    const nextPath = pending && pending.root === currentRoot ? pending.path : '/';
    pendingRestoreRef.current = null;
    setCurrentPath(nextPath);
    setSelectedFile(null);
    setFileContent('');
    setIsFileDirty(false);
    setSelectedItems([]);
  }, [currentRoot]);

  useEffect(() => {
    setSelectedItems([]);
  }, [currentPath]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== 'filemanager') return;
    if (!serverId) return;
    void loadFiles(currentPath);
  }, [isOpen, activeTab, currentPath, currentRoot, serverId]);

  // Remember the current position per server so it can be restored on reopen.
  useEffect(() => {
    if (!isOpen || serverId == null) return;
    writeSavedPosition(serverId, { root: currentRoot, path: currentPath });
  }, [isOpen, serverId, currentRoot, currentPath]);

  return {
    currentPath,
    setCurrentPath,
    currentRoot,
    setCurrentRoot,
    availableRoots,
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
    selectedItems,
    setSelectedItems,
    deleteMultiNames,
    setDeleteMultiNames,
  };
}
