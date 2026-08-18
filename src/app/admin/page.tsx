'use client'

import Link from 'next/link'

export default function AdminDashboardPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">🔒 관리자 대시보드</h1>
        <p className="text-sm text-slate-500 mt-1">
          모임 히스토리를 확인하거나 질문 템플릿을 관리하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 모임 히스토리 카드 */}
        <Link
          href="/admin/history"
          className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:border-purple-300 transition-all group"
        >
          <div className="text-3xl mb-3">📜</div>
          <h2 className="text-lg font-bold text-slate-900 group-hover:text-purple-900 transition-colors">
            모임 히스토리 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            개설된 모임 목록과 작성된 포스트잇 데이터를 조회 및 삭제 관리합니다.
          </p>
        </Link>

        {/* 템플릿 관리 카드 */}
        <Link
          href="/admin/templates"
          className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:border-purple-300 transition-all group"
        >
          <div className="text-3xl mb-3">📋</div>
          <h2 className="text-lg font-bold text-slate-900 group-hover:text-purple-900 transition-colors">
            질문 템플릿 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            메인 페이지에서 모임 개설 시 제공할 나눔 질문 템플릿을 수정하거나 신규 등록합니다.
          </p>
        </Link>
      </div>
    </div>
  )
}