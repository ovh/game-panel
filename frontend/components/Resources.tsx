import { BookOpen, Video, FileText, ExternalLink, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiClient, type CatalogResourceItem } from '../utils/api';
import { AppButton, AppCard, AppInput, AppSelect } from '../src/ui/components';

const MAX_VISIBLE_RESOURCES = 9;

export function Resources() {
  const [resources, setResources] = useState<CatalogResourceItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const cardBg = 'bg-[#111827]';
  const cardBorder = 'border-gray-800';
  const textPrimary = 'text-white';
  const textSecondary = 'text-gray-300';
  const textTertiary = 'text-gray-400';
  const inputBg = 'bg-[#1f2937]';
  const inputBorder = 'border-gray-700';

  useEffect(() => {
    let cancelled = false;

    const loadResources = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await apiClient.getResources({ limit: 200 });
        if (cancelled) return;
        setResources(Array.isArray(response.resources) ? response.resources : []);
      } catch (error) {
        console.error('Failed to load resources:', error);
        if (!cancelled) {
          setResources([]);
          setLoadError('Unable to load resources right now.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setShowAll(false);
  }, [searchQuery, selectedCategory]);

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(new Set(resources.map((resource) => resource.category))).sort((a, b) =>
        a.localeCompare(b)
      ),
    ],
    [resources]
  );

  const filteredResources = useMemo(
    () =>
      resources.filter((resource) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          resource.title.toLowerCase().includes(query) ||
          resource.description.toLowerCase().includes(query) ||
          String(resource.gameKey ?? '')
            .toLowerCase()
            .includes(query);
        const matchesCategory =
          selectedCategory === 'All' || resource.category === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [resources, searchQuery, selectedCategory]
  );

  const displayedResources = showAll
    ? filteredResources
    : filteredResources.slice(0, MAX_VISIBLE_RESOURCES);
  const hasMoreResources = filteredResources.length > MAX_VISIBLE_RESOURCES;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="w-6 h-6" />;
      case 'article':
      default:
        return <FileText className="w-6 h-6" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'video':
        return 'bg-purple-900/40 text-purple-400';
      case 'article':
      default:
        return 'bg-blue-900/40 text-blue-400';
    }
  };

  return (
    <AppCard
      className={`mx-auto w-full max-w-7xl ${cardBg} overflow-hidden rounded-2xl border ${cardBorder} shadow-2xl`}
    >
      <div className={`p-8 pb-6 border-b border-gray-800`}>
        <h1 className={`text-2xl md:text-3xl font-bold mb-3 ${textPrimary}`}>
          Resources & Tutorials
        </h1>
        <p className={`text-lg ${textTertiary}`}>
          Learn how to manage your game servers effectively
        </p>
      </div>

      <div className="p-8 pb-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className={`${textPrimary} text-sm font-medium block mb-2`}>
              Search Resources
            </label>
            <div className="relative">
              <Search
                className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${textTertiary}`}
              />
              <AppInput
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, description, or game key..."
                className={`h-12 w-full ${inputBg} border ${inputBorder} rounded-lg pl-12 pr-4 ${textPrimary} focus:outline-none focus:border-[#0050D5] focus:ring-2 focus:ring-[#0050D5]/30 placeholder-gray-500 transition-all`}
              />
            </div>
          </div>

          <div>
            <label className={`${textPrimary} text-sm font-medium block mb-2`}>
              Filter by Category
            </label>
            <AppSelect
              value={selectedCategory}
              onChange={(value) => setSelectedCategory(value)}
              options={categories.map((category) => ({ label: category, value: category }))}
              className={`gp-resources-select w-full ${textPrimary} transition-all cursor-pointer`}
            />
          </div>
        </div>
      </div>

      <div className="px-8 pb-4">
        <p className={`${textTertiary} text-sm font-medium`}>
          Showing {filteredResources.length}{' '}
          {filteredResources.length === 1 ? 'resource' : 'resources'}
        </p>
      </div>

      {isLoading && (
        <div className="px-8 pb-8">
          <div className="bg-[#1a2332] rounded-xl p-12 text-center">
            <p className={`${textTertiary} text-base`}>Loading resources...</p>
          </div>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="px-8 pb-8">
          <div className="bg-[#1a2332] rounded-xl p-12 text-center">
            <h3 className={`text-xl font-semibold mb-3 ${textPrimary}`}>
              Unable to load resources
            </h3>
            <p className={`${textTertiary} text-base`}>{loadError}</p>
          </div>
        </div>
      )}

      {!isLoading && !loadError && (
        <>
          <div className="px-8 pb-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedResources.map((resource) => (
              <a
                key={resource.id}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${cardBg} rounded-xl p-6 border ${cardBorder} hover:border-gray-700 transition-all duration-300 group hover:shadow-xl hover:-translate-y-1`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div
                    className={`${getTypeBadgeColor(resource.mediaType)} p-3 rounded-lg shadow-sm`}
                  >
                    {getTypeIcon(resource.mediaType)}
                  </div>
                  <ExternalLink
                    className={`w-5 h-5 ${textTertiary} opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1 group-hover:-translate-y-1`}
                  />
                </div>

                <h3
                  className={`text-xl font-semibold mb-3 ${textPrimary} group-hover:text-[#0050D5] transition-colors`}
                >
                  {resource.title}
                </h3>

                <p className={`${textSecondary} text-sm mb-5 line-clamp-2 leading-relaxed`}>
                  {resource.description}
                </p>

                <div
                  className={`flex items-center justify-between gap-2 pt-4 border-t border-gray-800`}
                >
                  <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-800 text-gray-300">
                    {resource.category}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {resource.gameKey && (
                      <span className="px-2 py-1 rounded-full bg-gray-800/80 text-gray-300">
                        {resource.gameKey.toUpperCase()}
                      </span>
                    )}
                    {Number.isFinite(resource.readTimeMinutes) && resource.readTimeMinutes > 0 && (
                      <span className="font-medium">{resource.readTimeMinutes} min</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>

          {hasMoreResources && (
            <div className="px-8 pb-8 text-center">
              <AppButton
                onClick={() => setShowAll(!showAll)}
                tone="primary"
                className="px-8 py-4 bg-[#0050D5] text-white transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {showAll
                  ? 'Show Less'
                  : `See More Resources (${filteredResources.length - MAX_VISIBLE_RESOURCES} more)`}
              </AppButton>
            </div>
          )}

          {filteredResources.length === 0 && (
            <div className="px-8 pb-8">
              <div className="bg-[#1a2332] rounded-xl p-16 text-center">
                <div className="bg-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <BookOpen className={`w-10 h-10 ${textTertiary}`} />
                </div>
                <h3 className={`text-2xl font-semibold mb-3 ${textPrimary}`}>No resources found</h3>
                <p className={`${textTertiary} text-base`}>
                  Try adjusting your search or filter criteria
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </AppCard>
  );
}
