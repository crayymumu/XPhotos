'use client'

import React, { useRef, useState, useMemo, useCallback } from 'react'
import { cn } from '~/lib/utils'
import { useInView } from 'framer-motion'
import { AspectRatio } from '~/components/ui/aspect-ratio'
import type { ImageType } from '~/types'
import { useRouter } from 'next-nprogress-bar'
import { useIsMobile } from '~/hooks/use-mobile'
import { OptimizedImage } from '~/components/ui/optimized-image'
import { toPublicImageUrl } from '~/lib/utils/url'

interface ImageGalleryProps {
  images: ImageType[]
}

/**
 * 图片画廊组件 - 瀑布流布局
 */
export function ImageGallery({ images }: ImageGalleryProps) {
  const isMobile = useIsMobile()

  // 瀑布流分列：移动端 2 列，桌面端 3 列
  const columns = useMemo(() => {
    const columnCount = isMobile ? 2 : 3
    const result: ImageType[][] = Array.from({ length: columnCount }, () => [])
    images.forEach((image, idx) => {
      result[idx % columnCount].push(image)
    })
    return result
  }, [images, isMobile])

  return (
    <div className="relative flex w-full flex-col items-center justify-center py-10 px-4">
      {/* 手机端到小平板：两列；大屏：三列 */}
      <div className="mx-auto grid w-full max-w-7xl gap-6 grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
        {columns.map((columnImages, colIndex) => (
          <div key={colIndex} className="grid h-fit gap-6">
            {columnImages.map((image) => {
              const ratio =
                image.width && image.height ? image.width / image.height : 16 / 9
              return (
                <AnimatedImage
                  key={image.id}
                  image={image}
                  ratio={ratio}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface AnimatedImageProps {
  image: ImageType
  ratio: number
}

/**
 * 带动画效果的图片项 - 支持懒加载和悬停效果
 */
function AnimatedImage({ image, ratio }: AnimatedImageProps) {
  // === Refs ===
  const containerRef = useRef<HTMLDivElement>(null)

  // === State ===
  const [isLoading, setIsLoading] = useState(true)

  // === Hooks ===
  const isInView = useInView(containerRef, { once: true })
  const router = useRouter()

  // === Callbacks ===
  const handleClick = useCallback(() => {
    router.push(`/preview/${image.id}`)
  }, [router, image.id])

  const handleImageLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  return (
    <div ref={containerRef} className="group relative cursor-pointer" onClick={handleClick}>
      <AspectRatio ratio={ratio} className="bg-muted relative size-full rounded-xl overflow-hidden">
        <OptimizedImage
          src={toPublicImageUrl(image.preview_url || image.url)}
          alt={image.detail || 'Image'}
          width={image.width || 800}
          height={image.height || 600}
          className={cn(
            'size-full object-cover transition-all duration-700 ease-in-out',
            isLoading ? 'scale-110 blur-lg' : 'scale-100 blur-0',
            !isInView && 'opacity-0'
          )}
          containerClassName="size-full"
          priority={false}
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          quality={85}
          onLoad={handleImageLoad}
          onClick={handleClick}
        />
        {image.title && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/50 via-black/25 to-transparent flex items-end">
            <div className="w-full px-3 pb-3 text-white text-sm font-semibold leading-relaxed tracking-wide drop-shadow-sm line-clamp-2">
              {image.title}
            </div>
          </div>
        )}
      </AspectRatio>
    </div>
  )
}
