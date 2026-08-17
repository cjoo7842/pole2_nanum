'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase/client'
import { Template, Room } from '@/types/database'

export default function HostLandingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templatesLoaded, setTemplatesLoaded] = useState<boolean>(false)
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null)
  const [participantUrl, setParticipantUrl] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  // 템플릿 목록 불러오기
  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: true })

      if (data && data.length > 0) {
        setTemplates(data)
        setSelectedTemplateId(data[0].id)
      }
      // [추가] 템플릿 목록 조회가 끝났음을 표시.
      // 템플릿이 0개인 경우를 "아직 로딩 중"과 구분하기 위함 (아래 버튼 비활성화 조건에 사용).
      setTemplatesLoaded(true)
    }
    fetchTemplates()
  }, [])

  // 6자리 난수 방 코드 생성 함수
  // [수정] 기존 Math.random().toString(36).substring(2, 8)은 결과값에 따라
  // 6자리보다 짧은 문자열이 나올 수 있어 명세서의 "6자리 room_code" 요구사항을
  // 항상 보장하지 못했음. padEnd로 부족한 자리를 채워 항상 6자리를 보장.
  const generateRoomCode = () => {
    const raw = Math.random().toString(36).substring(2, 8).toUpperCase()
    return raw.padEnd(6, '0').substring(0, 6)
  }

  // 모임 방 생성
  // [수정] room_code unique 충돌 시 재시도할 수 있도록 최대 5회 루프 처리 추가
  const handleCreateRoom = async () => {
    setLoading(true)

    let roomData: Room | null = null
    let lastError: unknown = null

    for (let attempt = 0; attempt < 5 && !roomData; attempt++) {
      const roomCode = generateRoomCode()

      // 1. 선택된 템플릿의 첫 번째 질문 찾기
      let firstQuestionId: string | null = null
      if (selectedTemplateId) {
        const { data: qData } = await supabase
          .from('questions')
          .select('id')
          .eq('template_id', selectedTemplateId)
          .order('step_order', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (qData) firstQuestionId = qData.id
      }

      // 2. rooms 테이블에 WAITING 상태로 방 생성
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          room_code: roomCode,
          status: 'WAITING',
          template_id: selectedTemplateId || null,
          current_question_id: firstQuestionId,
        })
        .select()
        .maybeSingle()

      if (data) {
        roomData = data
      } else {
        lastError = error
      }
    }

    if (!roomData) {
      console.error('방 생성 오류:', lastError)
      alert('방 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      setLoading(false)
      return
    }

    setCreatedRoom(roomData)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    setParticipantUrl(`${origin}/p/${roomData.room_code}`)
    setLoading(false)
  }

  // [나눔 시작하기] 클릭 시 방 상태를 IN_PROGRESS로 변경 후 진행자 메인 화면으로 이동
  const handleStartSession = async () => {
    if (!createdRoom) return

    setLoading(true)
    const { error } = await supabase
      .from('rooms')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', createdRoom.id)

    if (error) {
      // [수정] 기존 console.error(msg, error)는 Next.js 에러 오버레이에서
      // {}로만 표시되어 원인 파악이 불가능했음.
      // PostgrestError(message/code/details/hint)든 순수 네트워크 Error든
      // 실제 내용이 보이도록 message/code를 명시적으로 꺼내서 로깅.
      console.error('방 상태 변경 오류:', {
        message: error.message,
        code: (error as { code?: string }).code,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
      })
      alert(`나눔 시작 중 오류가 발생했습니다.${error.message ? `\n(${error.message})` : ''}`)
      setLoading(false)
      return
    }

    router.push(`/host/${createdRoom.id}`)
  }

  // [추가] 템플릿이 아예 없는 상태에서는 질문 없는 방이 생성되어
  // host/[roomId], p/[roomCode] 양쪽 다 "질문을 불러오는 중..."에서 멈추는 문제가 있었음.
  // 템플릿이 하나도 없으면 방 생성 자체를 막고 안내 문구를 보여줌.
  const noTemplatesAvailable = templatesLoaded && templates.length === 0

  return (
    <main className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-xl bg-white rounded-3xl p-8 shadow-xl border border-amber-200/80 space-y-8 text-center">
        {/* Header & 성경 구절 */}
        {/* [수정] 명세서: "성경 구절(데살로니가전서 1:2-3)"
            기존 코드는 히브리서 10:24가 잘못 들어가 있었음.
            원문 그대로의 직역 인용 대신, 저작권상 안전하게 구절의 취지를 짧게 풀어쓰고
            정확한 장절 표기(1:2-3)를 명시함. 교회에서 사용 중인 공인 번역본 문구로
            교체하고 싶다면 이 blockquote 내용만 바꾸면 됨. */}
        <div className="space-y-3">
          <span className="inline-block bg-amber-100 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
            폴투 아웃리치 나눔
          </span>
          <h1 className="text-3xl font-extrabold text-amber-950">모임 진행자 화면</h1>
          <blockquote className="italic text-xs text-slate-500 pt-1">
            "우리가 너희 모두로 말미암아 항상 하나님께 감사하며 기도할 때에 너희를 기억함은
            너희의 믿음의 역사와 사랑의 수고와 우리 주 예수 그리스도에 대한 소망의 인내를
            우리 하나님 아버지 앞에서 끊임없이 기억함이니"
            <br />
            (데살로니가전서 1:2-3)
          </blockquote>
        </div>

        {/* 방 생성 전: 템플릿 선택 및 생성 버튼 */}
        {!createdRoom ? (
          <div className="space-y-6 pt-2">
            {templates.length > 0 && (
              <div className="text-left space-y-2">
                <label className="text-xs font-bold text-slate-600 block">
                  나눔 템플릿 선택
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {noTemplatesAvailable && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">
                사용 가능한 나눔 템플릿이 없습니다. 먼저 템플릿을 등록해 주세요.
              </p>
            )}

            {/* [수정] 명세서: "[새 모임 시작] 버튼" — 기존 "새로운 나눔 방 만들기 🚀" 문구를
                명세서 원문에 맞춤. 템플릿이 없으면 비활성화하여 빈 질문 방 생성을 방지. */}
            <button
              onClick={handleCreateRoom}
              disabled={loading || noTemplatesAvailable}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-2xl shadow-lg transition-all text-lg disabled:opacity-50"
            >
              {loading ? '모임방 생성 중...' : '새 모임 시작'}
            </button>
          </div>
        ) : (
          /* 방 생성 후: QR 코드 및 입장 안내 */
          <div className="space-y-6 pt-2 animate-fade-in">
            <div className="bg-amber-50/80 rounded-2xl p-6 border border-amber-200/60 space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-xl shadow-inner inline-block">
                {participantUrl && (
                  <QRCodeSVG value={participantUrl} size={200} level="H" includeMargin />
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">참가자 방 코드</p>
                <p className="text-3xl font-black text-amber-900 tracking-wider">
                  {createdRoom.room_code}
                </p>
              </div>
              <p className="text-xs text-slate-600 break-all bg-amber-100/60 p-2 rounded-lg">
                {participantUrl}
              </p>
            </div>

            <button
              onClick={handleStartSession}
              disabled={loading}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-2xl shadow-lg transition-all text-lg disabled:opacity-50"
            >
              {loading ? '시작 중...' : '나눔 시작하기 🎤'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
