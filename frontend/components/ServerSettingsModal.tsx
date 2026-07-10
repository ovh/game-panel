import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameConfigTab } from './GameConfigTab';

// Lazily loaded so the xterm terminal emulator stays off initial load until the Terminal tab opens.
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
  // OVHcloud games are identified by `providerMetadata.family` (minecraft / counter-strike /
  // hytale / palworld) rather than catalogId, so they stay wired identically across renames.
  const ovhcloudFamily = (() => {
    if (serverProvider !== 'ovhcloud') return null;
    try {
      return (JSON.parse(serverProviderMetadataJson ?? '{}')?.family as string | undefined) ?? null;
    } catch { return null; }
  })();
  const isHytaleOvhcloud = ovhcloudFamily === 'hytale';
  const isPalworldOvhcloud = ovhcloudFamily === 'palworld';
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

  const validMcServerTypes: McServerType[] = ['vanilla', 'paper', 'fabric', 'neoforge', 'bedrock'];
  const mcServerTypeChecked: McServerType | null = validMcServerTypes.includes(minecraftServerType as McServerType)
    ? (minecraftServerType as McServerType)
    : null;
  const addonKind: 'plugins' | 'mods' = minecraftServerType === 'paper' ? 'plugins' : 'mods';
  const addonsSupportedTypes = ['paper', 'fabric', 'neoforge'];
  const minecraftAddonsSupported = addonsSupportedTypes.includes(minecraftServerType ?? '');

  const ovhcloudConfigFiles = useMemo(() => {
    if (isMinecraftJavaOvhcloud) return ['/server.properties'];
    if (isHytaleOvhcloud) return ['/game/Server/config.json'];
    if (isPalworldOvhcloud) return ['/server/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini'];
    return undefined;
  }, [isMinecraftJavaOvhcloud, isHytaleOvhcloud, isPalworldOvhcloud]);

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
  // Until the user clicks a tab, the active tab follows the computed default (which shifts as
  // permissions load in asynchronously).
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
    canCreateBackups,
    canEditBackupSettings,
    canDeleteBackups,
    canRestoreBackups,
    canRenameBackups,
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
    canWriteCS2Frameworks,
    canAccessTab: baseCanAccessTab,
  } = createServerSettingsAccess(currentUser, serverPermissions);

  // Whether this server type has a Game Config surface at all. Like Terminal, the tab stays
  // visible but greyed-out when the user lacks the permissions to see any content.
  const gameConfigApplicable =
    !isExternalProvider &&
    (isMinecraftJavaOvhcloud ||
      isMinecraftBedrockOvhcloud ||
      isHytaleOvhcloud ||
      isPalworldOvhcloud ||
      isCS2Ovhcloud ||
      isLinuxGSMGame);

  // Whether the Game Config tab has content for this user: each game exposes a different config
  // surface gated by its own permission. Without it the tab is treated as inaccessible.
  const gameConfigHasContent =
    ((isMinecraftJavaOvhcloud || isMinecraftBedrockOvhcloud) && canUseMinecraft) ||
    (isHytaleOvhcloud && canUseHytale) ||
    (isPalworldOvhcloud && canUsePalworld) ||
    (isCS2Ovhcloud && canEditContainerConfig) ||
    (isLinuxGSMGame && canUseFileManager);

  const canUseGameConfigTab = gameConfigApplicable;
  const canAccessTab = (tab: SettingsTab): boolean => {
    if (tab === 'gameconfig') return gameConfigHasContent;
    // Backups require both server support and `backups.read`.
    if (tab === 'backup') return serverBackupSupported && canReadBackups;
    // Container config is readable by anyone (backend redacts `env` without `server.env`);
    // editing is gated inside the tab.
    if (tab === 'containerconfig') return true;
    return baseCanAccessTab(tab);
  };

  const openTab = (tab: SettingsTab) => {
    if (!canAccessTab(tab)) return;
    hasUserSelectedTabRef.current = true;
    setActiveTab(tab);
  };
  const defaultTab = SETTINGS_TAB_PRIORITY.find((tab) => canAccessTab(tab)) ?? 'filemanager';
  // Derive the displayed tab during render (not from the effect below), else the modal briefly
  // shows a stale activeTab and visibly jumps to the default on the next frame.
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

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!serverId || !canWriteFiles) return;

      // Preserve each file's folder-relative path (react-dropzone puts it on `file.path`)
      // instead of flattening to file.name.
      const relativePathOf = (file: File): string => {
        const raw = String((file as any).path || (file as any).webkitRelativePath || file.name || '')
          .replace(/\\/g, '/');
        let rel = raw.startsWith('./') ? raw.slice(2) : raw.startsWith('/') ? raw.slice(1) : raw;
        rel = rel.replace(/\/{2,}/g, '/');
        if (!rel || rel.split('/').some((seg) => seg === '..')) return file.name;
        return rel;
      };

      const dirPath = currentPath.replace(/\/$/, '');
      const uploads = files.map((file) => ({ file, relativePath: relativePathOf(file) }));

      const newItems: UploadQueueItem[] = uploads.map(({ relativePath }) => ({
        id: `${relativePath}-${Date.now()}-${Math.random()}`,
        name: relativePath,
        progress: 0,
        done: false,
      }));
      setUploadQueue((prev) => [...prev, ...newItems]);

      await Promise.all(
        uploads.map(async ({ file, relativePath }, i) => {
          const queueId = newItems[i].id;
          try {
            await apiClient.uploadServerFile(serverId, dirPath, relativePath, file, (pct) => {
              setUploadQueue((prev) =>
                prev.map((item) => (item.id === queueId ? { ...item, progress: pct } : item))
              );
            }, currentRoot);
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.id === queueId ? { ...item, progress: 100, done: true } : item
              )
            );
          } catch (error: any) {
            const msg = error?.response?.data?.error || error?.message || 'Upload failed';
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.id === queueId ? { ...item, error: msg, done: true } : item
              )
            );
          }
        })
      );

      loadFiles(currentPath);

      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((item) => !item.done || !!item.error));
      }, 3000);
    },
[serverId, canWriteFiles, currentPath, currentRoot, loadFiles]
  );

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
    // Until the user picks a tab, keep following the computed default, which can shift as
    // permissions load in asynchronously after the modal opens.
    if (!hasUserSelectedTabRef.current) {
      if (activeTab !== defaultTab) setActiveTab(defaultTab);
      return;
    }
    // Safety net: if the user's current tab becomes inaccessible, fall back.
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
              canManageEnv,
              canEditContainerConfig,
              containerConfigSaveCount,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
            } : null}
            cs2Props={isCS2Ovhcloud && serverId && canEditContainerConfig ? {
              serverId,
              serverStatus,
              canEdit: canEditContainerConfig,
              canWriteFrameworks: canWriteCS2Frameworks,
              canManageEnv,
              borderColor,
              contentBg,
              textPrimary,
              textSecondary,
              inputBg,
              inputBorder,
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

