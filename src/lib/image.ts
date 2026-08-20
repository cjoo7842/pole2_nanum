/**
 * 이미지 URL이 유효한 웹 URL 또는 로컬 블롭 URL인지 검증합니다. (http://, https://, blob:)
 */
export function isValidImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  )
}

/**
 * 포스트잇 이미지 URL을 안전하게 반환합니다.
 * 이미 완전한 HTTP/HTTPS/Blob URL인 경우 그대로 반환하며,
 * 레거시 파일명 또는 상대 경로가 DB에 저장되어 있는 경우 Supabase Storage의 Public URL 형식으로 변환합니다.
 */
export function getPostImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }

  // 레거시 파일명/경로 fallback 변환
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl) {
    const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
    if (cleanPath.startsWith('post-images/')) {
      return `${supabaseUrl}/storage/v1/object/public/${cleanPath}`
    }
    return `${supabaseUrl}/storage/v1/object/public/post-images/${cleanPath}`
  }

  return null
}
