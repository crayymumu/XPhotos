'use client'

import { type ReactNode, createContext, useRef, useContext } from 'react'
import { type StoreApi, useStore } from 'zustand'
import { type ConfigStore, createConfigStore, initConfigStore } from '~/stores/config-stores'

/** Config 状态的 Context */
export const ConfigStoreContext = createContext<StoreApi<ConfigStore> | null>(null)

export interface ConfigStoreProviderProps {
  children: ReactNode
}

/** 提供 Config 全局状态的 Provider */
export const ConfigStoreProvider = ({ children }: ConfigStoreProviderProps) => {
  const storeRef = useRef<StoreApi<ConfigStore> | null>(null)

  if (!storeRef.current) {
    storeRef.current = createConfigStore(initConfigStore())
  }

  return (
    <ConfigStoreContext.Provider value={storeRef.current}>
      {children}
    </ConfigStoreContext.Provider>
  )
}

/** 获取 Config Store 的 Hook，必须在 ConfigStoreProvider 内使用 */
export const useConfigStore = <T,>(selector: (store: ConfigStore) => T): T => {
  const context = useContext(ConfigStoreContext)

  if (!context) {
    throw new Error('useConfigStore must be used within ConfigStoreProvider')
  }

  return useStore(context, selector)
}
