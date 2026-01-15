'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, useMotionValue, animate, PanInfo } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CarouselItem {
  id: string | number
  url: string
  originalUrl?: string
  title?: string
}

interface FramerCarouselProps {
  items: CarouselItem[]
  autoPlay?: boolean
  autoPlayInterval?: number
  showNavButtons?: boolean
  showIndicators?: boolean
  aspectRatio?: string
  heightClass?: string
}

/**
 * Framer Motion 轮播组件 - 支持拖拽、自动播放、懒加载
 */
export function FramerCarousel({
  items,
  autoPlay = false,
  autoPlayInterval = 5000,
  showNavButtons = true,
  showIndicators = true,
  aspectRatio,
  heightClass,
}: FramerCarouselProps) {
  // === Refs ===
  const containerRef = useRef<HTMLDivElement>(null)

  // === State ===
  const [currentIndex, setCurrentIndex] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set([0]))

  // === Motion Values ===
  const translateX = useMotionValue(0)

  // === Callbacks ===
  // 更新容器宽度并同步位置
  const syncContainerWidth = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.offsetWidth
    setContainerWidth(width)
    if (width > 0) {
      translateX.set(-currentIndex * width)
    }
  }, [currentIndex, translateX])

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1))
  }, [])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(items.length - 1, prev + 1))
  }, [items.length])

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = containerWidth * 0.15
      const { offset, velocity } = info

      if ((offset.x < -threshold || velocity.x < -500) && currentIndex < items.length - 1) {
        setCurrentIndex((prev) => prev + 1)
      } else if ((offset.x > threshold || velocity.x > 500) && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1)
      } else {
        // 回弹到当前位置
        animate(translateX, -currentIndex * containerWidth, {
          type: 'spring',
          stiffness: 200,
          damping: 25,
          mass: 0.8,
        })
      }
    },
    [containerWidth, currentIndex, items.length, translateX]
  )

  // 判断图片是否应该加载
  const shouldLoadImage = useCallback((i: number) => {
    return Math.abs(i - currentIndex) <= 1
  }, [currentIndex])

  // === Effects ===
  // 容器尺寸监听
  useEffect(() => {
    requestAnimationFrame(syncContainerWidth)

    const handleResize = () => syncContainerWidth()
    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver(syncContainerWidth)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [syncContainerWidth])

  // 预加载相邻图片
  useEffect(() => {
    const toPreload = [currentIndex - 1, currentIndex, currentIndex + 1].filter(
      (i) => i >= 0 && i < items.length && !loadedImages.has(i)
    )

    toPreload.forEach((i) => {
      const img = new window.Image()
      img.src = items[i].url
      img.onload = () => setLoadedImages((prev) => new Set([...prev, i]))
    })
  }, [currentIndex, items, loadedImages])

  // 滑动动画
  useEffect(() => {
    if (containerWidth <= 0 || items.length === 0) return

    const targetX = -currentIndex * containerWidth
    if (translateX.get() === 0 && currentIndex === 0) {
      translateX.set(targetX)
    } else {
      animate(translateX, targetX, {
        type: 'spring',
        stiffness: 200,
        damping: 25,
        mass: 0.8,
      })
    }
  }, [currentIndex, containerWidth, translateX, items.length])

  // 自动播放
  useEffect(() => {
    if (!autoPlay || items.length <= 1) return

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, autoPlayInterval)

    return () => clearInterval(timer)
  }, [autoPlay, autoPlayInterval, items.length])

  // === Derived Values ===
  const useFixedHeight = !!heightClass
  const containerClassName = `relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 ${heightClass || ''}`
  const containerStyle = useFixedHeight ? {} : { aspectRatio: aspectRatio || '16/9' }

  if (!items || items.length === 0) {
    return (
      <div 
        className={`w-full flex items-center justify-center bg-black/20 rounded-2xl border border-white/10 ${heightClass || ''}`}
        style={useFixedHeight ? {} : { aspectRatio: aspectRatio || '16/9' }}
      >
        <span className="text-sm text-gray-500">暂无照片</span>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3">
        {/* 轮播主容器 */}
        <div
          ref={containerRef}
          className={containerClassName}
          style={containerStyle}
        >
          <motion.div
            className="flex h-full cursor-grab active:cursor-grabbing"
            style={{ x: translateX, willChange: 'transform' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.08}
            onDragEnd={handleDragEnd}
          >
            {items.map((item, i) => (
              <div
                key={item.id}
                className="shrink-0 h-full relative"
                style={{ 
                  width: containerWidth > 0 ? containerWidth : '100%',
                  willChange: 'transform',
                  flexShrink: 0,
                }}
              >
                {!loadedImages.has(i) && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {shouldLoadImage(i) && (
                  <img
                    src={item.url}
                    alt={item.title || `Photo ${item.id}`}
                    className={`w-full h-full object-cover select-none pointer-events-none transition-opacity duration-300 ${
                      loadedImages.has(i) ? 'opacity-100' : 'opacity-0'
                    }`}
                    draggable={false}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    onLoad={() => setLoadedImages((prev) => new Set([...prev, i]))}
                  />
                )}
                {item.title && loadedImages.has(i) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
                    <h3 className="text-white text-lg font-medium drop-shadow-lg">
                      {item.title}
                    </h3>
                  </div>
                )}
              </div>
            ))}
          </motion.div>

          {showNavButtons && items.length > 1 && (
            <>
              <button
                disabled={currentIndex === 0}
                onClick={goToPrev}
                className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 z-10 backdrop-blur-sm
                  ${currentIndex === 0
                    ? 'opacity-30 cursor-not-allowed bg-white/20'
                    : 'bg-white/80 hover:bg-white hover:scale-110 active:scale-95'
                  }`}
                aria-label="上一张"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
              </button>

              <button
                disabled={currentIndex === items.length - 1}
                onClick={goToNext}
                className={`absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 z-10 backdrop-blur-sm
                  ${currentIndex === items.length - 1
                    ? 'opacity-30 cursor-not-allowed bg-white/20'
                    : 'bg-white/80 hover:bg-white hover:scale-110 active:scale-95'
                  }`}
                aria-label="下一张"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
              </button>
            </>
          )}

          {showIndicators && items.length > 1 && (
            <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 sm:gap-2 p-1.5 sm:p-2 bg-black/30 backdrop-blur-sm rounded-full border border-white/20">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? 'w-6 sm:w-8 bg-white'
                      : 'w-1.5 sm:w-2 bg-white/50 hover:bg-white/70'
                  }`}
                  aria-label={`跳转到第 ${i + 1} 张`}
                />
              ))}
            </div>
          )}

          <div className="absolute top-3 sm:top-4 right-3 sm:right-4 px-2.5 py-1 bg-black/40 backdrop-blur-sm rounded-full text-xs sm:text-sm text-white/90 font-medium">
            {currentIndex + 1} / {items.length}
          </div>
        </div>
      </div>
    </div>
  )
}
