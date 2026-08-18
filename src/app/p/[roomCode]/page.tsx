'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import { Room, Question, Post } from '@/types/database'

// 명세서: "멀티라인 작성(최대 300자)"
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

    // 방 정보 조회
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .maybeSingle()

    if (roomData) {
      setRoom(roomData)

      if (roomData.current_question_id) {
        // 현재 질문 정보 조회
        const { data: questionData } = await supabase
          .from('questions')
          .select('*')
          .eq('id', roomData.current_question_id)
          .maybeSingle()

        setQuestion(questionData)

        // 작성된 포스트잇 조회
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
          fetchRoomAndQuestion()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])

  // 300자 제한을 넘는 입력 방지 핸들러
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

  // 4. 포스트잇 제출/수정 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !question || !token) return

    const trimmedContent = content.trim()

    if (!trimmedContent && !imageFile && !imagePreview) {
      alert('내용이나 사진을 작성해 주세요!')
      return
    }

    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      alert(`나눔 내용은 최대 ${MAX_CONTENT_LENGTH}자까지 작성할 수 있어요.`)
      return
    }

    setLoading(true)
    let imageUrl = imagePreview

    // 신규 이미지 파일 업로드 시
    if (imageFile) {
      try {
        if (existingPost?.image_url) {
          try {
            const oldUrl = new URL(existingPost.image_url)
            const pathSegments = oldUrl.pathname.split('/post-images/')
            if (pathSegments.length > 1) {
              const oldFilePath = pathSegments[1]
              await supabase.storage.from('post-images').remove([oldFilePath])
            }
          } catch (deleteError) {
            console.warn('기존 Storage 파일 삭제 예외 처리:', deleteError)
          }
        }

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
      <main className="min-h-screen bg-violet-50/40 flex items-center justify-center p-6 text-purple-900 font-bold">
        <p className="animate-pulse">모임 정보를 불러오는 중입니다...</p>
      </main>
    )
  }

  // 존재하지 않는 방 코드
  if (!room) {
    return (
      <main className="min-h-screen bg-violet-50/40 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="text-5xl">🔍</div>
        <h1 className="text-xl font-extrabold text-purple-950">존재하지 않는 모임 방입니다</h1>
        <p className="text-xs text-slate-500">방 코드를 다시 한번 확인해 주세요.</p>
      </main>
    )
  }

  // 방 상태 1: WAITING (진행자 나눔 시작 전)
  if (room.status === 'WAITING') {
    return (
      <>
        <link
          href="https://fonts.googleapis.com/css2?family=Gamja+Flower&display=swap"
          rel="stylesheet"
        />
        <main className="min-h-screen bg-violet-50/40 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="text-6xl animate-bounce">⏳</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-purple-950 [font-family:'Gamja_Flower',sans-serif]">
            진행자가 나눔을 시작하기 전입니다
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            대형 화면에서 [나눔 시작하기] 버튼을 누르면<br />질문 작성 창이 자동으로 열립니다.
          </p>
        </main>
      </>
    )
  }

  // 방 상태 2: COMPLETED (전체 모임 종료)
  if (room.status === 'COMPLETED') {
    return (
      <>
        <link
          href="https://fonts.googleapis.com/css2?family=Gamja+Flower&display=swap"
          rel="stylesheet"
        />
        <main className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 [font-family:'Gamja_Flower',sans-serif]">
            모든 나눔이 종료되었습니다
          </h1>
          <p className="text-sm text-slate-600">오늘 나눔에 함께해 주셔서 감사합니다!</p>
        </main>
      </>
    )
  }

  // 방 상태 3: IN_PROGRESS (포스트잇 작성 및 수정 메인 UI - 딥퍼플 스타일)
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Gamja+Flower&display=swap"
        rel="stylesheet"
      />
      <main className="min-h-screen bg-violet-50/40 p-4 sm:p-6 flex flex-col items-center justify-center text-slate-800">
        <div className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-[2rem] p-6 sm:p-8 shadow-2xl shadow-purple-100/80 border border-purple-100 space-y-6">
          
          {/* 질문 영역 */}
          <div className="space-y-2 text-center border-b border-purple-100 pb-5">
            <span className="text-xs font-bold text-purple-900 bg-purple-100 px-3 py-1 rounded-full border border-purple-200/80 [font-family:'Gamja_Flower',sans-serif] text-sm">
              {question?.subtitle || '오늘의 나눔 질문'}
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-purple-950 pt-2 leading-snug">
              {question?.title || '질문을 불러오는 중...'}
            </h1>
          </div>

          {/* 작성 완료 뷰 */}
          {isSubmitted ? (
            <div className="space-y-6 text-center py-4">
              <div className="text-5xl">💌</div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-purple-950 [font-family:'Gamja_Flower',sans-serif]">
                  기다려주세요!
                </h2>
                <p className="text-xs text-slate-500">
                  진행자가 나눔 포스트잇을 지목할 때까지 기다려 주세요.
                </p>
              </div>

              <button
                onClick={() => setIsSubmitted(false)}
                className="w-full py-3.5 bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold rounded-2xl transition-colors text-base [font-family:'Gamja_Flower',sans-serif] cursor-pointer"
              >
                수정하기 ✏️
              </button>
            </div>
          ) : (
            /* 작성/수정 폼 뷰 */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">
                  이름 또는 닉네임 (선택)
                </label>
                <input
                  type="text"
                  placeholder="익명"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-purple-100 bg-purple-50/30 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-900 transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-600 block">
                    나눔 내용
                  </label>
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
                  placeholder="하나님께서 주시는 마음을 솔직하게 나누어주세요"
                  value={content}
                  onChange={handleContentChange}
                  className="w-full p-3.5 rounded-xl border border-purple-100 bg-purple-50/30 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-900 resize-none transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">
                  사진 첨부 (선택)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200 transition-all cursor-pointer"
                />
                {imagePreview && (
                  <div className="mt-3 relative w-full h-36 rounded-xl overflow-hidden bg-slate-100 border border-purple-100">
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
                className="w-full py-4 bg-purple-900 hover:bg-purple-950 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-purple-900/20 transition-all text-xl disabled:opacity-50 [font-family:'Gamja_Flower',sans-serif] cursor-pointer"
              >
                {loading ? '제출 중...' : existingPost ? '나눔 수정하기 ✏️' : '나눔 제출하기 🚀'}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  )
}