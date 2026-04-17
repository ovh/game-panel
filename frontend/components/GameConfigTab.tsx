import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, Save } from 'lucide-react';
import { apiClient } from '../utils/api';
import { GameConfigAdvancedLinks } from './serverSettings/GameConfigAdvancedLinks';
import { AppButton, AppInput, AppSelect, AppToggle } from '../src/ui/components';
import {
  type CatalogGameDefinition,
  type DbConfigFileDefinition,
  type VerifiedConfigFile,
  type VerifiedField,
  areMapsEqual,
  buildFilePathCandidates,
  coerceSelectInputValue,
  getBooleanAliasInfo,
  parseConfigFilesValue,
  parseDbConfigFiles,
  resolveNumberFieldControlType,
  resolveNumberFieldStep,
  resolveSelectOptionValue,
  serializeSelectValue,
  toFieldId,
  uniquePaths,
} from './gameConfigTab/configUtils';
import {
  applyInlineConfigProfileWrite,
  isInlineConfigProfileSupported,
  parseInlineConfigProfileContent,
  resolveInlineConfigProfileId,
} from './gameConfigTab/configProfiles';

interface GameConfigTabProps {
  serverGame: string;
  serverId?: number | null;
  canReadFileManager?: boolean;
  canWriteFileManager?: boolean;
  canManageGameUpdates?: boolean;
  onOpenFileManagerPath?: (path: string) => void;
}

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getNumberPrecision = (value: number): number => {
  if (!Number.isFinite(value)) return 0;

  const text = value.toString().toLowerCase();
  if (!text.includes('e')) {
    return text.includes('.') ? text.split('.')[1].length : 0;
  }

  const [base, exponentRaw] = text.split('e');
  const exponent = Number(exponentRaw);
  if (!Number.isFinite(exponent)) return 0;

  const decimals = base.includes('.') ? base.split('.')[1].length : 0;
  if (exponent >= 0) return Math.max(0, decimals - exponent);
  return decimals + Math.abs(exponent);
};

const formatNumericValue = (value: number, precision: number): string => {
  if (!Number.isFinite(value)) return '';
  if (precision <= 0) return String(Math.round(value));
  return value
    .toFixed(precision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1');
};

const snapValueToStep = (
  value: number,
  min: number,
  max: number,
  step: number,
  precision: number
): number => {
  const clampedValue = clampNumber(value, min, max);
  const steppedValue = min + Math.round((clampedValue - min) / step) * step;
  const normalizedValue = Number(steppedValue.toFixed(precision));
  return clampNumber(normalizedValue, min, max);
};

const buildDefinitionFromVerifiedFile = (
  file: Pick<VerifiedConfigFile, 'format' | 'fields'>
): Pick<DbConfigFileDefinition, 'format' | 'keys'> => ({
  format: file.format,
  keys: Object.fromEntries(
    file.fields.map((field) => [
      field.key,
      {
        title: field.title,
        type: field.type,
        options: field.options,
        description: field.description,
        section: field.section,
        trueValue: field.trueValue,
        falseValue: field.falseValue,
        min: field.min,
        max: field.max,
        format: field.format,
      },
    ])
  ),
});

const areFieldValuesEquivalent = (
  field: Pick<VerifiedField, 'type' | 'options'> | undefined,
  expectedValue: string,
  actualValue: string | undefined
): boolean => {
  const actual = String(actualValue ?? '');
  if (actual === expectedValue) return true;
  if (!field) return false;

  if (field.type === 'number') {
    const expectedNumber = Number(expectedValue);
    const actualNumber = Number(actual);
    return Number.isFinite(expectedNumber) && Number.isFinite(actualNumber)
      ? expectedNumber === actualNumber
      : false;
  }

  if (field.type === 'boolean') {
    const expectedBoolean = getBooleanAliasInfo(expectedValue);
    const actualBoolean = getBooleanAliasInfo(actual);
    return Boolean(expectedBoolean && actualBoolean && expectedBoolean.state === actualBoolean.state);
  }

  return false;
};

const resolveVerifiedUiValue = (
  field: Pick<VerifiedField, 'type' | 'options'> | undefined,
  expectedValue: string,
  actualValue: string | undefined
): string => {
  if (areFieldValuesEquivalent(field, expectedValue, actualValue)) {
    return expectedValue;
  }

  return String(actualValue ?? '');
};

export function GameConfigTab({
  serverGame,
  serverId,
  canReadFileManager = false,
  canWriteFileManager = false,
  canManageGameUpdates = false,
  onOpenFileManagerPath,
}: GameConfigTabProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [savingConfiguration, setSavingConfiguration] = useState(false);

  const [resolvedGameDefinition, setResolvedGameDefinition] =
    useState<CatalogGameDefinition | null>(null);
  const [detectedConfigFiles, setDetectedConfigFiles] = useState<string[]>([]);
  const [configFilesLoading, setConfigFilesLoading] = useState(false);
  const [configFilesError, setConfigFilesError] = useState<string | null>(null);

  const [verifiedConfigFiles, setVerifiedConfigFiles] = useState<VerifiedConfigFile[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [initialFieldValues, setInitialFieldValues] = useState<Record<string, string>>({});
  const [touchedFieldIds, setTouchedFieldIds] = useState<Record<string, boolean>>({});
  const [gameUpdateEnabled, setGameUpdateEnabled] = useState(false);
  const [gameUpdateLoading, setGameUpdateLoading] = useState(false);
  const [gameUpdateSaving, setGameUpdateSaving] = useState(false);
  const [gameUpdateError, setGameUpdateError] = useState<string | null>(null);
  const [openFieldHelpId, setOpenFieldHelpId] = useState<string | null>(null);

  const configChanged = useMemo(
    () => !areMapsEqual(fieldValues, initialFieldValues),
    [fieldValues, initialFieldValues]
  );

  useEffect(() => {
    let cancelled = false;

    const isCommonCfgPath = (path: string) => /\/common\.cfg$/i.test(String(path || '').trim());

    const buildDefaultCfgPath = (path: string): string | null => {
      const normalized = String(path || '')
        .trim()
        .replace(/\\/g, '/');
      if (!isCommonCfgPath(normalized)) return null;
      return normalized.replace(/\/common\.cfg$/i, '/_default.cfg');
    };

    const resolveFileContent = async (paths: string[]) => {
      if (!serverId) return null;

      let lastError: any = null;
      for (const path of paths) {
        try {
          const content = await apiClient.readServerFile(serverId, path);
          return { path, content: String(content || '') };
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError;
    };

    const resolveEffectiveConfigValues = async (
      definitionFile: DbConfigFileDefinition
    ): Promise<
      | {
          path: string;
          mergedValues: Record<string, string>;
          directValues: Record<string, string>;
        }
      | null
    > => {
      const candidatePaths = buildFilePathCandidates(definitionFile.path);
      if (candidatePaths.length === 0) return null;

      const resolvedFile = await resolveFileContent(candidatePaths);
      if (!resolvedFile) return null;

      const directValues = parseInlineConfigProfileContent(
        resolvedFile.content,
        resolvedFile.path,
        definitionFile
      );

      // LinuxGSM loads _default.cfg first, then common.cfg overrides it.
      if (!isCommonCfgPath(resolvedFile.path)) {
        return {
          path: resolvedFile.path,
          mergedValues: directValues,
          directValues,
        };
      }

      const defaultPath = buildDefaultCfgPath(resolvedFile.path);
      if (!defaultPath || !serverId) {
        return {
          path: resolvedFile.path,
          mergedValues: directValues,
          directValues,
        };
      }

      try {
        const defaultContent = await apiClient.readServerFile(serverId, defaultPath);
        const defaultValues = parseInlineConfigProfileContent(
          String(defaultContent || ''),
          defaultPath,
          definitionFile
        );
        return {
          path: resolvedFile.path,
          mergedValues: {
            ...defaultValues,
            ...directValues,
          },
          directValues,
        };
      } catch {
        return {
          path: resolvedFile.path,
          mergedValues: directValues,
          directValues,
        };
      }
    };

    const loadConfigMetadata = async () => {
      if (!serverId) {
        setResolvedGameDefinition(null);
        setDetectedConfigFiles([]);
        setVerifiedConfigFiles([]);
        setFieldValues({});
        setInitialFieldValues({});
        setTouchedFieldIds({});
        setConfigFilesError(null);
        setConfigFilesLoading(false);
        return;
      }

      setConfigFilesLoading(true);
      setConfigFilesError(null);
      setSaveError(null);
      setSaveSuccessMessage(null);

      try {
        let definition: CatalogGameDefinition | null = null;

        try {
          definition = (await apiClient.getCatalogGame(serverGame)) as CatalogGameDefinition;
        } catch {
          const catalogGames = await apiClient.getCatalogGames();
          const needle = String(serverGame).toLowerCase();
          const matched = catalogGames.games.find((game) => {
            const shortname = String(game.shortname || '').toLowerCase();
            const gameServerName = String(game.gameservername || '').toLowerCase();
            const gameName = String(game.gamename || '').toLowerCase();
            return shortname === needle || gameServerName === needle || gameName === needle;
          });
          definition = (matched as CatalogGameDefinition | null) ?? null;
        }

        const server = await apiClient.getServer(serverId);

        const filesFromDefinition = uniquePaths(
          parseConfigFilesValue(definition?.configFiles ?? definition?.config_files)
        );
        const filesFromServer = uniquePaths(
          parseConfigFilesValue(
            server?.configFiles ?? server?.config_files ?? server?.config_files_json
          )
        );

        const resolvedFiles =
          filesFromDefinition.length > 0
            ? filesFromDefinition
            : filesFromServer.length > 0
              ? filesFromServer
              : [];

        const dbDefinitions = parseDbConfigFiles(
          definition?.configFiles ?? definition?.config_files
        );
        const verified: VerifiedConfigFile[] = [];
        const nextValues: Record<string, string> = {};
        const verificationErrors: string[] = [];

        for (const definitionFile of dbDefinitions) {
          if (!resolveInlineConfigProfileId(definitionFile.format)) {
            verificationErrors.push(`${definitionFile.path}: unsupported or missing format.type`);
            continue;
          }

          try {
            const resolvedFile = await resolveEffectiveConfigValues(definitionFile);
            if (!resolvedFile) continue;

            const fields: VerifiedField[] = Object.entries(definitionFile.keys).map(
              ([key, fieldDefinition]) => {
                const normalizedKey = key.toLowerCase();
                const presentInFile = normalizedKey in resolvedFile.directValues;
                const value = resolvedFile.mergedValues[normalizedKey] ?? '';
                nextValues[toFieldId(definitionFile.path, key)] = value;
                return {
                  key,
                  title: fieldDefinition.title,
                  type: fieldDefinition.type,
                  options: fieldDefinition.options,
                  description: fieldDefinition.description,
                  section: fieldDefinition.section,
                  trueValue: fieldDefinition.trueValue,
                  falseValue: fieldDefinition.falseValue,
                  min: fieldDefinition.min,
                  max: fieldDefinition.max,
                  format: fieldDefinition.format,
                  presentInFile,
                };
              }
            );

            verified.push({
              declaredPath: definitionFile.path,
              resolvedPath: resolvedFile.path,
              format: definitionFile.format,
              fields,
            });
          } catch {
            verificationErrors.push(`${definitionFile.path}: file not found or unreadable`);
          }
        }

        if (cancelled) return;

        setResolvedGameDefinition(definition);
        setDetectedConfigFiles(resolvedFiles);
        setVerifiedConfigFiles(verified);
        setFieldValues(nextValues);
        setInitialFieldValues(nextValues);
        setTouchedFieldIds({});

        if (verificationErrors.length > 0) {
          setConfigFilesError(
            `Some DB config files could not be validated: ${verificationErrors.join(' | ')}`
          );
        } else {
          setConfigFilesError(null);
        }
      } catch {
        let fallbackFromServer: string[] = [];

        try {
          const server = await apiClient.getServer(serverId);
          fallbackFromServer = uniquePaths(
            parseConfigFilesValue(
              server?.configFiles ?? server?.config_files ?? server?.config_files_json
            )
          );
        } catch {
          // Ignore secondary fallback errors
        }

        if (cancelled) return;
        setResolvedGameDefinition(null);
        setDetectedConfigFiles(fallbackFromServer);
        setVerifiedConfigFiles([]);
        setFieldValues({});
        setInitialFieldValues({});
        setTouchedFieldIds({});
        setConfigFilesError('Unable to load game configuration files from the game definition DB.');
      } finally {
        if (!cancelled) {
          setConfigFilesLoading(false);
        }
      }
    };

    void loadConfigMetadata();

    return () => {
      cancelled = true;
    };
  }, [serverId, serverGame]);

  useEffect(() => {
    if (configChanged) {
      setSaveError(null);
      setSaveSuccessMessage(null);
    }
  }, [configChanged]);

  useEffect(() => {
    if (!saveSuccessMessage || configChanged) return;

    const timer = window.setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [configChanged, saveSuccessMessage]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-game-config-help]')) {
        return;
      }
      setOpenFieldHelpId(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadGameUpdateConfig = async () => {
      if (!serverId) {
        setGameUpdateEnabled(false);
        setGameUpdateError(null);
        setGameUpdateLoading(false);
        return;
      }

      setGameUpdateLoading(true);
      setGameUpdateError(null);

      try {
        const response = await apiClient.getGameUpdateCron(serverId);
        if (cancelled) return;
        setGameUpdateEnabled(Boolean(response?.enabled));
      } catch (error: any) {
        if (cancelled) return;
        const backendMessage = error?.response?.data?.error || error?.message;
        setGameUpdateError(backendMessage || 'Failed to load game update configuration.');
      } finally {
        if (!cancelled) {
          setGameUpdateLoading(false);
        }
      }
    };

    void loadGameUpdateConfig();

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const openFileInFileManager = useCallback(
    (path: string) => {
      if (!canReadFileManager) return;
      onOpenFileManagerPath?.(path);
    },
    [canReadFileManager, onOpenFileManagerPath]
  );

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
    setTouchedFieldIds((prev) => ({
      ...prev,
      [fieldId]: true,
    }));
  };

  const handleSelectFieldChange = (
    fieldId: string,
    field: VerifiedField,
    nextOptionValue: string
  ) => {
    const initialRawValue = initialFieldValues[fieldId] ?? '';
    handleFieldChange(
      fieldId,
      coerceSelectInputValue(field.options, initialRawValue, nextOptionValue)
    );
  };

  const handleBooleanFieldChange = (
    fieldId: string,
    field: VerifiedField,
    checked: boolean
  ) => {
    handleFieldChange(fieldId, checked ? field.trueValue ?? 'true' : field.falseValue ?? 'false');
  };

  const handleToggleGameUpdate = async () => {
    if (!serverId || !canManageGameUpdates || gameUpdateSaving) return;

    setGameUpdateSaving(true);
    setGameUpdateError(null);

    try {
      const response = await apiClient.updateGameUpdateCron(serverId, !gameUpdateEnabled);
      const nextEnabled = Boolean(response?.enabled);
      setGameUpdateEnabled(nextEnabled);
    } catch (error: any) {
      const backendMessage = error?.response?.data?.error || error?.message;
      setGameUpdateError(backendMessage || 'Failed to update game update configuration.');
    } finally {
      setGameUpdateSaving(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!serverId) {
      setSaveError('Server is not available yet. Please retry in a few seconds.');
      return;
    }

    if (!canWriteFileManager) {
      setSaveError('Permission denied: fs.write is required to save game settings.');
      return;
    }

    const changedByFile = new Map<string, Array<{ fieldId: string; key: string; value: string }>>();
    const nextPersistedFieldValues: Record<string, string> = { ...fieldValues };
    verifiedConfigFiles.forEach((file) => {
      file.fields.forEach((field) => {
        const id = toFieldId(file.declaredPath, field.key);
        const current = fieldValues[id] ?? '';
        const initial = initialFieldValues[id] ?? '';
        const persistedValue =
          field.type === 'select' || field.type === 'boolean'
            ? serializeSelectValue(field, current, initial)
            : current;
        nextPersistedFieldValues[id] = persistedValue;
        const isTouched = Boolean(touchedFieldIds[id]);
        if (!field.presentInFile && !isTouched) return;
        if (persistedValue === initial && field.presentInFile) return;

        const operations = changedByFile.get(file.declaredPath) || [];
        operations.push({ fieldId: id, key: field.key, value: persistedValue });
        changedByFile.set(file.declaredPath, operations);
      });
    });

    if (changedByFile.size === 0) {
      setFieldValues(nextPersistedFieldValues);
      return;
    }

    setSavingConfiguration(true);
    setSaveError(null);
    setSaveSuccessMessage(null);

    try {
      let updatedFiles = 0;
      const verifiedPersistedFieldValues: Record<string, string> = {};

      for (const [declaredPath, operations] of changedByFile.entries()) {
        const matchedFile = verifiedConfigFiles.find(
          (candidate) => candidate.declaredPath === declaredPath
        );
        const candidates = buildFilePathCandidates(declaredPath);
        if (candidates.length === 0) {
          throw new Error(`Invalid config file path: ${declaredPath}`);
        }

        let resolvedFilePath: string | null = null;
        let originalContent = '';
        let lastReadError: any = null;

        for (const candidatePath of candidates) {
          try {
            originalContent = await apiClient.readServerFile(serverId, candidatePath);
            resolvedFilePath = candidatePath;
            lastReadError = null;
            break;
          } catch (error) {
            lastReadError = error;
          }
        }

        if (!resolvedFilePath) {
          const backendMessage = lastReadError?.response?.data?.error || lastReadError?.message;
          throw new Error(backendMessage || `Failed to read config file: ${declaredPath}`);
        }

        if (!matchedFile || !isInlineConfigProfileSupported(matchedFile.format)) {
          throw new Error(`Unsupported config format.type for inline save: ${resolvedFilePath}`);
        }

        let nextContent = String(originalContent || '');
        const definitionForWrite = buildDefinitionFromVerifiedFile(matchedFile);
        operations.forEach((operation) => {
          const matchedField = matchedFile?.fields.find((field) => field.key === operation.key);
          nextContent = applyInlineConfigProfileWrite(
            nextContent,
            operation.key,
            operation.value,
            resolvedFilePath,
            definitionForWrite,
            matchedField
          );
        });

        if (nextContent !== String(originalContent || '')) {
          await apiClient.updateServerFile(serverId, resolvedFilePath, nextContent);
          updatedFiles += 1;
        }

        const verifiedContent = await apiClient.readServerFile(serverId, resolvedFilePath);
        const verificationDefinition = matchedFile
          ? buildDefinitionFromVerifiedFile(matchedFile)
          : undefined;
        const verifiedValues = parseInlineConfigProfileContent(
          String(verifiedContent || ''),
          resolvedFilePath,
          verificationDefinition
        );

        operations.forEach((operation) => {
          const verifiedValue = verifiedValues[operation.key.toLowerCase()];
          const matchedField = matchedFile?.fields.find((field) => field.key === operation.key);
          if (!areFieldValuesEquivalent(matchedField, operation.value, verifiedValue)) {
            throw new Error(
              `Verification failed after saving ${resolvedFilePath}: ${operation.key} expected "${operation.value}" but found "${verifiedValue ?? ''}".`
            );
          }
          verifiedPersistedFieldValues[operation.fieldId] = resolveVerifiedUiValue(
            matchedField,
            operation.value,
            verifiedValue
          );
        });
      }

      const nextVerifiedFieldValues = {
        ...nextPersistedFieldValues,
        ...verifiedPersistedFieldValues,
      };
      setFieldValues(nextVerifiedFieldValues);
      setInitialFieldValues(nextVerifiedFieldValues);
      setTouchedFieldIds({});
      setVerifiedConfigFiles((currentFiles) =>
        currentFiles.map((file) => {
          const writtenOperations = changedByFile.get(file.declaredPath);
          if (!writtenOperations || writtenOperations.length === 0) return file;

          const writtenKeys = new Set(writtenOperations.map((operation) => operation.key));
          return {
            ...file,
            fields: file.fields.map((field) =>
              writtenKeys.has(field.key) ? { ...field, presentInFile: true } : field
            ),
          };
        })
      );
      setSaveSuccessMessage(
        updatedFiles > 0
          ? `Saved game settings to ${updatedFiles} config file${updatedFiles > 1 ? 's' : ''}.`
          : 'Config files were already up to date.'
      );
    } catch (error: any) {
      const backendMessage = error?.response?.data?.error || error?.message;
      setSaveError(backendMessage || 'Failed to save game settings.');
    } finally {
      setSavingConfiguration(false);
    }
  };

  const contentBg = 'bg-[#111827]';
  const borderColor = 'border-gray-700';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-400';
  const hasGameConfiguration = detectedConfigFiles.length > 0 || verifiedConfigFiles.length > 0;
  const showSaveSuccessToast = Boolean(saveSuccessMessage && !configChanged);
  const showBottomStatusPanel = !canWriteFileManager || Boolean(saveError);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6">
        <div className="w-full max-w-full md:max-w-4xl mx-auto space-y-3 md:space-y-6 pb-6">
          <div className="space-y-4 px-1 sm:px-2 py-1">
            <div className="space-y-2 pb-1">
              <h3 className={`text-2xl font-bold ${textPrimary} mb-2`}>
                Game Update Configuration
              </h3>
              <p className={`text-sm ${textSecondary}`}>
                Enable or disable automatic update  (once per hour).
              </p>
            </div>

            {gameUpdateLoading ? (
              <div className={`flex items-center gap-2 text-sm ${textSecondary}`}>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading game update configuration...</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 px-1 py-2">
                <span className={`text-sm sm:text-base font-medium ${textPrimary}`}>
                  Automatic update
                </span>
                <AppToggle
                  ariaLabel="Toggle automatic update checks"
                  checked={gameUpdateEnabled}
                  size="standard"
                  disabled={!canManageGameUpdates || gameUpdateSaving}
                  onChange={() => void handleToggleGameUpdate()}
                  className="flex-shrink-0"
                />
              </div>
            )}

            {!canManageGameUpdates && (
              <p className="text-xs text-amber-300">
                Read-only mode: `server.gamesettings.write` permission is required.
              </p>
            )}

            {gameUpdateError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <p className={`text-sm ${textSecondary}`}>{gameUpdateError}</p>
              </div>
            )}
          </div>

          {hasGameConfiguration && (
            <div className="space-y-5 pt-2 px-1 sm:px-2">
              <div className="py-0">
                <h3 className={`text-2xl font-bold ${textPrimary} mb-0`}>Game Configuration</h3>
              </div>

              {configFilesLoading && (
                <div className={`flex items-center gap-2 text-sm ${textSecondary}`}>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading game configuration definitions...</span>
                </div>
              )}

              {!configFilesLoading && verifiedConfigFiles.length > 0 && (
                <div className="space-y-5">
                  {verifiedConfigFiles.map((file) => (
                    <div
                      key={file.declaredPath}
                      className={`border ${borderColor} rounded-lg p-4 space-y-3`}
                    >
                      <div>
                        <div>
                          <p className={`text-xs ${textSecondary}`}>Config file</p>
                          <p className={`text-sm font-mono ${textPrimary} break-all`}>
                            {file.resolvedPath}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {file.fields.map((field) => {
                          const fieldId = toFieldId(file.declaredPath, field.key);
                          const value = fieldValues[fieldId] ?? '';
                          const isTouched = Boolean(touchedFieldIds[fieldId]);
                          const fieldLabel = String(field.title || '').trim() || field.key;
                          const fieldDescription = String(field.description || '').trim();
                          const selectValue =
                            field.type === 'select'
                              ? resolveSelectOptionValue(field.options, value)
                              : value;
                          const booleanResolvedValue =
                            field.type === 'boolean'
                              ? resolveSelectOptionValue(field.options, value)
                              : value;
                          const booleanAliasInfo =
                            field.type === 'boolean'
                              ? getBooleanAliasInfo(value) ??
                                getBooleanAliasInfo(booleanResolvedValue)
                              : null;
                          const booleanChecked = booleanAliasInfo?.state === 'true';
                          const hasSliderBounds =
                            field.type === 'number' &&
                            Number.isFinite(field.min) &&
                            Number.isFinite(field.max) &&
                            (field.min as number) <= (field.max as number);
                          const sliderMin = hasSliderBounds ? (field.min as number) : 0;
                          const sliderMax = hasSliderBounds ? (field.max as number) : 0;
                          const requestedNumberControl = resolveNumberFieldControlType(field.format);
                          const numberFieldStep = resolveNumberFieldStep(field.format) ?? 1;
                          const sliderPrecision = hasSliderBounds
                            ? Math.max(
                                getNumberPrecision(numberFieldStep),
                                getNumberPrecision(sliderMin),
                                getNumberPrecision(sliderMax)
                              )
                            : 0;
                          const parsedNumberValue = Number(value);
                          const clampedSliderValue = hasSliderBounds
                            ? Number.isFinite(parsedNumberValue)
                              ? snapValueToStep(
                                  parsedNumberValue,
                                  sliderMin,
                                  sliderMax,
                                  numberFieldStep,
                                  sliderPrecision
                                )
                              : sliderMin
                            : 0;
                          const hasEffectiveSliderValue = String(value).trim().length > 0;
                          const showSliderValue = hasEffectiveSliderValue || isTouched;
                          const shouldRenderSlider =
                            field.type === 'number' &&
                            hasSliderBounds &&
                            requestedNumberControl !== 'input';
                          const sliderValueLabel = formatNumericValue(
                            clampedSliderValue,
                            sliderPrecision
                          );
                          const sliderMinLabel = formatNumericValue(sliderMin, sliderPrecision);
                          const sliderMaxLabel = formatNumericValue(sliderMax, sliderPrecision);

                          return (
                            <div
                              key={fieldId}
                              className={`rounded-lg border ${borderColor} bg-[#0f172a]/45 p-3 sm:p-4`}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-[minmax(185px,1.15fr)_minmax(0,1.1fr)] items-center gap-3 sm:gap-4">
                                <div className="relative" data-game-config-help>
                                  <label
                                    className={`flex items-center gap-2 text-sm font-semibold leading-tight sm:pr-2 ${textPrimary}`}
                                  >
                                    <span className="break-all">{fieldLabel}</span>
                                    {fieldDescription && (
                                      <button
                                        type="button"
                                        aria-label={`Show info for ${fieldLabel}`}
                                        aria-expanded={openFieldHelpId === fieldId}
                                        onClick={() =>
                                          setOpenFieldHelpId((current) =>
                                            current === fieldId ? null : fieldId
                                          )
                                        }
                                        className="inline-flex h-5 shrink-0 items-center justify-center px-0.5 text-[var(--color-cyan-400)]/80 transition-colors hover:text-[var(--color-cyan-400)]"
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </label>
                                  {fieldDescription && openFieldHelpId === fieldId && (
                                    <div className="absolute left-0 top-full z-20 mt-3 w-[280px] max-w-[calc(100vw-4rem)]">
                                      <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-gray-700/80 bg-[#0b1220]" />
                                      <div className="relative rounded-xl border border-gray-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(11,18,32,0.98))] px-3.5 py-3 text-xs font-normal leading-relaxed text-gray-300 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-sm">
                                        {fieldDescription}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  {field.type === 'boolean' ? (
                                    <div className="flex items-center justify-end">
                                      <AppToggle
                                        ariaLabel={`Toggle ${field.key}`}
                                        checked={booleanChecked}
                                        onChange={(checked) =>
                                          handleBooleanFieldChange(fieldId, field, checked)
                                        }
                                        className="shrink-0"
                                      />
                                    </div>
                                  ) : field.type === 'select' ? (
                                    <AppSelect
                                      value={selectValue}
                                      onChange={(nextValue) =>
                                        handleSelectFieldChange(fieldId, field, nextValue)
                                      }
                                      options={[
                                        ...(value &&
                                        selectValue === value &&
                                        !field.options.some((option) => option.value === value)
                                          ? [{ label: `${value} (current)`, value }]
                                          : []),
                                        ...field.options.map((option) => ({
                                          label: option.label,
                                          value: option.value,
                                        })),
                                      ]}
                                      className="w-full gp-game-config-select"
                                    />
                                  ) : field.type === 'number' ? (
                                    shouldRenderSlider ? (
                                      <div className="space-y-1.5">
                                        <input
                                          type="range"
                                          min={sliderMin}
                                          max={sliderMax}
                                          step={numberFieldStep}
                                          value={clampedSliderValue}
                                          onChange={(event) =>
                                            handleFieldChange(
                                              fieldId,
                                              formatNumericValue(
                                                snapValueToStep(
                                                  Number(event.target.value),
                                                  sliderMin,
                                                  sliderMax,
                                                  numberFieldStep,
                                                  sliderPrecision
                                                ),
                                                sliderPrecision
                                              )
                                            )
                                          }
                                          aria-label={field.key}
                                          className="gp-game-config-range w-full"
                                        />
                                        <div
                                          className={`grid grid-cols-3 items-center text-[11px] ${textSecondary}`}
                                        >
                                          <span className="text-left">{sliderMinLabel}</span>
                                          <span className={`text-center text-xs font-semibold ${textPrimary}`}>
                                            {showSliderValue ? sliderValueLabel : ''}
                                          </span>
                                          <span className="text-right">{sliderMaxLabel}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <AppInput
                                          type="number"
                                          value={value}
                                          min={field.min}
                                          max={field.max}
                                          step={resolveNumberFieldStep(field.format) ?? 'any'}
                                          onChange={(event) =>
                                            handleFieldChange(fieldId, event.target.value)
                                          }
                                          className="w-full px-3 py-2 bg-[#1f2937] border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)]/40 focus:border-[var(--color-cyan-400)]"
                                        />
                                      </>
                                    )
                                  ) : (
                                    <AppInput
                                      type="text"
                                      value={value}
                                      onChange={(event) =>
                                        handleFieldChange(fieldId, event.target.value)
                                      }
                                      className="w-full px-3 py-2 bg-[#1f2937] border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)]/40 focus:border-[var(--color-cyan-400)]"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canWriteFileManager && verifiedConfigFiles.length > 0 && (
                <div className="flex items-center justify-center gap-3 py-4 sm:py-5">
                  <AppButton
                    onClick={handleSaveConfiguration}
                    disabled={!configChanged || savingConfiguration || verifiedConfigFiles.length === 0}
                    className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#0050D7] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#157EEA] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingConfiguration ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>{savingConfiguration ? 'Saving...' : 'Save Configuration'}</span>
                  </AppButton>
                </div>
              )}

              <GameConfigAdvancedLinks
                configFiles={detectedConfigFiles}
                isLoading={configFilesLoading}
                error={configFilesError}
                canReadFileManager={canReadFileManager}
                canWriteFileManager={canWriteFileManager}
                onOpenFileManagerPath={openFileInFileManager}
              />
            </div>
          )}
        </div>
      </div>

      {showSaveSuccessToast && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex w-[calc(100%-2rem)] justify-end sm:bottom-6 sm:right-6">
          <div className="gp-log-prompt-toast w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-500/30 bg-[linear-gradient(180deg,rgba(6,35,30,0.98)_0%,rgba(6,22,17,0.98)_100%)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="flex items-start gap-3 p-4 sm:p-5">
              <div className="gp-log-prompt-toast-icon mt-0.5 rounded-xl bg-emerald-500/10 p-2.5 text-emerald-300 ring-1 ring-emerald-400/20">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Game settings saved</p>
                <p className="mt-1 text-sm leading-6 text-slate-200">{saveSuccessMessage}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBottomStatusPanel && (
        <div
          className={`sticky bottom-0 ${contentBg} border-t ${borderColor} p-3 md:p-6 md:-mx-6 space-y-3`}
        >
          {!canWriteFileManager && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <p className={`text-sm ${textSecondary}`}>
                Read-only mode: `fs.write` permission is required to save game settings.
              </p>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className={`text-sm ${textSecondary}`}>{saveError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



