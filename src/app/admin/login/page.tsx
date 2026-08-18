'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminLoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setIsLoading(true)

    // Supabase 비밀번호 기반 로그인 API 호출
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMsg(
        error.message === 'Invalid login credentials'
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : error.message
      )
      setIsLoading(false)
      return
    }

    // 로그인 성공 시 관리자 대시보드로 이동
    router.push('/admin')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-amber-50/60 flex items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-amber-100 flex flex-col gap-6 relative overflow-hidden">
        {/* 장식용 배경 아이콘 */}
        <div className="absolute -top-6 -right-6 text-8xl opacity-10 rotate-12 select-none">
          🔑
        </div>

        <div className="text-center space-y-2 relative z-10">
          <span className="inline-block px-3 py-1 bg-amber-100 text-amber-900 text-xs font-bold rounded-full">
            관리자 전용
          </span>
          <h1 className="text-3xl font-black text-amber-950">
            pole2:나눔 🔒
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            모임 관리를 위해 관리자 계정으로 로그인해 주세요.
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4 relative z-10">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 pl-1">
              이메일
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600 pl-1">
              비밀번호
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all text-sm"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium text-center">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full py-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-2xl shadow-md transition-all text-base disabled:opacity-50"
          >
            {isLoading ? '로그인 중...' : '로그인하기 💛'}
          </button>
        </form>
      </div>
    </main>
  )
}