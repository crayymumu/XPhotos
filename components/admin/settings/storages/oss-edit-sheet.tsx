'use client'

import type { Config } from '~/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '~/components/ui/sheet'
import { useButtonStore } from '~/app/providers/button-store-providers'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { ReloadIcon } from '@radix-ui/react-icons'
import { Button } from '~/components/ui/button'
import { useTranslations } from 'next-intl'
import { Switch } from '~/components/ui/switch'
import { normalizeStorageFolder } from '~/lib/utils/storage'

export default function OSSEditSheet() {
  const [loading, setLoading] = useState(false)
  const { mutate } = useSWRConfig()
  const { ossEdit, setOSSEdit, setOSSEditData, ossData } = useButtonStore(
    (state) => state,
  )
  const t = useTranslations()

  function getVal(arr: Config[] | undefined, key: string): string {
    return (arr || []).find((c) => c.config_key === key)?.config_value || ''
  }

  function setVal(arr: Config[] | undefined, key: string, val: string): Config[] {
    return (arr || []).map((c) => {
      if (c.config_key === key) c.config_value = val
      return c
    })
  }

  function normalizeAndValidate(data: Config[] | undefined): { ok: boolean, next: Config[], message?: string } {
    // 阿里云OSS的配置项
    const required = ['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket']
    const missing = required.filter(k => !getVal(data, k))
    if (missing.length) {
      return { ok: false, next: data || [], message: `缺少必要配置：${missing.join(', ')}` }
    }

    let next = [...(data || [])]
    const endpoint = getVal(next, 'endpoint')
    if (endpoint && !/^https:\/\//i.test(endpoint)) {
      next = setVal(next, 'endpoint', `https://${endpoint.replace(/^https?:\/\//i,'')}`)
    }

    const storageFolder = normalizeStorageFolder(getVal(next, 'storage_folder'))
    next = setVal(next, 'storage_folder', storageFolder)

    return { ok: true, next }
  }

  async function submit() {
    setLoading(true)
    try {
      const { ok, next, message } = normalizeAndValidate(ossData)
      if (!ok) {
        toast.error(message || '配置不完整')
        return
      }
      setOSSEditData(next)
      await fetch('/api/v1/settings/update-oss-info', {
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
        body: JSON.stringify(next),
      }).then(res => res.json())
      toast.success(t('Config.updateSuccess'))
      mutate('/api/v1/settings/oss-info')
      setOSSEdit(false)
      setOSSEditData([] as Config[])
    } catch (e) {
      toast.error(t('Config.updateFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet
      defaultOpen={false}
      open={ossEdit}
      onOpenChange={(open: boolean) => {
        if (!open) {
          setOSSEdit(false)
          setOSSEditData([] as Config[])
        }
      }}
      modal={false}
    >
      <SheetContent side="left" className="w-full overflow-y-auto scrollbar-hide p-2" onInteractOutside={(event: any) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>{t('Config.editOSS')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col space-y-2">
          {
            ossData?.map((config: Config) => (
              config.config_key === 'oss_cdn' || config.config_key === 'oss_direct_download' || config.config_key === 'oss_force_server_upload' ?
                <div
                  key={config.id}
                  className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"
                >
                  <div className="flex flex-col gap-1">
                    <div className="text-tiny text-default-400">
                      {t('Config.' + config.config_key)}
                    </div>
                  </div>
                  <Switch
                    className="cursor-pointer"
                    checked={config.config_value === 'true'}
                    onCheckedChange={(value) => setOSSEditData(
                      ossData?.map((c: Config) => {
                        if (c.config_key === config.config_key) {
                          c.config_value = value ? 'true' : 'false'
                        }
                        return c
                      })
                    )}
                  />
                </div>
              :
              <label
                htmlFor="text"
                key={config.id}
                className="block overflow-hidden rounded-md border border-gray-200 px-3 py-2 shadow-sm focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600"
              >
                <span className="text-xs font-medium text-gray-700"> {config.config_key} </span>

                <input
                  type="text"
                  id="name"
                  value={config.config_value || ''}
                  placeholder={t('Config.' + config.config_key)}
                  onChange={(e) => setOSSEditData(
                    ossData?.map((c: Config) => {
                      if (c.config_key === config.config_key) {
                        c.config_value = e.target.value
                      }
                      return c
                    })
                  )}
                  className="mt-1 w-full border-none p-0 focus:border-transparent focus:outline-none focus:ring-0 sm:text-sm"
                />
              </label>
            ))
          }
        </div>
        <Button className="cursor-pointer my-2" onClick={() => submit()} disabled={loading}>
          {loading && <ReloadIcon className="mr-2 h-4 w-4 animate-spin"/>}
          {t('Config.submit')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}

