'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, Variants } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Template } from '@/types/database'

function HomePageContent() {
  const router = useRouter()
  const supabase = createClient()

  // 상태 관리
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // 🔑 추가: 템플릿 목록 및 메인 화면 선택 상태
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true)

  // 1. Supabase에서 템플릿 목록 불러오기
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('templates')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })

        if (error) throw error

        if (data && data.length > 0) {
          setTemplates(data)
          setSelectedTemplateId(data[0].id) // 첫 번째 템플릿 기본 선택
        }
      } catch (err) {
        console.error('템플릿 조회 중 오류:', err)
      } finally {
        setIsLoadingTemplates(false)
      }
    }

    fetchTemplates()
  }, [supabase])

  // 새 모임 시작 (메인 화면에서 직접 선택한 selectedTemplateId 반영)
  const handleCreateRoom = async () => {
    if (isCreating) return

    if (!selectedTemplateId) {
      alert('사용할 나눔 템플릿을 선택해 주세요.')
      return
    }

    setIsCreating(true)

    try {
      const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase()

      const { data, error } = await supabase
        .from('rooms')
        .insert({
          room_code: generatedCode,
          status: 'WAITING',
          template_id: selectedTemplateId, // 🔑 메인에서 선택된 templateId 저장
        })
        .select('id')
        .single()

      if (error) throw error

      if (data && data.id) {
        router.push(`/host/${data.id}`)
      }
    } catch (err) {
      console.error('모임 생성 중 오류 발생:', err)
      alert('새 모임을 생성하는 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setIsCreating(false)
    }
  }

  // 기존 모임 참여 (admin 처리 유지)
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault()
    const rawCode = roomCode.trim()

    if (!rawCode) {
      alert('모임 코드를 입력해 주세요.')
      return
    }

    // 🔑 [관리자 페이지 접속 이스터에그] admin/ADMIN 입력 시 관리자 로그인으로 이동
    if (rawCode.toLowerCase() === 'admin') {
      router.push('/admin/login')
      return
    }

    const formattedCode = rawCode.toUpperCase()
    router.push(`/p/${formattedCode}`)
  }

  // Variants 타입 명시
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.1,
      },
    },
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        bounce: 0.35,
        duration: 0.7,
      },
    },
  }

  return (
    <>
      {/* 웹폰트 로드: 로고용 Black Han Sans + 성경 구절용 Noto Serif KR */}
      <link
        href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Serif+KR:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      <main className="relative min-h-screen bg-slate-50/70 flex items-center justify-center p-4 sm:p-6 lg:p-12 text-slate-800 overflow-hidden font-sans">
        {/* soft background light */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-pink-100/40 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center relative z-10 my-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* 좌측 브랜드 영역 (중앙 정렬 및 긴밀한 덩어리감) */}
          <div className="flex flex-col justify-center items-start space-y-5 py-4 lg:py-6">
            {/* 뱃지 + 워드마크 (한 그룹으로 밀착) */}
            <div className="space-y-2 w-full">
              <motion.div variants={itemVariants}>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100/90 text-purple-900 font-bold text-xs tracking-wide border border-purple-200/80 shadow-xs backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                  pole2 : 나눔
                </span>
              </motion.div>

              <motion.h1
                variants={itemVariants}
                className="text-6xl sm:text-7xl lg:text-8xl font-normal leading-none tracking-tight select-none bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 bg-clip-text text-transparent [font-family:'Black_Han_Sans',sans-serif] drop-shadow-xs"
              >
                FOLLOW
              </motion.h1>
            </div>

            {/* 성경 구절 인용 */}
            <motion.div variants={itemVariants} className="space-y-1.5 pt-0.5">
              <p className="text-slate-700 font-normal text-[15px] sm:text-[16px] lg:text-[17px] leading-[1.65] whitespace-pre-line [font-family:'Noto_Serif_KR',serif]">
                &quot;그들이 이르러 교회를 모아 하나님이 함께 행하신 모든 일과{'\n'}
                이방인들에게 믿음의 문을 열으신 것을 보고하고&quot;
              </p>
              <p className="text-purple-900/60 font-medium text-[13px] sm:text-[14px] [font-family:'Noto_Serif_KR',serif]">
                — 사도행전 14:27
              </p>
            </motion.div>

            {/* 하단 은은한 마감 데코레이션 태그라인 */}
            <motion.div
              variants={itemVariants}
              className="pt-2 flex items-center gap-2 text-xs font-semibold text-slate-400/90 tracking-wider uppercase select-none"
            >
              <span className="w-6 h-[1px] bg-purple-200" />
              <span>Outreach Community Gathering</span>
            </motion.div>
          </div>

          <div className="block lg:hidden border-b-2 border-dashed border-purple-200/80 my-2" />

          {/* 우측 영역: 모임 시작하기 카드 UI */}
          <motion.div variants={itemVariants}>
            <div className="bg-white/95 backdrop-blur-md rounded-[20px] p-7 sm:p-9 lg:p-10 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.08)] border border-purple-100/70 flex flex-col space-y-6 font-sans">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
                  모임 시작하기
                </h2>
                <p className="text-xs sm:text-sm font-medium text-slate-400">
                  새로운 나눔을 만들거나, 기존 모임에 참여하세요.
                </p>
              </div>

              {/* 템플릿 선택 드롭다운 */}
              <motion.div variants={itemVariants} className="space-y-1.5">
                <label htmlFor="templateSelect" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  나눔 질문 템플릿 선택
                </label>
                {isLoadingTemplates ? (
                  <div className="w-full h-[52px] px-4 bg-slate-100 rounded-xl text-xs text-slate-400 font-medium flex items-center">
                    템플릿 목록 불러오는 중...
                  </div>
                ) : templates.length > 0 ? (
                  <select
                    id="templateSelect"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full h-[52px] px-4 bg-slate-50/80 border border-slate-200/90 rounded-xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white transition-all cursor-pointer"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full h-[52px] px-4 bg-red-50 border border-red-100 rounded-xl text-xs text-red-500 font-medium flex items-center">
                    등록된 템플릿이 없습니다. 관리자에게 문의하세요.
                  </div>
                )}
              </motion.div>

              {/* ① 새 모임 시작 (Primary Button) */}
              <motion.div variants={itemVariants}>
                <motion.button
                  onClick={handleCreateRoom}
                  disabled={isCreating || !selectedTemplateId}
                  whileHover={!isCreating && selectedTemplateId ? { scale: 1.02, backgroundColor: '#3B0764' } : {}}
                  whileTap={!isCreating && selectedTemplateId ? { scale: 0.98 } : {}}
                  transition={{ type: 'spring', bounce: 0.3 }}
                  className="w-full h-[52px] bg-gradient-to-r from-purple-900 to-indigo-900 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 hover:shadow-lg transition-all text-base flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-300 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {/* Sparkle 라인 아이콘 */}
                  <svg className="w-5 h-5 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.286L13 21l-2.286-6.857L5 12l5.714-2.286L13 3z" />
                  </svg>
                  <span>{isCreating ? '모임 생성 중...' : '새 나눔 모임 열기'}</span>
                  {/* Arrow 아이콘 */}
                  <svg className="w-4 h-4 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </motion.button>
              </motion.div>

              {/* ② 구분선 */}
              <motion.div variants={itemVariants} className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white/95 px-4 text-slate-300 font-bold tracking-widest">
                    또는
                  </span>
                </div>
              </motion.div>

              {/* ③ 기존 모임 참여 (인풋+버튼 seamless 결합) */}
              <motion.div variants={itemVariants} className="space-y-1.5">
                <label htmlFor="roomCode" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  기존 모임 참여
                </label>

                <form onSubmit={handleJoinRoom} className="flex items-center gap-0 w-full group">
                  <input
                    id="roomCode"
                    type="text"
                    placeholder="모임 코드 입력 (예: AB12CD)"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="flex-1 h-[52px] px-4 bg-slate-50/80 border border-slate-200/90 border-r-0 rounded-l-xl text-slate-800 text-sm font-mono font-bold tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans transition-all"
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', bounce: 0.3 }}
                    className="h-[52px] px-6 bg-purple-50 hover:bg-purple-100/90 text-purple-900 font-bold border border-slate-200/90 border-l-0 rounded-r-xl transition-all text-sm whitespace-nowrap cursor-pointer flex items-center justify-center shrink-0"
                  >
                    참여
                  </motion.button>
                </form>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50/60 flex items-center justify-center text-slate-400 font-bold">로딩 중...</div>}>
      <HomePageContent />
    </Suspense>
  )
}