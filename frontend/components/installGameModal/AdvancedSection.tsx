import { ChevronDown } from 'lucide-react';
import { AppButton, AppInput, AppSelect } from '../../src/ui/components';

interface AdvancedSectionProps {
  borderColor: string;
  collapseBg: string;
  textPrimary: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  showHealthcheckAdvanced: boolean;
  setShowHealthcheckAdvanced: (show: boolean) => void;
  isLoading: boolean;
  dockerImage?: string | null;
  healthcheckType: 'default' | 'tcp_connect' | 'process';
  setHealthcheckType: (value: 'default' | 'tcp_connect' | 'process') => void;
  healthcheckPort: string;
  setHealthcheckPort: (value: string) => void;
  healthcheckProcess: string;
  setHealthcheckProcess: (value: string) => void;
}

export function AdvancedSection({
  borderColor,
  collapseBg,
  textPrimary,
  textSecondary,
  inputBg,
  inputBorder,
  inputFocus,
  showHealthcheckAdvanced,
  setShowHealthcheckAdvanced,
  isLoading,
  dockerImage,
  healthcheckType,
  setHealthcheckType,
  healthcheckPort,
  setHealthcheckPort,
  healthcheckProcess,
  setHealthcheckProcess,
}: AdvancedSectionProps) {
  return (
    <div className={`border ${borderColor} rounded-xl overflow-hidden`}>
      <AppButton
        onClick={() => setShowHealthcheckAdvanced(!showHealthcheckAdvanced)}
        className={`w-full px-5 py-3.5 flex items-center justify-between ${collapseBg} transition-all`}
        disabled={isLoading}
        type="button"
      >
        <span className={`font-semibold ${textPrimary} flex items-center gap-2`}>Advanced</span>
        <ChevronDown
          className={`w-5 h-5 ${textSecondary} transition-transform duration-300 ${
            showHealthcheckAdvanced ? 'rotate-180' : ''
          }`}
        />
      </AppButton>

      {showHealthcheckAdvanced && (
        <div className="p-5 space-y-5 border-t border-gray-700/20">
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider ${textSecondary} mb-2`}>
              Docker Image
            </label>
            <AppInput
              type="text"
              value={dockerImage || '-'}
              readOnly
              disabled
              className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl text-gray-300 opacity-70 cursor-not-allowed`}
            />
          </div>

          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider ${textSecondary} mb-2`}>
              Healthcheck Type
            </label>
            <p className={`text-xs leading-relaxed ${textSecondary} mb-2`}>
              Healthcheck is used to verify server status. Based on the selected method (default,
              TCP port, or process), the panel determines whether the server is{' '}
              <span className="text-gray-300">running</span> or{' '}
              <span className="text-gray-300">stopped</span>.
            </p>
            <AppSelect
              value={healthcheckType}
              onChange={(value) =>
                setHealthcheckType(value as 'default' | 'tcp_connect' | 'process')
              }
              options={[
                { label: 'Default', value: 'default' },
                { label: 'TCP Connect', value: 'tcp_connect' },
                { label: 'Process', value: 'process' },
              ]}
              disabled={isLoading}
              className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl ${textPrimary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
            />
          </div>

          {healthcheckType === 'tcp_connect' && (
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider ${textSecondary} mb-2`}>
                Container TCP Port
              </label>
              <AppInput
                type="number"
                min="1"
                max="65535"
                value={healthcheckPort}
                onChange={(e) => setHealthcheckPort(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. 25565"
                className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl ${textPrimary} placeholder:${textSecondary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
              />
            </div>
          )}

          {healthcheckType === 'process' && (
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider ${textSecondary} mb-2`}>
                Process Name
              </label>
              <AppInput
                type="text"
                value={healthcheckProcess}
                onChange={(e) => setHealthcheckProcess(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. java, srcds_linux, ShooterGameServer"
                className={`w-full px-4 py-3 ${inputBg} border ${inputBorder} rounded-xl ${textPrimary} placeholder:${textSecondary} ${inputFocus} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}



