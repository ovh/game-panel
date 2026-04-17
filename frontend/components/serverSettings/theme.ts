import type { SettingsTab } from './access';

export const SERVER_SETTINGS_THEME = {
  modalBg: 'bg-[#0f172a]',
  sidebarBg: 'bg-[#1e293b]',
  contentBg: 'bg-[#111827]',
  borderColor: 'border-gray-700',
  textPrimary: 'text-white',
  textSecondary: 'text-gray-400',
  hoverBg: 'hover:bg-gray-700',
  activeBg: 'bg-[var(--gp-primary-300)]',
  inputBg: 'bg-[#1f2937]',
  inputBorder: 'border-gray-600',
} as const;

export function createSettingsTabButtonClass(
  activeTab: SettingsTab,
  canAccessTab: (tab: SettingsTab) => boolean,
  activeBg: string,
  textPrimary: string,
  hoverBg: string
) {
  return (tab: SettingsTab) =>
    `transition-colors ${
      !canAccessTab(tab)
        ? 'text-gray-500 bg-transparent cursor-not-allowed opacity-60'
        : activeTab === tab
          ? `${activeBg} text-[#031126]`
          : `${textPrimary} bg-transparent ${hoverBg}`
    }`;
}
