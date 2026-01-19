'use client'

import * as React from 'react'
import { cn } from '~/lib/utils'
import Link from 'next/link'

interface CoverCardProps extends React.HTMLAttributes<HTMLDivElement> {
  imageUrl: string
  location: string
  flag?: string
  stats: string
  href: string
  themeColor: string
  exploreText?: string
}

/**
 * RGB 转 HSL 颜色格式
 */
function rgbToHsl(r: number, g: number, b: number): string {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * 从图片底部 20% 区域提取主色调的 Hook
 */
function useImageDominantColor(imageUrl: string, fallbackColor: string): string {
  const [dominantColor, setDominantColor] = React.useState(fallbackColor)

  React.useEffect(() => {
    if (!imageUrl) return

    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = imageUrl

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const sampleHeight = Math.floor(img.height * 0.2)
        const startY = img.height - sampleHeight
        if (sampleHeight <= 0) return

        canvas.width = img.width
        canvas.height = sampleHeight
        ctx.drawImage(img, 0, startY, img.width, sampleHeight, 0, 0, img.width, sampleHeight)

        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
        let rSum = 0, gSum = 0, bSum = 0, count = 0

        // 每隔 10 个像素采样以提升性能
        for (let i = 0; i < data.length; i += 40) {
          rSum += data[i]
          gSum += data[i + 1]
          bSum += data[i + 2]
          count++
        }

        if (count > 0) {
          setDominantColor(rgbToHsl(
            Math.round(rSum / count),
            Math.round(gSum / count),
            Math.round(bSum / count)
          ))
        }
      } catch {
        // CORS 或其他错误时保持 fallback
      }
    }
  }, [imageUrl])

  return dominantColor
}

/**
 * 封面卡片组件 - 自动从图片提取主题色
 */
const CoverCard = React.forwardRef<HTMLDivElement, CoverCardProps>(
  ({ className, imageUrl, location, flag, stats, href, themeColor: fallbackThemeColor, exploreText, ...props }, ref) => {
    const themeColor = useImageDominantColor(imageUrl, fallbackThemeColor)

    return (
      // The 'group' class enables hover effects on child elements
      <div
        ref={ref}
        style={{
          '--theme-color': themeColor,
        } as React.CSSProperties}
        className={cn('group w-full h-full', className)}
        {...props}
      >
        <Link
          href={href}
          className="relative block w-full h-full overflow-hidden shadow-lg 
                     transition-all duration-500 ease-in-out 
                     group-hover:scale-105 group-hover:shadow-[0_0_60px_-15px_hsl(var(--theme-color)/0.6)]"
          aria-label={`Explore details for ${location}`}
          style={{
             boxShadow: '0 0 40px -15px hsl(var(--theme-color) / 0.5)'
          }}
        >
          {/* Background Image with Parallax Zoom */}
          <div
            className="absolute inset-0 bg-cover bg-center 
                       transition-transform duration-500 ease-in-out group-hover:scale-110"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />

          {/* Themed Gradient Overlay - Removed */}
          {/* <div
            className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-80"
            style={{
              background: `linear-gradient(to bottom, transparent, hsl(var(--theme-color) / 0.8))`,
              opacity: 0.4
            }}
          /> */}
          
          {/* Content */}
          <div className="relative flex flex-col justify-center items-center h-full p-6 text-white text-center">
            <h3 className="text-4xl font-bold tracking-[0.2em] uppercase drop-shadow-lg">
              {location}
            </h3>
            {flag && <span className="text-2xl mt-2 drop-shadow-md">{flag}</span>}
            <p className="text-sm text-white/90 mt-3 font-medium tracking-widest uppercase opacity-0 transform translate-y-4 transition-all duration-500 ease-in-out group-hover:opacity-100 group-hover:translate-y-0">
              {stats}
            </p>

            {/* Explore Button - Removed for SamAlive style */}
          </div>
        </Link>
      </div>
    )
  }
)
CoverCard.displayName = 'CoverCard'

export { CoverCard }
