// @ts-expect-error ali-oss no types
import OSS from 'ali-oss'

export function createOSSClient(cfg: Record<string, string>) {
  return new OSS({
    region: cfg['oss_region'],
    accessKeyId: cfg['oss_accesskey_id'],
    accessKeySecret: cfg['oss_accesskey_secret'],
    endpoint: cfg['oss_endpoint'],
    bucket: cfg['oss_bucket'],
  })
}

export async function ossPut(client: OSS, key: string, body: Buffer, contentType?: string) {
  return client.put(key, body, {
    headers: contentType ? { 'Content-Type': contentType } : undefined,
  })
}

export async function ossDelete(client: OSS, key: string) {
  return client.delete(key)
}

export async function ossGet(client: OSS, key: string) {
  return client.get(key)
}

export async function ossHeadBucket(client: OSS) {
  return client.getBucketInfo()
}

export function ossSignatureUrl(
  client: OSS,
  key: string,
  operation: 'get' | 'put' = 'get',
  contentType?: string,
  expiresIn: number = 3600
): string {
  return client.signatureUrl(key, {
    expires: expiresIn,
    method: operation === 'get' ? 'GET' : 'PUT',
    ...(contentType && operation === 'put' ? { 'Content-Type': contentType } : {})
  })
}
