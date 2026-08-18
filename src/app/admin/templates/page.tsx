'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Template } from '@/types/database'

export default function AdminTemplatesPage() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  // 모달 상태 관리
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // 템플릿 목록 불러오기
  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('템플릿 목록 불러오기 실패:', error)
      alert('템플릿 목록을 불러오는 중 오류가 발생했습니다.')
    } else {
      setTemplates(data || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // 새 템플릿 추가
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || isCreating) return

    setIsCreating(true)
    const { data, error } = await supabase
      .from('templates')
      .insert({ title: newTitle.trim() })
      .select()
      .single()

    if (error) {
      console.error('템플릿 생성 실패:', error)
      alert('템플릿 생성 중 오류가 발생했습니다.')
    } else if (data) {
      setNewTitle('')
      setIsModalOpen(false)
      fetchTemplates()
    }
    setIsCreating(false)
  }

  // 템플릿 삭제
  const handleDeleteTemplate = async (id: string, title: string) => {
    if (!confirm(`'${title}' 템플릿을 정말 삭제하시겠습니까?\n포함된 모든 질문 데이터도 함께 영향을 받을 수 있습니다.`)) {
      return
    }

    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('템플릿 삭제 실패:', error)
      alert('템플릿 삭제 중 오류가 발생했습니다.')
    } else {
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      {/* 상단 헤더 및 추가 버튼 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-amber-950">템플릿 관리</h1>
          <p className="text-xs text-slate-500 mt-1">
            나눔 모임에서 사용할 질문 세트(템플릿)를 추가하고 관리하세요.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm shadow transition-all flex items-center gap-1.5"
        >
          <span>➕</span> 새 템플릿 추가
        </button>
      </div>

      {/* 템플릿 그리드 목록 */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium animate-pulse">
          템플릿 데이터를 불러오는 중...
        </div>
      ) : templates.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl space-y-2 bg-white">
          <p className="text-2xl">📂</p>
          <p className="text-slate-600 font-bold">등록된 템플릿이 없습니다.</p>
          <p className="text-xs text-slate-400">새 템플릿 추가 버튼을 눌러 질문 세트를 만들어 보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all gap-4"
            >
              <div>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                  Template
                </span>
                <h3 className="text-lg font-bold text-slate-800 mt-2 line-clamp-1">
                  {template.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  생성일: {new Date(template.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Link
                  href={`/admin/templates/${template.id}`}
                  className="flex-1 py-2 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-700 font-bold rounded-xl text-xs text-center transition-all"
                >
                  ✏️ 질문 수정 / 관리
                </Link>
                <button
                  onClick={() => handleDeleteTemplate(template.id, template.title)}
                  className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 새 템플릿 생성 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-amber-100">
            <h3 className="text-lg font-bold text-slate-800">새 템플릿 만들기 📝</h3>
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  템플릿 제목
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 주일 소그룹 나눔, 아웃리치 첫날 질문"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm disabled:opacity-50"
                >
                  {isCreating ? '생성 중...' : '만들기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}