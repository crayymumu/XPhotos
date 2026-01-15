'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { LoadingAnimation } from '~/components/ui/loading-animation'

/** 加载动画延迟时间（ms） */
const LOADING_DELAY = 300

export function LoadingAnimationProviders({ children }: { children: React.ReactNode }) {
  // === Refs（不触发渲染的可变值）===
  const prevPathnameRef = useRef<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // === State（触发渲染的响应式状态）===
  const [isMounted, setIsMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // === Derived State（从其他状态派生）===
  const pathname = usePathname()

  // === Callbacks（稳定的回调函数）===
  const hideLoadingWithDelay = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsLoading(false), LOADING_DELAY)
  }, [])

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // === Effects ===

  /** 客户端挂载检测 */
  useEffect(() => {
    setIsMounted(true)
  }, [])

  /** 路由变化监听 + 首次加载完成处理（合并相关逻辑） */
  useEffect(() => {
    if (!isMounted) return

    clearTimer()

    const isRouteChange = prevPathnameRef.current !== null && prevPathnameRef.current !== pathname

    if (isRouteChange) {
      setIsLoading(true)
    }

    const rafId = requestAnimationFrame(() => hideLoadingWithDelay())
    prevPathnameRef.current = pathname

    const handleLoad = () => hideLoadingWithDelay()

    if (document.readyState !== 'complete') {
      window.addEventListener('load', handleLoad)
    }

    return () => {
      cancelAnimationFrame(rafId)
      clearTimer()
      window.removeEventListener('load', handleLoad)
    }
  }, [pathname, isMounted, hideLoadingWithDelay, clearTimer])

  return (
    <>
      {isMounted && <LoadingAnimation visible={isLoading} />}
      {children}
    </>
  )
}
