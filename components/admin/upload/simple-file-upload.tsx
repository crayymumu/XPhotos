'use client'

import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { fetcher } from '~/lib/utils/fetcher'
import type { ExifType, AlbumType, ImageType } from '~/types'
import Compressor from 'compressorjs'
import { Upload as AntUpload, Button as AntButton, Input as AntInput, Form as AntForm, Modal as AntModal, message as AntMessage, Tag as AntTag, Card as AntCard, Space as AntSpace, Progress as AntProgress, InputNumber as AntInputNumber, DatePicker as AntDatePicker } from 'antd'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '~/components/ui/select'
import MultipleSelector from '~/components/ui/origin/multiselect'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import zhCN from 'antd/es/date-picker/locale/zh_CN'
import { CloseOutlined } from '@ant-design/icons'
import { useTranslations } from 'next-intl'
import { exifReader, uploadFile } from '~/lib/utils/file'
import { UploadIcon } from '~/components/icons/upload'
import { heicTo, isHeic } from 'heic-to'
import { encodeBrowserThumbHash } from '~/lib/utils/blurhash-client'

const { Dragger } = AntUpload
dayjs.locale('zh-cn')

// EXIF 预设配置（存储于 localStorage）
const EXIF_PRESETS_KEY = 'picimpact_exif_presets'
const DEFAULT_EXIF_PRESETS = {
  cameraModels: ['Fujifilm X-T30', 'iPhone 15 Pro'],
  shutterSpeeds: ['1/8000', '1/4000', '1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1'],
  isos: ['50', '100', '200', '400', '800', '1600', '3200', '6400'],
  apertures: ['1.4', '1.8', '2.0', '2.8', '3.2', '3.5', '4.0', '5.6', '8.0', '11', '16'],
}

interface FileWithKey extends File { __key?: string }
interface UploadResponse { code: number; data?: { url: string; imageId: string; fileName: string; key?: string } }
interface TagNode { category: string; children: { name: string }[] }
interface AlistStorage { mount_path: string }

export default function SimpleFileUpload() {
  const t = useTranslations()
  const referenceInputRef = useRef<HTMLInputElement | null>(null)

  // ========== 状态定义 ==========
  // 存储配置
  const [storage, setStorage] = useState('oss')
  const [album, setAlbum] = useState('')
  const [alistStorage, setAlistStorage] = useState<AlistStorage[]>([])
  const [alistMountPath, setAlistMountPath] = useState('')
  const [storageSelect, setStorageSelect] = useState(false)

  // 上传状态
  const [files, setFiles] = useState<FileWithKey[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoUploadedFor, setAutoUploadedFor] = useState<string | null>(null)
  const [showMissingModal, setShowMissingModal] = useState(false)

  // 图片数据
  const [url, setUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [originalKey, setOriginalKey] = useState('')
  const [, setPreviewKey] = useState('')
  const [imageId, setImageId] = useState('')
  const [imageName, setImageName] = useState('')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [hash, setHash] = useState('')
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')

  // EXIF 与标签
  const [exif, setExif] = useState({} as ExifType)
  const [exifPresets, setExifPresets] = useState(DEFAULT_EXIF_PRESETS)
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false)
  const [editingPresetsText, setEditingPresetsText] = useState({ cameraModels: '', shutterSpeeds: '', isos: '', apertures: '' })
  const [imageLabels, setImageLabels] = useState<string[]>([])
  const [presetTags, setPresetTags] = useState<string[]>([])
  const [tagTree, setTagTree] = useState<TagNode[]>([])
  const [primarySelect, setPrimarySelect] = useState<string | null>(null)
  const [secondarySelect, setSecondarySelect] = useState<string[]>([])
  const [cascaderValue, setCascaderValue] = useState<string[]>([])

  // ========== 数据获取 ==========
  const { data } = useSWR('/api/v1/albums/get', fetcher)
  const { data: configs } = useSWR<{ config_key: string, config_value: string }[]>('/api/v1/settings/get-custom-info', fetcher)

  // 预览图压缩配置（从系统设置读取）
  const previewMaxWidthOn = configs?.find(c => c.config_key === 'preview_max_width_limit_switch')?.config_value === '1'
  const previewMaxWidth = parseInt(configs?.find(c => c.config_key === 'preview_max_width_limit')?.config_value || '0')
  const previewQuality = parseFloat(configs?.find(c => c.config_key === 'preview_quality')?.config_value || '0.2')

  // ========== 初始化 ==========
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXIF_PRESETS_KEY)
      if (raw) setExifPresets(JSON.parse(raw))
    } catch {}
  }, [])

  // 拉取预设标签和标签树
  useEffect(() => {
    Promise.all([
      fetcher('/api/v1/settings/tags/get'),
      fetcher('/api/v1/settings/tags/get?tree=true'),
    ]).then(([tagsRes, treeRes]: [{ data: { name: string }[] }, { data: TagNode[] }]) => {
      if (tagsRes?.data) setPresetTags(tagsRes.data.map(t => t.name))
      if (treeRes?.data) setTagTree(treeRes.data)
    }).catch(() => {})
  }, [])

  // 切换预设标签（点击加入/移除）
  function togglePresetTag(tag: string) {
    const trimmed = tag?.trim()
    if (!trimmed) return
    const exists = imageLabels.some(t => t.trim().toLowerCase() === trimmed.toLowerCase())
    setImageLabels(exists 
      ? imageLabels.filter(t => t.trim().toLowerCase() !== trimmed.toLowerCase())
      : [...new Set([...imageLabels, trimmed])])
  }

  // 级联选择器值同步到标签列表
  const syncCascaderToLabels = React.useCallback((value: string[]) => {
    if (!value?.length) return
    const toAdd = value.filter(v => v?.trim())
    if (!toAdd.length) return
    setImageLabels(prev => {
      const set = new Set(prev.map(v => v.trim()))
      toAdd.forEach(v => set.add(v.trim()))
      return Array.from(set).filter(Boolean)
    })
  }, [])

  useEffect(() => { syncCascaderToLabels(cascaderValue) }, [cascaderValue, syncCascaderToLabels])

  // 标签变更处理（去重 + 级联同步）
  const handleImageLabelsChange = (vals: string[]) => {
    const uniqueVals = Array.from(new Set(vals.filter(v => v?.trim()).map(v => v.trim())))
    setImageLabels(uniqueVals)
    
    // 若删除了所有级联标签，清空级联选择器
    if (cascaderValue?.length) {
      const cascaderTags = cascaderValue.filter(v => v?.trim())
      if (cascaderTags.every(tag => !uniqueVals.includes(tag.trim()))) {
        setCascaderValue([])
        setPrimarySelect(null)
        setSecondarySelect([])
      }
    }
  }

  // 从文件读取 EXIF 信息和图片尺寸
  const loadExif = React.useCallback(async (file: File) => {
    try {
      const { tags, exifObj } = await exifReader(file)
      setExif(exifObj)
      setLat(tags?.GPSLatitude?.description || '')
      setLon(tags?.GPSLongitude?.description || '')
    } catch (e) { console.error(e) }
    
    try {
      const reader = new FileReader()
      reader.onload = e => {
        const img = new Image()
        img.onload = () => { setWidth(img.width); setHeight(img.height) }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    } catch (e) { console.error(e) }
  }, [])
  
  // 带超时的 fetch 封装
  function fetchWithTimeout(resource: RequestInfo, options: RequestInit = {}, timeout = 15000) {
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('请求超时')), timeout)
      fetch(resource, options)
        .then(res => { clearTimeout(timer); resolve(res) })
        .catch(err => { clearTimeout(timer); reject(err) })
    })
  }

  // 提交图片数据到后端
  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      // 校验必填项
      if (!url) { setIsSubmitting(false); setShowMissingModal(true); return }
      if (!album) { toast.warning(t('Tips.selectAlbumFirst')); return }
      if (!height) { toast.warning(t('Tips.imageHeightRequired')); return }
      if (!width) { toast.warning(t('Tips.imageWidthRequired')); return }

      // 合并标签（预设 + 级联选择）
      const labels = [...imageLabels]
      if (primarySelect && !labels.includes(primarySelect)) labels.push(primarySelect)
      secondarySelect.forEach(s => { if (!labels.includes(s)) labels.push(s) })

      // 构建提交数据
      const data = {
        album, url, client_image_id: imageId, image_name: imageName, title,
        preview_url: previewUrl, video_url: videoUrl, blurhash: hash,
        exif, labels, detail, width, height, type: 1, lat, lon,
      } as unknown as ImageType & { tagCategoryMap?: Record<string, string> }

      // 标签分类映射（子标签 -> 父分类）
      if (primarySelect && secondarySelect.length) {
        data.tagCategoryMap = Object.fromEntries(secondarySelect.map(s => [s, primarySelect]))
      }

      // 重复检测
      const dupRes = await fetchWithTimeout('/api/v1/images/check-duplicate', {
        headers: { 'Content-Type': 'application/json' },
        method: 'post',
        body: JSON.stringify({ blurhash: hash || undefined, url: url || undefined }),
      }, 10000).then(r => r.json()).catch(() => ({ code: 200, data: { duplicate: false } }))

      if (dupRes?.data?.duplicate) {
        const ok = await new Promise<boolean>(resolve => {
          AntModal.confirm({
            title: '检测到重复图片',
            content: '该图片已存在，是否仍然继续保存？',
            okText: '继续保存', cancelText: '取消',
            onOk: () => resolve(true), onCancel: () => resolve(false),
          })
        })
        if (!ok) { setIsSubmitting(false); return }
      }

      const res = await fetchWithTimeout('/api/v1/images/add', {
        headers: { 'Content-Type': 'application/json' },
        method: 'post',
        body: JSON.stringify(data),
      }, 15000).then(r => r.json())

      toast[res?.code === 200 ? 'success' : 'error'](t(res?.code === 200 ? 'Tips.saveSuccess' : 'Tips.saveFailed'))
    } catch {
      toast.error(t('Tips.saveFailed'))
    } finally {
      setIsSubmitting(false)
      setUploadProgress(0)
    }
  }

  // 获取 AList 存储目录列表
  async function getAlistStorage() {
    if (alistStorage.length) { setStorageSelect(true); return }
    try {
      toast.info(t('Tips.gettingAlistDirs'))
      const res = await fetch('/api/v1/storage/alist/storages').then(r => r.json())
      if (res?.code === 200) { setAlistStorage(res.data?.content); setStorageSelect(true) }
      else toast.error(t('Tips.getFailed'))
    } catch { toast.error(t('Tips.getFailed')) }
  }

  const storages = [
    { label: 'Cloudflare R2', value: 'r2' },
    { label: 'Amazon S3', value: 's3' },
    { label: 'Aliyun OSS', value: 'oss' },
    { label: 'AList API', value: 'alist' },
  ]

  // 上传预览图（压缩后）
  const uploadPreviewImage = React.useCallback(async (file: File, type: string) => {
    new Compressor(file, {
      quality: previewQuality,
      checkOrientation: false,
      mimeType: 'image/webp',
      maxWidth: previewMaxWidthOn && previewMaxWidth > 0 ? previewMaxWidth : undefined,
      async success(compressedFile) {
        const previewFile = new File([compressedFile], 'preview.webp', { type: 'image/webp' })
        const res = await uploadFile(previewFile, type, storage, alistMountPath, { onProgress: p => setUploadProgress(p) })
        if (res?.code === 200) {
          setPreviewUrl(res.data?.url || '')
          if (res.data?.key) setPreviewKey(res.data.key)
        }
      },
      error() {},
    })
  }, [previewQuality, previewMaxWidthOn, previewMaxWidth, storage, alistMountPath])

  // 上传成功后处理（设置元数据、上传预览图）
  const resHandle = React.useCallback(async (res: UploadResponse, file: File) => {
    try { await uploadPreviewImage(file, album === '/' ? '/preview' : album + '/preview') } catch {}
    await loadExif(file)
    setHash(await encodeBrowserThumbHash(file))
    setUrl(res.data?.url || '')
    setImageId(res.data?.imageId || '')
    setImageName(res.data?.fileName || '')
    if (res.data?.key) setOriginalKey(res.data.key)
  }, [album, loadExif, uploadPreviewImage])

  // 从参考图提取 EXIF（不上传）
  const applyReferenceExif = React.useCallback(async (file: File) => {
    try {
      const { tags, exifObj } = await exifReader(file)
      setExif(prev => ({ ...prev, ...exifObj }))
      setLat(tags?.GPSLatitude?.description || '')
      setLon(tags?.GPSLongitude?.description || '')
      toast.success('已从参考图提取 EXIF')
    } catch {
      toast.error('参考图无有效 EXIF 信息')
    }
  }, [])

  // 上传原图（支持 HEIC 自动转换）
  const onRequestUpload = React.useCallback(async (file: File) => {
    const baseName = file.name.replace(/\.[^/.]+$/, '')
    
    // HEIC 转 JPEG
    if (await isHeic(file)) {
      const blob = await heicTo({ blob: file, type: 'image/jpeg' })
      const jpegFile = new File([blob], baseName + '.jpg', { type: 'image/jpeg' })
      const res = await uploadFile(jpegFile, album, storage, alistMountPath, { onProgress: p => setUploadProgress(p) })
      if (res.code === 200) await resHandle(res, jpegFile)
      return
    }
    
    // 普通文件上传
    const res = await uploadFile(file, album, storage, alistMountPath, { onProgress: p => setUploadProgress(p) })
    if (res.code === 200) await resHandle(res, file)
  }, [album, storage, alistMountPath, resHandle])

  // 重置所有状态（移除文件时）
  function onRemoveFile() {
    // 尝试删除已上传的存储对象
    if (originalKey && storage) {
      fetch('/api/v1/file/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage, key: originalKey })
      }).catch(() => {})
    }
    // 重置所有状态
    setExif({} as ExifType); setUrl(''); setHash(''); setTitle('')
    setImageId(''); setImageName(''); setDetail('')
    setWidth(0); setHeight(0); setLat(''); setLon('')
    setPreviewUrl(''); setVideoUrl(''); setOriginalKey(''); setPreviewKey('')
    setImageLabels([]); setCascaderValue([]); setPrimarySelect(null); setSecondarySelect([])
    setFiles([])
  }

  // 按 key 移除文件
  function removeFileByKey(key: string) {
    const has = files.some(f => ((f as FileWithKey).__key || f.name) === key)
    if (has) onRemoveFile()
    setFiles(prev => prev.filter(f => ((f as FileWithKey).__key || f.name) !== key))
  }

  // 文件选择后自动处理（有相册则上传，无相册则仅预览）
  const onRequestUploadRef = useRef(onRequestUpload)
  onRequestUploadRef.current = onRequestUpload

  useEffect(() => {
    const file = files[0]
    if (!file || autoUploadedFor === file.name) return

    let cancelled = false
    ;(async () => {
      try {
        if (album) {
          await onRequestUploadRef.current(file)
        } else {
          await loadExif(file)
          setHash(await encodeBrowserThumbHash(file))
          const reader = new FileReader()
          reader.onload = e => { if (!cancelled) setPreviewUrl(e.target?.result as string || '') }
          reader.readAsDataURL(file)
        }
        setAutoUploadedFor(file.name)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [files, album, autoUploadedFor, loadExif])

  return (
    <div className="admin-upload flex flex-col space-y-4 h-full flex-1 font-sans text-sm">
      {/* Top controls: storage, album, alist (if any) and submit (Form.Item for colon alignment) */}
      <AntForm layout="horizontal" style={{ marginBottom: 16 }}>
        <div className="flex items-center" style={{ gap: 16 }}>
          <AntForm.Item 
            label={t('Upload.selectStorage')} 
            required
            validateStatus={!storage ? 'error' : ''}
            help={!storage ? '请选择存储' : ''}
            style={{ minWidth: 160, marginBottom: 0 }}
          >
            <Select value={storage} onValueChange={(v: string) => {
              setStorage(v)
              if (v === 'alist') getAlistStorage(); else setStorageSelect(false)
            }}>
              <SelectTrigger className="w-[160px] h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder={t('Upload.selectStorage')} /></SelectTrigger>
              <SelectContent>
                {storages.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </AntForm.Item>

          <AntForm.Item label={t('Upload.selectAlbum')} required style={{ minWidth: 280, flex: 1, marginBottom: 0 }} className="flex-1 min-w-0">
            <Select value={album || undefined} onValueChange={setAlbum}>
              <SelectTrigger className="w-full h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder={t('Upload.selectAlbum')} /></SelectTrigger>
              <SelectContent>
                {data?.map((a: AlbumType) => <SelectItem key={a.album_value} value={a.album_value}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </AntForm.Item>

          {storage === 'alist' && storageSelect && alistStorage.length > 0 && (
            <AntForm.Item label={t('Upload.selectAlistDirectory')} required validateStatus={!alistMountPath ? 'error' : ''} help={!alistMountPath ? '请选择 AList 目录' : ''} style={{ minWidth: 240, marginBottom: 0 }}>
              <Select value={alistMountPath || undefined} onValueChange={setAlistMountPath}>
                <SelectTrigger className="w-[200px] h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder={t('Upload.selectAlistDirectory')} /></SelectTrigger>
                <SelectContent>
                  {alistStorage.map(s => <SelectItem key={s.mount_path} value={s.mount_path}>{s.mount_path}</SelectItem>)}
                </SelectContent>
              </Select>
            </AntForm.Item>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <AntButton
              className="h-9 flex items-center justify-center"
              size="middle"
              type="primary"
              loading={isSubmitting}
              onClick={async () => {
                if (files[0] && !url) await onRequestUpload(files[0])
                await handleSubmit()
              }}
              disabled={(!files.length && !url) || !album || !storage || (storage === 'alist' && !alistMountPath)}
            >
              {t('Button.submit')}
            </AntButton>
          </div>
        </div>
      </AntForm>
      <AntModal
        title="文件未上传"
        open={showMissingModal}
        onCancel={() => setShowMissingModal(false)}
        footer={[
          <AntButton key="cancel" onClick={() => setShowMissingModal(false)}>取消</AntButton>,
          <AntButton key="upload" type="primary" onClick={async () => {
            setShowMissingModal(false)
            if (!files[0]) return
            setIsSubmitting(true)
            try { await onRequestUpload(files[0]); await handleSubmit() }
            catch { toast.error('上传失败') }
            finally { setIsSubmitting(false) }
          }}>上传并提交</AntButton>
        ]}
      >
        <div>当前文件尚未上传，点击"上传并提交"将先上传后保存。</div>
      </AntModal>

      {/* 主区域：左侧上传器，右侧元数据表单 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="h-full">
          <AntCard className="h-full" title="上传文件">
            <Dragger
              multiple={false}
              disabled={!storage || !album || (storage === 'alist' && !alistMountPath)}
              beforeUpload={() => false}
              showUploadList={false}
              style={{ padding: 12, minHeight: 120, height: '100%' }}
              onChange={info => {
                const last = info.fileList?.at(-1)?.originFileObj as FileWithKey | undefined
                if (last) {
                  if (!last.__key) last.__key = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
                  setFiles([last])
                } else setFiles([])
              }}
            >
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <UploadIcon />
                <p className="font-medium text-sm">{t('Upload.dragOrClick')}</p>
                <p className="text-muted-foreground text-xs">{t('Upload.uploadTipsSingle') ?? '可拖拽或点击上传'}</p>
                {(!storage || !album || (storage === 'alist' && !alistMountPath)) && (
                  <p className="text-[12px]" style={{ color: '#999' }}>请先选择存储与相册</p>
                )}
              </div>
            </Dragger>
            {/* Progress bar for upload */}
            {uploadProgress > 0 && (
              <div className="mt-3">
                <AntProgress percent={uploadProgress} status="active" />
              </div>
            )}
            {/* EXIF 补充表单 */}
            <div className="mt-6 pt-4 border-t">
              <div className="text-sm font-medium mb-3">EXIF 信息</div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <AntButton type="default" onClick={() => referenceInputRef.current?.click()}>选择参考图提取 EXIF</AntButton>
                <input ref={referenceInputRef} type="file" accept="image/*,.cr2,.arw,.nef,.tif,.tiff,.dng" className="hidden" onChange={e => { if (e.target.files?.[0]) applyReferenceExif(e.target.files[0]); e.target.value = '' }} />
              </div>
              <AntForm layout="vertical">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  <AntForm.Item label="相机型号" extra={<a onClick={() => { setEditingPresetsText({ cameraModels: exifPresets.cameraModels.join(', '), shutterSpeeds: exifPresets.shutterSpeeds.join(', '), isos: exifPresets.isos.join(', '), apertures: exifPresets.apertures.join(', ') }); setIsPresetModalOpen(true) }}>管理常用选项</a>}>
                    <MultipleSelector
                      value={exif?.model ? [{ value: String(exif.model), label: String(exif.model) }] : []}
                      options={exifPresets.cameraModels.map(m => ({ value: m, label: m }))}
                      placeholder="选择或输入"
                      creatable maxSelected={1}
                      onChange={(opts?: any) => setExif({ ...exif, model: opts?.[0]?.value || '' })}
                    />
                  </AntForm.Item>
                  <AntForm.Item label="光圈 (f/)">
                    <div className="flex gap-2">
                      <Select value={exif?.f_number ? String(exif.f_number) : undefined} onValueChange={v => setExif({ ...exif, f_number: Number(v) || 0 })}>
                        <SelectTrigger className="min-w-[120px] h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder="常用" /></SelectTrigger>
                        <SelectContent>{exifPresets.apertures.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                      <AntInput value={exif?.f_number || ''} onChange={e => setExif({ ...exif, f_number: Number(e.target.value) || 0 })} placeholder="手动输入" />
                    </div>
                  </AntForm.Item>
                  <AntForm.Item label="快门">
                    <div className="flex gap-2">
                      <Select value={exif?.exposure_time || undefined} onValueChange={v => setExif({ ...exif, exposure_time: v })}>
                        <SelectTrigger className="min-w-[120px] h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder="常用" /></SelectTrigger>
                        <SelectContent>{exifPresets.shutterSpeeds.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <AntInput value={exif?.exposure_time || ''} onChange={e => setExif({ ...exif, exposure_time: e.target.value })} placeholder="手动输入" />
                    </div>
                  </AntForm.Item>
                  <AntForm.Item label="ISO">
                    <div className="flex gap-2">
                      <Select value={exif?.iso_speed_rating ? String(exif.iso_speed_rating) : undefined} onValueChange={v => setExif({ ...exif, iso_speed_rating: Number(v) || 0 })}>
                        <SelectTrigger className="min-w-[120px] h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder="常用" /></SelectTrigger>
                        <SelectContent>{exifPresets.isos.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                      </Select>
                      <AntInput value={exif?.iso_speed_rating || ''} onChange={e => setExif({ ...exif, iso_speed_rating: Number(e.target.value) || 0 })} placeholder="手动输入" />
                    </div>
                  </AntForm.Item>
                  <AntForm.Item label="焦距 (mm)">
                    <AntInput value={exif?.focal_length || ''} onChange={e => setExif({ ...exif, focal_length: Number(e.target.value) || 0 })} />
                  </AntForm.Item>
                  <AntForm.Item label="拍摄日期">
                    <AntDatePicker style={{ width: '100%' }} showTime locale={zhCN} value={exif?.data_time ? dayjs(exif.data_time) : undefined} onChange={d => setExif({ ...exif, data_time: d?.format('YYYY-MM-DD HH:mm:ss') || '' })} format="YYYY-MM-DD HH:mm:ss" allowClear />
                  </AntForm.Item>
                </div>
              </AntForm>
            </div>
          </AntCard>
        </div>

        <div className="h-full">
          <AntCard className="h-full" title="元数据" styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}>
            <AntSpace vertical size={16} style={{ width: '100%' }}>
              {/* 基本信息 */}
              <div>
                <div className="text-sm font-medium mb-3">地址与尺寸</div>
                <AntSpace vertical size={12} style={{ width: '100%' }}>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">{t('Upload.title')}</div>
                    <AntInput value={title} placeholder={t('Upload.inputTitle')} onChange={e => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">{t('Upload.url')}</div>
                    <AntInput disabled value={url} />
                    {!url && <div className="text-xs mt-2 text-red-600">未上传原图</div>}
                  </div>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">{t('Upload.previewUrl')}</div>
                    <AntInput disabled value={previewUrl} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs mb-2 text-gray-500">{t('Upload.width')}</div>
                      <AntInputNumber disabled value={width} style={{ width: '100%' }} />
                      {!width && <div className="text-xs mt-2 text-red-600">缺少宽度</div>}
                    </div>
                    <div>
                      <div className="text-xs mb-2 text-gray-500">{t('Upload.height')}</div>
                      <AntInputNumber disabled value={height} style={{ width: '100%' }} />
                      {!height && <div className="text-xs mt-2 text-red-600">缺少高度</div>}
                    </div>
                  </div>
                </AntSpace>
              </div>

              {/* 地理位置 */}
              <div>
                <div className="text-sm font-medium mb-3">地理位置</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs mb-2 text-gray-500">{t('Upload.lon')}</div>
                    <AntInput disabled value={lon} />
                  </div>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">{t('Upload.lat')}</div>
                    <AntInput disabled value={lat} />
                  </div>
                </div>
              </div>

              {/* 描述 */}
              <div>
                <div className="text-sm font-medium mb-3">描述</div>
                <div>
                  <div className="text-xs mb-2 text-gray-500">{t('Upload.detail')}</div>
                  <AntInput value={detail} onChange={e => setDetail(e.target.value)} placeholder={t('Upload.inputDetail')} />
                </div>
              </div>

              {/* 标签 */}
              <div>
                <div className="text-sm font-medium mb-3">标签</div>
                <AntSpace vertical size={12} style={{ width: '100%' }}>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">预设标签（点击切换）</div>
                    <div className="flex flex-wrap gap-2">
                      {presetTags.filter(Boolean).map((tag, i) => (
                        <AntTag key={`${tag}-${i}`} color={imageLabels.includes(tag) ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => togglePresetTag(tag)}>{tag}</AntTag>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">标签分类</div>
                    <div className="flex gap-2 items-center">
                      <div className="min-w-[160px]">
                        <Select value={primarySelect ?? undefined} onValueChange={(v: string) => { setPrimarySelect(v); setCascaderValue([v, ...secondarySelect]) }}>
                          <SelectTrigger className="w-full h-9 bg-white text-gray-900 border-gray-200"><SelectValue placeholder="选择分类" /></SelectTrigger>
                          <SelectContent>{tagTree.filter(Boolean).map(n => <SelectItem key={n.category} value={n.category}>{n.category ?? '未分类'}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <MultipleSelector
                          value={secondarySelect.map(s => ({ value: s, label: s }))}
                          options={(tagTree.find(t => t.category === primarySelect)?.children || []).map(c => ({ value: c.name, label: c.name }))}
                          placeholder="选择子标签"
                          onChange={(opts?: any) => { const vals = opts?.map((o: any) => o.value) || []; setSecondarySelect(vals); setCascaderValue([primarySelect || '', ...vals]) }}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-2 text-gray-500">自定义标签</div>
                    <MultipleSelector
                      value={imageLabels.filter(Boolean).map(s => ({ value: s, label: s }))}
                      options={presetTags.map(s => ({ value: s, label: s }))}
                      creatable
                      placeholder={t('Upload.indexTag')}
                      onChange={(opts?: any) => handleImageLabelsChange(opts?.map((o: any) => o.value) || [])}
                    />
                  </div>
                </AntSpace>
              </div>
            </AntSpace>
          </AntCard>
        </div>
      </div>

      {/* 已选文件列表 */}
      {files.length > 0 && (
        <div className="w-full">
          <AntCard>
            {files.map((file, i) => (
              <div key={(file as FileWithKey).__key || file.name || i} className="flex items-center justify-between p-2 border rounded mb-2">
                <div className="font-medium">{file.name}</div>
                <AntButton type="text" danger icon={<CloseOutlined />} onClick={() => removeFileByKey((file as FileWithKey).__key || file.name)} />
              </div>
            ))}
          </AntCard>
        </div>
      )}

      {/* EXIF 预设管理 Modal */}
      <AntModal title="管理常用 EXIF 选项" open={isPresetModalOpen} onCancel={() => setIsPresetModalOpen(false)}
        onOk={() => {
          try {
            const parse = (s: string) => s.split(',').map(v => v.trim()).filter(Boolean)
            const next = { cameraModels: parse(editingPresetsText.cameraModels), shutterSpeeds: parse(editingPresetsText.shutterSpeeds), isos: parse(editingPresetsText.isos), apertures: parse(editingPresetsText.apertures) }
            localStorage.setItem(EXIF_PRESETS_KEY, JSON.stringify(next))
            setExifPresets(next); setIsPresetModalOpen(false); AntMessage.success('已保存')
          } catch { AntMessage.error('保存失败') }
        }}
      >
        <div className="flex flex-col gap-2">
          <div><div className="text-xs text-gray-600 mb-1">相机型号（逗号分隔）</div><AntInput value={editingPresetsText.cameraModels} onChange={e => setEditingPresetsText({ ...editingPresetsText, cameraModels: e.target.value })} /></div>
          <div><div className="text-xs text-gray-600 mb-1">快门（逗号分隔）</div><AntInput value={editingPresetsText.shutterSpeeds} onChange={e => setEditingPresetsText({ ...editingPresetsText, shutterSpeeds: e.target.value })} /></div>
          <div><div className="text-xs text-gray-600 mb-1">ISO（逗号分隔）</div><AntInput value={editingPresetsText.isos} onChange={e => setEditingPresetsText({ ...editingPresetsText, isos: e.target.value })} /></div>
          <div><div className="text-xs text-gray-600 mb-1">光圈（逗号分隔）</div><AntInput value={editingPresetsText.apertures} onChange={e => setEditingPresetsText({ ...editingPresetsText, apertures: e.target.value })} /></div>
        </div>
      </AntModal>
    </div>
  )
}