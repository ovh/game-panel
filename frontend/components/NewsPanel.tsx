import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  RotateCw,
  Server,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import { apiClient, type CatalogNewsItem } from '../utils/api';
import { AppBadge, AppButton, AppCard } from '../src/ui/components';

const NEWS_ICON_KEYS = [
  'server',
  'restart',
  'warning',
  'news',
  'update',
  'maintenance',
  'security',
  'event',
  'info',
  'success',
] as const;

type NewsIconKey = (typeof NEWS_ICON_KEYS)[number];
const NEWS_ICON_KEY_SET = new Set<string>(NEWS_ICON_KEYS);

const NEWS_ICON_ALIASES: Record<string, string> = {
  reboot: 'restart',
  alert: 'warning',
  announcement: 'news',
  announce: 'news',
};

const normalizeNewsIconKey = (iconKey: string | null | undefined): NewsIconKey => {
  const raw = String(iconKey ?? '')
    .trim()
    .toLowerCase();
  const normalized = NEWS_ICON_ALIASES[raw] || raw || 'news';
  return NEWS_ICON_KEY_SET.has(normalized) ? (normalized as NewsIconKey) : 'news';
};

const formatNewsDate = (timestamp: number): string => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return '-';
  return new Date(parsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export function NewsPanel() {
  const [newsItems, setNewsItems] = useState<CatalogNewsItem[]>([]);
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      try {
        const response = await apiClient.getNews(20);
        if (cancelled) return;

        setNewsItems(Array.isArray(response.news) ? response.news : []);
        setCurrentNewsIndex(0);
      } catch (error) {
        console.error('Failed to load news:', error);
        if (!cancelled) {
          setNewsItems([]);
          setCurrentNewsIndex(0);
        }
      }
    };

    void loadNews();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (newsItems.length <= 1) return;

    const interval = window.setInterval(() => {
      setCurrentNewsIndex((prev) => (prev + 1) % newsItems.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [newsItems.length]);

  useEffect(() => {
    if (newsItems.length === 0) {
      setCurrentNewsIndex(0);
      return;
    }

    if (currentNewsIndex >= newsItems.length) {
      setCurrentNewsIndex(0);
    }
  }, [currentNewsIndex, newsItems.length]);

  const nextNews = () => {
    if (newsItems.length === 0) return;
    setCurrentNewsIndex((prev) => (prev + 1) % newsItems.length);
  };

  const prevNews = () => {
    if (newsItems.length === 0) return;
    setCurrentNewsIndex((prev) => (prev - 1 + newsItems.length) % newsItems.length);
  };

  const currentNews = newsItems[currentNewsIndex] ?? null;
  const currentNewsIconKey = normalizeNewsIconKey(currentNews?.iconKey);

  const getNewsIcon = (iconType: string) => {
    const normalized = normalizeNewsIconKey(iconType);
    switch (normalized) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'maintenance':
        return <Settings className="w-5 h-5" />;
      case 'restart':
      case 'update':
        return <RotateCw className="w-5 h-5" />;
      case 'server':
        return <Server className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'news':
      case 'info':
        return <Info className="w-5 h-5" />;
      case 'security':
        return <Shield className="w-5 h-5" />;
      case 'event':
        return <Sparkles className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  return (
    <AppCard className="w-full overflow-hidden rounded-lg border border-gray-800">
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 p-4 pb-6 sm:pb-4 bg-gradient-to-r from-[#157EEA]/10 to-transparent">
        {currentNews ? (
          <>
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#0050D7]/20 text-[var(--color-cyan-400)]">
              {getNewsIcon(currentNews.iconKey)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Sparkles className="w-4 h-4 text-[var(--color-cyan-400)]" />
                <h3 className="font-semibold text-white text-sm md:text-base">
                  {currentNews.title}
                </h3>
                <AppBadge
                  tone="07"
                  className="whitespace-nowrap border border-slate-500/30 bg-slate-700/35 px-2 py-0.5 text-xs text-slate-200"
                >
                  {currentNewsIconKey}
                </AppBadge>
              </div>
              <p className="text-xs md:text-sm text-gray-400">{currentNews.description}</p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatNewsDate(currentNews.date)}
              </span>
              {newsItems.length > 1 && (
                <div className="flex items-center gap-1">
                  <AppButton
                    onClick={prevNews}
                    tone="ghost"
                    className="h-7 w-7 rounded border-none bg-transparent p-1.5 transition-colors hover:bg-gray-700"
                    aria-label="Previous news"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-400" />
                  </AppButton>
                  <span className="text-xs text-gray-400 min-w-[2rem] text-center">
                    {currentNewsIndex + 1}/{newsItems.length}
                  </span>
                  <AppButton
                    onClick={nextNews}
                    tone="ghost"
                    className="h-7 w-7 rounded border-none bg-transparent p-1.5 transition-colors hover:bg-gray-700"
                    aria-label="Next news"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </AppButton>
                </div>
              )}
            </div>

            {newsItems.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {newsItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentNewsIndex ? 'bg-[#0050D7] w-6' : 'bg-gray-600 w-1.5'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#0050D7]/20 text-[var(--color-cyan-400)]">
              <Info className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-[var(--color-cyan-400)]" />
                <h3 className="font-semibold text-white text-sm md:text-base">No news published</h3>
              </div>
              <p className="text-xs md:text-sm text-gray-400">
                News from the database will appear here.
              </p>
            </div>
          </>
        )}
      </div>
    </AppCard>
  );
}


