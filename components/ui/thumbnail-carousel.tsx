'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import Image from 'next/image'
import type { ImageType } from '~/types'

// 缩略图轮播组件的尺寸常量
const FULL_WIDTH_PX = 120
const COLLAPSED_WIDTH_PX = 35
const GAP_PX = 2
const MARGIN_PX = 2

interface ThumbnailCarouselProps {
  images: ImageType[]
}

interface ThumbnailItem {
  id: string
  url: string
  title: string
}

interface ThumbnailsProps {
  currentIndex: number
  onIndexChange: (index: number) => void
  items: ThumbnailItem[]
}

/**
 * 缩略图导航组件 - 展示可点击的图片缩略图列表
 */
function Thumbnails({ currentIndex, onIndexChange, items }: ThumbnailsProps) {
  const thumbnailsRef = useRef<HTMLDivElement>(null)

  // 当前选中项变化时，自动滚动到居中位置
  useEffect(() => {
    const container = thumbnailsRef.current
    if (!container) return

    let scrollPosition = 0
    for (let i = 0; i < currentIndex; i++) {
      scrollPosition += COLLAPSED_WIDTH_PX + GAP_PX
    }
    scrollPosition += MARGIN_PX

    const containerWidth = container.offsetWidth
    const centerOffset = containerWidth / 2 - FULL_WIDTH_PX / 2
    scrollPosition -= centerOffset

    container.scrollTo({ left: scrollPosition, behavior: 'smooth' })
  }, [currentIndex])

  return (
    <div
      ref={thumbnailsRef}
      className='overflow-x-auto'
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        .overflow-x-auto::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className='flex gap-0.5 h-20 pb-2' style={{ width: 'fit-content' }}>
        {items.map((item, i) => (
          <motion.button
            key={item.id}
            onClick={() => onIndexChange(i)}
            initial={false}
            animate={i === currentIndex ? 'active' : 'inactive'}
            variants={{
              active: {
                width: FULL_WIDTH_PX,
                marginLeft: MARGIN_PX,
                marginRight: MARGIN_PX,
              },
              inactive: {
                width: COLLAPSED_WIDTH_PX,
                marginLeft: 0,
                marginRight: 0,
              },
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className='relative shrink-0 h-full overflow-hidden rounded'
          >
            <Image
              src={item.url}
              alt={item.title}
              fill
              sizes="120px"
              className='object-cover pointer-events-none select-none'
              draggable={false}
            />
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/**
 * 缩略图轮播组件 - 支持拖拽和缩略图导航
 */
export default function ThumbnailCarousel({ images }: ThumbnailCarouselProps) {
  // === Refs ===
  const containerRef = useRef<HTMLDivElement>(null)

  // === State ===
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // === Motion Values ===
  const translateX = useMotionValue(0)

  // === Derived Data ===
  const items: ThumbnailItem[] = images
    .map(img => ({
      id: img.id,
      url: img.url || img.preview_url || '',
      title: img.title || 'Untitled'
    }))
    .filter(item => item.url)

  // 拖拽结束后，平滑过渡到目标位置
  useEffect(() => {
    if (isDragging || !containerRef.current) return

    const containerWidth = containerRef.current.offsetWidth || 1
    const targetX = -currentIndex * containerWidth

    animate(translateX, targetX, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    })
  }, [currentIndex, translateX, isDragging])

  if (items.length === 0) return null

  return (
    <div className='w-full max-w-5xl mx-auto p-4 lg:p-10'>
      <div className='flex flex-col gap-3'>
        {/* Main Carousel */}
        <div className='relative overflow-hidden rounded-lg bg-gray-900/50 backdrop-blur-sm border border-white/10' ref={containerRef}>
          <motion.div
            className='flex'
            drag='x'
            dragElastic={0.2}
            dragMomentum={false}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={(_, info) => {
              setIsDragging(false)
              const containerWidth = containerRef.current?.offsetWidth || 1
              const { offset, velocity } = info

              let nextIndex = currentIndex

              // 快速滑动时使用速度判断
              if (Math.abs(velocity.x) > 500) {
                nextIndex = velocity.x > 0 ? currentIndex - 1 : currentIndex + 1
              }
              // 否则使用偏移量阈值(30%)
              else if (Math.abs(offset.x) > containerWidth * 0.3) {
                nextIndex = offset.x > 0 ? currentIndex - 1 : currentIndex + 1
              }

              nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex))
              setCurrentIndex(nextIndex)
            }}
            style={{ x: translateX }}
          >
            {items.map((item) => (
              <div key={item.id} className='relative shrink-0 w-full h-[500px]'>
                <Image
                  src={item.url}
                  alt={item.title}
                  fill
                  sizes="100vw"
                  className='object-contain bg-black/20 select-none pointer-events-none'
                  draggable={false}
                />
              </div>
            ))}
          </motion.div>

          {/* 上一张按钮 */}
          <motion.button
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className={`absolute left-4 text-black top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform z-10
              ${
                currentIndex === 0
                  ? 'opacity-40 cursor-not-allowed'
                  : 'bg-white/80 hover:scale-110 hover:opacity-100 opacity-70'
              }`}
          >
            <svg
              className='w-6 h-6'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </motion.button>

          {/* 下一张按钮 */}
          <motion.button
            disabled={currentIndex === items.length - 1}
            onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
            className={`absolute text-black right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform z-10
              ${
                currentIndex === items.length - 1
                  ? 'opacity-40 cursor-not-allowed'
                  : 'bg-white/80 hover:scale-110 hover:opacity-100 opacity-70'
              }`}
          >
            <svg
              className='w-6 h-6'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 5l7 7-7 7'
              />
            </svg>
          </motion.button>

          {/* 图片计数器 */}
          <div className='absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-sm border border-white/10'>
            {currentIndex + 1} / {items.length}
          </div>
        </div>

        <Thumbnails currentIndex={currentIndex} onIndexChange={setCurrentIndex} items={items} />
      </div>
    </div>
  )
}
