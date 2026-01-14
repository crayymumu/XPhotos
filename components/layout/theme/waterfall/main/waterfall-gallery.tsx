'use client'

import type { ImageHandleProps } from '~/types/props.ts'
import type { ImageType } from '~/types'
import { useSwrPageTotalHook } from '~/hooks/use-swr-page-total-hook.ts'
import useSWRInfinite from 'swr/infinite'
import { useTranslations } from 'next-intl'
import { ReloadIcon } from '@radix-ui/react-icons'
import { Button } from '~/components/ui/button.tsx'
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { ImageGallery } from '~/components/ui/image-gallery'
import { useGalleryFilters } from '~/hooks/use-gallery-filters'

// ============ 常量配置 ============
const RENDER_BATCH_SIZE = 20      // 每批渲染图片数量
const RENDER_INTERVAL_MS = 50     // 批次间隔时间
const SCROLL_THRESHOLD_PX = 800   // 触发加载的滚动阈值
const EMPTY_ARRAY: string[] = []  // 空数组引用，避免重复创建

/**
 * 瀑布流图片画廊组件
 * 
 * 核心功能：
 * 1. 无限滚动加载 - 滚动到底部自动加载下一页
 * 2. 分批渲染 - 避免大量图片同时渲染导致卡顿
 * 3. 筛选支持 - 相机/镜头/标签多条件筛选
 */
export default function WaterfallGallery(props: Readonly<ImageHandleProps>) {
  // ============ Props 解构 ============
  const { filters, sortByShootTime, args, album, handle } = props
  const cameras = filters?.cameras || EMPTY_ARRAY
  const lenses = filters?.lenses || EMPTY_ARRAY
  const tags = filters?.tags || EMPTY_ARRAY
  const tagsOperator = filters?.tagsOperator || 'and'

  // ============ Hooks ============
  const t = useTranslations()
  const { data: pageTotalData } = useSwrPageTotalHook(props)
  const pageTotal = (pageTotalData as number) || 0

  // ============ Refs & State ============
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderedCount, setRenderedCount] = useState(RENDER_BATCH_SIZE)

  // ============ Memoized Values ============
  // 筛选条件唯一键，用于缓存失效和依赖追踪
  const filterKey = useMemo(
    () => [
      cameras.join(','),
      lenses.join(','),
      tags.join(','),
      tagsOperator,
      sortByShootTime || '',
    ].join('|'),
    [cameras, lenses, tags, tagsOperator, sortByShootTime]
  )

  // ============ 数据获取 ============
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<ImageType[]>(
    (index) => [`client-${args}-${index}-${album}-${filterKey}`, index],
    ([, index]: [string, number]) => handle(
      index + 1,
      album,
      cameras.length > 0 ? cameras : undefined,
      lenses.length > 0 ? lenses : undefined,
      tags.length > 0 ? tags : undefined,
      tags.length > 0 ? tagsOperator : 'and',
      sortByShootTime
    ) as Promise<ImageType[]>,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
    }
  )

  // 筛选逻辑（含防抖处理）
  const { dataList, isFiltering } = useGalleryFilters({
    cameras,
    lenses,
    tags,
    tagsOperator,
    sortByShootTime,
    data,
    isValidating,
    setSize,
    mutate,
  })

  // ============ 派生状态 ============
  // 当前批次渲染的图片
  const renderedImages = useMemo(
    () => dataList.slice(0, renderedCount),
    [dataList, renderedCount]
  )

  // 首次加载态
  const isInitialLoading = useMemo(
    () => isLoading && dataList.length === 0,
    [isLoading, dataList.length]
  )

  // ============ 事件处理 ============
  // 滚动到底部时加载下一页
  const handleScroll = useCallback(() => {
    if (!containerRef.current || isValidating || size >= pageTotal) return
    const { scrollY, innerHeight } = window
    const { scrollHeight } = document.documentElement
    if (scrollY + innerHeight >= scrollHeight - SCROLL_THRESHOLD_PX) {
      setSize(size + 1)
    }
  }, [isValidating, size, pageTotal, setSize])

  // ============ 副作用 ============
  // 筛选条件变更时重置渲染数量
  useEffect(() => {
    setRenderedCount(RENDER_BATCH_SIZE)
  }, [filterKey])

  // 绑定滚动监听
  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // 分批渐进渲染，每 50ms 渲染一批
  useEffect(() => {
    if (renderedCount >= dataList.length || isFiltering) return
    const timer = setTimeout(() => {
      setRenderedCount(prev => Math.min(prev + RENDER_BATCH_SIZE, dataList.length))
    }, RENDER_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [renderedCount, dataList.length, isFiltering])

  // ============ 渲染 ============

  return (
    <div className="w-full min-h-screen bg-[#0f172a] dark:bg-[#0f172a]" ref={containerRef}>
      {/* 初始加载态：首次加载时显示 */}
      {isInitialLoading && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-sm text-gray-400">正在加载图片...</span>
          </div>
        </div>
      )}

      {/* 筛选加载态：筛选触发时显示 */}
      {isFiltering && !isInitialLoading && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">正在筛选图片...</span>
          </div>
        </div>
      )}
      
      {/* 图片列表：仅在非筛选加载态时显示 */}
      {!isFiltering && !isInitialLoading && (
        <>
          <ImageGallery images={renderedImages} />
          
          {/* 错误提示 */}
          {error && !isValidating && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-red-400">筛选失败，请重试</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutate()}
                className="text-xs"
              >
                重试
              </Button>
            </div>
          )}
          
          {/* 无数据提示：仅在非加载态且无错误时显示 */}
          {!error && !isValidating && dataList.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-400 text-sm">暂无匹配的图片</p>
            </div>
          )}
          
          {/* 加载更多按钮 */}
          {!error && dataList.length > 0 && (
            <div className="flex items-center justify-center pb-8 pt-4">
              {isValidating ? (
                <div className="flex items-center space-x-2 text-gray-400">
                  <ReloadIcon className="h-5 w-5 animate-spin" />
                  <span className="text-sm">{t('Button.loading')}</span>
                </div>
              ) : size < pageTotal ? (
                <Button
                  disabled={isLoading}
                  onClick={() => {
                    setSize(size + 1)
                  }}
                  variant="outline"
                  className="select-none cursor-pointer border-gray-200 hover:border-gray-400 transition-colors"
                  aria-label={t('Button.loadMore')}
                >
                  {t('Button.loadMore')}
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}
