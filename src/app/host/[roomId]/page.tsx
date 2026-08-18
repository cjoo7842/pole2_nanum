'use client'

import { useEffect, useRef, useState, use } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import confetti from 'canvas-confetti'

// 타입 정의
interface Room {
  id: string
  room_code: string
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'
  template_id?: string | null
  current_question_id?: string | null
}

interface Question {
  id: string
  template_id?: string | null
  title: string
  subtitle?: string | null
  step_order: number
}

interface Post {
  id: string
  room_id: string
  question_id: string
  author_name: string | null
  content: string
  image_url?: string | null
  color?: string | null
  is_selected?: boolean
  created_at: string
}

export default function HostRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  // Next.js 15 App Router params Unwrapping
  const { roomId } = use(params)
  const supabase = createClient()

  // 상태 관리
  const [room, setRoom] = useState<Room | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null) // 지목/선택 팝업용
  const [isAllCompletedModal, setIsAllCompletedModal] = useState(false) // 모두 나눔 완료 여부 상태

  // realtime 콜백 안에서 최신 질문 id를 참조하기 위한 ref
  const currentQuestionIdRef = useRef<string | null>(null)

  // 폭죽 터트리기 함수
  const fireConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    })
  }

  // 특정 질문(questionId)에 해당하는 포스트잇만 불러와 posts state를 교체
  const loadPostsForQuestion = async (questionId: string | null) => {
    if (!questionId) {
      setPosts([])
      return
    }
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('room_id', roomId)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })

    setPosts(postsData || [])
  }

  // 질문 정보 + 그 질문에 해당하는 포스트잇을 함께 갱신
  const loadQuestionAndPosts = async (questionId: string | null) => {
    currentQuestionIdRef.current = questionId
    setIsAllCompletedModal(false) // 질문 변경 시 안내 상태 초기화

    if (!questionId) {
      setCurrentQuestion(null)
      setPosts([])
      return
    }

    const { data: questionData } = await supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .single()

    setCurrentQuestion(questionData || null)
    await loadPostsForQuestion(questionId)
  }

  // 1. 방 데이터 및 질문/포스트잇 초기 로드
  useEffect(() => {
    const fetchRoomData = async () => {
      try {
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single()

        if (roomError) throw roomError
        setRoom(roomData)

        await loadQuestionAndPosts(roomData.current_question_id ?? null)
      } catch (err) {
        console.error('데이터 로드 실패:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRoomData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // 2. Realtime 구독 (포스트잇 실시간 수신 및 방 상태 변경 감지)
  useEffect(() => {
    // 포스트잇 생성 구독
    const postsChannel = supabase
      .channel(`realtime-posts-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts', filter: `room_id=eq.${roomId}` },
        (payload: RealtimePostgresInsertPayload<Post>) => {
          const newPost = payload.new as Post
          if (newPost.question_id !== currentQuestionIdRef.current) return
          setPosts((prev) => [...prev, newPost])
        }
      )
      .subscribe()

    // 방 상태 변경 구독
    const roomChannel = supabase
      .channel(`realtime-room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        async (payload: RealtimePostgresUpdatePayload<Room>) => {
          const updatedRoom = payload.new as Room
          setRoom(updatedRoom)

          if (updatedRoom.current_question_id !== currentQuestionIdRef.current) {
            await loadQuestionAndPosts(updatedRoom.current_question_id ?? null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(postsChannel)
      supabase.removeChannel(roomChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // 3. 나눔 시작하기 클릭 처리
  const handleStartSharing = async () => {
    if (isStarting || !room) return
    setIsStarting(true)

    try {
      if (!room.template_id) {
        alert('이 방에 연결된 템플릿이 없습니다. 관리자 페이지에서 템플릿을 먼저 지정해주세요.')
        return
      }

      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('template_id', room.template_id)
        .order('step_order', { ascending: true })
        .limit(1)

      const firstQuestionId = questions?.[0]?.id
      if (!firstQuestionId) {
        alert('연결된 템플릿에 등록된 질문이 없습니다. 관리자 페이지에서 질문을 먼저 추가해주세요.')
        return
      }

      const { error } = await supabase
        .from('rooms')
        .update({
          status: 'IN_PROGRESS',
          current_question_id: firstQuestionId,
        })
        .eq('id', room.id)

      if (error) throw error
    } catch (err) {
      console.error('나눔 시작 실패:', err)
      alert('나눔을 시작하는 중 오류가 발생했습니다.')
    } finally {
      setIsStarting(false)
    }
  }

  // 4. 다음 질문으로 이동
  const handleGoToNextQuestion = async () => {
    if (!room || !currentQuestion || !room.template_id) return

    setSelectedPost(null)
    setIsAllCompletedModal(false)

    const { data: nextQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('template_id', room.template_id)
      .gt('step_order', currentQuestion.step_order)
      .order('step_order', { ascending: true })
      .limit(1)

    const nextQuestion = nextQuestions?.[0]

    if (!nextQuestion) {
      alert('모든 나눔 질문이 끝났습니다!')
      await supabase.from('rooms').update({ status: 'COMPLETED' }).eq('id', room.id)
      return
    }

    const { error } = await supabase
      .from('rooms')
      .update({ current_question_id: nextQuestion.id })
      .eq('id', room.id)

    if (error) {
      console.error('다음 질문 이동 실패:', error)
      alert('다음 질문으로 넘어가는 중 오류가 발생했습니다.')
    }
  }

  // 5. [랜덤 뽑기] 비복원 추출 (다음 사람 지목 공통 처리) + 폭죽 추가
  const handleRandomPick = async () => {
    const unselected = posts.filter((p) => !p.is_selected)

    if (unselected.length === 0) {
      if (posts.length === 0) {
        alert('아직 제출된 포스트잇이 없습니다!')
      } else {
        // 모든 사람이 지목 완료되었을 때 안내 상태 활성화
        setIsAllCompletedModal(true)
      }
      return
    }

    setIsAllCompletedModal(false)
    const randomIndex = Math.floor(Math.random() * unselected.length)
    const picked = unselected[randomIndex]

    setSelectedPost(picked)
    setPosts((prev) => prev.map((p) => (p.id === picked.id ? { ...p, is_selected: true } : p)))

    // 지목될 때 폭죽 발사!
    fireConfetti()

    const { error } = await supabase.from('posts').update({ is_selected: true }).eq('id', picked.id)
    if (error) {
      console.error('지목 상태 저장 실패:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-violet-50/40 flex items-center justify-center">
        <div className="text-purple-900 font-bold text-lg animate-pulse">
          나눔 방 정보를 불러오는 중...
        </div>
      </div>
    )
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${room?.room_code}` : ''
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(joinUrl)}`

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Gamja+Flower&display=swap"
        rel="stylesheet"
      />

      <main className="min-h-screen bg-violet-50/30 text-slate-800 p-6 sm:p-10 lg:p-16 flex flex-col justify-center relative overflow-hidden">
        {/* ==================== [대기 화면: STATUS === 'WAITING'] ==================== */}
        {room?.status === 'WAITING' ? (
          <div className="max-w-6xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* 1. [좌측 영역] QR 코드 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.3 }}
              className="flex flex-col items-center justify-center space-y-4 p-4"
            >
              <div className="p-4 bg-purple-100/60 rounded-3xl border border-purple-200/60 shadow-sm backdrop-blur-sm">
                <img
                  src={qrApiUrl}
                  alt="모임 접속 QR 코드"
                  className="w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 object-contain rounded-2xl"
                />
              </div>
              <p className="text-xs sm:text-sm text-slate-400 font-medium font-mono break-all text-center max-w-sm">
                {joinUrl}
              </p>
            </motion.div>

            {/* 2. [우측 영역] 카드 */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: 'spring', bounce: 0.35 }}
              className="bg-white/90 backdrop-blur-md p-8 sm:p-10 rounded-[2.5rem] border border-purple-100 shadow-2xl shadow-purple-100/80 flex flex-col items-center text-center justify-between space-y-8"
            >
              <div className="flex flex-col items-center space-y-2 w-full">
                <span className="text-sm sm:text-base uppercase tracking-wider text-purple-900 bg-purple-100 px-4 py-1.5 rounded-full border border-purple-200/80 [font-family:'Gamja_Flower',sans-serif]">
                  모임 참여 코드
                </span>
                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-purple-900 font-mono tracking-wider drop-shadow-sm text-center">
                  {room?.room_code}
                </h1>
              </div>

              <div className="border-t border-dashed border-purple-100 my-2 w-full" />

              <div className="flex flex-col items-center space-y-5 w-full">
                <p className="text-sm sm:text-base font-semibold text-slate-600 text-center whitespace-nowrap">
                  모든 구성원이 접속했다면 나눔을 시작해보세요!
                </p>

                <motion.button
                  onClick={handleStartSharing}
                  disabled={isStarting}
                  whileHover={{ scale: 1.02, backgroundColor: '#3B0764' }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-5 bg-purple-900 text-white font-bold rounded-2xl shadow-xl shadow-purple-900/20 transition-all flex items-center justify-center gap-3 cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  <span className="text-2xl sm:text-3xl [font-family:'Gamja_Flower',sans-serif]">
                    {isStarting ? '나눔 준비 중...' : '🚀 나눔 시작하기'}
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        ) : (
          /* ==================== [진행 화면: STATUS === 'IN_PROGRESS' / 'COMPLETED'] ==================== */
          <div className="max-w-7xl w-full mx-auto flex flex-col space-y-8 pt-24 pb-12">
            {/* 질문 박스 상단 고정 */}
            <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md px-6 py-4 border-b border-purple-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold bg-purple-100 text-purple-900 px-2.5 py-1 rounded-md">
                      코드: {room?.room_code}
                    </span>
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      실시간 진행 중
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">
                    {currentQuestion?.title || '질문을 불러오는 중입니다...'}
                  </h2>
                  {currentQuestion?.subtitle && (
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                      {currentQuestion.subtitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* 랜덤 지목 버튼 */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRandomPick}
                    className="px-6 py-3 bg-purple-900 hover:bg-purple-950 text-white font-bold rounded-2xl shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span className="text-xl sm:text-2xl [font-family:'Gamja_Flower',sans-serif]">
                      🎲 랜덤 지목
                    </span>
                  </motion.button>
                </div>
              </div>
            </header>

            {/* 포스트잇 카드 목록 */}
            <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 items-start">
              <AnimatePresence>
                {posts.map((post, idx) => {
                  const bgColors = [
                    'bg-amber-100/90 border-amber-200 text-amber-950',
                    'bg-rose-100/90 border-rose-200 text-rose-950',
                    'bg-sky-100/90 border-sky-200 text-sky-950',
                    'bg-emerald-100/90 border-emerald-200 text-emerald-950',
                    'bg-purple-100/90 border-purple-200 text-purple-950',
                  ]
                  const colorClass = bgColors[idx % bgColors.length]
                  const rotateDeg = (idx % 2 === 0 ? 1 : -1) * ((idx % 3) + 1)

                  return (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, rotate: rotateDeg }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', bounce: 0.3 }}
                      className={`p-6 rounded-2xl border shadow-sm flex flex-col justify-between space-y-5 h-auto cursor-pointer hover:shadow-md transition-shadow ${colorClass} ${
                        post.is_selected ? 'opacity-40' : 'opacity-100'
                      }`}
                      onClick={() => {
                        setSelectedPost(post)
                        setIsAllCompletedModal(false)
                        fireConfetti() // 카드를 직접 클릭해 띄울 때도 폭죽 발사!
                      }}
                    >
                      <div className="flex-1 flex items-center justify-center py-2">
                        <p className="text-lg sm:text-xl font-bold leading-relaxed whitespace-pre-wrap text-center break-words w-full">
                          {post.content}
                        </p>
                      </div>

                      {post.image_url && (
                        <div className="w-full">
                          <img
                            src={post.image_url}
                            alt="첨부 사진"
                            className="w-full h-auto max-h-80 object-contain rounded-xl border border-black/5 bg-black/5"
                          />
                        </div>
                      )}

                      <div className="flex justify-between items-center text-xs font-bold opacity-75 pt-3 border-t border-black/5">
                        <span>{post.author_name || '익명'}</span>
                        <span>{new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </section>

            {posts.length === 0 && (
              <div className="text-center py-28 text-slate-400 font-medium">
                아직 제출된 포스트잇이 없습니다. 모바일에서 작성해보세요!
              </div>
            )}
          </div>
        )}

        {/* ==================== [지목 팝업 모달] ==================== */}
        <AnimatePresence>
          {selectedPost && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => {
                setSelectedPost(null)
                setIsAllCompletedModal(false)
              }}
            >
              <motion.div
                initial={{ scale: 0.7, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.7, y: 30 }}
                transition={{ type: 'spring', bounce: 0.3 }}
                className="bg-purple-50 border-2 border-purple-200 p-8 rounded-3xl shadow-2xl max-w-lg w-full text-slate-900 space-y-6 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase bg-purple-200 text-purple-900 px-3 py-1 rounded-full [font-family:'Gamja_Flower',sans-serif] text-sm">
                    🎉 지목된 포스트잇
                  </span>
                  <button
                    onClick={() => {
                      setSelectedPost(null)
                      setIsAllCompletedModal(false)
                    }}
                    className="text-slate-400 hover:text-slate-700 font-bold text-xl cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-2xl sm:text-3xl font-bold leading-relaxed whitespace-pre-wrap text-center break-words">
                  {selectedPost.content}
                </p>

                {selectedPost.image_url && (
                  <img
                    src={selectedPost.image_url}
                    alt="첨부 이미지"
                    className="w-full h-auto max-h-80 object-contain rounded-2xl border border-purple-100"
                  />
                )}

                <div className="text-right font-bold text-purple-950 text-base">
                  — {selectedPost.author_name || '익명'}
                </div>

                {/* 하단 제어 영역 */}
                <div className="pt-4 border-t border-purple-200/60 flex flex-col space-y-3 items-center">
                  {isAllCompletedModal ? (
                    /* 모든 사람 나눔 완료 시 안내 및 '넹❤️' 버튼 */
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full p-4 bg-pink-100/90 border border-pink-200 rounded-2xl flex flex-col items-center space-y-3 text-center"
                    >
                      <p className="text-base font-bold text-pink-950 [font-family:'Gamja_Flower',sans-serif] text-xl break-keep">
                        모든 사람이 나누었습니다!{'\n'}다음 질문으로 넘어가시겠습니까?
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleGoToNextQuestion}
                        className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-black rounded-xl shadow-md text-xl cursor-pointer [font-family:'Gamja_Flower',sans-serif]"
                      >
                        넹❤️
                      </motion.button>
                    </motion.div>
                  ) : (
                    /* 다음 사람 지목 버튼 */
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleRandomPick}
                      className="w-full py-3.5 bg-purple-900 hover:bg-purple-950 text-white font-bold rounded-2xl shadow-md transition-all text-lg flex items-center justify-center gap-2 cursor-pointer [font-family:'Gamja_Flower',sans-serif]"
                    >
                      <span>🎲 다음 사람 지목 →</span>
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  )
}