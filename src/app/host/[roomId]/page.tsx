'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { createClient } from '@/lib/supabase/client'
import { Room, Question, Post } from '@/types/database'
import { PostItCard } from '@/components/PostItCard'
import { PostItModal } from '@/components/PostItModal'

export default function HostMainPage() {
  const params = useParams()
  const roomId = params?.roomId as string
  const supabase = createClient()

  const [room, setRoom] = useState<Room | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  // 모달 상태 관리
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [showNextQuestionModal, setShowNextQuestionModal] = useState<boolean>(false)

  // [추가] 지목 처리 중 버튼 연타로 인한 race condition 방지용 플래그
  const [isPicking, setIsPicking] = useState<boolean>(false)

  // 1. 초기 데이터 (방, 질문, 포스트잇) 조회
  const fetchRoomAndData = async () => {
    if (!roomId) return

    // 방 조회
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()

    // [추가] 방 조회 실패 시 무한 로딩 대신 에러 상태 노출
    if (roomError) {
      console.error('방 조회 오류:', roomError)
      setFetchError('모임 정보를 불러오는 중 오류가 발생했습니다.')
      return
    }

    if (roomData) {
      setFetchError(null)
      setRoom(roomData)

      // 현재 질문 조회
      if (roomData.current_question_id) {
        const { data: questionData } = await supabase
          .from('questions')
          .select('*')
          .eq('id', roomData.current_question_id)
          .maybeSingle()

        setQuestion(questionData)

        // 질문에 해당하는 포스트잇 목록 조회
        const { data: postsData } = await supabase
          .from('posts')
          .select('*')
          .eq('room_id', roomData.id)
          .eq('question_id', roomData.current_question_id)
          .order('created_at', { ascending: true })

        if (postsData) {
          setPosts(postsData)
        }
      } else {
        // 질문이 아직 지정되지 않은 방 (템플릿 없이 생성된 경우 등)
        setQuestion(null)
        setPosts([])
      }
    } else {
      setFetchError('존재하지 않는 방입니다.')
    }
  }

  // 2. 초기 로드 및 포스트잇 Realtime 동기화
  useEffect(() => {
    fetchRoomAndData()

    // Realtime 구독 (참가자가 포스트잇을 제출/수정/삭제 시 실시간 감지)
    const channel = supabase
      .channel(`host-posts-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // 실시간 변경 발생 시 포스트잇 목록 다시 불러오기
          fetchRoomAndData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // 3. 비복원 무작위 포스트잇 지목
  // [수정] PostItModal의 onNext에도 그대로 재사용됨:
  //  - 모달이 열려있는 상태에서 호출되면 → 남은 포스트잇 중 다음 1개를 뽑아 모달 내용을 교체
  //  - 남은 포스트잇이 0개면 → 모달을 닫고 완료 안내 모달 오픈
  const handlePickRandomPost = async () => {
    if (isPicking) return // 연타 방지

    const unselectedPosts = posts.filter((p) => !p.is_selected)

    // 미지목 인원이 없으면 폭죽 및 다음 질문 안내
    if (unselectedPosts.length === 0) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
      setIsModalOpen(false)
      setShowNextQuestionModal(true)
      return
    }

    setIsPicking(true)

    const randomIndex = Math.floor(Math.random() * unselectedPosts.length)
    const picked = unselectedPosts[randomIndex]

    // DB에 is_selected = true 상태 비동기 업데이트
    const { error } = await supabase
      .from('posts')
      .update({ is_selected: true })
      .eq('id', picked.id)

    if (error) {
      console.error('지목 상태 업데이트 실패:', error)
      alert('랜덤 지목 처리 중 오류가 발생했습니다. 다시 시도해 주세요.')
      setIsPicking(false)
      return
    }

    // 성공 시 로컬 UI 업데이트 및 확대 팝업 오픈/교체
    setSelectedPost(picked)
    setIsModalOpen(true)
    setPosts((prev) =>
      prev.map((p) => (p.id === picked.id ? { ...p, is_selected: true } : p))
    )
    setIsPicking(false)
  }

  // 4. 다음 질문으로 이동 (template_id null 예외 및 COMPLETED 전이 로직 반영)
  const handleGoToNextQuestion = async () => {
    if (!room || !question) return

    // template_id 유무에 따른 동적 쿼리
    let query = supabase
      .from('questions')
      .select('*')
      .gt('step_order', question.step_order)

    if (room.template_id) {
      query = query.eq('template_id', room.template_id)
    }

    const { data: nextQuestions, error } = await query
      .order('step_order', { ascending: true })
      .limit(1)

    if (error) {
      console.error('다음 질문 조회 오류:', error)
      alert('다음 질문을 불러오는 중 오류가 발생했습니다.')
      return
    }

    if (nextQuestions && nextQuestions.length > 0) {
      const nextQ = nextQuestions[0]

      // Room의 current_question_id 업데이트
      await supabase
        .from('rooms')
        .update({ current_question_id: nextQ.id })
        .eq('id', room.id)

      setQuestion(nextQ)
      setShowNextQuestionModal(false)
      setPosts([])
    } else {
      // 다음 질문이 더 이상 없을 경우 방 상태를 COMPLETED로 변경
      await supabase
        .from('rooms')
        .update({ status: 'COMPLETED' })
        .eq('id', room.id)

      setRoom((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null))
      alert('모든 나눔 질문이 끝났습니다! 모임이 종료되었습니다 🎉')
      setShowNextQuestionModal(false)
    }
  }

  if (fetchError) {
    return (
      <main className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-center gap-2">
        <p className="text-slate-700 font-bold">{fetchError}</p>
        <button
          onClick={fetchRoomAndData}
          className="mt-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold"
        >
          다시 시도
        </button>
      </main>
    )
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-amber-50 flex items-center justify-center p-6 text-slate-600">
        <p className="animate-pulse">모임 진행 화면을 불러오는 중입니다...</p>
      </main>
    )
  }

  // [수정] 그리드에는 아직 지목되지 않은 포스트잇만 노출
  // (지목된 카드는 PostItCard 자체에서도 방어적으로 투명화되지만,
  //  AnimatePresence + filter로 실제 DOM에서도 완전히 제거되도록 함)
  const visiblePosts = posts.filter((p) => !p.is_selected)
  const selectedCount = posts.filter((p) => p.is_selected).length

  return (
    <main className="min-h-screen bg-amber-50/40 p-6 flex flex-col text-slate-800">
      {/* 상단 헤더 영역 */}
      <header className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-amber-200/80 gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
              방 코드: {room.room_code}
            </span>
            {room.status === 'COMPLETED' && (
              <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                모임 종료됨
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-amber-950 mt-1">
            {question?.title || '질문을 불러오는 중입니다...'}
          </h1>
          {question?.subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{question.subtitle}</p>
          )}
        </div>

        {/* 액션 버튼 그룹 */}
        {/* [수정] 명세서 4단계는 "모든 포스트잇 지목 완료 시 자동으로 안내 모달 출현"만 규정함.
            기존엔 진행자가 아무 때나 누를 수 있는 별도의 "다음 질문으로 ➔" 수동 버튼이 있어
            지목이 끝나지 않은 상태에서도 질문을 넘겨버릴 수 있는 스펙 밖 동작이었음.
            → 자동 트리거([나눔 시작]/[다음 사람 지목] 진행 중 자연스럽게 뜨는 안내 모달)만 남기고
              수동 버튼은 제거. (필요하다면 진행자용 "강제 건너뛰기"는 별도 확인 절차를 거쳐
              명세서에 새 항목으로 추가하는 걸 권장.) */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePickRandomPost}
            disabled={posts.length === 0 || room.status === 'COMPLETED' || isPicking}
            className="py-3 px-6 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-2xl shadow-md transition-all disabled:opacity-40 text-base"
          >
            🎲 나눔 시작
          </button>
        </div>
      </header>

      {/* 실시간 제출된 포스트잇 그리드 영역 */}
      <section className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-600">
            실시간 나눔 카드 ({posts.length}개 제출됨)
          </h2>
          <span className="text-xs text-slate-400">
            지목 완료: {selectedCount} / {posts.length}
          </span>
        </div>

        {posts.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-amber-200 rounded-3xl text-center space-y-2">
            <div className="text-4xl animate-bounce">📝</div>
            <p className="text-sm font-bold text-amber-900">
              참가자들의 나눔 포스트잇을 기다리고 있습니다
            </p>
            <p className="text-xs text-slate-400">
              모바일로 접속하여 첫 번째 나눔을 제출해 보세요!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {/* [수정] AnimatePresence + filter로 지목된 카드는 그리드에서 완전히 제거됨 */}
            <AnimatePresence>
              {visiblePosts.map((post, idx) => (
                <PostItCard
                  key={post.id}
                  post={post}
                  index={idx}
                  onClick={() => {
                    setSelectedPost(post)
                    setIsModalOpen(true)
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* 지목된 포스트잇 확대 팝업 모달 */}
      {/* [수정] onNext를 handlePickRandomPost에 연결 → 팝업 안에서 바로 다음 사람 연속 지목 가능
          (남은 포스트잇 0개가 되는 순간, handlePickRandomPost 내부에서 자동으로
           완료 안내 모달로 전환됨) */}
      <AnimatePresence>
        {isModalOpen && (
          <PostItModal
            isOpen={isModalOpen}
            post={selectedPost}
            onClose={() => setIsModalOpen(false)}
            onNext={handlePickRandomPost}
          />
        )}
      </AnimatePresence>

      {/* 다음 질문 전환 확인 모달 */}
      {/* [수정] 명세서 원문 그대로 문구/버튼명 일치시킴:
          "모든 사람이 나눔을 완료했습니다! 다음 질문으로 넘어가시겠습니까?" / [넹❤️] */}
      {showNextQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="text-4xl">🎉</div>
            <h3 className="text-lg font-bold text-slate-800">
              모든 사람이 나눔을 완료했습니다!
              <br />
              다음 질문으로 넘어가시겠습니까?
            </h3>
            <div className="pt-2">
              <button
                onClick={handleGoToNextQuestion}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-base"
              >
                넹❤️
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
