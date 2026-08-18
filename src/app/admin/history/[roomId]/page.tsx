'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Room, Question, Post } from '@/types/database'

interface QuestionWithPosts extends Question {
  posts: Post[]
}

export default function AdminHistoryDetailPage() {
  const params = useParams()
  // useParams의 안전한 문자열 추출
  const roomId = typeof params?.roomId === 'string' ? params.roomId : Array.isArray(params?.roomId) ? params.roomId[0] : ''

  const [room, setRoom] = useState<Room | null>(null)
  const [questionsWithPosts, setQuestionsWithPosts] = useState<QuestionWithPosts[]>([])
  const [unassignedPosts, setUnassignedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  // 이미지 크게보기 모달 상태
  const [selectedImagePost, setSelectedImagePost] = useState<Post | null>(null)

  // 모임 정보 및 질문/포스트잇 데이터 로드
  const fetchData = useCallback(async () => {
    if (!roomId) return
    setLoading(true)

    const supabase = createClient()

    // 1. 방 정보 조회
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    setRoom(roomData)

    // 2. 해당 방의 질문 목록 조회
    let questionsData: Question[] = []
    if (roomData?.template_id) {
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('template_id', roomData.template_id)
        .order('step_order', { ascending: true })

      if (qData) questionsData = qData
    }

    // 3. 해당 방의 모든 포스트잇 조회
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    const allPosts: Post[] = postsData || []

    // 4. 질문별로 포스트잇 그룹화 (타입 명시: p: Post)
    const grouped: QuestionWithPosts[] = questionsData.map((q) => ({
      ...q,
      posts: allPosts.filter((p: Post) => p.question_id === q.id),
    }))

    // 질문 정보에 포함되지 않은 포스트잇 분리 (타입 명시: p: Post)
    const assignedQuestionIds = new Set(questionsData.map((q) => q.id))
    const unassigned = allPosts.filter(
      (p: Post) => !p.question_id || !assignedQuestionIds.has(p.question_id)
    )

    setQuestionsWithPosts(grouped)
    setUnassignedPosts(unassigned)
    setLoading(false)
  }, [roomId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 관리자용 포스트잇 삭제
  const handleDeletePost = async (postId: string) => {
    if (!confirm('이 포스트잇을 삭제하시겠습니까?\n삭제된 포스트잇은 복구할 수 없습니다.')) {
      return
    }

    const supabase = createClient()
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      console.error('포스트잇 삭제 오류:', error)
      alert('포스트잇 삭제 중 오류가 발생했습니다.')
    } else {
      // 로컬 상태에서 제거 (타입 명시: p: Post)
      setQuestionsWithPosts((prev) =>
        prev.map((q) => ({
          ...q,
          posts: q.posts.filter((p: Post) => p.id !== postId),
        }))
      )
      setUnassignedPosts((prev) => prev.filter((p: Post) => p.id !== postId))
      if (selectedImagePost?.id === postId) {
        setSelectedImagePost(null)
      }
    }
  }

  // CORS 에러 방지 안전 이미지 다운로드
  const handleDownloadImage = async (imageUrl: string, authorName: string) => {
    try {
      const response = await fetch(imageUrl, { mode: 'cors' })
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `나눔사진_${authorName || '참가자'}.jpg`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('이미지 직접 다운로드 실패 (CORS 정책 등):', error)
      window.open(imageUrl, '_blank')
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 font-medium animate-pulse">
        모임 상세 기록을 불러오는 중입니다...
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 상단 헤더 */}
      <div>
        <Link
          href="/admin/history"
          className="text-xs font-bold text-slate-400 hover:text-amber-600 flex items-center gap-1 mb-2"
        >
          ← 모임 히스토리 목록으로
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-amber-950">
            모임 기록 상세
          </h1>
          <span className="font-mono text-xs font-bold bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
            방 코드: {room?.room_code}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {room?.created_at &&
            new Date(room.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
        </p>
      </div>

      {/* 질문별 포스트잇 갤러리 섹션 */}
      {questionsWithPosts.map((q) => (
        <section key={q.id} className="space-y-3">
          <div className="border-b border-amber-200/60 pb-2 flex items-baseline gap-2">
            <span className="text-xs font-bold bg-amber-500 text-white px-2.5 py-0.5 rounded-full">
              Q{q.step_order}
            </span>
            <h2 className="text-lg font-bold text-slate-800">{q.title}</h2>
            <span className="text-xs text-slate-400 ml-auto">
              {q.posts.length}개의 나눔
            </span>
          </div>

          {q.posts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-2xl bg-white">
              이 질문에는 제출된 포스트잇이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {q.posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onDelete={handleDeletePost}
                  onImageClick={() => setSelectedImagePost(post)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* 질문에 속하지 않은 포스트잇이 있을 경우 예외 처리 */}
      {unassignedPosts.length > 0 && (
        <section className="space-y-3 pt-4">
          <div className="border-b border-slate-200 pb-2 flex items-baseline gap-2">
            <h2 className="text-base font-bold text-slate-600">기타 포스트잇</h2>
            <span className="text-xs text-slate-400">
              {unassignedPosts.length}개
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {unassignedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDelete={handleDeletePost}
                onImageClick={() => setSelectedImagePost(post)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 원본 이미지 확대 및 다운로드 모달 */}
      {selectedImagePost && selectedImagePost.image_url && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {selectedImagePost.author_name || '익명'} 님의 사진
                </h3>
                {selectedImagePost.content && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                    &quot;{selectedImagePost.content}&quot;
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedImagePost(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-hidden rounded-2xl bg-slate-100 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImagePost.image_url}
                alt="포스트잇 첨부 이미지"
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedImagePost(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm"
              >
                닫기
              </button>
              <button
                onClick={() =>
                  handleDownloadImage(
                    selectedImagePost.image_url!,
                    selectedImagePost.author_name || '참가자'
                  )
                }
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm shadow flex items-center justify-center gap-1.5"
              >
                <span>💾</span> 사진 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 개별 포스트잇 카드 컴포넌트
function PostCard({
  post,
  onDelete,
  onImageClick,
}: {
  post: Post
  onDelete: (id: string) => void
  onImageClick: () => void
}) {
  return (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3 relative group">
      {/* 상단 작성자 및 삭제 버튼 */}
      <div className="flex items-center justify-between border-b border-amber-200/50 pb-2">
        <span className="text-xs font-black text-amber-900">
          {post.author_name || '익명'}
        </span>
        <button
          onClick={() => onDelete(post.id)}
          className="text-[11px] font-bold text-slate-300 hover:text-red-500 transition-colors"
        >
          삭제
        </button>
      </div>

      {/* 이미지 썸네일 */}
      {post.image_url && (
        <div
          onClick={onImageClick}
          className="relative h-32 rounded-xl overflow-hidden bg-slate-100 cursor-pointer group/img"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image_url}
            alt="첨부된 사진"
            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200"
          />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
            🔍 크게보기
          </div>
        </div>
      )}

      {/* 내용 */}
      {post.content && (
        <p className="text-xs font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
          {post.content}
        </p>
      )}

      {/* 일시 */}
      <div className="text-[10px] text-slate-400 text-right pt-1">
        {new Date(post.created_at).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  )
}