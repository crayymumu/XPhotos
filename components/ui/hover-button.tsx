'use client'

import * as React from 'react'
import { cn } from '~/lib/utils'

// 圆圈粒子状态
interface CircleParticle {
  id: number
  x: number
  y: number
  color: string
  fadeState: 'in' | 'out' | null
}

interface HoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

/**
 * 悬停按钮组件 - 鼠标移动时产生发光粒子效果
 */
const HoverButton = React.forwardRef<HTMLButtonElement, HoverButtonProps>(
  ({ className, children, ...props }, ref) => {
    // === Refs ===
    const internalRef = React.useRef<HTMLButtonElement>(null)
    const buttonRef = (ref as React.RefObject<HTMLButtonElement>) || internalRef
    const lastAddedTimeRef = React.useRef(0)
    const pendingTimersRef = React.useRef<Set<number>>(new Set())

    // === State ===
    const [isPointerInside, setIsPointerInside] = React.useState(false)
    const [particles, setParticles] = React.useState<CircleParticle[]>([])

    // === Callbacks ===
    // 调度粒子动画：淡入 -> 淡出 -> 移除
    const scheduleParticleAnimation = React.useCallback((particleId: number) => {
      const fadeInTimer = window.setTimeout(() => {
        setParticles((prev) =>
          prev.map((p) => (p.id === particleId ? { ...p, fadeState: 'in' } : p))
        )
        pendingTimersRef.current.delete(fadeInTimer)
      }, 0)
      pendingTimersRef.current.add(fadeInTimer)

      const fadeOutTimer = window.setTimeout(() => {
        setParticles((prev) =>
          prev.map((p) => (p.id === particleId ? { ...p, fadeState: 'out' } : p))
        )
        pendingTimersRef.current.delete(fadeOutTimer)
      }, 1000)
      pendingTimersRef.current.add(fadeOutTimer)

      const removeTimer = window.setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== particleId))
        pendingTimersRef.current.delete(removeTimer)
      }, 2200)
      pendingTimersRef.current.add(removeTimer)
    }, [])

    // 创建粒子
    const createParticle = React.useCallback((x: number, y: number) => {
      const buttonWidth = buttonRef.current?.offsetWidth || 0
      const xPos = x / buttonWidth
      const color = `linear-gradient(to right, var(--circle-start) ${xPos * 100}%, var(--circle-end) ${xPos * 100}%)`
      const particleId = Date.now()

      setParticles((prev) => [...prev, { id: particleId, x, y, color, fadeState: null }])
      scheduleParticleAnimation(particleId)
    }, [buttonRef, scheduleParticleAnimation])

    const handlePointerMove = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!isPointerInside) return

        const currentTime = Date.now()
        if (currentTime - lastAddedTimeRef.current > 100) {
          lastAddedTimeRef.current = currentTime
          const rect = event.currentTarget.getBoundingClientRect()
          createParticle(event.clientX - rect.left, event.clientY - rect.top)
        }
      },
      [isPointerInside, createParticle]
    )

    const handlePointerEnter = React.useCallback(() => setIsPointerInside(true), [])
    const handlePointerLeave = React.useCallback(() => setIsPointerInside(false), [])

    // === Effects ===
    // 组件卸载时清理所有定时器
    React.useEffect(() => {
      const timers = pendingTimersRef.current
      return () => {
        timers.forEach((timer) => clearTimeout(timer))
      }
    }, [])

    return (
      <button
        ref={buttonRef}
        className={cn(
          'relative isolate px-8 py-3 rounded-3xl',
          'text-foreground font-medium text-base leading-6',
          'backdrop-blur-lg bg-[rgba(43,55,80,0.1)]',
          'cursor-pointer overflow-hidden',
          'before:content-[\'\'] before:absolute before:inset-0',
          'before:rounded-[inherit] before:pointer-events-none',
          'before:z-[1]',
          'before:shadow-[inset_0_0_0_1px_rgba(170,202,255,0.2),inset_0_0_16px_0_rgba(170,202,255,0.1),inset_0_-3px_12px_0_rgba(170,202,255,0.15),0_1px_3px_0_rgba(0,0,0,0.50),0_4px_12px_0_rgba(0,0,0,0.45)]',
          'before:mix-blend-multiply before:transition-transform before:duration-300',
          'active:before:scale-[0.975]',
          className
        )}
        onPointerMove={handlePointerMove}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        {...props}
        style={{
          '--circle-start': 'var(--tw-gradient-from, #a0d9f8)',
          '--circle-end': 'var(--tw-gradient-to, #3a5bbf)',
        } as React.CSSProperties}
      >
        {particles.map(({ id, x, y, color, fadeState }) => (
          <div
            key={id}
            className={cn(
              'absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full',
              'blur-lg pointer-events-none z-[-1] transition-opacity duration-300',
              fadeState === 'in' && 'opacity-75',
              fadeState === 'out' && 'opacity-0 duration-[1.2s]',
              !fadeState && 'opacity-0'
            )}
            style={{ left: x, top: y, background: color }}
          />
        ))}
        {children}
      </button>
    )
  }
)

HoverButton.displayName = 'HoverButton'

export { HoverButton }
