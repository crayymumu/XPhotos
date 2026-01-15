'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Image from 'next/image'
import type { ImageType } from '~/types'

interface ImageAutoSliderProps {
  images: ImageType[]
}

/**
 * 自动滚动图片滑块组件 - 无限循环滚动
 */
export const ImageAutoSlider = ({ images }: ImageAutoSliderProps) => {
  // === State ===
  const [isFirstImageLoaded, setIsFirstImageLoaded] = useState(false)

  // === Derived Values ===
  // 复制图片实现无缝循环
  const duplicatedImages = useMemo(() => [...images, ...images], [images])

  // === Callbacks ===
  const handleFirstImageLoad = useCallback(() => {
    if (!isFirstImageLoaded) {
      setIsFirstImageLoaded(true)
    }
  }, [isFirstImageLoaded])

  // === Effects ===
  // 预加载第一张图片
  useEffect(() => {
    if (images.length === 0) {
      setIsFirstImageLoaded(true)
      return
    }

    const firstImageUrl = images[0].preview_url || images[0].url
    if (!firstImageUrl) {
      setIsFirstImageLoaded(true)
      return
    }

    const img = new window.Image()
    img.src = firstImageUrl
    img.onload = () => setIsFirstImageLoaded(true)
    img.onerror = () => setIsFirstImageLoaded(true)
  }, [images])

  if (images.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes scroll-right {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .infinite-scroll {
          animation: scroll-right 40s linear infinite;
        }

        .scroll-container {
          mask: linear-gradient(
            90deg,
            transparent 0%,
            black 10%,
            black 90%,
            transparent 100%
          );
          -webkit-mask: linear-gradient(
            90deg,
            transparent 0%,
            black 10%,
            black 90%,
            transparent 100%
          );
        }

        .image-item {
          transition: transform 0.3s ease, filter 0.3s ease;
        }

        .image-item:hover {
          transform: scale(1.05);
          filter: brightness(1.1);
        }

        .loading-spinner {
          animation: spin 1s linear infinite;
        }
      `}</style>
      
      <div className="w-full bg-transparent relative overflow-hidden flex items-center justify-center py-4">
        {!isFirstImageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full loading-spinner" />
          </div>
        )}

        <div className={`relative z-10 w-full flex items-center justify-center transition-opacity duration-500 ${isFirstImageLoaded ? 'opacity-100' : 'opacity-0'}`}>
          <div className="scroll-container w-full max-w-[1400px]">
            <div className="infinite-scroll flex gap-6 w-max">
              {duplicatedImages.map((image, idx) => (
                <div
                  key={`${image.id}-${idx}`}
                  className="image-item relative flex-shrink-0 rounded-xl overflow-hidden"
                  style={{ width: 'clamp(128px, 20vw, 256px)', aspectRatio: '4/3' }}
                >
                  <Image
                    src={image.preview_url || image.url || ''}
                    alt={image.title || `Gallery image ${idx + 1}`}
                    fill
                    sizes="(max-width: 768px) 128px, (max-width: 1024px) 192px, 256px"
                    className="object-cover"
                    unoptimized
                    onLoad={idx === 0 ? handleFirstImageLoad : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
