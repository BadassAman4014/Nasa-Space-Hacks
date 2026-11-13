import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Sprout, Layers, MapPin, Compass, Navigation } from 'lucide-react';
import {
  executeUnifiedSearch,
  type SearchResult,
  type SearchResultCategory,
} from '../../services/geocodingService';
import type { SavedField, UserFarm } from '../../services/boundariesApi';

interface MapSearchBarProps {
  mode: 'dashboard' | 'explorer';
  placeholder?: string;
  savedFields: SavedField[];
  savedFarms?: UserFarm[];
  onSelectResult: (result: SearchResult) => void;
  className?: string;
  darkSurface?: boolean;
}

export const MapSearchBar: React.FC<MapSearchBarProps> = ({
  mode,
  placeholder,
  savedFields,
  savedFarms = [],
  onSelectResult,
  className = '',
  darkSurface = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  const defaultPlaceholder =
    mode === 'dashboard'
      ? 'Search saved fields, farms, or locations...'
      : 'Search municipalities, regions, or coordinates...';

  // Perform search with 180ms debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await executeUnifiedSearch(query, {
          mode,
          savedFields,
          savedFarms,
        });
        setResults(res);
        setIsOpen(res.length > 0);
        setSelectedIndex(-1);
      } catch (err) {
        console.warn('Unified search error:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, mode, savedFields, savedFarms]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (item: SearchResult) => {
      onSelectResult(item);
      setIsOpen(false);
      setQuery(item.title);
    },
    [onSelectResult]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const getCategoryIcon = (cat: SearchResultCategory) => {
    switch (cat) {
      case 'field':
        return <Sprout size={14} className="text-[#1fa35b]" />;
      case 'farm':
        return <Layers size={14} className="text-[#8b5cf6]" />;
      case 'coordinates':
        return <Compass size={14} className="text-[#f59e0b]" />;
      default:
        return <MapPin size={14} className="text-[#0284c7]" />;
    }
  };

  const getBadgeStyle = (cat: SearchResultCategory) => {
    switch (cat) {
      case 'field':
        return 'bg-[#1fa35b]/15 text-[#1fa35b] border-[#1fa35b]/30';
      case 'farm':
        return 'bg-[#8b5cf6]/15 text-[#8b5cf6] border-[#8b5cf6]/30';
      case 'coordinates':
        return 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30';
      default:
        return 'bg-[#0284c7]/15 text-[#0284c7] border-[#0284c7]/30';
    }
  };

  // Helper to highlight matching text
  const highlightMatch = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} className="font-bold underline decoration-[#1fa35b] text-[#1fa35b]">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-xl border transition shadow-sm ${
          darkSurface
            ? 'bg-[#1a1a1a] border-[#3a3a3a] text-white focus-within:border-[#1fa35b]'
            : 'bg-white border-[#e5e7eb] text-[#111] focus-within:border-[#1fa35b] focus-within:ring-2 focus-within:ring-[#1fa35b]/20'
        } px-3 py-2`}
      >
        <Search size={16} className={darkSurface ? 'text-[#888]' : 'text-[#9ca3af]'} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          className={`w-full bg-transparent text-xs font-medium focus:outline-none placeholder:text-gray-400 ${
            darkSurface ? 'text-white' : 'text-gray-900'
          }`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className={`p-0.5 rounded-full hover:bg-gray-200/50 ${
              darkSurface ? 'text-[#888] hover:text-white' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Results Dropdown Menu */}
      {isOpen && results.length > 0 && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 max-h-72 overflow-y-auto rounded-xl border shadow-xl z-[600] ${
            darkSurface
              ? 'bg-[#1f1f1f] border-[#333] text-white'
              : 'bg-white border-[#e5e7eb] text-gray-900'
          }`}
        >
          <div className="py-1">
            {results.map((item, idx) => {
              const isHighlighted = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-2.5 transition ${
                    isHighlighted
                      ? darkSurface
                        ? 'bg-[#2a2a2a]'
                        : 'bg-[#f3f4f6]'
                      : 'hover:bg-opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0">{getCategoryIcon(item.category)}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {highlightMatch(item.title, query)}
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          darkSurface ? 'text-[#888]' : 'text-gray-500'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${getBadgeStyle(
                      item.category
                    )}`}
                  >
                    {item.badge}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

