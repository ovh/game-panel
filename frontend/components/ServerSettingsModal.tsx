import { useEffect, useState } from 'react';
import { GameConfigTab } from './GameConfigTab';
import { ServerSshTerminal } from './ServerSshTerminal';
import { ServerSettingsActionModals } from './serverSettings/ServerSettingsActionModals';
import { ServerSettingsSftpPasswordModals } from './serverSettings/ServerSettingsSftpPasswordModals';
import { FileManagerTab } from './serverSettings/FileManagerTab';
import { BackupTab } from './serverSettings/BackupTab';
import { SftpTab } from './serverSettings/SftpTab';
import { ServerSettingsModalLayout } from './serverSettings/ServerSettingsModalLayout';
import {
  createServerSettingsAccess,
  SETTINGS_TAB_PRIORITY,
  type SettingsTab,
} from './serverSettings/access';
import { resolveFileMutationError } from './serverSettings/fileMutationErrors';
import { createSettingsTabButtonClass, SERVER_SETTINGS_THEME } from './serverSettings/theme';
import { useBackupState } from './serverSettings/useBackupState';
import { useBodyScrollLock } from './serverSettings/useBodyScrollLock';
import { useFileManagerState } from './serverSettings/useFileManagerState';
import { apiClient, PUBLIC_CONNECTION_HOST } from '../utils/api';
import type { AuthUser } from '../utils/permissions';
import {
  createBackupNowHandler,
  createCloseFirstTimePasswordModalHandler,
  createCloseSftpPasswordModalHandler,
  createCopyContentHandler,
  createCopyPathHandler,
  createCopySftpDetailHandler,
  createDeleteBackupHandler,
  createDisableSftpHandler,
  createDownloadBackupHandler,
  createEnableSftpHandler,
  createExecuteBackupNowHandler,
  createFirstTimePasswordSubmitHandler,
  createSaveBackupSettingsHandler,
  createUpdateSftpPasswordModalHandler,
} from './serverSettings/actionHandlers';
import { createFileManagerHandlers, type FileItem } from './serverSettings/fileManagerHandlers';
import {
  formatBytes,
  isSymlinkEntry,
  splitFilePath,
} from './serverSettings/utils';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverGame: string;
  serverStatus?: string | null;
  serverId?: number | null;
  serverSftpUsername?: string | null;
  serverSftpEnabled?: boolean;
  currentUser?: AuthUser | null;
  serverPermissions?: string[];
}

export function ServerSettingsModal({
  isOpen,
  onClose,
  serverName,
  serverGame,
  serverStatus,
  serverId,
  serverSftpUsername,
  serverSftpEnabled,
  currentUser,
  serverPermissions = [],
}: ServerSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('filemanager');

  const [sftpError, setSftpError] = useState<string | null>(null);
  const [sftpPasswordLoading, setSftpPasswordLoading] = useState(false);
  const [sftpToggleLoading, setSftpToggleLoading] = useState(false);
  const [showFirstTimePasswordModal, setShowFirstTimePasswordModal] = useState(false);
  const [firstTimePassword, setFirstTimePassword] = useState('');
  const [firstTimeConfirmPassword, setFirstTimeConfirmPassword] = useState('');
  const [showFirstTimePassword, setShowFirstTimePassword] = useState(false);
  const [showFirstTimeConfirmPassword, setShowFirstTimeConfirmPassword] = useState(false);
  const [firstTimePasswordError, setFirstTimePasswordError] = useState<string | null>(null);

  const [showSftpPasswordModal, setShowSftpPasswordModal] = useState(false);
  const [sftpModalPassword, setSftpModalPassword] = useState('');
  const [sftpModalConfirmPassword, setSftpModalConfirmPassword] = useState('');
  const [showSftpModalPassword, setShowSftpModalPassword] = useState(false);
  const [showSftpModalConfirmPassword, setShowSftpModalConfirmPassword] = useState(false);
  const [sftpModalPasswordError, setSftpModalPasswordError] = useState<string | null>(null);

  const [copiedSftp, setCopiedSftp] = useState<string | null>(null);

  const {
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
  } = useFileManagerState({
    activeTab,
    isOpen,
    serverId,
  });
  const {
    autoBackupEnabled,
    setAutoBackupEnabled,
    backupFrequencyType,
    setBackupFrequencyType,
    backupHours,
    setBackupHours,
    backupTime,
    setBackupTime,
    backupDay,
    setBackupDay,
    backupRetention,
    setBackupRetention,
    backups,
    backupsPath,
    backupsLoading,
    backupsError,
    setBackupsError,
    backupSettingsLoading,
    backupSettingsError,
    setBackupSettingsError,
    backupCronError,
    setBackupCronError,
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
    loadBackups,
    loadBackupSettings,
    loadBackupCron,
  } = useBackupState({
    serverId,
    isActive: isOpen && activeTab === 'backup',
  });

  const {
    canUseFileManager,
    canManageGameUpdates,
    canUseGameConfigTab,
    hasAnySettingsAccess,
    canWriteFiles,
    canDownloadBackups,
    canCreateBackups,
    canEditBackupSettings,
    canDeleteBackups,
    canAccessTab,
  } = createServerSettingsAccess(currentUser, serverPermissions);

  const openTab = (tab: SettingsTab) => {
    if (!canAccessTab(tab)) return;
    setActiveTab(tab);
  };
  const defaultTab = SETTINGS_TAB_PRIORITY.find((tab) => canAccessTab(tab)) ?? 'filemanager';
  const sftpUsername = serverSftpUsername ?? '';
  const sftpEnabled = serverSftpEnabled === true;
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
        const content = await apiClient.readServerFile(serverId, normalized);
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
  } = createFileManagerHandlers({
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
  });

  const handleCopyPath = createCopyPathHandler({
    currentPath,
    setCopyPathSuccess,
  });

  const handleCopyContent = createCopyContentHandler({
    fileContent,
    setCopyContentSuccess,
  });

  const handleCopySftpDetail = createCopySftpDetailHandler({
    setCopiedSftp,
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
    backupsPath,
    setBackupDeleteLoading,
    setBackupsError,
    loadBackups,
  });

  const executeBackupNow = createExecuteBackupNowHandler({
    canCreateBackups,
    serverId,
    backupsPath,
    setBackupNowLoading,
    setBackupsError,
    loadBackups,
  });

  const handleBackupNow = createBackupNowHandler({
    canCreateBackups,
    serverId,
    setShowBackupNowWarningModal,
    executeBackupNow,
  });

  const handleSaveBackupSettings = createSaveBackupSettingsHandler({
    canEditBackupSettings,
    serverId,
    backupRetention,
    backupRetentionDays,
    stopOnBackup,
    autoBackupEnabled,
    backupFrequencyType,
    backupHours,
    backupTime,
    backupDay,
    setBackupSaving,
    setBackupSettingsError,
    setBackupCronError,
    loadBackupSettings,
    loadBackupCron,
  });

  const handleEnableSftp = createEnableSftpHandler({
    serverId,
    setShowFirstTimePasswordModal,
    setSftpToggleLoading,
    setSftpError,
  });

  const handleFirstTimePasswordSubmit = createFirstTimePasswordSubmitHandler({
    serverId,
    firstTimePassword,
    firstTimeConfirmPassword,
    setSftpPasswordLoading,
    setFirstTimePasswordError,
    setShowFirstTimePasswordModal,
    setFirstTimePassword,
    setFirstTimeConfirmPassword,
    setShowFirstTimePassword,
    setShowFirstTimeConfirmPassword,
  });

  const closeFirstTimePasswordModal = createCloseFirstTimePasswordModalHandler({
    setShowFirstTimePasswordModal,
    setFirstTimePassword,
    setFirstTimeConfirmPassword,
    setFirstTimePasswordError,
    setShowFirstTimePassword,
    setShowFirstTimeConfirmPassword,
  });

  const handleDisableSftp = createDisableSftpHandler({
    serverId,
    setSftpToggleLoading,
    setSftpError,
  });

  const handleUpdateSftpPasswordModal = createUpdateSftpPasswordModalHandler({
    serverId,
    sftpModalPassword,
    sftpModalConfirmPassword,
    setSftpPasswordLoading,
    setSftpModalPasswordError,
    setShowSftpPasswordModal,
    setSftpModalPassword,
    setSftpModalConfirmPassword,
    setShowSftpModalPassword,
    setShowSftpModalConfirmPassword,
  });

  const closeSftpPasswordModal = createCloseSftpPasswordModalHandler({
    setShowSftpPasswordModal,
    setSftpModalPassword,
    setSftpModalConfirmPassword,
    setSftpModalPasswordError,
    setShowSftpModalPassword,
    setShowSftpModalConfirmPassword,
  });

  useEffect(() => {
    if (isOpen) return;
    if (activeTab === defaultTab) return;
    setActiveTab(defaultTab);
  }, [isOpen, activeTab, defaultTab]);

  useEffect(() => {
    if (!isOpen) return;
    if (canAccessTab(activeTab)) return;
    setActiveTab(defaultTab);
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
    activeTab,
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
        modalBg={modalBg}
        sidebarBg={sidebarBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        hoverBg={hoverBg}
        canUseGameConfigTab={canUseGameConfigTab}
        canAccessTab={canAccessTab}
        openTab={openTab}
        tabButtonClass={tabButtonClass}
        hasAnySettingsAccess={hasAnySettingsAccess}
        activeTab={activeTab}
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
            renamingFile={renamingFile}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleFileClick={handleFileClick}
            handleRenameConfirm={handleRenameConfirm}
            handleRenameCancel={handleRenameCancel}
            handleRenameFile={handleRenameFile}
            handleDeleteFile={handleDeleteFile}
            isEditorExpanded={isEditorExpanded}
            setIsEditorExpanded={setIsEditorExpanded}
            handleCopyContent={handleCopyContent}
            copyContentSuccess={copyContentSuccess}
            handleDownloadFile={handleDownloadFile}
            handleSaveFile={handleSaveFile}
            isFileDirty={isFileDirty}
            savingFile={savingFile}
            setSelectedFile={setSelectedFile}
            fileLoading={fileLoading}
            fileContent={fileContent}
            setFileContent={setFileContent}
            setIsFileDirty={setIsFileDirty}
            fileError={fileError}
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
            backupCronError={backupCronError}
            autoBackupEnabled={autoBackupEnabled}
            setAutoBackupEnabled={setAutoBackupEnabled}
            backupFrequencyType={backupFrequencyType}
            setBackupFrequencyType={setBackupFrequencyType}
            backupHours={backupHours}
            setBackupHours={setBackupHours}
            backupTime={backupTime}
            setBackupTime={setBackupTime}
            backupDay={backupDay}
            setBackupDay={setBackupDay}
            handleSaveBackupSettings={handleSaveBackupSettings}
            canEditBackupSettings={canEditBackupSettings}
            backupSaving={backupSaving}
            backupSettingsLoading={backupSettingsLoading}
            loadBackups={loadBackups}
            backupsPath={backupsPath}
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
          />
        }
        sftpContent={
          <SftpTab
            contentBg={contentBg}
            borderColor={borderColor}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            serverName={serverName}
            sftpError={sftpError}
            sftpEnabled={sftpEnabled}
            sftpToggleLoading={sftpToggleLoading}
            handleEnableSftp={handleEnableSftp}
            handleDisableSftp={handleDisableSftp}
            publicConnectionHost={PUBLIC_CONNECTION_HOST}
            copiedSftp={copiedSftp}
            handleCopySftpDetail={handleCopySftpDetail}
            sftpUsername={sftpUsername}
            setShowSftpPasswordModal={setShowSftpPasswordModal}
          />
        }
        gameConfigContent={
          <GameConfigTab
            serverGame={serverGame}
            serverId={serverId}
            canReadFileManager={canUseFileManager}
            canWriteFileManager={canWriteFiles}
            canManageGameUpdates={canManageGameUpdates}
            onOpenFileManagerPath={handleOpenFileManagerAtPath}
          />
        }
        terminalContent={
          <div className="h-full overflow-hidden p-3 sm:p-4 md:p-6">
            <ServerSshTerminal serverId={serverId} serverName={serverName} />
          </div>
        }
      />

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
        deleteEntryLoading={deleteEntryLoading}
        closeDeleteEntryModal={() => {
          setShowDeleteEntryModal(false);
          setDeleteEntryTarget(null);
        }}
        confirmDeleteEntry={confirmDeleteEntry}
        showBackupNowWarningModal={showBackupNowWarningModal}
        backupNowLoading={backupNowLoading}
        stopOnBackup={stopOnBackup}
        closeBackupWarningModal={() => {
          if (backupNowLoading) return;
          setShowBackupNowWarningModal(false);
        }}
        executeBackupNow={executeBackupNow}
      />

      <ServerSettingsSftpPasswordModals
        modalBg={modalBg}
        borderColor={borderColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        hoverBg={hoverBg}
        inputBg={inputBg}
        inputBorder={inputBorder}
        showFirstTimePasswordModal={showFirstTimePasswordModal}
        closeFirstTimePasswordModal={closeFirstTimePasswordModal}
        firstTimePassword={firstTimePassword}
        setFirstTimePassword={setFirstTimePassword}
        firstTimeConfirmPassword={firstTimeConfirmPassword}
        setFirstTimeConfirmPassword={setFirstTimeConfirmPassword}
        showFirstTimePassword={showFirstTimePassword}
        setShowFirstTimePassword={setShowFirstTimePassword}
        showFirstTimeConfirmPassword={showFirstTimeConfirmPassword}
        setShowFirstTimeConfirmPassword={setShowFirstTimeConfirmPassword}
        firstTimePasswordError={firstTimePasswordError}
        clearFirstTimePasswordError={() => setFirstTimePasswordError(null)}
        handleFirstTimePasswordSubmit={handleFirstTimePasswordSubmit}
        sftpPasswordLoading={sftpPasswordLoading}
        showSftpPasswordModal={showSftpPasswordModal}
        closeSftpPasswordModal={closeSftpPasswordModal}
        sftpModalPassword={sftpModalPassword}
        setSftpModalPassword={setSftpModalPassword}
        sftpModalConfirmPassword={sftpModalConfirmPassword}
        setSftpModalConfirmPassword={setSftpModalConfirmPassword}
        showSftpModalPassword={showSftpModalPassword}
        setShowSftpModalPassword={setShowSftpModalPassword}
        showSftpModalConfirmPassword={showSftpModalConfirmPassword}
        setShowSftpModalConfirmPassword={setShowSftpModalConfirmPassword}
        sftpModalPasswordError={sftpModalPasswordError}
        clearSftpModalPasswordError={() => setSftpModalPasswordError(null)}
        handleUpdateSftpPasswordModal={handleUpdateSftpPasswordModal}
      />
    </>
  );
}

