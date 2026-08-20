'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import { RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import { Room, Question, Post } from '@/types/database'
import { isValidImageUrl, getPostImageUrl } from '@/lib/image'

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
  const [showNicknameModal, setShowNicknameModal] = useState<boolean>(false)
  const [tempNickname, setTempNickname] = useState<string>('')

  const [content, setContent] = useState<string>('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState<boolean>(true)
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false)

  // 1. 참가자 식별 토큰 및 이전 입력한 닉네임 로드 (없을 경우 닉네임 입력 모달 표시)
  useEffect(() => {
    let pToken = localStorage.getItem('participant_token')
    if (!pToken) {
      pToken = crypto.randomUUID()
      localStorage.setItem('participant_token', pToken)
    }
    setToken(pToken)

    const savedName = localStorage.getItem('participant_name')
    if (savedName) {
      setAuthorName(savedName)
    } else {
      setShowNicknameModal(true)
    }
  }, [])

  // 1-2. Realtime Presence 참여자 실시간 등록
  useEffect(() => {
    if (!room?.id || !token || !authorName) return

    const presenceChannel = supabase.channel(`presence-room-${room.id}`, {
      config: {
        presence: {
          key: token,
        },
      },
    })

    presenceChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          token,
          name: authorName,
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [room?.id, token, authorName, supabase])

  // 이미지 압축 유틸 함수 (요구사항: 최대 가로/세로 1024px, 용량 1MB 이하)
  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1, // 최대 용량 1MB 이하
      maxWidthOrHeight: 1024, // 최대 가로/세로 1024px
      useWebWorker: true,
      initialQuality: 0.85,
    }
    try {
      const compressed = await imageCompression(file, options)
      console.log(`[Image Compression] 원본: ${(file.size / 1024).toFixed(1)}KB -> 압축: ${(compressed.size / 1024).toFixed(1)}KB`)
      return compressed
    } catch (error) {
      console.warn('browser-image-compression 실패, 원본 파일로 유지:', error)
      return file
    }
  }

  // 2. 방, 질문 및 기존 작성 포스트잇 정보 조회 (isSilent: 백그라운드 동기화 시 전체 로딩 스피너 깜빡임 방지)
  const fetchRoomAndQuestion = async (isSilent = false) => {
    if (!roomCode) return
    if (!isSilent) setLoading(true)

    try {
      // 방 정보 조회
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .maybeSingle()

      if (roomError) {
        console.error('방 정보 조회 오류:', roomError)
        if (!isSilent) setLoading(false)
        return
      }

      if (roomData) {
        setRoom(roomData)

        if (roomData.current_question_id) {
          // 현재 질문 정보 조회
          const { data: questionData } = await supabase
            .from('questions')
            .select('*')
            .eq('id', roomData.current_question_id)
            .maybeSingle()

          setQuestion(questionData || null)

          // 작성된 포스트잇 조회 (현재 참가자 토큰 기준)
          const pToken = localStorage.getItem('participant_token') || token
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
              if (postData.author_name) setAuthorName(postData.author_name)
              setContent(postData.content || '')
              setLocalPreviewUrl(getPostImageUrl(postData.image_url) || null)
              setImageFile(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
              setIsSubmitted(true)
            } else {
              setExistingPost(null)
              setIsSubmitted(false)
              setContent('')
              setLocalPreviewUrl(null)
              setImageFile(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }
          }
        } else {
          setQuestion(null)
          setExistingPost(null)
        }
      } else {
        setRoom(null)
      }
    } catch (err) {
      console.error('fetchRoomAndQuestion 처리 중 예외 발생:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  // 3. Room Realtime 구독 및 이중 안전장치 (자동 재구독 + visibilitychange + 6초 주기적 Polling)
  useEffect(() => {
    if (!roomCode) return

    // 최초 1회 화면 진입 시 데이터 로드
    fetchRoomAndQuestion(false)

    let isMounted = true
    let activeChannel: ReturnType<typeof supabase.channel> | null = null
    let retryTimer: NodeJS.Timeout | null = null

    const setupRealtimeChannel = () => {
      if (!isMounted) return

      if (activeChannel) {
        supabase.removeChannel(activeChannel)
      }

      const channelName = `room-status-${roomCode}-${Date.now()}`
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `room_code=eq.${roomCode}`,
          },
          (payload: RealtimePostgresUpdatePayload<Room>) => {
            console.log('[Realtime Participant] 방 상태 변경 수신:', payload)
            fetchRoomAndQuestion(true)
          }
        )
        .subscribe((status: string, err?: Error | null) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Realtime Participant] 구독 성공 (${channelName})`)
          } else if (
            status === 'CLOSED' ||
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT'
          ) {
            console.warn(`[Realtime Participant] 채널 상태 비정상 [${status}]:`, err)
            if (isMounted) {
              if (retryTimer) clearTimeout(retryTimer)
              // 소켓 끊김 감지 시 1.5초 후 자동 재구독 시도
              retryTimer = setTimeout(() => {
                console.log('[Realtime Participant] 채널 재구독 시도...')
                setupRealtimeChannel()
              }, 1500)
            }
          }
        })

      activeChannel = channel
    }

    setupRealtimeChannel()

    // 안전장치 1: 모바일 화면 켜짐/탭 재활성화(visibilitychange) 및 포커스(focus) 시 동기화
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Sync Participant] 탭 활성화 감지 -> 방/질문 동기화 검증')
        fetchRoomAndQuestion(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    // 안전장치 2: 6초 간격 간이 Polling으로 질문 전환 유실 방지
    const pollingInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRoomAndQuestion(true)
      }
    }, 6000)

    return () => {
      isMounted = false
      if (retryTimer) clearTimeout(retryTimer)
      clearInterval(pollingInterval)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
      }
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
      const previewUrl = URL.createObjectURL(file)
      setLocalPreviewUrl(previewUrl)
    }
  }

  // 이미지 첨부 취소/삭제 핸들러
  const handleRemoveImage = () => {
    setImageFile(null)
    setLocalPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 4. 포스트잇 제출/수정 핸들러 (이미지 URL 누락 방지 및 비동기 순서 보장)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !question || !token) return

    const trimmedContent = content.trim()

    if (!trimmedContent && !imageFile && !localPreviewUrl) {
      alert('내용이나 사진을 작성해 주세요!')
      return
    }

    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      alert(`나눔 내용은 최대 ${MAX_CONTENT_LENGTH}자까지 작성할 수 있어요.`)
      return
    }

    // 닉네임 로컬 저장 (다음 질문에서도 자동 유지)
    if (authorName.trim()) {
      localStorage.setItem('participant_name', authorName.trim())
    }

    setLoading(true)
    let finalImageUrl: string | null = null

    // 1단계: 신규 이미지 파일이 있는 경우 -> 압축 및 Storage 업로드
    if (imageFile) {
      try {
        const compressedFile = await compressImage(imageFile)
        const fileExt = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const filePath = `${room.id}/${crypto.randomUUID()}.${fileExt}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(filePath, compressedFile, {
            contentType: imageFile.type || 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          console.error('Storage 업로드 실패:', uploadError)
          alert('이미지 업로드에 실패했습니다.')
          setLoading(false)
          return
        }

        // 업로드 성공 후 getPublicUrl 호출
        const { data: publicUrlData } = supabase.storage
          .from('post-images')
          .getPublicUrl(filePath)

        if (!publicUrlData?.publicUrl) {
          console.error('Storage Public URL 추출 실패')
          alert('이미지 업로드에 실패했습니다.')
          setLoading(false)
          return
        }

        finalImageUrl = publicUrlData.publicUrl
        console.log('이미지 업로드 성공:', finalImageUrl)

        // 이전 이미지가 존재하고 새 이미지로 교체된 경우, 이전 Storage 파일 정리
        if (existingPost?.image_url && existingPost.image_url !== finalImageUrl) {
          try {
            const oldUrl = new URL(existingPost.image_url)
            const pathSegments = oldUrl.pathname.split('/post-images/')
            if (pathSegments.length > 1) {
              const oldFilePath = pathSegments[1]
              await supabase.storage.from('post-images').remove([oldFilePath])
            }
          } catch (delErr) {
            console.warn('이전 Storage 파일 정리 예외 (무시 가능):', delErr)
          }
        }
      } catch (err: any) {
        console.error('Storage 업로드 실패:', err)
        alert('이미지 업로드에 실패했습니다.')
        setLoading(false)
        return
      }
    } else if (localPreviewUrl) {
      // 2단계: 이미지 파일 변경은 없지만 기존 프리뷰(기존 업로드 URL)가 유지되어 있는 경우 -> getPostImageUrl로 안전한 전체 URL 보장
      finalImageUrl = getPostImageUrl(existingPost?.image_url || localPreviewUrl)
    } else {
      // 3단계: 이미지가 없거나 사용자가 삭제한 경우
      finalImageUrl = null
    }

    // 2단계: DB UPDATE 또는 INSERT 쿼리 실행
    if (existingPost) {
      // 기존 포스트잇 수정 (UPDATE)
      const { data, error } = await supabase
        .from('posts')
        .update({
          author_name: authorName.trim() || null,
          content: trimmedContent,
          image_url: finalImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPost.id)
        .select()
        .maybeSingle()

      if (error) {
        console.error('포스트잇 수정 오류:', error)
        alert(`수정 처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
      } else if (data) {
        setExistingPost(data)
        setLocalPreviewUrl(getPostImageUrl(data.image_url) || null)
        setImageFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        setIsSubmitted(true)
      }
    } else {
      // 신규 포스트잇 제출 (INSERT)
      const { data, error } = await supabase
        .from('posts')
        .insert({
          room_id: room.id,
          question_id: question.id,
          author_name: authorName.trim() || null,
          content: trimmedContent,
          image_url: finalImageUrl,
          participant_token: token,
        })
        .select()
        .maybeSingle()

      if (error) {
        console.error('포스트잇 제출 오류:', error)
        alert(`제출 처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`)
      } else if (data) {
        setExistingPost(data)
        setLocalPreviewUrl(getPostImageUrl(data.image_url) || null)
        setImageFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        setIsSubmitted(true)
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
        <main className="min-h-screen bg-violet-50/40 flex flex-col items-center justify-center p-6 text-center space-y-5 font-sans relative">
          <div className="text-6xl animate-bounce">⏳</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-purple-950 [font-family:'Gamja_Flower',sans-serif]">
            진행자가 나눔을 시작하기 전입니다
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
            환영합니다, <strong className="text-purple-900 font-extrabold">{authorName || '참가자'}</strong>님! 🐥<br />
            대형 화면에서 [나눔 시작하기] 버튼을 누르면 질문 작성 창이 자동으로 열립니다.
          </p>

          <button
            type="button"
            onClick={() => {
              setTempNickname(authorName)
              setShowNicknameModal(true)
            }}
            className="text-xs font-semibold text-purple-900/70 hover:text-purple-950 underline cursor-pointer pt-2"
          >
            닉네임 수정하기
          </button>

          {/* 닉네임 최초 입력 / 수정 모달 */}
          {showNicknameModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white/95 backdrop-blur-md rounded-[24px] p-6 sm:p-8 max-w-sm w-full space-y-5 shadow-2xl border border-purple-100 text-slate-800 text-left">
                <div className="text-center space-y-2">
                  <div className="text-4xl">🐥</div>
                  <h2 className="text-xl font-black text-purple-950">나눔에 오신 것을 환영해요!</h2>
                  <p className="text-xs text-slate-500">
                    모임에서 사용할 이름이나 닉네임을 입력해 주세요.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = tempNickname.trim()
                    if (!name) {
                      alert('이름이나 닉네임을 입력해 주세요!')
                      return
                    }
                    setAuthorName(name)
                    localStorage.setItem('participant_name', name)
                    setShowNicknameModal(false)
                  }}
                  className="space-y-4"
                >
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={20}
                    placeholder="예: 요한, 든든한 나무"
                    value={tempNickname}
                    onChange={(e) => setTempNickname(e.target.value)}
                    className="w-full h-[52px] px-4 rounded-xl border border-purple-200 bg-purple-50/40 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white transition-all"
                  />

                  <button
                    type="submit"
                    className="w-full h-[52px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 text-base transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>입장하기 🚀</span>
                  </button>
                </form>
              </div>
            </div>
          )}
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
        <main className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans">
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
      <main className="min-h-screen bg-violet-50/40 p-4 sm:p-6 flex flex-col items-center justify-center text-slate-800 font-sans">
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
              {/* 닉네임 뱃지 표시 (입력란 숨김) */}
              <div className="flex items-center justify-between bg-purple-50/80 p-3.5 rounded-xl border border-purple-100 text-xs">
                <div className="flex items-center gap-2 font-bold text-purple-950">
                  <span>🐥</span>
                  <span>작성자:</span>
                  <span className="text-purple-900 bg-white px-2.5 py-0.5 rounded-md border border-purple-200/80 font-extrabold text-xs">
                    {authorName || '익명'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTempNickname(authorName)
                    setShowNicknameModal(true)
                  }}
                  className="text-slate-400 hover:text-purple-900 font-medium underline text-[11px] cursor-pointer"
                >
                  닉네임 변경
                </button>
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
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200 transition-all cursor-pointer"
                />
                {localPreviewUrl && (
                  <div className="mt-3 relative w-full h-44 rounded-2xl overflow-hidden bg-slate-100 border border-purple-100 group shadow-inner flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={localPreviewUrl}
                      alt="첨부 이미지 미리보기"
                      className="w-full h-full object-cover rounded-2xl"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      title="사진 삭제"
                      className="absolute top-2.5 right-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shadow-md"
                    >
                      ✕
                    </button>
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

        {/* 닉네임 입력 모달 (IN_PROGRESS 화면 중 닉네임 변경 시 또는 최초 입력 시) */}
        {showNicknameModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-[24px] p-6 sm:p-8 max-w-sm w-full space-y-5 shadow-2xl border border-purple-100 text-slate-800">
              <div className="text-center space-y-2">
                <div className="text-4xl">🐥</div>
                <h2 className="text-xl font-black text-purple-950">나눔에 오신 것을 환영해요!</h2>
                <p className="text-xs text-slate-500">
                  모임에서 사용할 이름이나 닉네임을 입력해 주세요.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = tempNickname.trim()
                  if (!name) {
                    alert('이름이나 닉네임을 입력해 주세요!')
                    return
                  }
                  setAuthorName(name)
                  localStorage.setItem('participant_name', name)
                  setShowNicknameModal(false)
                }}
                className="space-y-4"
              >
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={20}
                  placeholder="예: 요한, 든든한 나무"
                  value={tempNickname}
                  onChange={(e) => setTempNickname(e.target.value)}
                  className="w-full h-[52px] px-4 rounded-xl border border-purple-200 bg-purple-50/40 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-900 focus:bg-white transition-all"
                />

                <button
                  type="submit"
                  className="w-full h-[52px] bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-950 hover:to-indigo-950 text-white font-bold rounded-xl shadow-md shadow-purple-900/20 text-base transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>입장하기 🚀</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  )
}