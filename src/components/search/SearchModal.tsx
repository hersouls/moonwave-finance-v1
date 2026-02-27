import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '@/hooks/useSearch'
import { SearchResultItem } from './SearchResultItem'
import { useUIStore } from '@/stores/uiStore'

export function SearchModal() {
  const isOpen = useUIStore((s) => s.isSearchModalOpen)
  const close = useUIStore((s) => s.closeSearchModal)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { results, isSearching } = useSearch(query)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setActiveIndex(0)
  }, [results])

  const handleSelect = (path: string) => {
    close()
    navigate(path)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[activeIndex]) {
      handleSelect(results[activeIndex].path)
    } else if (e.key === 'Escape') {
      close()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={close}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-zinc-700">
          <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="자산, 거래, 카테고리 검색..."
            className="flex-1 py-4 text-sm bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Results */}
        {query && (
          <div className="max-h-80 overflow-y-auto">
            {isSearching ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-400">검색 중...</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-400">검색 결과가 없습니다</div>
            ) : (
              <div className="py-2">
                {results.map((r, i) => (
                  <SearchResultItem
                    key={`${r.type}-${r.id}`}
                    result={r}
                    isActive={i === activeIndex}
                    onClick={() => handleSelect(r.path)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-4 text-xs text-zinc-400">
          <span>↑↓ 이동</span>
          <span>↵ 선택</span>
          <span>ESC 닫기</span>
        </div>
      </div>
    </div>
  )
}
