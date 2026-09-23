import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameConfigTab } from './GameConfigTab';

const ServerSshTerminal = lazy(() =>
  import('./ServerSshTerminal').then((m) => ({ default: m.ServerSshTerminal }))
);
import { ConfirmationModal } from './ConfirmationModal';
import { ServerSettingsActionModals } from './serverSettings/ServerSettingsActionModals';
import { FileManagerTab, type UploadQueueItem } from './serverSettings/FileManagerTab';
import { BackupTab } from './serverSettings/BackupTab';
import { ContainerConfigTab } from './serverSettings/ContainerConfigTab';
import { ScheduledTasksTab } from './serverSettings/ScheduledTasksTab';
import { ServerSettingsModalLayout } from './serverSettings/ServerSettingsModalLayout';
import {
  createServerSettingsAccess,
  SETTINGS_TAB_PRIORITY,
  type SettingsTab,
} from './serverSettings/access';
import { type McServerType, getPickerManagedKeys } from '../utils/minecraftCatalog';
import { resolveFileMutationError } from './serverSettings/fileMutationErrors';
import { createSettingsTabButtonClass, SERVER_SETTINGS_THEME } from './serverSettings/theme';
import { useBackupState } from './serverSettings/useBackupState';
import { useBodyScrollLock } from '../src/ui/utils/useBodyScrollLock';
import { useFileManagerState } from './serverSettings/useFileManagerState';
import { apiClient } from '../utils/api';
import { supportsBackupCreate, supportsBackupRename } from '../utils/providerCapabilities';
import { retryWithBackoff, runWithConcurrency } from '../utils/uploadHelpers';
import type { AuthUser } from '../utils/permissions';
import {
  createBackupNowHandler,
  createCopyContentHandler,
  createCopyPathHandler,
  createDeleteBackupHandler,
  createDownloadBackupHandler,
  createExecuteBackupNowHandler,
  createRenameBackupHandler,
  createRestoreBackupHandler,
  createSaveBackupSettingsHandler,
} from './serverSettings/actionHandlers';
import { createFileManagerHandlers } from './serverSettings/fileManagerHandlers';
import {
  envFromServer,
  formatBytes,
  splitFilePath,
} from './serverSettings/utils';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverGame: string;
  serverProvider?: string;
  serverProviderMetadataJson?: string | null;
  serverStatus?: string | null;
  serverId?: number | null;
  currentUser?: AuthUser | null;
  serverPermissions?: string[];
}

export function ServerSettingsModal({
  isOpen,
  onClose,
  serverName,
  serverGame,
  serverProvider,
  serverProviderMetadataJson,
  serverStatus,
  serverId,
  currentUser,
  serverPermissions = [],
}: ServerSettingsModalProps) {
  const isLinuxGSMGame = serverProvider === 'linuxgsm';
  const isExternalProvider = serverProvider === 'external';
  const ovhcloudFamily = (() => {
    if (serverProvider !== 'ovhcloud') return null;
    try {
      return (JSON.parse(serverProviderMetadataJson ?? '{}')?.family as string | undefined) ?? null;
    } catch { return null; }
  })();
  const isHytaleOvhcloud = ovhcloudFamily === 'hytale';
  const isPalworldOvhcloud = ovhcloudFamily === 'palworld';
  const isProjectZomboidOvhcloud = ovhcloudFamily === 'project-zomboid';
  const isRustOvhcloud = ovhcloudFamily === 'rust';
  const isValheimOvhcloud = ovhcloudFamily === 'valheim';
  const isGarrysModOvhcloud = ovhcloudFamily === 'garrys-mod';
  const isCS2Ovhcloud = (() => {
    if (serverProvider !== 'ovhcloud') return false;
    try {
      const meta = JSON.parse(serverProviderMetadataJson ?? '{}');
      return meta?.family === 'counter-strike';
    } catch { return false; }
  })();

  const isMinecraftJavaOvhcloud = (() => {
    if (serverProvider !== 'ovhcloud') return false;
    try {
      const meta = JSON.parse(serverProviderMetadataJson ?? '{}');
      return meta?.family === 'minecraft' && meta?.edition === 'java';
    } catch {
      return false;
    }
  })();

  const isMinecraftBedrockOvhcloud = (() => {
    if (serverProvider !== 'ovhcloud') return false;
    try {
      const meta = JSON.parse(serverProviderMetadataJson ?? '{}');
      return meta?.family === 'minecraft' && meta?.edition === 'bedrock';
    } catch {
      return false;
    }
  })();

  const minecraftServerType = (() => {
    if (!isMinecraftJavaOvhcloud && !isMinecraftBedrockOvhcloud) return null;
    try {
      const meta = JSON.parse(serverProviderMetadataJson ?? '{}');
      return (meta?.serverType as string | null) ?? null;
    } catch {
      return null;
    }
  })();

  const validMcServerTypes: McServerType[] = ['vanilla', 'paper', 'fabric', 'neoforge', 'forge', 'bedrock'];
  const mcServerTypeChecked: McServerType | null = validMcServerTypes.includes(minecraftServerType as McServerType)
    ? (minecraftServerType as McServerType)
    : null;
  const addonKind: 'plugins' | 'mods' = minecraftServerType === 'paper' ? 'plugins' : 'mods';
  const addonsSupportedTypes = ['paper', 'fabric', 'neoforge', 'forge'];
  const minecraftAddonsSupported = addonsSupportedTypes.includes(minecraftServerType ?? '');

  // Project Zomboid's config files are prefixed with PZ_SERVERNAME (the container env,
  // default "servertest"); the backend resolves the same value when reading/writing them.
  // Resolve it here so the "Advanced Configuration" links point at the real files.
  const [pzServerName, setPzServerName] = useState<string>('servertest');
  useEffect(() => {
    if (!isOpen || !isProjectZomboidOvhcloud || !serverId) return;
    let cancelled = false;
    void (async () => {
      try {
        const server = await apiClient.getServer(serverId);
        if (cancelled) return;
        const name = String(envFromServer(server)['PZ_SERVERNAME'] ?? '').trim();
        setPzServerName(name || 'servertest');
      } catch {
        // Keep the default on failure; the links stay usable for the common case.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, isProjectZomboidOvhcloud, serverId]);

  const ovhcloudConfigFiles = useMemo(() => {
    if (isMinecraftJavaOvhcloud) return ['/server.properties'];
    if (isHytaleOvhcloud) return ['/game/Server/config.json'];
    if (isPalworldOvhcloud) return ['/server/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini'];
    if (isProjectZomboidOvhcloud) {
      const base = `/zomboid/Server/${pzServerName}`;
      return [`${base}.ini`, `${base}_SandboxVars.lua`, `${base}_spawnpoints.lua`, `${base}_spawnregions.lua`];
    }
    return undefined;
  }, [isMinecraftJavaOvhcloud, isHytaleOvhcloud, isPalworldOvhcloud, isProjectZomboidOvhcloud, pzServerName]);

  const serverBackupSupported = (() => {
    if (serverProvider === 'linuxgsm') return true;
    if (serverProvider === 'ovhcloud') {
      try {
        const meta = JSON.parse(serverProviderMetadataJson ?? '{}');
        return !!meta?.capabilities?.backup;
      } catch {
        return false;
      }
    }
    return false;
  })();

  const [activeTab, setActiveTab] = useState<SettingsTab>('filemanager');
  const hasUserSelectedTabRef = useRef(false);
  const [containerConfigSaveCount, setContainerConfigSaveCount] = useState(0);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
    icon?: 'warning' | 'danger';
  } | null>(null);

  const requestConfirm = (title: string, message: string, onConfirm: () => Promise<void>, icon?: 'warning' | 'danger') => {
    setConfirmModal({ title, message, onConfirm, icon });
  };

  const {
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
    loadFiles,
    selectedItems,
    setSelectedItems,
    deleteMultiNames,
    setDeleteMultiNames,
  } = useFileManagerState({
    activeTab,
    isOpen,
    serverId,
    containerConfigSaveCount,
  });
  const {
    backupRetention,
    setBackupRetention,
    backups,
    backupsLoading,
    backupsError,
    setBackupsError,
    backupSettingsLoading,
    backupSettingsError,
    setBackupSettingsError,
    stopOnBackup,
    setStopOnBackup,
    backupRetentionDays,
    setBackupRetentionDays,
    backupNowLoading,
    setBackupNowLoading,
    showBackupNowWarningModal,
    setShowBackupNowWarningModal,
    backupSaving,
    setBackupSaving,
    backupDownloadLoading,
    setBackupDownloadLoading,
    backupDeleteLoading,
    setBackupDeleteLoading,
    backupRestoreLoading,
    setBackupRestoreLoading,
    backupRenameLoading,
    setBackupRenameLoading,
    loadBackups,
    loadBackupSettings,
    backupsNotSupported,
  } = useBackupState({
    serverId,
    isActive: isOpen && activeTab === 'backup',
    isLinuxGSMGame,
  });

  const {
    canUseFileManager,
    canEditContainerConfig,
    canManageEnv,
    canWriteFiles,
    canReadBackups,
    canDownloadBackups,
    canCreateBackups: canCreateBackupsPerm,
    canEditBackupSettings,
    canDeleteBackups,
    canRestoreBackups,
    canRenameBackups: canRenameBackupsPerm,
    canWriteScheduledTasks,
    canReadMinecraftSettings,
    canWriteMinecraftSettings,
    canReadMinecraftOperators,
    canWriteMinecraftOperators,
    canReadMinecraftWhitelist,
    canWriteMinecraftWhitelist,
    canReadMinecraftBans,
    canWriteMinecraftBans,
    canReadMinecraftIpBans,
    canWriteMinecraftIpBans,
    canReadMinecraftAddons,
    canWriteMinecraftAddons,
    canUseMinecraft,
    canReadHytaleSettings,
    canWriteHytaleSettings,
    canReadHytaleMods,
    canWriteHytaleMods,
    canUseHytale,
    canReadPalworldSettings,
    canWritePalworldSettings,
    canUsePalworld,
    canReadProjectZomboidSettings,
    canWriteProjectZomboidSettings,
    canReadProjectZomboidMods,
    canWriteProjectZomboidMods,
    canUseProjectZomboid,
    canWipeSoft,
    canWipeHard,
    canWriteCS2Frameworks,
    canReadRustSettings,
    canWriteRustSettings,
    canReadRustMods,
    canWriteRustMods,
    canWriteRustFrameworks,
    canUseRust,
    canReadValheimMods,
    canWriteValheimMods,
    canWriteValheimFrameworks,
    canUseValheim,
    canAccessTab: baseCanAccessTab,
  } = createServerSettingsAccess(currentUser, serverPermissions);

  // Games whose backups are a file pair answer 501 on create and 400 on rename, so the
  // permission alone is not enough to offer either action.
  const canCreateBackups = canCreateBackupsPerm && supportsBackupCreate(serverProviderMetadataJson);
  const canRenameBackups = canRenameBackupsPerm && supportsBackupRename(serverProviderMetadataJson);

  const gameConfigApplicable =
    !isExternalProvider &&
    (isMinecraftJavaOvhcloud ||
      isMinecraftBedrockOvhcloud ||
      isHytaleOvhcloud ||
      isPalworldOvhcloud ||
      isProjectZomboidOvhcloud ||
      isCS2Ovhcloud ||
      isGarrysModOvhcloud ||
      isRustOvhcloud ||
      isValheimOvhcloud ||
      isLinuxGSMGame);

  const gameConfigHasContent =
    ((isMinecraftJavaOvhcloud || isMinecraftBedrockOvhcloud) && canUseMinecraft) ||
    (isHytaleOvhcloud && canUseHytale) ||
    (isPalworldOvhcloud && canUsePalworld) ||
    (isProjectZomboidOvhcloud && canUseProjectZomboid) ||
    (isCS2Ovhcloud && (canEditContainerConfig || canWipeHard)) ||
    (isGarrysModOvhcloud && (canEditContainerConfig || canWipeHard)) ||
    (isRustOvhcloud && canUseRust) ||
    (isValheimOvhcloud && canUseValheim) ||
    (isLinuxGSMGame && canUseFileManager);

  const canUseGameConfigTab = gameConfigApplicable;
  const canAccessTab = (tab: SettingsTab): boolean => {
    if (tab === 'gameconfig') return gameConfigHasContent;
    if (tab === 'backup') return serverBackupSupported && canReadBackups;
    if (tab === 'containerconfig') return true;
    return baseCanAccessTab(tab);
  };

  const openTab = (tab: SettingsTab) => {
    if (!canAccessTab(tab)) return;
    hasUserSelectedTabRef.current = true;
    setActiveTab(tab);
  };
  const defaultTab = SETTINGS_TAB_PRIORITY.find((tab) => canAccessTab(tab)) ?? 'filemanager';
  const effectiveActiveTab = hasUserSelectedTabRef.current ? activeTab : defaultTab;
  useBodyScrollLock(isOpen);

  const getFileMutationErrorMessage = (action: string, error: any): Promise<string> =>
    resolveFileMutationError(action, error, serverId);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== 'filemanager') return;
    if (!serverId) return;
    if (!pendingFilePath) return;

    const { normalized, directory, fileName } = splitFilePath(pendingFilePath);
    if (!fileName) {
      setPendingFilePath(null);
      return;
    }

    if (currentPath !== directory) {
      setCurrentPath(directory);
      return;
    }

    let cancelled = false;

    const openFile = async () => {
      setSelectedFile({ name: fileName, type: 'file' });
      setFileContent('');
      setIsFileDirty(false);
      setFileError(null);
      setFileLoading(true);

      try {
        const content = await apiClient.readServerFile(serverId, normalized, currentRoot);
        if (cancelled) return;
        setFileContent(content ?? '');
      } catch (error: any) {
        if (cancelled) return;
        setFileError(error?.response?.data?.error || error?.message || `Failed to load ${fileName}`);
      } finally {
        if (!cancelled) {
          setFileLoading(false);
          setPendingFilePath(null);
        }
      }
    };

    void openFile();

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, serverId, pendingFilePath, currentPath]);

  const {
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
  } = createFileManagerHandlers({
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
    selectedItems,
    deleteMultiNames,
    setSelectedItems,
    setDeleteMultiNames,
  });

  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  useEffect(() => { uploadQueueRef.current = uploadQueue; }, [uploadQueue]);
  const uploadTasksRef = useRef<Map<string, { file: File; relativePath: string; dirPath: string; root?: string }>>(new Map());

  // A folder upload (e.g. a Minecraft map) is often hundreds of small files.
  // Uploading them all at once saturates the browser's ~6-connections-per-host
  // limit and the server; bound concurrency to a handful at a time instead.
  const UPLOAD_CONCURRENCY = 5;

  const uploadOneQueued = useCallback(
    async (queueId: string): Promise<boolean> => {
      const task = uploadTasksRef.current.get(queueId);
      if (!serverId || !task) return true;
      setUploadQueue((prev) =>
        prev.map((it) => (it.id === queueId ? { ...it, progress: 0, done: false, error: undefined } : it))
      );
      try {
        await retryWithBackoff(() =>
          apiClient.uploadServerFile(serverId, task.dirPath, task.relativePath, task.file, (pct) => {
            setUploadQueue((prev) => prev.map((it) => (it.id === queueId ? { ...it, progress: pct } : it)));
          }, task.root)
        );
        setUploadQueue((prev) =>
          prev.map((it) => (it.id === queueId ? { ...it, progress: 100, done: true, error: undefined } : it))
        );
        return true;
      } catch (error: any) {
        const msg = error?.response?.data?.error || error?.message || 'Upload failed';
        setUploadQueue((prev) => prev.map((it) => (it.id === queueId ? { ...it, error: msg, done: true } : it)));
        return false;
      }
    },
    [serverId]
  );

  const purgeQueueIfAllSucceeded = useCallback(() => {
    setTimeout(() => {
      setUploadQueue((prev) => {
        if (prev.some((it) => it.error)) return prev;
        for (const it of prev) if (it.done && !it.error) uploadTasksRef.current.delete(it.id);
        return prev.filter((it) => !it.done || !!it.error);
      });
    }, 3000);
  }, []);

  const runUploads = useCallback(
    async (queueIds: string[]) => {
      await runWithConcurrency(queueIds, UPLOAD_CONCURRENCY, async (id) => { await uploadOneQueued(id); });
      loadFiles(currentPath);
      purgeQueueIfAllSucceeded();
    },
    [uploadOneQueued, loadFiles, currentPath, purgeQueueIfAllSucceeded]
  );

  const handleUploadFiles = useCallback(
    async (dropped: File[]) => {
      if (!serverId || !canWriteFiles) return;

      const relativePathOf = (file: File): string => {
        const raw = String((file as any).path || (file as any).webkitRelativePath || file.name || '')
          .replace(/\\/g, '/');
        let rel = raw.startsWith('./') ? raw.slice(2) : raw.startsWith('/') ? raw.slice(1) : raw;
        rel = rel.replace(/\/{2,}/g, '/');
        if (!rel || rel.split('/').some((seg) => seg === '..')) return file.name;
        return rel;
      };

      const dirPath = currentPath.replace(/\/$/, '');
      const uploads = dropped.map((file) => ({ file, relativePath: relativePathOf(file) }));

      const runNow = async () => {
        const newItems: UploadQueueItem[] = uploads.map(({ relativePath }) => ({
          id: `${relativePath}-${Date.now()}-${Math.random()}`,
          name: relativePath,
          progress: 0,
          done: false,
        }));
        uploads.forEach(({ file, relativePath }, i) => {
          uploadTasksRef.current.set(newItems[i].id, { file, relativePath, dirPath, root: currentRoot });
        });
        setUploadQueue((prev) => [...prev, ...newItems]);
        await runUploads(newItems.map((it) => it.id));
      };

      const existing = new Set(files.map((f) => f.name));
      const clashes = Array.from(
        new Set(uploads.map((u) => u.relativePath.split('/')[0]).filter((name) => existing.has(name)))
      );

      if (clashes.length > 0) {
        requestConfirm(
          'Replace existing items?',
          `${clashes.length === 1 ? 'This item' : 'These items'} already exist here and will be overwritten: ${clashes.join(', ')}.`,
          runNow,
          'warning'
        );
        return;
      }

      await runNow();
    },
    [serverId, canWriteFiles, currentPath, currentRoot, runUploads, files]
  );

  const handleRetryFailedUploads = useCallback(async () => {
    const failedIds = uploadQueueRef.current.filter((it) => !!it.error).map((it) => it.id);
    if (failedIds.length === 0) return;
    await runUploads(failedIds);
  }, [runUploads]);

  const [extractStatus, setExtractStatus] = useState<
    { name: string; status: 'running' | 'done' | 'failed'; completedFiles: number; error?: string } | null
  >(null);
  const extractingRef = useRef(false);

  const handleExtractFile = useCallback(async (fileName: string) => {
    if (!serverId || !canWriteFiles || extractingRef.current) return;
    extractingRef.current = true;
    const dirPath = currentPath.replace(/\/$/, '');
    const path = `${dirPath}/${fileName}`;
    setExtractStatus({ name: fileName, status: 'running', completedFiles: 0 });
    try {
      const job = await apiClient.extractServerArchive(serverId, path, currentRoot);
      let current = job;
      let pollErrors = 0;
      while (current.status === 'pending' || current.status === 'running') {
        setExtractStatus({ name: fileName, status: 'running', completedFiles: current.completedFiles });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          current = await apiClient.getFileTransfer(serverId, job.id);
          pollErrors = 0;
        } catch (err) {
          if (++pollErrors >= 5) throw err;
        }
      }
      if (current.status === 'completed') {
        setExtractStatus({ name: fileName, status: 'done', completedFiles: current.completedFiles });
        loadFiles(currentPath);
        setTimeout(() => setExtractStatus((s) => (s && s.status === 'done' ? null : s)), 3000);
      } else {
        setExtractStatus({ name: fileName, status: 'failed', completedFiles: current.completedFiles, error: current.errorMessage || 'Extraction failed' });
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Extraction failed';
      setExtractStatus({ name: fileName, status: 'failed', completedFiles: 0, error: msg });
    } finally {
      extractingRef.current = false;
    }
  }, [serverId, canWriteFiles, currentPath, currentRoot, loadFiles]);

  const handleCopyPath = createCopyPathHandler({
    currentPath,
    setCopyPathSuccess,
  });

  const handleCopyContent = createCopyContentHandler({
    fileContent,
    setCopyContentSuccess,
  });

  const handleDownloadBackup = createDownloadBackupHandler({
    canDownloadBackups,
    serverId,
    setBackupDownloadLoading,
    setBackupsError,
  });

  const handleDeleteBackup = createDeleteBackupHandler({
    canDeleteBackups,
    serverId,
    setBackupDeleteLoading,
    setBackupsError,
    loadBackups,
    requestConfirm,
  });

  const executeBackupNow = createExecuteBackupNowHandler({
    canCreateBackups,
    serverId,
    setBackupNowLoading,
    setBackupsError,
    loadBackups,
  });

  const isMinecraftOvhcloud = isMinecraftJavaOvhcloud || isMinecraftBedrockOvhcloud;

  const handleBackupNow = createBackupNowHandler({
    canCreateBackups,
    serverId,
    setShowBackupNowWarningModal,
    executeBackupNow,
    hotBackupOnly: isHytaleOvhcloud,
    skipWarning: isMinecraftOvhcloud,
  });

  const handleSaveBackupSettings = createSaveBackupSettingsHandler({
    canEditBackupSettings,
    serverId,
    backupRetention,
    backupRetentionDays,
    stopOnBackup,
    setBackupSaving,
    setBackupSettingsError,
    loadBackupSettings,
  });

  const handleRestoreBackup = createRestoreBackupHandler({
    canRestoreBackups,
    serverId,
    setBackupRestoreLoading,
    setBackupsError,
    requestConfirm: (title, message, onConfirm) => requestConfirm(title, message, onConfirm, 'danger'),
  });

  const handleRenameBackup = createRenameBackupHandler({
    canRenameBackups,
    serverId,
    setBackupRenameLoading,
    setBackupsError,
    loadBackups,
  });

  useEffect(() => {
    if (isOpen) return;
    hasUserSelectedTabRef.current = false;
    if (activeTab === defaultTab) return;
    setActiveTab(defaultTab);
  }, [isOpen, activeTab, defaultTab]);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasUserSelectedTabRef.current) {
      if (activeTab !== defaultTab) setActiveTab(defaultTab);
      return;
    }
    if (!canAccessTab(activeTab)) setActiveTab(defaultTab);
  }, [isOpen, activeTab, defaultTab]);

  const {
    modalBg,
    sidebarBg,
    contentBg,
    borderColor,
    textPrimary,
    textSecondary,
    hoverBg,
    activeBg,
    inputBg,
    inputBorder,
  } = SERVER_SETTINGS_THEME;
  const tabButtonClass = createSettingsTabButtonClass(
    effectiveActiveTab,
    canAccessTab,
    activeBg,
    textPrimary,
    hoverBg
  );

  return (
    <>
      <ServerSettingsModalLayout
        isOpen={isOpen}
        onClose={onClose}
        serverName={serverName}
        serverProvider={serverProvider}
        modalBg={modalBg}
        sidebarBg={sidebarBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        hoverBg={hoverBg}
        canUseGameConfigTab={canUseGameConfigTab}
        canShowBackupTab={serverBackupSupported}
        canShowScheduledTasksTab={true}
        canAccessTab={canAccessTab}
        openTab={openTab}
        tabButtonClass={tabButtonClass}
        activeTab={effectiveActiveTab}
        fileManagerContent={
          <FileManagerTab
            borderColor={borderColor}
            contentBg={contentBg}
            hoverBg={hoverBg}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            currentPath={currentPath}
            setCurrentPath={setCurrentPath}
            currentRoot={currentRoot}
            availableRoots={availableRoots}
            setCurrentRoot={setCurrentRoot}
            loadFiles={loadFiles}
            handleCreateFolder={handleCreateFolder}
            handleCreateFile={handleCreateFile}
            handleCopyPath={handleCopyPath}
            canWriteFiles={canWriteFiles}
            copyPathSuccess={copyPathSuccess}
            filesLoading={filesLoading}
            filesError={filesError}
            files={files}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            selectedItems={selectedItems}
            renamingFile={renamingFile}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleFileClick={handleFileClick}
            handleFileDoubleClick={handleFileDoubleClick}
            handleDeleteSelected={handleDeleteSelected}
            handleMoveEntries={handleMoveEntries}
            handleRenameConfirm={handleRenameConfirm}
            handleRenameCancel={handleRenameCancel}
            handleRenameFile={handleRenameFile}
            handleDeleteFile={handleDeleteFile}
            handleDownloadPath={handleDownloadPath}
            handleDownloadSelected={handleDownloadSelected}
            fileLoading={fileLoading}
            fileContent={fileContent}
            setFileContent={setFileContent}
            isFileDirty={isFileDirty}
            setIsFileDirty={setIsFileDirty}
            fileError={fileError}
            savingFile={savingFile}
            handleSaveFile={handleSaveFile}
            handleDownloadFile={handleDownloadFile}
            handleCopyContent={handleCopyContent}
            copyContentSuccess={copyContentSuccess}
            onUploadFiles={handleUploadFiles}
            uploadQueue={uploadQueue}
            onRetryFailedUploads={handleRetryFailedUploads}
            onExtractFile={handleExtractFile}
            extractStatus={extractStatus}
          />
        }
        backupContent={
          <BackupTab
            contentBg={contentBg}
            borderColor={borderColor}
            hoverBg={hoverBg}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            serverName={serverName}
            handleBackupNow={handleBackupNow}
            canCreateBackups={canCreateBackups}
            backupNowLoading={backupNowLoading}
            backupSettingsError={backupSettingsError}
            backupRetention={backupRetention}
            setBackupRetention={setBackupRetention}
            backupRetentionDays={backupRetentionDays}
            setBackupRetentionDays={setBackupRetentionDays}
            stopOnBackup={stopOnBackup}
            setStopOnBackup={setStopOnBackup}
            handleSaveBackupSettings={handleSaveBackupSettings}
            canEditBackupSettings={canEditBackupSettings}
            backupSaving={backupSaving}
            backupSettingsLoading={backupSettingsLoading}
            loadBackups={loadBackups}
            backupsError={backupsError}
            backupsLoading={backupsLoading}
            backups={backups}
            formatBytes={formatBytes}
            handleDownloadBackup={handleDownloadBackup}
            canDownloadBackups={canDownloadBackups}
            backupDownloadLoading={backupDownloadLoading}
            handleDeleteBackup={handleDeleteBackup}
            canDeleteBackups={canDeleteBackups}
            backupDeleteLoading={backupDeleteLoading}
            handleRestoreBackup={handleRestoreBackup}
            canRestoreBackups={canRestoreBackups}
            backupRestoreLoading={backupRestoreLoading}
            handleRenameBackup={handleRenameBackup}
            canRenameBackups={canRenameBackups}
            backupRenameLoading={backupRenameLoading}
            isLinuxGSMGame={isLinuxGSMGame}
            backupsNotSupported={backupsNotSupported}
          />
        }
        gameConfigContent={
          <GameConfigTab
            serverGame={serverGame}
            serverProvider={serverProvider}
            serverId={serverId}
            canReadFileManager={canUseFileManager}
            canWriteFileManager={canWriteFiles}
            onOpenFileManagerPath={(path) => { hasUserSelectedTabRef.current = true; handleOpenFileManagerAtPath(path); }}
            ovhcloudConfigFiles={ovhcloudConfigFiles}
            minecraftProps={(isMinecraftJavaOvhcloud || isMinecraftBedrockOvhcloud) && serverId && canUseMinecraft ? {
              serverId,
              serverStatus,
              canReadSettings: canReadMinecraftSettings,
              canWriteSettings: canWriteMinecraftSettings,
              canReadOperators: isMinecraftJavaOvhcloud && canReadMinecraftOperators,
              canWriteOperators: isMinecraftJavaOvhcloud && canWriteMinecraftOperators,
              canReadWhitelist: isMinecraftJavaOvhcloud && canReadMinecraftWhitelist,
              canWriteWhitelist: isMinecraftJavaOvhcloud && canWriteMinecraftWhitelist,
              canReadBans: isMinecraftJavaOvhcloud && canReadMinecraftBans,
              canWriteBans: isMinecraftJavaOvhcloud && canWriteMinecraftBans,
              canReadIpBans: isMinecraftJavaOvhcloud && canReadMinecraftIpBans,
              canWriteIpBans: isMinecraftJavaOvhcloud && canWriteMinecraftIpBans,
              canReadAddons: isMinecraftJavaOvhcloud && minecraftAddonsSupported && canReadMinecraftAddons,
              canWriteAddons: isMinecraftJavaOvhcloud && minecraftAddonsSupported && canWriteMinecraftAddons,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              addonKind,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
              mcServerType: mcServerTypeChecked,
              canEditVersion: canEditContainerConfig,
              canManageEnv,
              containerConfigSaveCount,
            } : null}
            hytaleProps={isHytaleOvhcloud && serverId && canUseHytale ? {
              serverId,
              serverStatus,
              canReadSettings: canReadHytaleSettings,
              canWriteSettings: canWriteHytaleSettings,
              canReadMods: canReadHytaleMods,
              canWriteMods: canWriteHytaleMods,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
            palworldProps={isPalworldOvhcloud && serverId && canUsePalworld ? {
              serverId,
              serverStatus,
              canReadSettings: canReadPalworldSettings,
              canWriteSettings: canWritePalworldSettings,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              canManageEnv,
              canEditContainerConfig,
              containerConfigSaveCount,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
            projectZomboidProps={isProjectZomboidOvhcloud && serverId && canUseProjectZomboid ? {
              serverId,
              serverStatus,
              canReadSettings: canReadProjectZomboidSettings,
              canWriteSettings: canWriteProjectZomboidSettings,
              canReadMods: canReadProjectZomboidMods,
              canWriteMods: canWriteProjectZomboidMods,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              canManageEnv,
              canEditContainerConfig,
              containerConfigSaveCount,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
            cs2Props={isCS2Ovhcloud && serverId && (canEditContainerConfig || canWipeHard) ? {
              serverId,
              serverStatus,
              canEdit: canEditContainerConfig,
              canWriteFrameworks: canWriteCS2Frameworks,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              canManageEnv,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
              inputBg,
              inputBorder,
            } : null}
            garrysModProps={isGarrysModOvhcloud && serverId && (canEditContainerConfig || canWipeHard) ? {
              serverId,
              serverStatus,
              canEdit: canEditContainerConfig,
              canWipeHard,
              onReinstallStarted: onClose,
              canManageEnv,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
            rustProps={isRustOvhcloud && serverId && canUseRust ? {
              serverId,
              serverStatus,
              canReadSettings: canReadRustSettings,
              canWriteSettings: canWriteRustSettings,
              canReadMods: canReadRustMods,
              canWriteMods: canWriteRustMods,
              canWriteFrameworks: canWriteRustFrameworks,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              canManageEnv,
              canEditContainerConfig,
              containerConfigSaveCount,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
            valheimProps={isValheimOvhcloud && serverId && canUseValheim ? {
              serverId,
              serverStatus,
              canReadMods: canReadValheimMods,
              canWriteMods: canWriteValheimMods,
              canWriteFrameworks: canWriteValheimFrameworks,
              canWipeSoft,
              canWipeHard,
              onReinstallStarted: onClose,
              canManageEnv,
              canEditContainerConfig,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
          />
        }
        terminalContent={
          <div className="h-full overflow-hidden p-3 sm:p-4 md:p-6">
            <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading terminal…</div>}>
              <ServerSshTerminal serverId={serverId} serverName={serverName} serverStatus={serverStatus} />
            </Suspense>
          </div>
        }
        scheduledTasksContent={
          <ScheduledTasksTab
            serverId={serverId}
            serverBackupSupported={serverBackupSupported}
            serverProvider={serverProvider}
            serverGame={serverGame}
            canRead={canAccessTab('scheduledtasks')}
            canWrite={canWriteScheduledTasks}
            contentBg={contentBg}
            borderColor={borderColor}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            hoverBg={hoverBg}
            inputBg={inputBg}
            inputBorder={inputBorder}
          />
        }
        containerConfigContent={
          <ContainerConfigTab
            serverId={serverId}
            serverStatus={serverStatus}
            borderColor={borderColor}
            contentBg={contentBg}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            hoverBg={hoverBg}
            canEdit={canEditContainerConfig}
            canManageEnv={canManageEnv}
            pickerManagedKeys={mcServerTypeChecked ? getPickerManagedKeys(mcServerTypeChecked) : []}
            onSaved={() => setContainerConfigSaveCount(c => c + 1)}
          />
        }
      />

      {confirmModal && (
        <ConfirmationModal
          isOpen={true}
          title={confirmModal.title}
          message={confirmModal.message}
          icon={confirmModal.icon ?? 'warning'}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
          confirmText="Confirm"
        />
      )}

      <ServerSettingsActionModals
        modalBg={modalBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        hoverBg={hoverBg}
        inputBg={inputBg}
        inputBorder={inputBorder}
        showCreateEntryModal={showCreateEntryModal}
        createEntryType={createEntryType}
        createEntryName={createEntryName}
        createEntryError={createEntryError}
        createEntryLoading={createEntryLoading}
        setCreateEntryName={setCreateEntryName}
        clearCreateEntryError={() => setCreateEntryError(null)}
        closeCreateEntryModal={() => setShowCreateEntryModal(false)}
        submitCreateEntry={submitCreateEntry}
        showDeleteEntryModal={showDeleteEntryModal}
        deleteEntryTarget={deleteEntryTarget}
        deleteMultiNames={deleteMultiNames}
        deleteEntryLoading={deleteEntryLoading}
        closeDeleteEntryModal={() => {
          setShowDeleteEntryModal(false);
          setDeleteEntryTarget(null);
          setDeleteMultiNames(null);
        }}
        confirmDeleteEntry={confirmDeleteEntry}
        showBackupNowWarningModal={showBackupNowWarningModal}
        backupNowLoading={backupNowLoading}
        stopOnBackup={stopOnBackup}
        hotBackupOnly={isHytaleOvhcloud}
        closeBackupWarningModal={() => {
          if (backupNowLoading) return;
          setShowBackupNowWarningModal(false);
        }}
        executeBackupNow={executeBackupNow}
      />

    </>
  );
}

