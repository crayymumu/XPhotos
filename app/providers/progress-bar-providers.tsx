'use client'

import { useState, useEffect } from 'react'
import { AppProgressBar as ProgressBar } from 'next-nprogress-bar'

/** 进度条颜色 */
const PROGRESS_BAR_COLOR = 'oklch(87.2% 0.01 258.338)'

/** 路由切换进度条 Provider */
export function ProgressBarProviders({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return (
    <>
      {isMounted && (
        <ProgressBar height="2px" color={PROGRESS_BAR_COLOR} shallowRouting />
      )}
      {children}
    </>
  )
}
