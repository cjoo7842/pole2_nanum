'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { Template, Question } from '@/types/database'

// Drag & Drop이 가능한 질문 카드 컴포넌트
function SortableQuestionItem({
  question,
  onDelete,
}: {
  question: Question
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white/95 backdrop-blur-md p-4 sm:p-5 rounded-[16px] border border-purple-100/80 shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_16px_rgba(88,28,135,0.04)] flex items-center justify-between gap-4 select-none"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* 드래그 핸들 손잡이 아이콘 */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-2 text-slate-300 hover:text-purple-900 cursor-grab active:cursor-grabbing rounded-lg hover:bg-purple-50 transition-colors"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-full border border-purple-200/80">
              Q{question.step_order}
            </span>
            <h4 className="font-bold text-slate-900 text-base truncate">
              {question.title}
            </h4>
          </div>
          {question.subtitle && (
            <p className="text-xs text-slate-400 mt-0.5 truncate pl-0.5">
              {question.subtitle}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(question.id)}
        className="text-xs font-bold text-slate-300 hover:text-red-600 p-2 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
      >
        삭제
      </button>
    </div>
  )
}

export default function TemplateDetailPage() {
  const params = useParams()
  const templateId = typeof params?.templateId === 'string' ? params.templateId : ''
  const supabase = createClient()

  const [template, setTemplate] = useState<Template | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // 질문 추가 입력 폼 상태
  const [newTitle, setNewTitle] = useState('')
  const [newSubtitle, setNewSubtitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // dnd-kit 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // 1. 템플릿 정보 및 질문 목록 조회
  const fetchData = useCallback(async () => {
    if (!templateId) return
    setLoading(true)

    // 템플릿 정보
    const { data: tData } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single()

    // 질문 목록 (step_order 순 오름차순 정렬)
    const { data: qData } = await supabase
      .from('questions')
      .select('*')
      .eq('template_id', templateId)
      .order('step_order', { ascending: true })

    if (tData) setTemplate(tData)
    if (qData) setQuestions(qData)
    setLoading(false)
  }, [templateId, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 2. 새 질문 추가 (step_order = 현재 질문 개수 + 1)
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || isAdding) return

    setIsAdding(true)
    const nextOrder = questions.length + 1

    const { data, error } = await supabase
      .from('questions')
      .insert({
        template_id: templateId,
        title: newTitle.trim(),
        subtitle: newSubtitle.trim() || null,
        step_order: nextOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('질문 추가 실패 상세:', JSON.stringify(error, null, 2))
      const errorMessage = error.message || error.details || error.hint || '알 수 없는 오류'
      alert(`질문 추가 중 오류가 발생했습니다:\n${errorMessage}`)
    } else if (data) {
      setQuestions((prev) => [...prev, data])
      setNewTitle('')
      setNewSubtitle('')
    }
    setIsAdding(false)
  }

  // 3. 질문 삭제 (삭제 후 남은 질문들의 step_order를 재정렬)
  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm('이 질문을 삭제하시겠습니까?')) return

    const { error } = await supabase.from('questions').delete().eq('id', qId)

    if (error) {
      console.error('질문 삭제 실패:', JSON.stringify(error, null, 2))
      alert(`질문 삭제 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
      return
    }

    const updated = questions
      .filter((q) => q.id !== qId)
      .map((q, idx) => ({ ...q, step_order: idx + 1 }))

    setQuestions(updated)

    // 삭제로 인한 재정렬
    const results = await Promise.all(
      updated.map((q) =>
        supabase.from('questions').update({ step_order: q.step_order }).eq('id', q.id)
      )
    )
    const failed = results.find((r) => r.error)
    if (failed) {
      console.error('순서 재정렬 저장 실패:', JSON.stringify(failed.error, null, 2))
      alert('삭제 후 순서 재정렬 중 일부 오류가 발생했습니다. 새로고침 후 확인해주세요.')
      fetchData() // 실제 DB 상태로 다시 동기화
    }
  }

  // 4. Drag & Drop 종료 핸들러 (순서 재배치 및 DB 비동기 update)
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = questions.findIndex((q) => q.id === active.id)
    const newIndex = questions.findIndex((q) => q.id === over.id)

    // 순서 변경된 배열 생성
    const reorderedQuestions = arrayMove(questions, oldIndex, newIndex).map(
      (q, idx) => ({
        ...q,
        step_order: idx + 1,
      })
    )

    const previousQuestions = questions // 실패 시 롤백용

    // 즉시 로컬 UI 반영 (낙관적 업데이트)
    setQuestions(reorderedQuestions)

    try {
      // 1단계: 임시 음수 값으로 먼저 업데이트 (UNIQUE 제약 조건 방지)
      const tempResults = await Promise.all(
        reorderedQuestions.map((q, idx) =>
          supabase
            .from('questions')
            .update({ step_order: -(idx + 1) })
            .eq('id', q.id)
        )
      )
      const tempFailed = tempResults.find((r) => r.error)
      if (tempFailed) throw tempFailed.error

      // 2단계: 최종 순서 값으로 업데이트
      const finalResults = await Promise.all(
        reorderedQuestions.map((q) =>
          supabase
            .from('questions')
            .update({ step_order: q.step_order })
            .eq('id', q.id)
        )
      )
      const finalFailed = finalResults.find((r) => r.error)
      if (finalFailed) throw finalFailed.error
    } catch (err) {
      console.error('순서 변경 저장 실패:', err)
      alert('순서 변경을 저장하는 중 오류가 발생했습니다. 이전 순서로 되돌립니다.')
      setQuestions(previousQuestions) // 로컬 상태 롤백
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 font-medium animate-pulse">
        질문 데이터를 불러오는 중입니다...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans">
      {/* 상단 헤더 영역 */}
      <div>
        <Link
          href="/admin/templates"
          className="text-xs font-bold text-slate-400 hover:text-purple-900 flex items-center gap-1 mb-2 transition-colors"
        >
          ← 템플릿 목록으로 돌아가기
        </Link>
        <h1 className="text-2xl font-black text-purple-950">
          {template?.title || '템플릿 질문 상세'}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          질문 카드의 왼쪽 ☰ 손잡이를 드래그하여 진행 순서를 자유롭게 바꿀 수 있습니다.
        </p>
      </div>

      {/* 질문 추가 폼 */}
      <form
        onSubmit={handleAddQuestion}
        className="bg-white/95 backdrop-blur-md p-6 rounded-[20px] border border-purple-100/80 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.06)] space-y-4"
      >
        <h3 className="text-sm font-black text-slate-800">➕ 새 질문 추가하기</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            required
            placeholder="메인 질문 내용 (예: 이번 주의 감사했던 순간은?)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-[52px] px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white font-medium transition-all"
          />
          <input
            type="text"
            placeholder="보조 설명 (선택 사항 - 예: 사진과 함께 적어주세요)"
            value={newSubtitle}
            onChange={(e) => setNewSubtitle(e.target.value)}
            className="h-[52px] px-4 bg-slate-50/80 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white font-medium transition-all"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isAdding}
            className="px-6 h-[46px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-900/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isAdding ? '추가 중...' : '질문 등록'}
          </button>
        </div>
      </form>

      {/* 질문 리스트 (Drag & Drop Context) */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700">
          등록된 질문 목록 ({questions.length}개)
        </h3>

        {questions.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-purple-200/80 rounded-[20px] bg-white/80 text-slate-400 text-xs font-medium">
            아직 추가된 질문이 없습니다. 위에서 질문을 등록해 주세요!
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={questions.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2.5">
                {questions.map((question) => (
                  <SortableQuestionItem
                    key={question.id}
                    question={question}
                    onDelete={handleDeleteQuestion}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}