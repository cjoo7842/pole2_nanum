import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. 기본 response 객체 생성
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 2. Supabase 서버 클라이언트 생성
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. 현재 접속 사용자(세션) 정보 조회
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // 4. /admin 경로 보호 로직
  if (pathname.startsWith('/admin')) {
    // A. 로그인 페이지(/admin/login) 접속 건
    if (pathname === '/admin/login') {
      if (user) {
        const url = request.nextUrl.clone()
        // 🔑 [수정] 존재하지 않는 '/admin' 대신 실제 관리자 메인 페이지인 '/admin/history' 로 이동시킵니다.
        url.pathname = '/admin/history'
        return redirectWithCookies(url, response)
      }
      return response
    }

    // B. /admin/login 외의 /admin 경로 접속 건 (미인증 시 로그인 페이지로)
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return redirectWithCookies(url, response)
    }
  }

  return response
}

/**
 * Supabase에서 갱신된 쿠키 헤더를 유지하면서 안전하게 Redirect 처리하는 헬퍼 함수
 */
function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url)
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value)
  })
  return redirectResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}