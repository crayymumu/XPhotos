const CDN_URL = (process.env.NEXT_PUBLIC_IMAGE_CDN_URL || '').replace(/\/$/, '')

export function toPublicImageUrl(value: string | null | undefined): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `${CDN_URL}/${value.replace(/^\//, '')}`
}

export function toPathOnly(value: string | null | undefined): string {
  if (!value) return ''
  if (!value.startsWith('http://') && !value.startsWith('https://')) return value
  try {
    const u = new URL(value)
    return u.pathname.replace(/^\//, '')
  } catch {
    return value
  }
}
