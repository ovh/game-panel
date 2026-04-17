import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../utils/api';
import {
  type AuthPermissions,
  type AuthUser,
  hasGlobalPermission,
  hasServerPermission,
  normalizeAuthPermissions,
} from '../../utils/permissions';

function emptyPermissions(): AuthPermissions {
  return { global: [], servers: [] };
}

export function useAuthSession() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentPermissions, setCurrentPermissions] = useState<AuthPermissions>(emptyPermissions);
  const [installPermissionsSyncing, setInstallPermissionsSyncing] = useState(false);

  const applyProfile = useCallback((profile: any) => {
    const user = profile?.user ?? null;
    setCurrentUser(user);
    setCurrentPermissions(normalizeAuthPermissions(profile?.permissions));
    setCurrentUserId(typeof user?.id === 'number' ? user.id : null);
  }, []);

  const clearProfile = useCallback(() => {
    setCurrentUser(null);
    setCurrentPermissions(emptyPermissions());
    setCurrentUserId(null);
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const profile = await apiClient.getCurrentUser();
      applyProfile(profile);
    } catch {
      clearProfile();
    }
  }, [applyProfile, clearProfile]);

  const refreshInstallPermissions = useCallback(async () => {
    setInstallPermissionsSyncing(true);
    try {
      await loadCurrentUser();
    } finally {
      setInstallPermissionsSyncing(false);
    }
  }, [loadCurrentUser]);

  useEffect(() => {
    let cancelled = false;

    const verifyToken = async () => {
      try {
        const token = apiClient.getAuthToken();
        if (!token) {
          if (!cancelled) {
            setIsAuthenticated(false);
            clearProfile();
          }
          return;
        }

        const profile = await apiClient.getCurrentUser();
        if (!cancelled) {
          setIsAuthenticated(true);
          applyProfile(profile);
        }
      } catch (error: any) {
        if (!cancelled) {
          if (error?.response?.status === 401) {
            apiClient.clearAuth();
          }
          setIsAuthenticated(false);
          clearProfile();
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
          setAuthReady(true);
        }
      }
    };

    void verifyToken();

    return () => {
      cancelled = true;
    };
  }, [applyProfile, clearProfile]);

  const canManageUsers = useMemo(
    () => hasGlobalPermission(currentUser, currentPermissions, 'users.manage'),
    [currentUser, currentPermissions]
  );

  const canInstallServers = useMemo(
    () => hasGlobalPermission(currentUser, currentPermissions, 'server.install'),
    [currentUser, currentPermissions]
  );

  const canAccessServer = useCallback(
    (serverId: string | number, permission: string) =>
      hasServerPermission(currentUser, currentPermissions, Number(serverId), permission),
    [currentUser, currentPermissions]
  );

  const serverPermissionsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    currentPermissions.servers.forEach((entry) => {
      map[String(entry.serverId)] = entry.permissions || [];
    });
    return map;
  }, [currentPermissions]);

  const resetSession = useCallback(() => {
    setIsAuthenticated(false);
    clearProfile();
  }, [clearProfile]);

  const markAuthenticated = useCallback(() => {
    setIsAuthenticated(true);
    setAuthChecking(false);
    setAuthReady(true);
  }, []);

  return {
    isAuthenticated,
    setIsAuthenticated,
    authChecking,
    authReady,
    currentUserId,
    currentUser,
    canManageUsers,
    canInstallServers,
    canAccessServer,
    serverPermissionsById,
    installPermissionsSyncing,
    loadCurrentUser,
    refreshInstallPermissions,
    resetSession,
    markAuthenticated,
  };
}
