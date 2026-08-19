'use client'

import Link from 'next/link'

export default function AdminDashboardPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 font-sans">
      <div>
        <h1 className="text-2xl font-black text-purple-950">🔒 관리자 대시보드</h1>
        <p className="text-xs text-slate-500 mt-1">
          모임 히스토리를 확인하거나 질문 템플릿을 관리하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 템플릿 관리 카드 */}
        <Link
          href="/admin/templates"
          className="p-7 bg-white/95 backdrop-blur-md border border-purple-100/80 rounded-[20px] shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.06)] hover:shadow-lg hover:border-purple-300 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-purple-100/80 border border-purple-200/60 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform">
              📂
            </div>
            <h2 className="text-lg font-black text-slate-900 group-hover:text-purple-900 transition-colors">
              질문 템플릿 관리
            </h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              메인 페이지에서 모임 개설 시 제공할 나눔 질문 템플릿을 추가, 수정, 공개/비공개 및 삭제 관리합니다.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-900">
            <span>템플릿 관리 바로가기</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* 모임 히스토리 카드 */}
        <Link
          href="/admin/history"
          className="p-7 bg-white/95 backdrop-blur-md border border-purple-100/80 rounded-[20px] shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.06)] hover:shadow-lg hover:border-purple-300 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-purple-100/80 border border-purple-200/60 flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform">
              📜
            </div>
            <h2 className="text-lg font-black text-slate-900 group-hover:text-purple-900 transition-colors">
              모임 히스토리 관리
            </h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              종료된 모임 목록과 작성된 나눔 포스트잇 및 사진 기록을 조회하고 잔여 모임 데이터를 정리합니다.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-900">
            <span>히스토리 조회 바로가기</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>
      </div>
    </div>
  )
}