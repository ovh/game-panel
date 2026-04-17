import { getApiErrorMessage } from './utils';

export async function resolveFileMutationError(
  action: string,
  error: any,
  _serverId?: number | null
): Promise<string> {
  const backendMessage = getApiErrorMessage(error);

  return backendMessage || `Failed to ${action}`;
}
