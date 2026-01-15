'use client'

import { Toaster } from 'sonner'
import { useTheme } from 'next-themes'

type ToasterProps = React.ComponentProps<typeof Toaster>

/** Toast 通知 Provider，自动响应主题切换 */
export function ToasterProviders() {
  const { theme = 'system' } = useTheme()

  return (
    <Toaster
      richColors
      closeButton
      position="bottom-right"
      theme={theme as ToasterProps['theme']}
    />
  )
}
