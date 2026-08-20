'use client'

import { useEffect, useRef, useState, use } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresDeletePayload,
} from '@supabase/supabase-js'
import confetti from 'canvas-confetti'
import { isValidImageUrl, getPostImageUrl } from '@/lib/image'

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
  const [participantCount, setParticipantCount] = useState<number>(0)
  const [isAllSubmittedBannerDismissed, setIsAllSubmittedBannerDismissed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null) // 지목/선택 팝업용
  const [presentingPost, setPresentingPost] = useState<Post | null>(null) // 현재 발표 진행 중인 포스트잇 (모달 닫혀도 Floating 바 유지용)
  const [isPickingAnimation, setIsPickingAnimation] = useState(false) // 3초 슬롯머신 긴장감 애니메이션 활성화 여부
  const [targetPostForAnimation, setTargetPostForAnimation] = useState<Post | null>(null) // 애니메이션 최종 당첨 포스트잇
  const [slotDisplayPost, setSlotDisplayPost] = useState<Post | null>(null) // 슬롯머신 롤링 시 화면에 표시되는 포스트잇
  const [countdownStep, setCountdownStep] = useState<number>(3) // 3, 2, 1, 0(당첨)
  const [isAllCompletedModal, setIsAllCompletedModal] = useState(false) // 모두 나눔 완료 여부 상태

  // realtime 콜백 안에서 최신 질문 id를 참조하기 위한 ref
  const currentQuestionIdRef = useRef<string | null>(null)
  // 비복원 추출을 위한 지목된 포스트잇 ID Set (중복 지목 방지 안전장치)
  const pickedPostIdsRef = useRef<Set<string>>(new Set())

  // 폭죽 터트리기 함수
  const fireConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    })
  }

  // 지목 시 3초 슬롯머신 긴장감 연출 useEffect
  useEffect(() => {
    if (!isPickingAnimation || !targetPostForAnimation) return

    const availablePosts = posts.length > 0 ? posts : [targetPostForAnimation]
    let intervalTimer: NodeJS.Timeout | null = null
    let countdownTimer1: NodeJS.Timeout | null = null
    let countdownTimer2: NodeJS.Timeout | null = null
    let lockTimer: NodeJS.Timeout | null = null
    let finishTimer: NodeJS.Timeout | null = null

    setCountdownStep(3)
    setSlotDisplayPost(availablePosts[Math.floor(Math.random() * availablePosts.length)])

    let intervalMs = 70
    let isRunning = true

    const cycle = () => {
      if (!isRunning) return
      const randomPost = availablePosts[Math.floor(Math.random() * availablePosts.length)]
      setSlotDisplayPost(randomPost)
      intervalTimer = setTimeout(cycle, intervalMs)
    }
    intervalTimer = setTimeout(cycle, intervalMs)

    // 0.8초 후: 2단계 (2)
    countdownTimer1 = setTimeout(() => {
      setCountdownStep(2)
      intervalMs = 110
    }, 800)

    // 1.6초 후: 3단계 (1)
    countdownTimer2 = setTimeout(() => {
      setCountdownStep(1)
      intervalMs = 160
    }, 1600)

    // 2.3초 후: 당첨 고정 및 폭죽 발사!
    lockTimer = setTimeout(() => {
      isRunning = false
      if (intervalTimer) clearTimeout(intervalTimer)
      setCountdownStep(0)
      setSlotDisplayPost(targetPostForAnimation)
      fireConfetti()
    }, 2300)

    // 3.0초 후: 애니메이션 종료 및 메인 발표 모달 오픈 + DB 업데이트
    finishTimer = setTimeout(async () => {
      const finalPost = { ...targetPostForAnimation, is_selected: true }
      pickedPostIdsRef.current.add(finalPost.id)

      setPosts((prev) =>
        prev.map((p) => (p.id === finalPost.id ? { ...p, is_selected: true } : p))
      )
      setSelectedPost(finalPost)
      setPresentingPost(finalPost)
      setIsPickingAnimation(false)
      setTargetPostForAnimation(null)

      await supabase.from('posts').update({ is_selected: true }).eq('id', finalPost.id)
    }, 3000)

    return () => {
      isRunning = false
      if (intervalTimer) clearTimeout(intervalTimer)
      if (countdownTimer1) clearTimeout(countdownTimer1)
      if (countdownTimer2) clearTimeout(countdownTimer2)
      if (lockTimer) clearTimeout(lockTimer)
      if (finishTimer) clearTimeout(finishTimer)
    }
  }, [isPickingAnimation, targetPostForAnimation, posts, supabase])

  // 특정 질문(questionId)에 해당하는 포스트잇만 불러와 posts state를 교체
  const loadPostsForQuestion = async (questionId: string | null) => {
    if (!questionId) {
      setPosts([])
      pickedPostIdsRef.current.clear()
      return
    }
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('room_id', roomId)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })

    if (postsData) {
      postsData.forEach((p: Post) => {
        if (p.is_selected) {
          pickedPostIdsRef.current.add(p.id)
        }
      })
      setPosts(postsData)
    } else {
      setPosts([])
    }
  }

  // 질문 정보 + 그 질문에 해당하는 포스트잇을 함께 갱신
  const loadQuestionAndPosts = async (questionId: string | null) => {
    currentQuestionIdRef.current = questionId
    setIsAllCompletedModal(false) // 질문 변경 시 안내 상태 초기화
    setIsAllSubmittedBannerDismissed(false) // 전원 제출 배너 상태 초기화
    pickedPostIdsRef.current.clear()

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

  // 1. 방 데이터 및 질문/포스트잇 초기 로드 + Presence 접속자 수 구독
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

    // 1-2. Realtime Presence 참여자 실시간 집계
    const presenceChannel = supabase.channel(`presence-room-${roomId}`)
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const count = Object.keys(state).length
        setParticipantCount(count)
        console.log('[Presence Host] 실시간 참여자 수:', count)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(presenceChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // 2. Realtime 구독 (포스트잇 실시간 생성/수신/수정 및 방 상태 변경 감지) + 이중 안전장치
  useEffect(() => {
    let isMounted = true
    let postsChannel: ReturnType<typeof supabase.channel> | null = null
    let roomChannel: ReturnType<typeof supabase.channel> | null = null
    let postsRetryTimer: NodeJS.Timeout | null = null
    let roomRetryTimer: NodeJS.Timeout | null = null

    // 2-1. 포스트잇 변경사항 실시간 구독
    const setupPostsChannel = () => {
      if (!isMounted) return
      if (postsChannel) supabase.removeChannel(postsChannel)

      const channelName = `realtime-posts-${roomId}-${Date.now()}`
      postsChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'posts', filter: `room_id=eq.${roomId}` },
          (payload: RealtimePostgresInsertPayload<Post>) => {
            const newPost = payload.new as Post
            if (newPost.question_id !== currentQuestionIdRef.current) return
            setPosts((prev) => {
              if (prev.some((p) => p.id === newPost.id)) return prev
              return [...prev, newPost]
            })
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'posts', filter: `room_id=eq.${roomId}` },
          (payload: RealtimePostgresUpdatePayload<Post>) => {
            const updatedPost = payload.new as Post
            if (updatedPost.question_id !== currentQuestionIdRef.current) return

            setPosts((prev) =>
              prev.map((post) => (post.id === updatedPost.id ? updatedPost : post))
            )

            setSelectedPost((prevSelected) =>
              prevSelected && prevSelected.id === updatedPost.id ? updatedPost : prevSelected
            )
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'posts', filter: `room_id=eq.${roomId}` },
          (payload: RealtimePostgresDeletePayload<Post>) => {
            const deletedId = (payload.old as { id?: string })?.id
            if (deletedId) {
              setPosts((prev) => prev.filter((p) => p.id !== deletedId))
              setSelectedPost((prev) => (prev && prev.id === deletedId ? null : prev))
            }
          }
        )
        .subscribe((status: string, err?: Error | null) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Realtime Host Posts] 구독 성공 (${channelName})`)
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[Realtime Host Posts] 채널 상태 [${status}], error:`, err)
            if (isMounted) {
              if (postsRetryTimer) clearTimeout(postsRetryTimer)
              postsRetryTimer = setTimeout(() => {
                console.log('[Realtime Host Posts] 채널 재구독 시도...')
                setupPostsChannel()
              }, 2000)
            }
          }
        })
    }

    // 2-2. 방 상태 변경 실시간 구독
    const setupRoomChannel = () => {
      if (!isMounted) return
      if (roomChannel) supabase.removeChannel(roomChannel)

      const channelName = `realtime-room-${roomId}-${Date.now()}`
      roomChannel = supabase
        .channel(channelName)
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
        .subscribe((status: string, err?: Error | null) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Realtime Host Room] 구독 성공 (${channelName})`)
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[Realtime Host Room] 채널 상태 [${status}], error:`, err)
            if (isMounted) {
              if (roomRetryTimer) clearTimeout(roomRetryTimer)
              roomRetryTimer = setTimeout(() => {
                console.log('[Realtime Host Room] 채널 재구독 시도...')
                setupRoomChannel()
              }, 2000)
            }
          }
        })
    }

    setupPostsChannel()
    setupRoomChannel()

    // 안전장치 1: 탭/창 재활성화 시 포스트잇 및 방 상태 재검증
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && currentQuestionIdRef.current) {
        console.log('[Sync Host] 탭 활성화 감지 -> 포스트잇 최신화')
        loadPostsForQuestion(currentQuestionIdRef.current)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    // 안전장치 2: 5초 간격 간이 Polling으로 대규모 동시 제출 누락 완전 방지
    const pollingInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && currentQuestionIdRef.current) {
        loadPostsForQuestion(currentQuestionIdRef.current)
      }
    }, 5000)

    return () => {
      isMounted = false
      if (postsRetryTimer) clearTimeout(postsRetryTimer)
      if (roomRetryTimer) clearTimeout(roomRetryTimer)
      clearInterval(pollingInterval)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      if (postsChannel) supabase.removeChannel(postsChannel)
      if (roomChannel) supabase.removeChannel(roomChannel)
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
    setPresentingPost(null)
    setIsPickingAnimation(false)
    setTargetPostForAnimation(null)
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

  // 5. 포스트잇 카드 클릭 처리 (3초 슬롯머신 긴장감 연출 트리거)
  const handleCardClick = (post: Post) => {
    if (isPickingAnimation) return

    // 이미 발표 완료/지목된 카드를 다시 열어보는 경우 바로 모달 오픈
    if (post.is_selected && pickedPostIdsRef.current.has(post.id)) {
      setSelectedPost(post)
      setPresentingPost(post)
      setIsAllCompletedModal(false)
      return
    }

    // 신규 지목인 경우: 3초 슬롯머신 긴장감 연출 시작!
    setIsAllSubmittedBannerDismissed(true)
    setIsAllCompletedModal(false)
    setTargetPostForAnimation(post)
    setIsPickingAnimation(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-violet-50/40 flex items-center justify-center font-sans">
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
        href="https://fonts.googleapis.com/css2?family=Gamja+Flower&family=Noto+Serif+KR:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <main className="min-h-screen bg-slate-50/70 text-slate-800 p-6 sm:p-10 lg:p-16 flex flex-col justify-center relative overflow-hidden font-sans">
        {/* soft background light blurs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-pink-100/40 rounded-full blur-3xl pointer-events-none" />

        {/* ==================== [대기 화면: STATUS === 'WAITING'] ==================== */}
        {room?.status === 'WAITING' ? (
          <div className="max-w-5xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center relative z-10">
            {/* 1. [좌측 영역] QR 코드 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.3 }}
              className="flex flex-col items-center justify-center space-y-4 p-4"
            >
              <div className="p-5 bg-white/90 backdrop-blur-md rounded-[20px] border border-purple-100 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrApiUrl}
                  alt="모임 접속 QR 코드"
                  className="w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80 object-contain rounded-xl"
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
              className="bg-white/95 backdrop-blur-md p-8 sm:p-10 rounded-[20px] border border-purple-100/70 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.08)] flex flex-col items-center text-center justify-between space-y-7"
            >
              <div className="flex flex-col items-center space-y-3 w-full">
                <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm uppercase tracking-wider text-purple-900 bg-purple-100 px-4 py-1.5 rounded-full border border-purple-200/80 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                  모임 참여 코드
                </span>
                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-purple-900 font-mono tracking-wider drop-shadow-sm text-center">
                  {room?.room_code}
                </h1>

                {/* 실시간 참여자 수 표시 귀여운 패치 (요구사항 1) */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1, y: [0, -3, 0] }}
                  transition={{
                    y: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' },
                    scale: { duration: 0.3 },
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-950 font-bold text-xs sm:text-sm border border-amber-200 shadow-xs"
                >
                  <span className="text-base">🐥</span>
                  <span>
                    현재 <strong className="text-purple-900 font-extrabold text-sm sm:text-base">{participantCount}</strong>명이 입장했어요!
                  </span>
                </motion.div>
              </div>

              <div className="border-t border-dashed border-purple-100 my-1 w-full" />

              <div className="flex flex-col items-center space-y-5 w-full">
                <p className="text-sm sm:text-base font-semibold text-slate-600 text-center whitespace-nowrap">
                  모든 구성원이 접속했다면 나눔을 시작해보세요!
                </p>

                <motion.button
                  onClick={handleStartSharing}
                  disabled={isStarting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', bounce: 0.3 }}
                  className="w-full h-[56px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:bg-slate-300 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-lg"
                >
                  <span>🚀</span>
                  <span>{isStarting ? '나눔 준비 중...' : '나눔 시작하기'}</span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        ) : (
          /* ==================== [진행 화면: STATUS === 'IN_PROGRESS' / 'COMPLETED'] ==================== */
          <div className="max-w-7xl w-full mx-auto flex flex-col space-y-8 pt-24 pb-12 relative z-10">
            {/* 질문 박스 상단 고정 */}
            <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md px-6 py-4 border-b border-purple-100/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-full border border-purple-200/80">
                      코드: {room?.room_code}
                    </span>
                    <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      실시간 진행 중
                    </span>
                    {/* 실시간 제출 현황 카운터 */}
                    <span className="text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <span>💌</span>
                      <span>제출: <strong>{posts.length}</strong> / {participantCount > 0 ? participantCount : '?'}명</span>
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
                  {/* 다음 질문으로 넘어가기 버튼 (요구사항 2) */}
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleGoToNextQuestion}
                    className="h-[46px] px-5 bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 transition-all flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <span>▶️</span>
                    <span>다음 질문으로 넘어가기</span>
                  </motion.button>
                </div>
              </div>
            </header>

            {/* ==================== [전원 제출 완료 알림 배너 모달] ==================== */}
            <AnimatePresence>
              {room?.status === 'IN_PROGRESS' &&
                participantCount > 0 &&
                posts.length >= participantCount &&
                !selectedPost &&
                !isAllSubmittedBannerDismissed &&
                !isAllCompletedModal && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="fixed top-24 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%] bg-gradient-to-r from-purple-900 via-purple-950 to-indigo-950 text-white p-5 rounded-[22px] shadow-2xl border border-purple-300/30 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md"
                  >
                    <div className="flex items-center gap-3 text-center sm:text-left">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl shrink-0">
                        🎉
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base sm:text-lg">
                          모든 사람이 제출을 완료했습니다!
                        </h3>
                        <p className="text-xs text-purple-200 mt-0.5">
                          접속자 <strong className="text-amber-300 font-bold">{participantCount}명</strong> 모두 나눔을 작성했어요. 포스트잇을 클릭해 나눔을 시작해보세요!
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsAllSubmittedBannerDismissed(true)}
                        className="flex-1 sm:flex-none px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-purple-950 font-black rounded-xl text-sm shadow-md transition-all cursor-pointer whitespace-nowrap"
                      >
                        포스트잇 선택하기 👇
                      </motion.button>
                      <button
                        onClick={() => setIsAllSubmittedBannerDismissed(true)}
                        className="text-white/60 hover:text-white text-xs p-2 rounded-lg cursor-pointer"
                        title="닫기"
                      >
                        ✕
                      </button>
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* 포스트잇 카드 목록 */}
            <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 items-start">
              <AnimatePresence>
                {posts.map((post, idx) => {
                  const bgColors = [
                    'bg-white/95 border-purple-100 text-slate-800',
                    'bg-purple-50/90 border-purple-200/80 text-purple-950',
                    'bg-pink-50/90 border-pink-200/80 text-pink-950',
                    'bg-amber-50/90 border-amber-200/80 text-amber-950',
                    'bg-sky-50/90 border-sky-200/80 text-sky-950',
                  ]
                  const colorClass = bgColors[idx % bgColors.length]
                  const rotateDeg = (idx % 2 === 0 ? 1 : -1) * ((idx % 3) + 0.5)

                  return (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, rotate: rotateDeg }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', bounce: 0.3 }}
                      className={`p-6 rounded-[16px] border shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_16px_rgba(88,28,135,0.04)] flex flex-col justify-between space-y-5 h-auto cursor-pointer hover:shadow-lg transition-all ${colorClass} ${
                        post.is_selected ? 'opacity-40' : 'opacity-100'
                      }`}
                      onClick={() => handleCardClick(post)}
                    >
                      <div className="flex-1 flex items-center justify-center py-2">
                        <p className="text-base sm:text-lg font-bold leading-relaxed whitespace-pre-wrap text-center break-words w-full">
                          {post.content}
                        </p>
                      </div>

                      {post.image_url && isValidImageUrl(getPostImageUrl(post.image_url)) && (
                        <div className="w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getPostImageUrl(post.image_url)!}
                            alt="첨부 사진"
                            className="w-full h-auto max-h-80 object-contain rounded-xl border border-black/5 bg-black/5"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none'
                            }}
                          />
                        </div>
                      )}

                      <div className="flex justify-between items-center text-xs font-bold opacity-75 pt-3 border-t border-black/5">
                        <span className="font-bold">{post.author_name || '익명'}</span>
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

        {/* ==================== [지목 긴장감 연출: 3초 슬롯머신 / 카운트다운 모달] (요구사항 4) ==================== */}
        <AnimatePresence>
          {isPickingAnimation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.8, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 30 }}
                transition={{ type: 'spring', bounce: 0.3 }}
                className="relative max-w-lg w-full bg-gradient-to-b from-purple-950 via-slate-900 to-indigo-950 border-2 border-amber-300/60 p-8 sm:p-10 rounded-[32px] shadow-[0_0_50px_rgba(245,158,11,0.3)] text-center text-white space-y-6 overflow-hidden font-sans"
              >
                {/* 상단 뱃지 및 카운트다운 */}
                <div className="flex flex-col items-center gap-2">
                  <motion.div
                    key={countdownStep}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-16 h-16 rounded-full bg-amber-400 text-purple-950 font-black text-3xl flex items-center justify-center shadow-lg shadow-amber-400/30"
                  >
                    {countdownStep > 0 ? countdownStep : '🎉'}
                  </motion.div>
                  <h3 className="text-xl sm:text-2xl font-black text-amber-300 tracking-wide mt-2">
                    {countdownStep > 0 ? '🎲 두구두구... 다음 나눔 주인공은?' : '✨ 이번 나눔의 주인공! ✨'}
                  </h3>
                </div>

                {/* 슬롯머신 롤링 윈도우 */}
                <div className="relative bg-black/50 border-2 border-purple-400/40 rounded-2xl p-6 min-h-[140px] flex flex-col items-center justify-center shadow-inner overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/40" />

                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={slotDisplayPost?.id ? `${slotDisplayPost.id}-${countdownStep}` : countdownStep}
                      initial={{ y: 25, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -25, opacity: 0 }}
                      transition={{ duration: 0.08, ease: 'easeOut' }}
                      className="flex flex-col items-center gap-2 relative z-10 w-full"
                    >
                      <span className="text-3xl">🐥</span>
                      <p className="text-2xl sm:text-3xl font-black text-amber-300 drop-shadow-md">
                        {slotDisplayPost?.author_name || '참여자'} 님
                      </p>
                      {slotDisplayPost?.content && (
                        <p className="text-xs sm:text-sm text-purple-200 line-clamp-2 max-w-xs break-words">
                          &quot;{slotDisplayPost.content}&quot;
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <p className="text-xs text-purple-300/80 animate-pulse">
                  {countdownStep > 0 ? '룰렛이 돌아가고 있습니다...' : '축하합니다! 박수로 맞이해주세요 👏'}
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ==================== [발표 진행 중 모달 이탈 시 '발표 이어하기' 플로팅 배너] (요구사항 3) ==================== */}
        <AnimatePresence>
          {!selectedPost && presentingPost && !isPickingAnimation && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.9 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-purple-950 via-indigo-950 to-purple-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl border border-purple-300/40 flex items-center gap-4 cursor-pointer hover:shadow-purple-900/40 hover:scale-[1.02] transition-all backdrop-blur-md"
              onClick={() => setSelectedPost(presentingPost)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-pulse">🎤</span>
                <div>
                  <p className="text-[11px] text-purple-200 font-semibold">현재 발표 진행 중</p>
                  <p className="text-sm sm:text-base font-extrabold text-white">
                    현재 <strong className="text-amber-300 underline underline-offset-2">{presentingPost.author_name || '익명'}</strong>님의 나눔 발표 진행 중입니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-2 border-l border-white/20">
                <button
                  type="button"
                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-purple-950 font-black rounded-xl text-xs shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  발표 이어하기 ↗
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPresentingPost(null)
                  }}
                  className="text-white/60 hover:text-white p-1 text-xs cursor-pointer"
                  title="발표 완료/종료"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                className="bg-white/95 backdrop-blur-md border border-purple-100 p-8 rounded-[24px] shadow-2xl max-w-lg w-full text-slate-900 space-y-6 relative font-sans"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center">
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase bg-purple-100 text-purple-900 px-3 py-1 rounded-full border border-purple-200/80">
                    🎉 지목된 나눔
                  </span>
                  <button
                    onClick={() => {
                      setSelectedPost(null)
                      setIsAllCompletedModal(false)
                    }}
                    className="text-slate-400 hover:text-slate-700 font-bold text-xl cursor-pointer p-1"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-relaxed whitespace-pre-line text-center break-words">
                  {selectedPost.content}
                </p>

                {selectedPost.image_url && isValidImageUrl(getPostImageUrl(selectedPost.image_url)) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getPostImageUrl(selectedPost.image_url)!}
                    alt="첨부 이미지"
                    className="w-full h-auto max-h-80 object-contain rounded-2xl border border-purple-100 bg-slate-50"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none'
                    }}
                  />
                )}

                <div className="text-right font-bold text-purple-950 text-base">
                  — {selectedPost.author_name || '익명'}
                </div>

                {/* 하단 제어 영역 */}
                <div className="pt-4 border-t border-purple-100 flex flex-col sm:flex-row gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPost(null)
                      setPresentingPost(null)
                    }}
                    className="w-full sm:flex-1 h-[52px] bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold rounded-xl transition-colors text-base cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>발표 완료 👏</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToNextQuestion}
                    className="w-full sm:flex-1 h-[52px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 text-base cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>다음 질문으로 이동 →</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  )
}