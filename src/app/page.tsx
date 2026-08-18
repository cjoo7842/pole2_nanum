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
      {/* 웹폰트 로드 */}
      <link
        href="https://fonts.googleapis.com/css2?family=Gamja+Flower&display=swap"
        rel="stylesheet"
      />

      <main className="relative min-h-screen bg-slate-50/60 flex items-center justify-center p-4 sm:p-6 lg:p-12 text-slate-800 overflow-hidden [font-family:'Gamja_Flower',sans-serif]">
        {/* soft background light */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-pink-100/40 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center relative z-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* 좌측 영역 */}
          <div className="flex flex-col space-y-6 justify-center my-auto">
            <motion.div variants={itemVariants}>
              <span className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-purple-100/90 text-purple-900 font-bold text-sm sm:text-base tracking-wide border border-purple-200/80 shadow-sm backdrop-blur-sm [font-family:sans-serif]">
                <span className="w-3 h-3 rounded-full bg-purple-600 animate-pulse" />
                pole2 : 나눔
              </span>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="text-7xl sm:text-8xl lg:text-9xl font-black text-purple-900 leading-none tracking-tight"
            >
              FOLLOW
            </motion.h1>

            <motion.div variants={itemVariants} className="space-y-1.5">
              <p className="text-slate-700 font-normal text-base sm:text-lg leading-relaxed whitespace-pre-line tracking-wide [font-family:'Gamja_Flower',sans-serif]">
                &quot;그들이 이르러 교회를 모아 하나님이 함께 행하신 모든 일과{'\n'}
                이방인들에게 믿음의 문을 열으신 것을 보고하고&quot;
              </p>
              <p className="text-slate-500 font-normal text-sm sm:text-base [font-family:'Gamja_Flower',sans-serif]">
                — 사도행전 14:27
              </p>
            </motion.div>
          </div>

          <div className="block lg:hidden border-b-2 border-dashed border-purple-200/80 my-2" />

          {/* 우측 영역 */}
          <motion.div variants={itemVariants}>
            <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-7 sm:p-9 lg:p-10 shadow-2xl shadow-purple-100/80 border border-purple-100 flex flex-col space-y-6 [font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif]">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
                  모임 시작하기
                </h2>
                <p className="text-xs sm:text-sm font-medium text-slate-400">
                  새로운 나눔을 만들거나, 기존 모임에 참여하세요.
                </p>
              </div>

              {/* 🔑 [추가] 템플릿 선택 드롭다운 (새 모임 시작 바로 위) */}
              <motion.div variants={itemVariants} className="space-y-1.5">
                <label htmlFor="templateSelect" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  나눔 질문 템플릿 선택
                </label>
                {isLoadingTemplates ? (
                  <div className="w-full py-3 px-4 bg-slate-100 rounded-2xl text-xs text-slate-400 font-medium">
                    템플릿 목록 불러오는 중...
                  </div>
                ) : templates.length > 0 ? (
                  <select
                    id="templateSelect"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white transition-all cursor-pointer"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full py-3 px-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-500 font-medium">
                    등록된 템플릿이 없습니다. 관리자에게 문의하세요.
                  </div>
                )}
              </motion.div>

              {/* ① 새 모임 시작 */}
              <motion.div variants={itemVariants}>
                <motion.button
                  onClick={handleCreateRoom}
                  disabled={isCreating || !selectedTemplateId}
                  whileHover={!isCreating && selectedTemplateId ? { scale: 1.025, backgroundColor: '#3B0764' } : {}}
                  whileTap={!isCreating && selectedTemplateId ? { scale: 0.97 } : {}}
                  transition={{ type: 'spring', bounce: 0.35 }}
                  className="w-full py-4 bg-purple-900 text-white font-bold rounded-2xl shadow-lg shadow-purple-900/20 transition-all text-xl flex items-center justify-center gap-2.5 cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  <span className="[font-family:'Gamja_Flower',sans-serif]">
                    {isCreating ? '모임 생성 중...' : '✨ 새 나눔 모임 열기 →'}
                  </span>
                </motion.button>
              </motion.div>

              {/* ② 구분선 */}
              <motion.div variants={itemVariants} className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t-2 border-slate-100" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white/90 px-4 text-slate-300 font-bold tracking-widest">
                    또는
                  </span>
                </div>
              </motion.div>

              {/* ③ 기존 모임 참여 */}
              <motion.div variants={itemVariants} className="space-y-3">
                <label htmlFor="roomCode" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  기존 모임 참여
                </label>

                <form onSubmit={handleJoinRoom} className="flex gap-2.5">
                  <input
                    id="roomCode"
                    type="text"
                    placeholder="모임 코드 입력 (예: AB12CD)"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="flex-1 px-4 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl text-slate-800 text-sm font-mono font-bold tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans transition-all"
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.03, backgroundColor: '#0F172A' }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', bounce: 0.35 }}
                    className="px-6 py-3.5 bg-slate-900 text-white font-bold rounded-2xl transition-all text-sm whitespace-nowrap shadow-md shadow-slate-900/10 cursor-pointer"
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