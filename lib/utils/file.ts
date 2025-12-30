import ExifReader from 'exifreader'
import type { ExifType } from '~/types'
import { createId } from '@paralleldrive/cuid2'

// ==================== EXIF 解析 ====================

export async function exifReader(file: ArrayBuffer | SharedArrayBuffer | Buffer | File) {
  const buffer = file instanceof File ? await file.arrayBuffer() : file
  const tags = await ExifReader.load(buffer)
  
  let dateTime = tags?.DateTimeOriginal?.description || tags?.DateTime?.description || ''
  if (dateTime && typeof dateTime === 'string') {
    dateTime = dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
  }

  const exifObj: ExifType = {
    make: tags?.Make?.description || '',
    model: tags?.Model?.description || '',
    bits: parseFloat(tags?.['Bits Per Sample']?.description || '') || null,
    data_time: dateTime,
    exposure_time: tags?.ExposureTime?.description || '',
    f_number: parseFloat(tags?.FNumber?.description || '') || null,
    exposure_program: tags?.ExposureProgram?.description || '',
    iso_speed_rating: parseInt(tags?.ISOSpeedRatings?.description || '', 10) || null,
    focal_length: parseFloat(tags?.FocalLength?.description || '') || null,
    lens_specification: tags?.LensSpecification?.description || '',
    lens_model: tags?.LensModel?.description || '',
    exposure_mode: tags?.ExposureMode?.description || '',
    // @ts-expect-error CFAPattern is not included in the ExifReader types
    cfa_pattern: tags?.CFAPattern?.description || '',
    color_space: tags?.ColorSpace?.description || '',
    white_balance: tags?.WhiteBalance?.description || '',
  }

  return { tags, exifObj }
}

// ==================== 文件上传 ====================

interface UploadOptions { onProgress?: (p: number) => void }
interface UploadResponse { code: number; data: { url: string; imageId: string; fileName: string; key?: string } }

// 统一上传入口：alist 走 FormData，其他走预签名
export async function uploadFile(file: File, type: string, storage: string, mountPath: string, options?: UploadOptions): Promise<UploadResponse> {
  if (!file?.name) throw new Error('Invalid file')
  if (!storage) throw new Error('Storage type is required')

  const imageId = createId()
  const ext = file.name.split('.').pop()
  const fileName = file.name
  const newFile = new File([file], `${imageId}.${ext}`, { type: file.type })

  return storage === 'alist'
    ? uploadViaFormData(newFile, type, storage, mountPath, imageId, fileName)
    : uploadViaPresignedUrl(newFile, type, storage, options, imageId, fileName)
}

// FormData 方式上传（alist / 服务端回退）
async function uploadViaFormData(file: File, type: string, storage: string, mountPath: string, imageId: string, fileName: string): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('storage', storage)
  formData.append('type', type)
  if (mountPath) formData.append('mountPath', mountPath)

  const json = await postJson('/api/v1/file/upload', formData)
  if (json?.code === 200) {
    return { code: 200, data: { url: json.data?.url || json.data, imageId, fileName, key: json.data?.key } }
  }
  throw new Error('Upload failed')
}

// 预签名 URL 上传（S3/R2）
async function uploadViaPresignedUrl(file: File, type: string, storage: string, options: UploadOptions | undefined, imageId: string, fileName: string): Promise<UploadResponse> {
  // 1. 获取预签名 URL
  const presignedJson = await postJson('/api/v1/file/presigned-url', { filename: file.name, contentType: file.type, type, storage })

  // 服务端强制走 FormData
  if (presignedJson?.data?.serverUpload || presignedJson?.code === 286) {
    return uploadViaFormData(file, type, storage, '', imageId, fileName).then(r => { options?.onProgress?.(100); return r })
  }
  if (presignedJson?.code !== 200) throw new Error(presignedJson?.message || 'Failed to get presigned URL')

  const { presignedUrl, key } = presignedJson.data

  // 2. 直传到存储，失败则回退服务端
  try {
    await uploadWithProgress(presignedUrl, file, options)
  } catch (e) {
    return uploadViaFormData(file, type, storage, '', imageId, fileName).then(r => { options?.onProgress?.(100); return r })
  }

  // 3. 获取公开访问 URL
  const objectJson = await postJson('/api/v1/file/getObjectUrl', { key, storage })
  if (objectJson?.code !== 200) throw new Error(objectJson?.message || 'Failed to get object URL')

  options?.onProgress?.(100)
  return { code: 200, data: { url: objectJson.data, imageId, fileName, key } }
}

// XHR 上传（带进度）
function uploadWithProgress(url: string, file: File, options?: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => e.lengthComputable && options?.onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `Status: ${xhr.status}`))
    xhr.onerror = () => reject(new Error(xhr.responseText || 'Upload failed'))
    xhr.send(file)
  })
}

// ==================== 工具函数 ====================

async function postJson(url: string, body: FormData | object) {
  const isFormData = body instanceof FormData
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: isFormData ? { Accept: 'application/json' } : { 'Content-Type': 'application/json' },
    body: isFormData ? body : JSON.stringify(body),
  })
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(await res.text().catch(() => `Request failed: ${res.status}`))
  }
  return res.json().catch(() => ({ code: res.status }))
}
