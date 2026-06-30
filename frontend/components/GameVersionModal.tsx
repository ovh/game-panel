import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { AppButton } from '../src/ui/components';
import type { OvhcloudImage } from '../utils/ovhcloudCatalog';

const MC_SERVER_TYPES: { key: string; label: string }[] = [
  { key: 'vanilla',  label: 'Java Edition' },
  { key: 'bedrock',  label: 'Bedrock Edition' },
  { key: 'paper',    label: 'Paper' },
  { key: 'fabric',   label: 'Fabric' },
  { key: 'neoforge', label: 'NeoForge' },
];

function getMcServerType(imageId: string): string {
  if (imageId.includes('paper'))        return 'paper';
  if (imageId.includes('java-edition')) return 'vanilla';
  if (imageId.includes('fabric'))       return 'fabric';
  if (imageId.includes('neoforge'))     return 'neoforge';
  if (imageId.includes('bedrock'))      return 'bedrock';
  return 'unknown';
}

function getMcVersion(imageId: string): string | null {
  const m = /java(\d+)$/.exec(imageId);
  return m ? `Java ${m[1]}` : null;
}

interface GameVersionModalProps {
  images: OvhcloudImage[];
  onSelect: (image: OvhcloudImage) => void;
  onClose: () => void;
}

export function GameVersionModal({ images, onSelect, onClose }: GameVersionModalProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const availableTypes = MC_SERVER_TYPES.filter(t =>
    images.some(img => getMcServerType(img.imageId) === t.key)
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gradient-to-br dark:from-[#1f2937] dark:to-[#111827] border border-gray-200 dark:border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Minecraft</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Select server type and version</p>
          </div>
          <AppButton tone="ghost" onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </AppButton>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Server Type
          </p>
          <div className="grid grid-cols-1 gap-2">
            {availableTypes.map(({ key, label }) => {
              const isSelected = selectedType === key;
              const typeImages = images.filter(img => getMcServerType(img.imageId) === key);
              const isBedrock = key === 'bedrock';

              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => setSelectedType(isSelected ? null : key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-[var(--gp-ods-accent-primary)] dark:border-[var(--color-cyan-400)] bg-[var(--gp-ods-accent-primary)]/8 dark:bg-[var(--color-cyan-400)]/10'
                        : 'border-gray-200 dark:border-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600/50 bg-gp-surface-elevated'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${isSelected ? 'text-[var(--gp-ods-accent-primary)] dark:text-[var(--color-cyan-400)]' : 'text-gray-900 dark:text-white'}`}>
                        {label}
                      </p>
                    </div>
                    <ArrowRight className={`w-4 h-4 flex-shrink-0 transition-transform ${isSelected ? 'rotate-90 text-[var(--gp-ods-accent-primary)] dark:text-[var(--color-cyan-400)]' : 'text-gray-300 dark:text-gray-600'}`} />
                  </button>

                  {/* Version buttons expand inline below the selected type */}
                  {isSelected && (
                    <div className="mt-2 mb-1 pl-4 border-l-2 border-[var(--gp-ods-accent-primary)]/30 dark:border-[var(--color-cyan-400)]/30 ml-4">
                      {isBedrock ? (
                        <AppButton
                          type="button"
                          onClick={() => onSelect(typeImages[0])}
                          tone="primary"
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                          Configure <ArrowRight className="w-3.5 h-3.5" />
                        </AppButton>
                      ) : (
                        <div className="flex flex-wrap gap-2 py-1">
                          {typeImages.map(img => {
                            const version = getMcVersion(img.imageId);
                            return (
                              <button
                                key={img.imageId}
                                type="button"
                                onClick={() => onSelect(img)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all border-[var(--gp-ods-accent-primary)] dark:border-[var(--color-cyan-400)] bg-transparent text-[var(--gp-ods-accent-primary)] dark:text-[var(--color-cyan-400)] hover:bg-[var(--gp-ods-accent-primary)] dark:hover:bg-[var(--color-cyan-400)] hover:!text-white dark:hover:!text-[#0a1628]"
                              >
                                {version}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
