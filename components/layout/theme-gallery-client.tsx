'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImageFilters, ImageHandleProps } from '~/types/props'
import { useSwrPageTotalHook } from '~/hooks/use-swr-page-total-hook'
import SimpleGallery from '~/components/layout/theme/simple/main/simple-gallery'
import WaterfallGallery from '~/components/layout/theme/waterfall/main/waterfall-gallery'
import { Button } from '~/components/ui/button'
import { Filter, LayoutGrid, Rows, ArrowUpDown } from 'lucide-react'
import { MultiSelect } from '~/components/ui/multi-select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover'

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface ThemeGalleryClientProps extends ImageHandleProps {
  systemStyle: string
  preferredStyle?: 'waterfall' | 'single'
  enableFilters?: boolean
  filterOptions?: { cameras: string[]; lenses: string[] }
  tagOptions?: string[]
}

type GalleryStyle = 'waterfall' | 'single'
type SortDirection = 'desc' | 'asc' | undefined
type TagsOperator = 'and' | 'or'

/* ─────────────────────────────────────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────────────────────────────────────── */

const POPOVER_SELECTORS = [
  '[data-slot="popover-content"]',
  '[data-slot="popover"]',
  '[role="dialog"]',
  '[data-radix-popper-content-wrapper]',
  '[data-slot="command"]',
  '[data-slot="command-input"]',
  '[data-slot="command-list"]',
  '[data-slot="command-item"]',
  '[data-slot="command-group"]',
  '[cmdk-root]',
  '[cmdk-input]',
  '[cmdk-list]',
  '[cmdk-item]',
  '[cmdk-group]',
] as const

const SCROLL_THRESHOLD = 8

/* ─────────────────────────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────────────────────────── */

export default function ThemeGalleryClient({
  systemStyle,
  preferredStyle,
  enableFilters = false,
  filterOptions,
  tagOptions,
  ...props
}: ThemeGalleryClientProps) {
  /* ── Refs ────────────────────────────────────────────────────────────────── */
  const filterPanelRef = useRef<HTMLDivElement | null>(null)

  /* ── 数据获取 ─────────────────────────────────────────────────────────────── */
  const { data: total } = useSwrPageTotalHook(props)

  /* ── 派生值 ──────────────────────────────────────────────────────────────── */
  const isSingleAlbum = props.album && props.album !== '/' && props.album !== 'all'
  const isHomePage = props.album === '/'

  const baseStyle: GalleryStyle = useMemo(() => {
    if (preferredStyle) return preferredStyle
    if (isSingleAlbum && typeof total === 'number') {
      return total > 10 ? 'waterfall' : 'single'
    }
    return systemStyle === '1' ? 'single' : 'waterfall'
  }, [isSingleAlbum, total, systemStyle, preferredStyle])

  /* ── 主题切换状态 ─────────────────────────────────────────────────────────── */
  const [currentStyle, setCurrentStyle] = useState<GalleryStyle>(baseStyle)
  const [isUserOverridden, setIsUserOverridden] = useState(false)

  /* ── 筛选面板状态 ─────────────────────────────────────────────────────────── */
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const [selectedCameras, setSelectedCameras] = useState<string[]>([])
  const [selectedLenses, setSelectedLenses] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagsOperator, setTagsOperator] = useState<TagsOperator>('and')

  /* ── 排序状态 ─────────────────────────────────────────────────────────────── */
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  /* ── Effect: 同步 baseStyle → currentStyle（用户未手动切换时） ─────────────── */
  useEffect(() => {
    if (!isUserOverridden) {
      setCurrentStyle(baseStyle)
    }
  }, [baseStyle, isUserOverridden])

  /* ── Effect: 筛选面板关闭且标签为空时，重置 tagsOperator ─────────────────── */
  useEffect(() => {
    if (!isFilterPanelOpen && selectedTags.length === 0) {
      setTagsOperator('and')
    }
  }, [isFilterPanelOpen, selectedTags.length])

  /* ── Effect: 滚动时自动收起筛选面板 ───────────────────────────────────────── */
  useEffect(() => {
    if (!enableFilters) return

    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (isFilterPanelOpen && currentScrollY > lastScrollY + SCROLL_THRESHOLD) {
        setIsFilterPanelOpen(false)
      }
      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [enableFilters, isFilterPanelOpen])

  /* ── Effect: 点击外部区域时关闭筛选面板 ───────────────────────────────────── */
  useEffect(() => {
    if (!enableFilters || !isFilterPanelOpen) return

    const handleClickOutside = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target) return

      if (filterPanelRef.current?.contains(target)) return
      if (target.closest('[aria-controls="gallery-filter-panel"]')) return

      const isInsidePopover = POPOVER_SELECTORS.some(selector => {
        try {
          return target.closest(selector) !== null
        } catch {
          return false
        }
      })
      if (isInsidePopover) return

      setIsFilterPanelOpen(false)
    }

    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [enableFilters, isFilterPanelOpen])

  /* ── 派生：构建筛选条件对象 ──────────────────────────────────────────────── */
  const filters: (ImageFilters & { tagsOperator?: TagsOperator }) | undefined = useMemo(() => {
    if (!enableFilters) return undefined
    return {
      cameras: selectedCameras.length ? selectedCameras : undefined,
      lenses: selectedLenses.length ? selectedLenses : undefined,
      tags: selectedTags.length ? selectedTags : undefined,
      tagsOperator: selectedTags.length > 0 ? tagsOperator : undefined,
    }
  }, [enableFilters, selectedCameras, selectedLenses, selectedTags, tagsOperator])

  /* ── Handlers ────────────────────────────────────────────────────────────── */
  const handleToggleTheme = () => {
    setIsUserOverridden(true)
    setCurrentStyle(prev => (prev === 'waterfall' ? 'single' : 'waterfall'))
  }

  const handleToggleFilterPanel = () => setIsFilterPanelOpen(prev => !prev)

  /* ── 派生：Gallery 组件 props ─────────────────────────────────────────────── */
  const galleryProps = useMemo(() => ({
    ...props,
    filters,
    sortByShootTime: enableFilters && isHomePage ? sortDirection : undefined,
  }), [props, filters, enableFilters, isHomePage, sortDirection])

  const toggleButtonLabel = currentStyle === 'waterfall' ? '切换到单列' : '切换到瀑布流'

  const sortButtonTitle = useMemo(() => {
    if (sortDirection === 'desc') return '拍摄时间：从新到旧'
    if (sortDirection === 'asc') return '拍摄时间：从旧到新'
    return '默认排序'
  }, [sortDirection])

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <>
      {currentStyle === 'waterfall'
        ? <WaterfallGallery {...galleryProps} />
        : <SimpleGallery {...galleryProps} />}

      {/* 悬浮操作按钮组 */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
        {enableFilters && (
          <>
            {isHomePage && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full bg-background/85 backdrop-blur-sm shadow-lg border-border hover:bg-accent"
                    title={sortButtonTitle}
                  >
                    <ArrowUpDown className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-[--trigger-width] p-1 bg-popover/95 backdrop-blur-md border border-border/50 shadow-lg rounded-md" 
                  align="end"
                  sideOffset={8}
                >
                  <div className="max-h-[inherit] overflow-auto outline-none">
                    <button
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortDirection === 'desc'
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-foreground hover:bg-accent/50 hover:text-accent-foreground'
                      }`}
                      onClick={() => setSortDirection('desc')}
                    >
                      从新到旧
                    </button>
                    <button
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortDirection === 'asc'
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-foreground hover:bg-accent/50 hover:text-accent-foreground'
                      }`}
                      onClick={() => setSortDirection('asc')}
                    >
                      从旧到新
                    </button>
                    <button
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        sortDirection === undefined
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-foreground hover:bg-accent/50 hover:text-accent-foreground'
                      }`}
                      onClick={() => setSortDirection(undefined)}
                    >
                      默认排序
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full bg-background/85 backdrop-blur-sm shadow-lg border-border hover:bg-accent"
              onClick={handleToggleFilterPanel}
              title={isFilterPanelOpen ? '收起筛选' : '展开筛选'}
              aria-expanded={isFilterPanelOpen}
              aria-controls="gallery-filter-panel"
            >
              <Filter className="h-5 w-5" />
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full bg-background/80 backdrop-blur-sm shadow-lg border-border hover:bg-accent"
          onClick={handleToggleTheme}
          title={toggleButtonLabel}
        >
          {currentStyle === 'waterfall'
            ? <Rows className="h-5 w-5" />
            : <LayoutGrid className="h-5 w-5" />}
        </Button>
      </div>

      {/* 筛选面板 */}
      {enableFilters && isFilterPanelOpen && (
        <div
          id="gallery-filter-panel"
          ref={filterPanelRef}
          className="fixed bottom-24 right-8 z-50 w-[min(92vw,520px)] rounded-2xl border border-border/60 bg-background/85 shadow-2xl supports-[backdrop-filter]:backdrop-blur-xl"
        >
          <div className="px-4 pt-3 pb-4 space-y-3 text-xs md:text-sm text-foreground/80">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <MultiSelect
                label="相机"
                placeholder="选择相机型号"
                options={(filterOptions?.cameras || []).map(v => ({ label: v, value: v }))}
                selected={selectedCameras}
                onChange={setSelectedCameras}
                className="bg-background/70 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]"
              />
              <MultiSelect
                label="镜头"
                placeholder="选择镜头型号"
                options={(filterOptions?.lenses || []).map(v => ({ label: v, value: v }))}
                selected={selectedLenses}
                onChange={setSelectedLenses}
                className="bg-background/70 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]"
              />
              <div className="space-y-2">
                <MultiSelect
                  label="标签"
                  placeholder="选择标签"
                  options={(tagOptions || []).map(v => ({ label: v, value: v }))}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  className="bg-background/70 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)]"
                />
                {selectedTags.length > 0 && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs text-foreground/60">标签逻辑：</span>
                    <button
                      type="button"
                      onClick={() => setTagsOperator('and')}
                      className={`px-2 py-0.5 text-xs border rounded transition-colors ${
                        tagsOperator === 'and'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-accent'
                      }`}
                    >
                      AND
                    </button>
                    <button
                      type="button"
                      onClick={() => setTagsOperator('or')}
                      className={`px-2 py-0.5 text-xs border rounded transition-colors ${
                        tagsOperator === 'or'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-accent'
                      }`}
                    >
                      OR
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
