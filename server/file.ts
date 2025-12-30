import 'server-only'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { alistUpload } from '~/lib/file-upload'
import { fetchConfigsByKeys } from '~/lib/db/query/configs'
import type { Config } from '~/types'
import { getR2Client } from '~/lib/r2'
import { generatePresignedUrl } from '~/lib/s3api'
import { getClient as getS3Client } from '~/lib/s3'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createId } from '@paralleldrive/cuid2'
import { normalizeStorageFolder } from '~/lib/utils/storage'
import { createOSSClient, ossPut, ossDelete, ossSignatureUrl } from '~/lib/oss'

const app = new Hono()

// ==================== 工具函数 ====================

function toConfigMap(configs: Config[]): Record<string, string> {
  return Object.fromEntries(configs.filter(c => c.config_key).map(c => [c.config_key, c.config_value || '']))
}

function buildS3PublicUrl(cfg: Record<string, string>, key: string): string {
  const { bucket = '', endpoint = '', s3_cdn, s3_cdn_url, force_path_style } = cfg
  const base = (s3_cdn === 'true' && s3_cdn_url) ? s3_cdn_url.replace(/\/$/, '') : endpoint.replace(/\/$/, '')
  if (s3_cdn === 'true' && s3_cdn_url) return `${base}/${key}`
  if (force_path_style === 'true') return `${base}/${bucket}/${key}`
  return `${base.replace('https://', `https://${bucket}.`)}/${key}`
}

function buildOSSPublicUrl(cfg: Record<string, string>, key: string): string {
  const { oss_bucket = '', oss_endpoint = '', oss_cdn, oss_cdn_url } = cfg
  if (oss_cdn === 'true' && oss_cdn_url) return `${oss_cdn_url.replace(/\/$/, '')}/${key}`
  const endpoint = oss_endpoint.replace(/\/$/, '').replace('https://', `https://${oss_bucket}.`)
  return `${endpoint}/${key}`
}

function buildFilePath(storageFolder: string, type: string, filename: string): string {
  const folder = normalizeStorageFolder(storageFolder)
  const typeSegment = type && type !== '/' ? type.replace(/^\//, '') : ''
  return [folder, typeSegment, filename].filter(Boolean).join('/')
}

// ==================== 预签名 URL ====================

app.post('/presigned-url', async (c) => {
  const { filename, contentType, type = '/', storage } = await c.req.json()
  if (!filename) throw new HTTPException(400, { message: 'Filename is required' })
  if (!storage) throw new HTTPException(400, { message: 'Storage type is required' })

  if (storage === 'r2') {
    const configs = await fetchConfigsByKeys(['r2_accesskey_id', 'r2_accesskey_secret', 'r2_account_id', 'r2_bucket', 'r2_storage_folder', 'r2_public_domain'])
    const cfg = toConfigMap(configs)
    const filePath = buildFilePath(cfg['r2_storage_folder'], type, filename)
    const presignedUrl = await generatePresignedUrl(getR2Client(configs), cfg['r2_bucket'], filePath, contentType, 'put')
    return c.json({ code: 200, data: { presignedUrl, key: filePath } })
  }

  if (storage === 's3') {
    const configs = await fetchConfigsByKeys(['accesskey_id', 'accesskey_secret', 'region', 'endpoint', 'bucket', 'storage_folder', 'force_path_style', 's3_force_server_upload', 's3_cdn', 's3_cdn_url'])
    const cfg = toConfigMap(configs)
    if (cfg['s3_force_server_upload'] === 'true') return c.json({ code: 286, data: { serverUpload: true } })
    for (const k of ['accesskey_id', 'accesskey_secret', 'region', 'endpoint', 'bucket']) {
      if (!cfg[k]) throw new HTTPException(400, { message: `S3 config ${k} is required` })
    }
    const filePath = buildFilePath(cfg['storage_folder'], type, filename)
    const base = (cfg['s3_cdn'] === 'true' && cfg['s3_cdn_url']) ? cfg['s3_cdn_url'].replace(/\/$/, '') : cfg['endpoint']
    return c.json({ code: 200, data: { presignedUrl: `${base}/${filePath}`, key: filePath } })
  }

  if (storage === 'oss') {
    const configs = await fetchConfigsByKeys(['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket', 'oss_storage_folder', 'oss_cdn', 'oss_cdn_url'])
    const cfg = toConfigMap(configs)
    for (const k of ['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket']) {
      if (!cfg[k]) throw new HTTPException(400, { message: `OSS config ${k} is required` })
    }
    const filePath = buildFilePath(cfg['oss_storage_folder'], type, filename)
    const client = createOSSClient(cfg)
    const presignedUrl = ossSignatureUrl(client, filePath, 'put', contentType)
    return c.json({ code: 200, data: { presignedUrl, key: filePath } })
  }

  throw new HTTPException(400, { message: 'Unsupported storage type' })
})

// ==================== 文件上传 ====================

app.post('/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as Blob | null
  const storage = formData.get('storage')?.toString()
  const type = formData.get('type')?.toString() || ''
  const mountPath = formData.get('mountPath')?.toString() || ''

  if (!storage) throw new HTTPException(400, { message: 'Storage type is required' })

  // AList 上传
  if (storage === 'alist') {
    const result = await alistUpload(file as Blob, type, mountPath)
    return Response.json({ code: 200, data: result })
  }

  // S3 服务端上传
  if (storage === 's3') {
    if (!file) throw new HTTPException(400, { message: 'File missing' })
    const configs = await fetchConfigsByKeys(['accesskey_id', 'accesskey_secret', 'region', 'endpoint', 'bucket', 'storage_folder', 'force_path_style', 's3_cdn', 's3_cdn_url'])
    const cfg = toConfigMap(configs)
    for (const k of ['accesskey_id', 'accesskey_secret', 'region', 'endpoint', 'bucket']) {
      if (!cfg[k]) throw new HTTPException(400, { message: `S3 config ${k} is required` })
    }

    const imageId = createId()
    const rawName = (file as any).name || 'upload.bin'
    const ext = rawName.includes('.') ? rawName.split('.').pop() : 'bin'
    const newFileName = `${imageId}.${ext}`
    const key = buildFilePath(cfg['storage_folder'], type, newFileName)

    await getS3Client(configs).send(new PutObjectCommand({
      Bucket: cfg['bucket'],
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: (file as any).type || undefined,
    }))

    return Response.json({ code: 200, data: { url: buildS3PublicUrl(cfg, key), imageId, fileName: newFileName, key } })
  }

  // OSS 服务端上传
  if (storage === 'oss') {
    if (!file) throw new HTTPException(400, { message: 'File missing' })
    const configs = await fetchConfigsByKeys(['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket', 'oss_storage_folder', 'oss_cdn', 'oss_cdn_url'])
    const cfg = toConfigMap(configs)
    for (const k of ['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket']) {
      if (!cfg[k]) throw new HTTPException(400, { message: `OSS config ${k} is required` })
    }

    const imageId = createId()
    const rawName = (file as any).name || 'upload.bin'
    const ext = rawName.includes('.') ? rawName.split('.').pop() : 'bin'
    const newFileName = `${imageId}.${ext}`
    const key = buildFilePath(cfg['oss_storage_folder'], type, newFileName)

    const client = createOSSClient(cfg)
    await ossPut(client, key, Buffer.from(await file.arrayBuffer()), (file as any).type || undefined)

    return Response.json({ code: 200, data: { url: buildOSSPublicUrl(cfg, key), imageId, fileName: newFileName, key } })
  }

  throw new HTTPException(400, { message: 'Unsupported storage type' })
})

// ==================== 获取对象 URL ====================

app.post('/getObjectUrl', async (c) => {
  const { storage, key } = await c.req.json()

  if (storage === 's3') {
    const configs = await fetchConfigsByKeys(['accesskey_id', 'accesskey_secret', 'region', 'endpoint', 'bucket', 'force_path_style', 's3_cdn', 's3_cdn_url', 's3_direct_download'])
    const cfg = toConfigMap(configs)
    // 私有桶返回预签名 GET 链接
    if (cfg['s3_direct_download'] !== 'true') {
      const signed = await generatePresignedUrl(getS3Client(configs), cfg['bucket'], key, '', 'get')
      return Response.json({ code: 200, data: signed })
    }
    return Response.json({ code: 200, data: buildS3PublicUrl(cfg, key) })
  }

  if (storage === 'r2') {
    const configs = await fetchConfigsByKeys(['r2_public_domain'])
    const domain = toConfigMap(configs)['r2_public_domain'] || ''
    return Response.json({ code: 200, data: `${domain}/${key}` })
  }

  if (storage === 'oss') {
    const configs = await fetchConfigsByKeys(['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket', 'oss_cdn', 'oss_cdn_url', 'oss_direct_download'])
    const cfg = toConfigMap(configs)
    if (cfg['oss_direct_download'] !== 'true') {
      const client = createOSSClient(cfg)
      const signed = ossSignatureUrl(client, key, 'get')
      return Response.json({ code: 200, data: signed })
    }
    return Response.json({ code: 200, data: buildOSSPublicUrl(cfg, key) })
  }
})

// ==================== 删除对象 ====================

app.post('/delete', async (c) => {
  const { storage, key } = await c.req.json()
  if (!storage || !key) throw new HTTPException(400, { message: 'storage 和 key 均必填' })

  if (storage === 's3') {
    const configs = await fetchConfigsByKeys(['accesskey_id', 'accesskey_secret', 'region', 'endpoint', 'bucket'])
    const bucket = toConfigMap(configs)['bucket']
    if (!bucket) throw new HTTPException(400, { message: 'S3 bucket 未配置' })
    await getS3Client(configs).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    return Response.json({ code: 200, message: 'deleted' })
  }

  if (storage === 'r2') {
    const configs = await fetchConfigsByKeys(['r2_account_id', 'r2_accesskey_id', 'r2_accesskey_secret', 'r2_bucket'])
    const bucket = toConfigMap(configs)['r2_bucket']
    await getR2Client(configs).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    return Response.json({ code: 200, message: 'deleted' })
  }

  if (storage === 'oss') {
    const configs = await fetchConfigsByKeys(['oss_accesskey_id', 'oss_accesskey_secret', 'oss_region', 'oss_endpoint', 'oss_bucket'])
    const cfg = toConfigMap(configs)
    if (!cfg['oss_bucket']) throw new HTTPException(400, { message: 'OSS bucket 未配置' })
    const client = createOSSClient(cfg)
    await ossDelete(client, key)
    return Response.json({ code: 200, message: 'deleted' })
  }

  throw new HTTPException(400, { message: 'Unsupported storage type' })
})

export default app