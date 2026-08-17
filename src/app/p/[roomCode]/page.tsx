'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import { Room, Question, Post } from '@/types/database'

// [추가] 명세서: "멀티라인 작성(최대 300자)" — 기존 코드엔 이 제한이 전혀 없었음
const MAX_CONTENT_LENGTH = 300

export default function ParticipantPage() {
  const params = useParams()
  const roomCode = (params?.roomCode as string)?.toUpperCase()
  const supabase = createClient()

  const [room, setRoom] = useState<Room | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [existingPost, setExistingPost] = useState<Post | null>(null)

  const [token, setToken] = useState<string>('')
  const [authorName, setAuthorName] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const [loading, setLoading] = useState<boolean>(true)
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false)

  // 1. 참가자 식별 토큰 생성 및 로드
  useEffect(() => {
    let pToken = localStorage.getItem('participant_token')
    if (!pToken) {
      pToken = crypto.randomUUID()
      localStorage.setItem('participant_token', pToken)
    }
    setToken(pToken)
  }, [])

  // 2. 방, 질문 및 기존 작성 포스트잇 정보 조회
  const fetchRoomAndQuestion = async () => {
    if (!roomCode) return
    setLoading(true)

    // 방 정보 조회 (.maybeSingle() 적용)
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .maybeSingle()

    if (roomData) {
      setRoom(roomData)

      if (roomData.current_question_id) {
        // 현재 질문 정보 조회 (.maybeSingle() 적용)
        const { data: questionData } = await supabase
          .from('questions')
          .select('*')
          .eq('id', roomData.current_question_id)
          .maybeSingle()

        setQuestion(questionData)

        // 작성된 포스트잇 조회 (최초 접속 시 0개 조회 에러 방지 .maybeSingle() 적용)
        const pToken = localStorage.getItem('participant_token')
        if (pToken) {
          const { data: postData } = await supabase
            .from('posts')
            .select('*')
            .eq('room_id', roomData.id)
            .eq('question_id', roomData.current_question_id)
            .eq('participant_token', pToken)
            .maybeSingle()

          if (postData) {
            setExistingPost(postData)
            setAuthorName(postData.author_name || '')
            setContent(postData.content || '')
            setImagePreview(postData.image_url)
            setIsSubmitted(true)
          } else {
            setExistingPost(null)
            setIsSubmitted(false)
            setContent('')
            setImagePreview(null)
            setImageFile(null)
          }
        }
      } else {
        setQuestion(null)
      }
    } else {
      setRoom(null)
    }
    setLoading(false)
  }

  // 3. Room Realtime 구독 동기화
  useEffect(() => {
    if (!roomCode) return

    fetchRoomAndQuestion()

    const channel = supabase
      .channel(`room-status-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${roomCode}`,
        },
        () => {
          // 진행자가 질문을 변경하거나 방 상태(IN_PROGRESS, COMPLETED)를 전환할 때 데이터 갱신
          fetchRoomAndQuestion()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])

  // [추가] 300자 제한을 넘는 입력 자체를 막는 핸들러.
  // maxLength 속성만으로는 IME(한글 조합 중 입력) 환경에서 완전히 막히지 않는 경우가 있어
  // onChange 단계에서도 한 번 더 방어적으로 자름.
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= MAX_CONTENT_LENGTH) {
      setContent(value)
    } else {
      setContent(value.slice(0, MAX_CONTENT_LENGTH))
    }
  }

  // 이미지 선택 처리
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  // 4. 포스트잇 제출/수정 핸들러 (Storage cleanup 반영)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !question || !token) return

    const trimmedContent = content.trim()

    if (!trimmedContent && !imageFile && !imagePreview) {
      alert('내용이나 사진을 작성해 주세요!')
      return
    }

    // [추가] 서버 전송 직전 최종 방어 — maxLength 우회(개발자도구 등)로 넘어온 값 차단
    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      alert(`나눔 내용은 최대 ${MAX_CONTENT_LENGTH}자까지 작성할 수 있어요.`)
      return
    }

    setLoading(true)
    let imageUrl = imagePreview

    // 신규 이미지 파일 업로드 시
    if (imageFile) {
      try {
        // 기존 Storage에 파일이 존재할 경우 삭제 (Storage 리소스 누수 방지)
        if (existingPost?.image_url) {
          try {
            const oldUrl = new URL(existingPost.image_url)
            const pathSegments = oldUrl.pathname.split('/post-images/')
            if (pathSegments.length > 1) {
              const oldFilePath = pathSegments[1]
              await supabase.storage.from('post-images').remove([oldFilePath])
            }
          } catch (deleteError) {
            console.warn('기존 Storage 파일 삭제 예외 처리 (무시 후 계속 진행):', deleteError)
          }
        }

        // 이미지 압축 및 업로드
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        }
        const compressedFile = await imageCompression(imageFile, options)
        const fileExt = compressedFile.name.split('.').pop()
        const filePath = `${room.id}/${crypto.randomUUID()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(filePath, compressedFile)

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage
          .from('post-images')
          .getPublicUrl(filePath)

        imageUrl = publicUrlData.publicUrl
      } catch (err) {
        console.error('이미지 업로드 오류:', err)
        alert('이미지 업로드에 실패했습니다.')
        setLoading(false)
        return
      }
    }

    if (existingPost) {
      // 기존 포스트잇 수정
      const { data, error } = await supabase
        .from('posts')
        .update({
          author_name: authorName,
          content: trimmedContent,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPost.id)
        .select()
        .maybeSingle()

      if (!error && data) {
        setExistingPost(data)
        setIsSubmitted(true)
        // [추가] 제출 성공 후 남아있던 imageFile을 초기화하지 않으면,
        // 다음번에 "수정하기"로 폼을 다시 열었을 때 이전 파일이 그대로 남아
        // 이미지 변경 없이 재제출해도 의도치 않게 재업로드될 수 있었음.
        setImageFile(null)
      } else {
        alert('수정 처리 중 오류가 발생했습니다.')
      }
    } else {
      // 신규 포스트잇 제출
      const { data, error } = await supabase
        .from('posts')
        .insert({
          room_id: room.id,
          question_id: question.id,
          author_name: authorName,
          content: trimmedContent,
          image_url: imageUrl,
          participant_token: token,
        })
        .select()
        .maybeSingle()

      if (!error && data) {
        setExistingPost(data)
        setIsSubmitted(true)
        setImageFile(null)
      } else {
        alert('제출 처리 중 오류가 발생했습니다.')
      }
    }
    setLoading(false)
  }

  // 로딩 상태 UI
  if (loading && !room) {
    return (
      <main className="min-h-screen bg-amber-50 flex items-center justify-center p-6 text-slate-600">
        <p className="animate-pulse">모임 정보를 불러오는 중입니다...</p>
      </main>
    )
  }

  // 존재하지 않는 방 코드
  if (!room) {
    return (
      <main className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="text-5xl">🔍</div>
        <h1 className="text-xl font-bold text-slate-800">존재하지 않는 모임 방입니다</h1>
        <p className="text-xs text-slate-500">방 코드를 다시 한번 확인해 주세요.</p>
      </main>
    )
  }

  // 방 상태 1: WAITING (진행자 나눔 시작 전)
  if (room.status === 'WAITING') {
    return (
      <main className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="text-6xl animate-bounce">⏳</div>
        <h1 className="text-2xl font-bold text-amber-950">진행자가 나눔을 시작하기 전입니다</h1>
        <p className="text-sm text-slate-600">
          대형 화면에서 [나눔 시작하기] 버튼을 누르면<br />질문 작성 창이 자동으로 열립니다.
        </p>
      </main>
    )
  }

  // 방 상태 2: COMPLETED (전체 모임 종료)
  if (room.status === 'COMPLETED') {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold text-slate-800">모든 나눔이 종료되었습니다</h1>
        <p className="text-sm text-slate-600">오늘 나눔에 함께해 주셔서 감사합니다!</p>
      </main>
    )
  }

  // 방 상태 3: IN_PROGRESS (포스트잇 작성 및 수정 메인 UI)
  return (
    <main className="min-h-screen bg-amber-50/60 p-4 sm:p-6 flex flex-col items-center justify-center text-slate-800">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-amber-200/80 space-y-6">
        {/* 질문 영역 */}
        <div className="space-y-1 text-center border-b border-amber-100 pb-4">
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
            {question?.subtitle || '오늘의 나눔 질문'}
          </span>
          <h1 className="text-xl font-extrabold text-amber-950 pt-2">
            {question?.title || '질문을 불러오는 중...'}
          </h1>
        </div>

        {/* 작성 완료 뷰 */}
        {isSubmitted ? (
          <div className="space-y-6 text-center py-4">
            <div className="text-5xl">💌</div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-800">기다려주세요!</h2>
              <p className="text-xs text-slate-500">
                진행자가 나눔 포스트잇을 지목할 때까지 기다려 주세요.
              </p>
            </div>

            <button
              onClick={() => setIsSubmitted(false)}
              className="w-full py-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-xl transition-colors text-sm"
            >
              수정하기 ✏️
            </button>
          </div>
        ) : (
          /* 작성/수정 폼 뷰 */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                이름 또는 닉네임 (선택)
              </label>
              <input
                type="text"
                placeholder="익명"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-600 block">
                  나눔 내용
                </label>
                {/* [추가] 남은 글자 수 표시 — maxLength만으로는 사용자가 제한을
                    인지하기 어려워 UX상 필수로 추가 */}
                <span
                  className={`text-[11px] font-medium ${
                    content.length >= MAX_CONTENT_LENGTH ? 'text-rose-500' : 'text-slate-400'
                  }`}
                >
                  {content.length} / {MAX_CONTENT_LENGTH}
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={MAX_CONTENT_LENGTH}
                placeholder="마음 속 나눔을 솔직하게 적어주세요..."
                value={content}
                onChange={handleContentChange}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                사진 첨부 (선택)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
              />
              {imagePreview && (
                <div className="mt-3 relative w-full h-36 rounded-xl overflow-hidden bg-slate-100 border">
                  <img
                    src={imagePreview}
                    alt="미리보기"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-colors text-base disabled:opacity-50"
            >
              {loading ? '제출 중...' : existingPost ? '나눔 수정하기 ✏️' : '나눔 제출하기 🚀'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
