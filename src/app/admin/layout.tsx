'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [userEmail, setUserEmail] = useState<string | null>(null)

  // 현재 로그인한 관리자 정보 가져오기
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
      }
    }
    getUser()
  }, [supabase])

  // 로그아웃 처리
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  // 로그인 페이지일 경우 레이아웃 미적용 (children만 렌더링)
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col text-slate-800 relative font-sans">
      {/* soft background light blurs */}
      <div className="fixed -top-24 -left-24 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-pink-100/30 rounded-full blur-3xl pointer-events-none" />

      {/* 상단바 (Header) */}
      <header className="bg-white/90 backdrop-blur-md border-b border-purple-100/80 sticky top-0 z-30 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xl font-black text-purple-950 flex items-center gap-2"
            >
              <span>pole2:나눔</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 font-bold text-xs border border-purple-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                Admin
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-bold text-slate-500 hover:text-purple-900 transition-colors hidden sm:inline-block"
            >
              홈 화면 가기 ↗
            </Link>
            {userEmail && (
              <span className="text-xs font-medium text-slate-400 hidden md:inline-block bg-slate-100 px-3 py-1 rounded-full">
                {userEmail}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8 relative z-10">
        {/* 사이드바 내비게이션 */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="bg-white/95 backdrop-blur-md p-3 rounded-[20px] border border-purple-100/70 shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_24px_rgba(88,28,135,0.04)] flex md:flex-col gap-1.5">
            <Link
              href="/admin/templates"
              className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2.5 ${
                pathname.startsWith('/admin/templates')
                  ? 'bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-md shadow-purple-900/20'
                  : 'text-slate-600 hover:bg-purple-50 hover:text-purple-900'
              }`}
            >
              <span>📂</span>
              <span>템플릿 관리</span>
            </Link>

            <Link
              href="/admin/history"
              className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2.5 ${
                pathname.startsWith('/admin/history')
                  ? 'bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-md shadow-purple-900/20'
                  : 'text-slate-600 hover:bg-purple-50 hover:text-purple-900'
              }`}
            >
              <span>📜</span>
              <span>모임 히스토리</span>
            </Link>
          </nav>
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}