'use client'

import * as React from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { fetcher } from '~/lib/utils/fetcher'
import type { AlbumType, ImageType } from '~/types'
import Compressor from 'compressorjs'
import {
  Upload as AntUpload,
  Button as AntButton,
  Input as AntInput,
  Form as AntForm,
  Modal as AntModal,
  message as AntMessage,
  Tag as AntTag,
  Card as AntCard,
  Progress as AntProgress,
  DatePicker as AntDatePicker,
} from 'antd'
import { Checkbox } from '~/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import MultipleSelector, { Option as MSOption } from '~/components/ui/origin/multiselect'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import zhCN from 'antd/es/date-picker/locale/zh_CN'
import { CloseOutlined } from '@ant-design/icons'
import { useTranslations } from 'next-intl' 
import { exifReader, uploadFile } from '~/lib/utils/file'
import { UploadIcon } from '~/components/icons/upload'
import { heicTo, isHeic } from 'heic-to'
import { encodeBrowserThumbHash } from '~/lib/utils/blurhash-client'

dayjs.locale('zh-cn')

// ==================== 类型定义 ====================

interface TagNode {
  category: string
  id?: string
  name?: string
  children: { name: string }[]
}

interface AlistStorage {
  mount_path: string
}

interface UploadFile extends File {
  __key?: string
  id?: string
  labels?: string[]
  exif?: Record<string, unknown>
}

interface UploadMeta {
  url?: string
  clientImageId?: string
  fileName?: string
  exifObj?: Record<string, unknown>
  width?: number
  height?: number
  blurhash?: string
  previewUrl?: string
  file?: UploadFile
}

interface UploadResponse {
  code: number
  data?: { url?: string; key?: string; imageId?: string; fileName?: string }
  message?: string
}

interface MultipleFileUploadProps {
  idPrefix?: string
}

// ==================== EXIF 预设配置 ====================

const EXIF_PRESETS_KEY = 'picimpact_exif_presets'
const DEFAULT_EXIF_PRESETS = {
  cameraModels: ['Fujifilm X-T30', 'iPhone 15 Pro'],
  shutterSpeeds: ['1/8000', '1/4000', '1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1'],
  isos: ['50', '100', '200', '400', '800', '1600', '3200', '6400'],
  apertures: ['1.4', '1.8', '2.0', '2.8', '3.2', '3.5', '4.0', '5.6', '8.0', '11', '16'],
}

// ==================== 存储选项 ====================

const STORAGE_OPTIONS = [
  { label: 'Cloudflare R2', value: 'r2' },
  { label: 'Amazon S3', value: 's3' },
  { label: 'Aliyun OSS', value: 'oss' },
  { label: 'AList API', value: 'alist' },
]

export default function MultipleFileUpload({ idPrefix: propIdPrefix }: MultipleFileUploadProps) {
  const t = useTranslations()
  const generatedIdPrefix = React.useId()
  const idPrefix = propIdPrefix ?? generatedIdPrefix

  // ==================== 存储配置 ====================
  const [storage, setStorage] = React.useState('oss')
  const [album, setAlbum] = React.useState('')
  const [alistStorage, setAlistStorage] = React.useState<AlistStorage[]>([])
  const [alistMountPath, setAlistMountPath] = React.useState('')
  const [storageSelect, setStorageSelect] = React.useState(false)

  // ==================== 文件与上传状态 ====================
  const [files, setFiles] = React.useState<UploadFile[]>([])
  const [fileKeyMap, setFileKeyMap] = React.useState<Record<string, string>>({})
  const [uploadProgressMap, setUploadProgressMap] = React.useState<Record<string, number>>({})
  const [uploadedMeta, setUploadedMeta] = React.useState<Record<string, UploadMeta>>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const uploadingKeysRef = React.useRef<Set<string>>(new Set())

  // ==================== 标签相关 ====================
  const [presetTags, setPresetTags] = React.useState<string[]>([])
  const [tagTree, setTagTree] = React.useState<TagNode[]>([])
  const [primarySelect, setPrimarySelect] = React.useState<string | null>(null)
  const [secondarySelect, setSecondarySelect] = React.useState<string[]>([])

  // ==================== EXIF 预设 ====================
  const [exifPresets, setExifPresets] = React.useState(() => {
    try {
      const raw = localStorage.getItem(EXIF_PRESETS_KEY)
      return raw ? JSON.parse(raw) : DEFAULT_EXIF_PRESETS
    } catch {
      return DEFAULT_EXIF_PRESETS
    }
  })
  const [isPresetModalOpen, setIsPresetModalOpen] = React.useState(false)
  const [editingPresetsText, setEditingPresetsText] = React.useState({
    cameraModels: '',
    shutterSpeeds: '',
    isos: '',
    apertures: '',
  })

  // ==================== 未上传文件弹窗 ====================
  const [showMissingModal, setShowMissingModal] = React.useState(false)
  const [missingFiles, setMissingFiles] = React.useState<UploadFile[]>([])
  const [missingSelection, setMissingSelection] = React.useState<Record<string, boolean>>({})

  // ==================== 数据获取 ====================
  const { data: albums } = useSWR('/api/v1/albums/get', fetcher)
  const { data: configs } = useSWR<{ config_key: string; config_value: string }[]>('/api/v1/settings/get-custom-info', fetcher)

  // 从配置中解析预览图压缩参数
  const previewMaxWidthOn = configs?.find(c => c.config_key === 'preview_max_width_limit_switch')?.config_value === '1'
  const previewMaxWidth = parseInt(configs?.find(c => c.config_key === 'preview_max_width_limit')?.config_value || '0')
  const previewQuality = parseFloat(configs?.find(c => c.config_key === 'preview_quality')?.config_value || '0.2')
  const maxUploadFiles = parseInt(configs?.find(c => c.config_key === 'max_upload_files')?.config_value || '5')

  // ==================== 初始化：拉取标签 ====================
  React.useEffect(() => {
    Promise.all([
      fetcher('/api/v1/settings/tags/get'),
      fetcher('/api/v1/settings/tags/get?tree=true'),
    ]).then(([tagsRes, treeRes]: [{ data: { name: string }[] }, { data: TagNode[] }]) => {
      if (tagsRes?.data) setPresetTags(tagsRes.data.map(t => t.name))
      if (treeRes?.data) setTagTree(treeRes.data)
    }).catch(() => {})
  }, [])

  // ==================== 标签联动：选中一级/二级后自动合并到每个文件 ====================
  React.useEffect(() => {
    if (!primarySelect && !secondarySelect.length) return
    setFiles(prev =>
      prev.map(item => {
        const labels = [...(item.labels || [])]
        if (primarySelect && !labels.includes(primarySelect)) labels.push(primarySelect)
        secondarySelect.forEach(s => {
          if (!labels.includes(s)) labels.push(s)
        })
        return { ...item, labels }
      })
    )
  }, [primarySelect, secondarySelect])

  // ==================== 工具函数 ====================

  /** 生成唯一 key */
  const genKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  /** 切换文件的预设标签 */
  const togglePresetTagForItem = React.useCallback((tag: string, idx: number) => {
    setFiles(prev => {
      const items = [...prev]
      const labels = items[idx].labels || []
      items[idx].labels = labels.includes(tag) ? labels.filter(t => t !== tag) : [...labels, tag]
      return items
    })
  }, [])

  /** 获取 AList 存储目录 */
  const getAlistStorage = React.useCallback(async () => {
    if (alistStorage.length) {
      setStorageSelect(true)
      return
    }
    try {
      toast.info('正在获取 AList 挂载目录')
      const res = await fetch('/api/v1/storage/alist/storages').then(r => r.json())
      if (res?.code === 200) {
        setAlistStorage(res.data?.content || [])
        setStorageSelect(true)
      } else {
        toast.error('获取失败')
      }
    } catch {
      toast.error('获取失败')
    }
  }, [alistStorage.length])

  // ==================== 上传相关函数 ====================

  /** 上传预览图（压缩后） */
  const uploadPreviewImage = React.useCallback(
    async (file: File, type: string) => {
      return new Promise<void>((resolve, reject) => {
        new Compressor(file, {
          quality: previewQuality,
          checkOrientation: false,
          mimeType: 'image/webp',
          maxWidth: previewMaxWidthOn && previewMaxWidth > 0 ? previewMaxWidth : undefined,
          async success(compressedFile) {
            // @ts-expect-error dynamic attach
            const key = file.__key
            const previewFile = new File([compressedFile], 'preview.webp', { type: 'image/webp' })
            const res = await uploadFile(previewFile, type, storage, alistMountPath, {
              onProgress: p => setUploadProgressMap(prev => ({ ...prev, [key]: p })),
            })
            if (res?.code === 200) {
              setUploadedMeta(prev => ({ ...prev, [key]: { ...(prev[key] || {}), previewUrl: res.data?.url } }))
              resolve()
            } else {
              reject(new Error('Preview upload failed'))
            }
          },
          error: reject,
        })
      })
    },
    [previewQuality, previewMaxWidthOn, previewMaxWidth, storage, alistMountPath]
  )

  /** 上传成功后处理：解析 EXIF、计算尺寸和 blurhash、上传预览图 */
  const resHandle = React.useCallback(
    async (res: UploadResponse, file: UploadFile) => {
      const key = file.__key
      const { exifObj } = await exifReader(file)
      if (key) {
        setUploadedMeta(prev => ({
          ...prev,
          [key]: { ...(prev[key] || {}), url: res?.data?.url, clientImageId: res?.data?.imageId, fileName: res?.data?.fileName, exifObj },
        }))
      }

      // 上传预览图
      const previewType = album === '/' ? '/preview' : album + '/preview'
      await uploadPreviewImage(file, previewType).catch(() => {})

      // 解析尺寸和 blurhash
      const reader = new FileReader()
      reader.onload = e => {
        const img = new Image()
        img.onload = async () => {
          const hash = await encodeBrowserThumbHash(file)
          if (key) {
            setUploadedMeta(prev => ({
              ...prev,
              [key]: { ...(prev[key] || {}), exifObj, width: img.width, height: img.height, blurhash: hash },
            }))
          }
        }
        if (typeof e.target?.result === 'string') img.src = e.target.result
      }
      reader.readAsDataURL(file)
    },
    [album, uploadPreviewImage]
  )

  /** 上传单个文件（支持 HEIC 自动转换） */
  const onRequestUpload = React.useCallback(
    async (file: UploadFile) => {
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      if (!file.__key) file.__key = genKey()

      // HEIC -> JPEG
      if (await isHeic(file)) {
        const blob = await heicTo({ blob: file, type: 'image/jpeg' })
        const jpegFile = new File([blob], baseName + '.jpg', { type: 'image/jpeg' }) as UploadFile
        jpegFile.__key = file.__key

        new Compressor(jpegFile, {
          quality: previewQuality,
          checkOrientation: false,
          mimeType: 'image/jpeg',
          maxWidth: previewMaxWidthOn && previewMaxWidth > 0 ? previewMaxWidth : undefined,
          async success(compressedFile) {
            const compressedJpeg = new File([compressedFile], jpegFile.name, { type: 'image/jpeg' })
            const res = await uploadFile(compressedJpeg, album, storage, alistMountPath, {
              onProgress: p => setUploadProgressMap(prev => ({ ...prev, [jpegFile.__key!]: p })),
            })
            if (res.code === 200) {
              await resHandle(res, jpegFile)
              if (res.data?.key && jpegFile.__key) setFileKeyMap(prev => ({ ...prev, [jpegFile.__key!]: res.data!.key! }))
            }
          },
        })
        return
      }

      // 普通文件上传
      const res = await uploadFile(file, album, storage, alistMountPath, {
        onProgress: p => setUploadProgressMap(prev => ({ ...prev, [file.__key!]: p })),
      })
      if (res.code === 200) {
        await resHandle(res, file)
        if (res.data?.key && file.__key) setFileKeyMap(prev => ({ ...prev, [file.__key!]: res.data!.key! }))
      }
    },
    [album, storage, alistMountPath, previewQuality, previewMaxWidthOn, previewMaxWidth, resHandle]
  )

  /** 从参考图提取 EXIF（不上传参考图） */
  const applyReferenceExifToItem = React.useCallback(
    async (file: File, idx: number) => {
      try {
        const { tags, exifObj } = await exifReader(file)
        setFiles(prev => {
          const items = [...prev]
          if (!items[idx]) return prev
          items[idx].exif = { ...(items[idx].exif || {}), ...exifObj }
          // @ts-expect-error dynamic attach
          items[idx].lat = tags?.GPSLatitude?.description || items[idx].lat
          // @ts-expect-error dynamic attach
          items[idx].lon = tags?.GPSLongitude?.description || items[idx].lon
          return items
        })
        toast.success('已从参考图提取 EXIF')
      } catch {
        toast.error('参考图无有效 EXIF 信息')
      }
    },
    []
  )

  // ==================== 提交相关函数 ====================

  /** 提交单个文件元数据到后端 */
  const autoSubmit = React.useCallback(
    async (meta: UploadMeta & { labels?: string[] }) => {
      if (!album) {
        toast.warning('请先选择相册！')
        return
      }

      // 确保有宽高
      let { width, height } = meta
      if ((!width || !height || width <= 0 || height <= 0) && meta.file) {
        try {
          const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const img = new Image()
              img.onload = () => resolve({ width: img.width, height: img.height })
              img.onerror = reject
              if (typeof reader.result === 'string') img.src = reader.result
            }
            reader.onerror = reject
            reader.readAsDataURL(meta.file!)
          })
          width = dims.width
          height = dims.height
        } catch {}
      }

      if (!width || !height || width <= 0 || height <= 0) {
        toast.error('图片宽度或高度缺失，无法提交')
        return
      }

      // 构建标签分类映射
      const labels = meta.labels || meta.file?.labels || []
      const tagCategoryMap: Record<string, string> = {}
      if (primarySelect && secondarySelect.length) {
        secondarySelect.forEach(s => (tagCategoryMap[s] = primarySelect))
      }

      const data = {
        album,
        url: meta.url,
        client_image_id: meta.clientImageId,
        title: '',
        preview_url: meta.previewUrl,
        blurhash: meta.blurhash,
        exif: meta.exifObj,
        labels,
        detail: '',
        width,
        height,
        lat: '',
        lon: '',
        tagCategoryMap: Object.keys(tagCategoryMap).length ? tagCategoryMap : undefined,
      } as unknown as ImageType & { tagCategoryMap?: Record<string, string> }

      // 重复检测
      const dupRes = await fetch('/api/v1/images/check-duplicate', {
        headers: { 'Content-Type': 'application/json' },
        method: 'post',
        body: JSON.stringify({ blurhash: meta.blurhash, url: meta.url }),
      }).then(r => r.json()).catch(() => ({ code: 200, data: { duplicate: false } }))

      if (dupRes?.data?.duplicate) {
        const ok = await new Promise<boolean>(resolve => {
          AntModal.confirm({
            title: '检测到重复图片',
            content: '该图片已存在，是否仍然继续保存？',
            okText: '继续保存',
            cancelText: '取消',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          })
        })
        if (!ok) return { code: 499 }
      }

      const resp = await fetch('/api/v1/images/add', {
        headers: { 'Content-Type': 'application/json' },
        method: 'post',
        body: JSON.stringify(data),
      })

      const contentType = resp.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await resp.text().catch(() => '')
        toast.error(text || '保存失败')
        return
      }

      const json = await resp.json().catch(() => null)
      if (json?.code === 200) {
        toast.success('保存成功')
      } else {
        toast.error(json?.message || '保存失败')
      }
    },
    [album, primarySelect, secondarySelect]
  )

  /** 移除文件（同时删除已上传的存储对象） */
  const removeFileByKey = React.useCallback(
    (key: string) => {
      // 删除存储对象
      const storageKey = fileKeyMap[key]
      if (storageKey && storage) {
        fetch('/api/v1/file/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage, key: storageKey }),
        }).catch(() => {})
      }

      setFileKeyMap(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setFiles(prev => prev.filter(f => (f.__key || f.id || f.name) !== key))
      setUploadedMeta(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setUploadProgressMap(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setMissingSelection(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setMissingFiles(prev => prev.filter(f => (f.__key || f.name) !== key))
      uploadingKeysRef.current.delete(key)
    },
    [fileKeyMap, storage]
  )

  /** 上传所选未上传文件后提交 */
  const handleUploadSelectedAndSubmit = React.useCallback(async () => {
    setShowMissingModal(false)
    setIsSubmitting(true)
    try {
      const toUpload = missingFiles.filter(f => f.__key && missingSelection[f.__key])
      for (const f of toUpload) await onRequestUpload(f)

      for (const file of files) {
        const key = file.__key
        if (!key) continue
        const meta = uploadedMeta[key]
        if (!meta?.url) continue
        await autoSubmit({ ...meta, file })
      }
    } catch {
      toast.error('提交过程中发生错误')
    } finally {
      setIsSubmitting(false)
    }
  }, [missingFiles, missingSelection, files, uploadedMeta, onRequestUpload, autoSubmit])

  /** 跳过未上传文件直接提交已上传的 */
  const handleSkipAndSubmit = React.useCallback(async () => {
    setShowMissingModal(false)
    setIsSubmitting(true)
    try {
      for (const file of files) {
        const key = file.__key
        if (!key) continue
        const meta = uploadedMeta[key]
        if (!meta?.url) continue
        await autoSubmit({ ...meta, file })
      }
    } catch {
      toast.error('提交过程中发生错误')
    } finally {
      setIsSubmitting(false)
    }
  }, [files, uploadedMeta, autoSubmit])

  /** 主提交入口 */
  const handleMainSubmit = React.useCallback(async () => {
    setIsSubmitting(true)
    try {
      // 检查有哪些文件尚未上传
      const missing = files.filter(f => {
        const key = f.__key
        return !key || !uploadedMeta[key]?.url
      })

      if (missing.length) {
        const sel: Record<string, boolean> = {}
        missing.forEach(f => f.__key && (sel[f.__key] = true))
        setMissingSelection(sel)
        setMissingFiles(missing)
        setIsSubmitting(false)
        setShowMissingModal(true)
        return
      }

      // 全部已上传，直接提交
      for (const file of files) {
        const key = file.__key
        if (!key) continue
        const meta = uploadedMeta[key]
        if (!meta?.url) {
          await onRequestUpload(file)
        }
        await autoSubmit({ ...(uploadedMeta[key] || {}), file })
      }
    } catch {
      toast.error('提交过程中发生错误')
    } finally {
      setIsSubmitting(false)
    }
  }, [files, uploadedMeta, onRequestUpload, autoSubmit])

  // ==================== 渲染 ====================

  return (
    <div className="admin-upload flex flex-col space-y-2 h-full flex-1 font-sans text-sm">
      {/* ========== 顶部控制栏 ========== */}
      <div className="flex items-end space-x-2">
        <div className="flex flex-1 w-full space-x-1">
          {/* 存储选择 */}
          <div className="flex flex-col" style={{ minWidth: 140 }}>
            <div className="text-xs text-gray-600 mb-1">{t('Upload.selectStorage')}</div>
            <Select
              value={storage}
              onValueChange={(v: string) => {
                setStorage(v)
                if (v === 'alist') getAlistStorage()
                else setStorageSelect(false)
              }}
            >
              <SelectTrigger className="w-full h-9 bg-white text-gray-900 border-gray-200">
                <SelectValue placeholder={t('Upload.selectStorage')} />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 相册选择 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="text-xs text-gray-600 mb-1">{t('Upload.selectAlbum')}</div>
            <Select value={album || undefined} onValueChange={setAlbum}>
              <SelectTrigger className="w-full h-9 bg-white text-gray-900 border-gray-200">
                <SelectValue placeholder={t('Upload.selectAlbum')} />
              </SelectTrigger>
              <SelectContent>
                {albums?.map((a: AlbumType) => (
                  <SelectItem key={a.album_value} value={a.album_value}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 一级标签 */}
          <div className="flex flex-col" style={{ minWidth: 240 }}>
            <div className="text-xs text-gray-600 mb-1">一级标签（Primary）</div>
            <Select
              value={primarySelect ?? undefined}
              onValueChange={(v: string) => {
                setPrimarySelect(v)
                setSecondarySelect([])
              }}
            >
              <SelectTrigger className="w-full md:w-[240px] h-9 bg-white text-gray-900 border-gray-200">
                <SelectValue placeholder="选择一级标签（可选）" />
              </SelectTrigger>
              <SelectContent>
                {tagTree.filter(n => n?.category).map((n, i) => (
                  <SelectItem key={`${n.category}-${i}`} value={n.category}>{n.category ?? '未分类'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 二级标签（多选） */}
          <div className="flex flex-col" style={{ minWidth: 240 }}>
            <div className="text-xs text-gray-600 mb-1">二级标签（Secondary，多选）</div>
            <MultipleSelector
              value={secondarySelect.map(s => ({ value: s, label: s }))}
              options={(tagTree.find(n => n.category === primarySelect)?.children || []).filter(c => c?.name).map(c => ({ value: c.name, label: c.name }))}
              placeholder={primarySelect ? '选择二级标签（可多选）' : '先选择一级标签'}
              onChange={(opts?: MSOption[]) => setSecondarySelect((opts || []).map(o => o.value))}
            />
          </div>

          {/* AList 目录选择 */}
          {storage === 'alist' && storageSelect && alistStorage.length > 0 && (
            <div className="flex flex-col" style={{ minWidth: 240 }}>
              <div className="text-xs text-gray-600 mb-1">{t('Upload.selectAlistDirectory')}</div>
              <Select value={alistMountPath || undefined} onValueChange={setAlistMountPath}>
                <SelectTrigger className="w-full h-9 bg-white text-gray-900 border-gray-200">
                  <SelectValue placeholder={t('Upload.selectAlistDirectory')} />
                </SelectTrigger>
                <SelectContent>
                  {alistStorage.map(s => (
                    <SelectItem key={s.mount_path} value={s.mount_path}>{s.mount_path}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        <AntButton
          className="h-9 flex items-center justify-center"
          size="middle"
          type="primary"
          loading={isSubmitting}
          onClick={handleMainSubmit}
          disabled={!files.length || !storage || (storage === 'alist' && !alistMountPath)}
        >
          {isSubmitting ? '提交中...' : '提交（会先上传未完成文件）'}
        </AntButton>
      </div>

      {/* ========== 未上传文件确认弹窗 ========== */}
      <AntModal
        title={`有 ${missingFiles.length} 个未上传的文件`}
        open={showMissingModal}
        onCancel={() => setShowMissingModal(false)}
        footer={[
          <AntButton key="cancel" onClick={() => setShowMissingModal(false)}>取消</AntButton>,
          <AntButton key="skip" onClick={handleSkipAndSubmit}>跳过未上传并提交</AntButton>,
          <AntButton key="upload" type="primary" onClick={handleUploadSelectedAndSubmit}>上传所选并提交</AntButton>,
        ]}
      >
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {missingFiles.length === 0 ? (
            <div className="text-sm text-gray-500">暂无未上传文件</div>
          ) : (
            missingFiles.map(f => (
              <div key={f.__key || f.name} className="flex items-center p-2 border-b">
                <Checkbox
                  checked={!!missingSelection[f.__key || f.name]}
                  onCheckedChange={v => setMissingSelection(prev => ({ ...prev, [f.__key || f.name]: !!v }))}
                />
                <div className="ml-2">{f.name}</div>
              </div>
            ))
          )}
        </div>
      </AntModal>

      {/* ========== 上传总进度 ========== */}
      {Object.keys(uploadProgressMap).length > 0 && (() => {
        const vals = Object.values(uploadProgressMap)
        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        return (
          <div className="mb-2">
            <AntProgress percent={avg} status="active" />
            <div className="text-xs text-gray-500 mt-1">上传进度：{avg}%（{vals.length} 个文件）</div>
          </div>
        )
      })()}

      {/* ========== 主区域：左侧上传器，右侧文件列表 ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* 上传区域 */}
        <div className="h-full">
          <AntCard className="h-full">
            <AntUpload
              multiple
              disabled={!storage || (storage === 'alist' && !alistMountPath)}
              beforeUpload={() => false}
              showUploadList={false}
              style={{ padding: 12, minHeight: 120, height: '100%' }}
              onChange={info => {
                const rawFiles = (info.fileList || []).map(f => f.originFileObj).filter(Boolean) as File[]
                const selected: UploadFile[] = rawFiles.map(f => {
                  const uf = f as UploadFile
                  if (!uf.__key) uf.__key = genKey()
                  return uf
                })
                setFiles(selected)

                // 自动上传（需已选相册）
                if (!album) {
                  toast.warning('请先选择相册以便自动上传')
                  return
                }
                selected.forEach(file => {
                  const key = file.__key
                  if (key && !uploadedMeta[key]?.url && !uploadingKeysRef.current.has(key)) {
                    uploadingKeysRef.current.add(key)
                    onRequestUpload(file).catch(e => console.error('Auto upload failed', e))
                  }
                })
              }}
            >
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <UploadIcon />
                <p className="font-medium text-sm">{t('Upload.uploadTips1')}</p>
                <p className="text-muted-foreground text-xs">{t('Upload.uploadTips2')}</p>
                <p className="text-muted-foreground text-xs">{t('Upload.uploadTips4', { count: maxUploadFiles })}</p>
              </div>
            </AntUpload>
          </AntCard>
        </div>

        {/* 文件列表 */}
        <div className="h-full">
          <AntCard className="h-full">
            {files.length === 0 ? (
              <div className="text-sm text-gray-500">暂无文件</div>
            ) : (
              files.map((f, idx) => (
                <div key={f.__key || f.id || idx} className="p-2 border rounded mb-2">
                  {/* 文件名与状态 */}
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(() => {
                          const key = f.__key
                          if (!key) return '待上传'
                          const meta = uploadedMeta[key]
                          const p = uploadProgressMap[key]
                          if (meta?.url) return '已上传'
                          if (typeof p === 'number') return `上传中 ${p}%`
                          return '待上传'
                        })()}
                      </div>
                      {f.__key && typeof uploadProgressMap[f.__key] === 'number' && (
                        <div className="w-full mt-2">
                          <AntProgress percent={uploadProgressMap[f.__key]} size="small" />
                        </div>
                      )}
                    </div>
                    <AntButton
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => removeFileByKey(f.__key || f.id || f.name)}
                    />
                  </div>

                  {/* 预设标签 */}
                  <div className="mt-2">
                    <div className="text-xs mb-1">预设标签</div>
                    <div className="flex flex-wrap gap-2">
                      {presetTags.map((tag, i) => (
                        <AntTag
                          key={`${tag}-${i}`}
                          color={f.labels?.includes(tag) ? 'blue' : 'default'}
                          style={{ cursor: 'pointer' }}
                          onClick={() => togglePresetTagForItem(tag, idx)}
                        >
                          {tag}
                        </AntTag>
                      ))}
                    </div>
                  </div>

                  {/* EXIF 编辑区 */}
                  <div className="mt-2 p-2 border rounded">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="text-xs">EXIF（可选）</div>
                      <AntButton size="small" onClick={() => document.getElementById(`${idPrefix}-ref-${idx}`)?.click()}>
                        参考图提取 EXIF
                      </AntButton>
                      <input
                        id={`${idPrefix}-ref-${idx}`}
                        type="file"
                        className="hidden"
                        accept="image/*,.cr2,.arw,.nef,.tif,.tiff,.dng"
                        onChange={e => {
                          if (e.target.files?.[0]) applyReferenceExifToItem(e.target.files[0], idx)
                          e.target.value = ''
                        }}
                      />
                    </div>
                    <AntForm layout="vertical">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <AntForm.Item
                          label="相机型号"
                          extra={
                            <a onClick={() => {
                              setEditingPresetsText({
                                cameraModels: exifPresets.cameraModels.join(', '),
                                shutterSpeeds: exifPresets.shutterSpeeds.join(', '),
                                isos: exifPresets.isos.join(', '),
                                apertures: exifPresets.apertures.join(', '),
                              })
                              setIsPresetModalOpen(true)
                            }}>
                              管理常用选项
                            </a>
                          }
                        >
                          <Select
                            value={(f.exif?.model as string) || undefined}
                            onValueChange={v => {
                              setFiles(prev => {
                                const items = [...prev]
                                items[idx].exif = { ...(items[idx].exif || {}), model: v }
                                return items
                              })
                            }}
                          >
                            <SelectTrigger className="w-full h-9 bg-white text-gray-900 border-gray-200">
                              <SelectValue placeholder="常用机型" />
                            </SelectTrigger>
                            <SelectContent>
                              {exifPresets.cameraModels.map((m: string) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </AntForm.Item>

                        <AntForm.Item label="快门">
                          <div className="flex gap-2">
                            <Select
                              value={(f.exif?.exposure_time as string) || undefined}
                              onValueChange={v => {
                                setFiles(prev => {
                                  const items = [...prev]
                                  items[idx].exif = { ...(items[idx].exif || {}), exposure_time: v }
                                  return items
                                })
                              }}
                            >
                              <SelectTrigger className="min-w-[140px] h-9 bg-white text-gray-900 border-gray-200">
                                <SelectValue placeholder="常用快门" />
                              </SelectTrigger>
                              <SelectContent>
                                {exifPresets.shutterSpeeds.map((s: string) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <AntInput
                              value={(f.exif?.exposure_time as string) || ''}
                              onChange={e => {
                                setFiles(prev => {
                                  const items = [...prev]
                                  items[idx].exif = { ...(items[idx].exif || {}), exposure_time: e.target.value }
                                  return items
                                })
                              }}
                              placeholder="手动输入"
                            />
                          </div>
                        </AntForm.Item>

                        <AntForm.Item label="ISO">
                          <div className="flex gap-2">
                            <Select
                              value={(f.exif?.iso_speed_rating as string) || undefined}
                              onValueChange={v => {
                                setFiles(prev => {
                                  const items = [...prev]
                                  items[idx].exif = { ...(items[idx].exif || {}), iso_speed_rating: v }
                                  return items
                                })
                              }}
                            >
                              <SelectTrigger className="min-w-[140px] h-9 bg-white text-gray-900 border-gray-200">
                                <SelectValue placeholder="常用 ISO" />
                              </SelectTrigger>
                              <SelectContent>
                                {exifPresets.isos.map((i: string) => (
                                  <SelectItem key={i} value={i}>{i}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <AntInput
                              value={(f.exif?.iso_speed_rating as string) || ''}
                              onChange={e => {
                                setFiles(prev => {
                                  const items = [...prev]
                                  items[idx].exif = { ...(items[idx].exif || {}), iso_speed_rating: e.target.value }
                                  return items
                                })
                              }}
                              placeholder="手动输入"
                            />
                          </div>
                        </AntForm.Item>

                        <AntForm.Item label="光圈 (f/)">
                          <div className="flex gap-2">
                            <Select
                              value={(f.exif?.f_number as string) || undefined}
                              onValueChange={v => {
                                setFiles(prev => {
                                  const items = [...prev]
                                  items[idx].exif = { ...(items[idx].exif || {}), f_number: v }
                                  return items
                                })
                              }}
                            >
                              <SelectTrigger className="min-w-[140px] h-9 bg-white text-gray-900 border-gray-200">
                                <SelectValue placeholder="常用光圈" />
                              </SelectTrigger>
                              <SelectContent>
                                {exifPresets.apertures.map((a: string) => (
                                  <SelectItem key={a} value={a}>{a}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <AntInput
                              value={(f.exif?.f_number as string) || ''}
                              onChange={e => {
                                setFiles(prev => {
                                  const items = [...prev]
                                  items[idx].exif = { ...(items[idx].exif || {}), f_number: e.target.value }
                                  return items
                                })
                              }}
                              placeholder="手动输入"
                            />
                          </div>
                        </AntForm.Item>

                        <AntForm.Item label="焦距 (mm)">
                          <AntInput
                            value={(f.exif?.focal_length as string) || ''}
                            onChange={e => {
                              setFiles(prev => {
                                const items = [...prev]
                                items[idx].exif = { ...(items[idx].exif || {}), focal_length: e.target.value }
                                return items
                              })
                            }}
                          />
                        </AntForm.Item>

                        <AntForm.Item label="拍摄日期">
                          <AntDatePicker
                            style={{ width: '100%' }}
                            locale={zhCN}
                            placeholder="选择拍摄日期"
                            value={f.exif?.data_time ? dayjs(f.exif.data_time as string) : undefined}
                            onChange={date => {
                              setFiles(prev => {
                                const items = [...prev]
                                items[idx].exif = { ...(items[idx].exif || {}), data_time: date?.format('YYYY-MM-DD') || '' }
                                return items
                              })
                            }}
                            disabledDate={current => current && (current < dayjs('2020-01-01') || current > dayjs().endOf('day'))}
                            allowClear
                          />
                        </AntForm.Item>
                      </div>
                    </AntForm>
                  </div>
                </div>
              ))
            )}
          </AntCard>
        </div>
      </div>

      {/* ========== EXIF 预设管理弹窗 ========== */}
      <AntModal
        title="管理常用 EXIF 选项"
        open={isPresetModalOpen}
        onCancel={() => setIsPresetModalOpen(false)}
        onOk={() => {
          try {
            const parse = (s: string) => s.split(',').map(v => v.trim()).filter(Boolean)
            const newPresets = {
              cameraModels: parse(editingPresetsText.cameraModels),
              shutterSpeeds: parse(editingPresetsText.shutterSpeeds),
              isos: parse(editingPresetsText.isos),
              apertures: parse(editingPresetsText.apertures),
            }
            setExifPresets(newPresets)
            localStorage.setItem(EXIF_PRESETS_KEY, JSON.stringify(newPresets))
            AntMessage.success('已保存')
            setIsPresetModalOpen(false)
          } catch {
            AntMessage.error('保存失败')
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <div>
            <div className="text-xs text-gray-600 mb-1">相机型号（逗号分隔）</div>
            <AntInput.TextArea
              rows={2}
              value={editingPresetsText.cameraModels}
              onChange={e => setEditingPresetsText(prev => ({ ...prev, cameraModels: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">常用快门（逗号分隔）</div>
            <AntInput.TextArea
              rows={2}
              value={editingPresetsText.shutterSpeeds}
              onChange={e => setEditingPresetsText(prev => ({ ...prev, shutterSpeeds: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">常用 ISO（逗号分隔）</div>
            <AntInput.TextArea
              rows={2}
              value={editingPresetsText.isos}
              onChange={e => setEditingPresetsText(prev => ({ ...prev, isos: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">常用光圈（逗号分隔）</div>
            <AntInput.TextArea
              rows={2}
              value={editingPresetsText.apertures}
              onChange={e => setEditingPresetsText(prev => ({ ...prev, apertures: e.target.value }))}
            />
          </div>
        </div>
      </AntModal>
    </div>
  )
}
