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
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* 상단바 (Header) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xl font-black text-amber-950 flex items-center gap-1.5"
            >
              <span>pole2:나눔</span>
              <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                Admin
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {userEmail && (
              <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
                {userEmail}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-xl transition-all"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">
        {/* 사이드바 내비게이션 */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex md:flex-col gap-1">
            <Link
              href="/admin/templates"
              className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                pathname.startsWith('/admin/templates')
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>📂</span>
              <span>템플릿 관리</span>
            </Link>

            <Link
              href="/admin/history"
              className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                pathname.startsWith('/admin/history')
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
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