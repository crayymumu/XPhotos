'use client'

import { type ReactNode, createContext, useRef, useContext } from 'react'
import { type StoreApi, useStore } from 'zustand'
import { type ButtonStore, createButtonStore, initButtonStore } from '~/stores/button-stores'

/** Button 状态的 Context */
export const ButtonStoreContext = createContext<StoreApi<ButtonStore> | null>(null)

export interface ButtonStoreProviderProps {
  children: ReactNode
}

/** 提供 Button 全局状态的 Provider */
export const ButtonStoreProvider = ({ children }: ButtonStoreProviderProps) => {
  const storeRef = useRef<StoreApi<ButtonStore> | null>(null)

  if (!storeRef.current) {
    storeRef.current = createButtonStore(initButtonStore())
  }

  return (
    <ButtonStoreContext.Provider value={storeRef.current}>
      {children}
    </ButtonStoreContext.Provider>
  )
}

/** 获取 Button Store 的 Hook，必须在 ButtonStoreProvider 内使用 */
export const useButtonStore = <T,>(selector: (store: ButtonStore) => T): T => {
  const context = useContext(ButtonStoreContext)

  if (!context) {
    throw new Error('useButtonStore must be used within ButtonStoreProvider')
  }

  return useStore(context, selector)
}
