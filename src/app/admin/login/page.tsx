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
    <main className="min-h-screen bg-slate-50/70 flex items-center justify-center p-6 text-slate-800 relative overflow-hidden font-sans">
      {/* soft background light blurs */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-pink-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-[20px] p-8 sm:p-10 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.08)] border border-purple-100/80 flex flex-col gap-6 relative overflow-hidden z-10">
        {/* 장식용 배경 아이콘 */}
        <div className="absolute -top-6 -right-6 text-8xl opacity-10 rotate-12 select-none pointer-events-none">
          🔑
        </div>

        <div className="text-center space-y-2 relative z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 text-purple-900 text-xs font-bold rounded-full border border-purple-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
            관리자 전용
          </span>
          <h1 className="text-3xl font-black text-purple-950">
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
              className="w-full h-[52px] px-4 rounded-xl bg-slate-50/80 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white transition-all text-sm font-medium"
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
              className="w-full h-[52px] px-4 rounded-xl bg-slate-50/80 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white transition-all text-sm font-medium"
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
            className="mt-2 w-full h-[52px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 transition-all text-base disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? '로그인 중...' : '로그인하기 →'}
          </button>
        </form>
      </div>
    </main>
  )
}