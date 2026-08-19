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
  const [newIsPublic, setNewIsPublic] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  // 작업 진행 중 상태 관리
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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
      .insert({
        title: newTitle.trim(),
        is_public: newIsPublic,
      })
      .select()
      .single()

    if (error) {
      console.error('템플릿 생성 실패:', error)
      alert(`템플릿 생성 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
    } else if (data) {
      setNewTitle('')
      setNewIsPublic(true)
      setIsModalOpen(false)
      fetchTemplates()
    }
    setIsCreating(false)
  }

  // 템플릿 공개 / 비공개 토글
  const handleTogglePublic = async (id: string, currentStatus: boolean) => {
    if (togglingId) return
    setTogglingId(id)

    const nextStatus = !currentStatus

    // 낙관적 UI 업데이트
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_public: nextStatus } : t))
    )

    const { error } = await supabase
      .from('templates')
      .update({ is_public: nextStatus })
      .eq('id', id)

    if (error) {
      console.error('템플릿 공개 상태 변경 실패:', error)
      alert(`공개 상태 변경에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
      // 실패 시 롤백
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_public: currentStatus } : t))
      )
    }

    setTogglingId(null)
  }

  // 템플릿 삭제 (연관된 모임 방, 포스트잇, 질문 데이터까지 완전 연쇄 삭제)
  const handleDeleteTemplate = async (id: string, title: string) => {
    if (deletingId) return

    if (
      !confirm(
        `'${title}' 템플릿을 정말 삭제하시겠습니까?\n\n⚠️ 경고:\n- 해당 템플릿에 등록된 모든 질문이 삭제됩니다.\n- 해당 템플릿으로 진행되었던 모든 모임 방(rooms) 및 참가자 포스트잇/사진 데이터도 완전히 함께 삭제됩니다.`
      )
    ) {
      return
    }

    setDeletingId(id)

    try {
      // 1. 해당 템플릿으로 생성된 모임 방(rooms) 목록 조회
      const { data: relatedRooms, error: roomsFetchError } = await supabase
        .from('rooms')
        .select('id')
        .eq('template_id', id)

      if (roomsFetchError) {
        console.error('연관 방 목록 조회 실패:', roomsFetchError)
      }

      const roomIds =
        (relatedRooms as { id: string }[] | null)?.map((r) => r.id) || []

      // 2. 해당 모임 방들에 달린 모든 포스트잇(posts) 먼저 삭제
      if (roomIds.length > 0) {
        const { error: postsDeleteError } = await supabase
          .from('posts')
          .delete()
          .in('room_id', roomIds)

        if (postsDeleteError) {
          console.error('연관 포스트잇(posts) 삭제 실패:', postsDeleteError)
          throw new Error(`연관 포스트잇 삭제 실패: ${postsDeleteError.message || '알 수 없는 오류'}`)
        }

        // 3. 해당 모임 방(rooms)들 삭제
        const { error: roomsDeleteError } = await supabase
          .from('rooms')
          .delete()
          .in('id', roomIds)

        if (roomsDeleteError) {
          console.error('연관 모임 방(rooms) 삭제 실패:', roomsDeleteError)
          throw new Error(`연관 모임 방 삭제 실패: ${roomsDeleteError.message || '알 수 없는 오류'}`)
        }
      }

      // 4. 해당 템플릿에 속한 질문(questions) 목록 조회
      const { data: relatedQuestions, error: qFetchError } = await supabase
        .from('questions')
        .select('id')
        .eq('template_id', id)

      if (qFetchError) {
        console.error('연관 질문 조회 실패:', qFetchError)
      }

      const questionIds =
        (relatedQuestions as { id: string }[] | null)?.map((q) => q.id) || []

      // 5. 혹시 남아있을 수 있는 해당 질문 ID 참조 포스트잇 정리
      if (questionIds.length > 0) {
        const { error: remainingPostsError } = await supabase
          .from('posts')
          .delete()
          .in('question_id', questionIds)

        if (remainingPostsError) {
          console.error('질문 참조 잔여 포스트잇 삭제 오류:', remainingPostsError)
        }
      }

      // 6. 질문(questions) 테이블 데이터 삭제
      const { error: questionsDeleteError } = await supabase
        .from('questions')
        .delete()
        .eq('template_id', id)

      if (questionsDeleteError) {
        console.error('연관 질문(questions) 삭제 실패:', questionsDeleteError)
        throw new Error(`연관 질문 삭제 실패: ${questionsDeleteError.message || '알 수 없는 오류'}`)
      }

      // 7. 템플릿(templates) 테이블 데이터 최종 삭제
      const { error: templateDeleteError } = await supabase
        .from('templates')
        .delete()
        .eq('id', id)

      if (templateDeleteError) {
        console.error('템플릿(templates) 삭제 실패:', templateDeleteError)
        throw new Error(`템플릿 삭제 실패: ${templateDeleteError.message || '알 수 없는 오류'}`)
      }

      // 8. UI 상태 즉시 갱신
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      alert(`'${title}' 템플릿 및 연관 모임 기록이 모두 깔끔하게 삭제되었습니다.`)
    } catch (err: any) {
      console.error('템플릿 전체 연쇄 삭제 프로세스 중 예외 발생:', err)
      const errorMsg =
        err?.message || (typeof err === 'object' ? JSON.stringify(err, null, 2) : String(err))
      alert(`템플릿 삭제 중 오류가 발생했습니다.\n\n[오류 내용]\n${errorMsg}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* 상단 헤더 및 추가 버튼 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-purple-950">템플릿 관리</h1>
          <p className="text-xs text-slate-500 mt-1">
            나눔 모임에서 사용할 질문 세트(템플릿)를 추가하고 공개 여부를 설정하세요.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-900/20 transition-all flex items-center gap-1.5 cursor-pointer"
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
        <div className="py-20 text-center border-2 border-dashed border-purple-200/80 rounded-[20px] space-y-2 bg-white/80">
          <p className="text-2xl">📂</p>
          <p className="text-slate-600 font-bold">등록된 템플릿이 없습니다.</p>
          <p className="text-xs text-slate-400">새 템플릿 추가 버튼을 눌러 질문 세트를 만들어 보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const isPublic = template.is_public ?? true
            const isDeleting = deletingId === template.id
            const isToggling = togglingId === template.id

            return (
              <div
                key={template.id}
                className="bg-white/95 backdrop-blur-md p-6 rounded-[20px] border border-purple-100/80 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.06)] flex flex-col justify-between hover:shadow-lg transition-all gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-full border border-purple-200/80">
                      Template
                    </span>

                    {/* 공개 / 비공개 토글 버튼 */}
                    <button
                      type="button"
                      disabled={isToggling || isDeleting}
                      onClick={() => handleTogglePublic(template.id, isPublic)}
                      title={isPublic ? '클릭 시 비공개로 전환 (메인 화면 미노출)' : '클릭 시 공개로 전환 (메인 화면 노출)'}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                        isPublic
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      } ${isToggling ? 'opacity-50 animate-pulse' : ''}`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isPublic ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      <span>{isToggling ? '변경 중...' : isPublic ? '공개 중' : '비공개'}</span>
                    </button>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mt-3 line-clamp-1">
                    {template.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    생성일: {new Date(template.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <Link
                    href={`/admin/templates/${template.id}`}
                    className="flex-1 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold rounded-xl text-xs text-center transition-all border border-purple-200/60"
                  >
                    ✏️ 질문 수정 / 관리
                  </Link>
                  <button
                    type="button"
                    disabled={isDeleting || isToggling}
                    onClick={() => handleDeleteTemplate(template.id, template.title)}
                    className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 새 템플릿 생성 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-md rounded-[24px] p-6 sm:p-7 max-w-md w-full space-y-5 shadow-2xl border border-purple-100">
            <h3 className="text-lg font-black text-slate-900">새 템플릿 만들기 📝</h3>
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  템플릿 제목
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 주일 소그룹 나눔, 아웃리치 첫날 질문"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-[52px] px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white font-medium transition-all"
                />
              </div>

              {/* 생성 시 공개 여부 설정 */}
              <div className="flex items-center gap-2.5 bg-purple-50/60 p-3.5 rounded-xl border border-purple-100">
                <input
                  type="checkbox"
                  id="modalIsPublic"
                  checked={newIsPublic}
                  onChange={(e) => setNewIsPublic(e.target.checked)}
                  className="w-4 h-4 text-purple-900 rounded border-slate-300 focus:ring-purple-900 cursor-pointer"
                />
                <label
                  htmlFor="modalIsPublic"
                  className="text-xs font-bold text-slate-700 cursor-pointer select-none"
                >
                  메인 화면에 즉시 공개하기 (사용자가 선택 가능)
                </label>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm cursor-pointer transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 h-[48px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-900/20 disabled:opacity-50 cursor-pointer transition-all flex items-center justify-center gap-2"
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