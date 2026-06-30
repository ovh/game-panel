const STEP_LABELS: Record<string, string> = {
  pulling_image: 'Pulling container image',
  preparing_files: 'Preparing server files',
  creating_container: 'Creating container',
  starting_container: 'Starting container',
  downloading_server_files: 'Downloading server files',
  extracting_server_files: 'Extracting server files',
  hytale_downloader_auth: 'Authenticating Hytale downloader',
  hytale_account_auth: 'Authenticating Hytale account',
  hytale_profile_selection: 'Selecting Hytale profile',
  configuring_hytale_auth: 'Configuring Hytale authentication',
};

export function getInstallStepLabel(key: string): string {
  return STEP_LABELS[key] ?? key.replace(/_/g, ' ');
}
