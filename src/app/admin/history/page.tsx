'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface TemplateRelation {
  title: string
}

interface CompletedRoom {
  id: string
  room_code: string
  created_at: string
  status: string
  template_id: string | null
  templates: TemplateRelation | null
}

// Supabase 원본 응답 타입 (1:N 조인 가능성에 대한 처리용)
interface RawRoomResponse {
  id: string
  room_code: string
  created_at: string
  status: string
  template_id: string | null
  templates: TemplateRelation | TemplateRelation[] | null
}

export default function AdminHistoryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [rooms, setRooms] = useState<CompletedRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)
  const [isCleaningUp, setIsCleaningUp] = useState(false)

  // 종료된 방 목록 불러오기
  const fetchCompletedRooms = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('rooms')
      .select(`
        id,
        room_code,
        created_at,
        status,
        template_id,
        templates (
          title
        )
      `)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('종료된 모임 불러오기 실패:', error)
      alert('모임 히스토리를 불러오는 중 오류가 발생했습니다.')
    } else if (data) {
      // Supabase join 결과 명확한 타입 처리
      const formatted: CompletedRoom[] = (data as RawRoomResponse[]).map((item) => ({
        ...item,
        templates: Array.isArray(item.templates) ? item.templates[0] : item.templates,
      }))
      setRooms(formatted)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchCompletedRooms()
  }, [fetchCompletedRooms])

  // 개별 모임 방 및 포스트잇 삭제
  const handleDeleteRoom = async (roomId: string, roomCode: string) => {
    if (deletingRoomId) return

    if (
      !confirm(
        `방 코드 [${roomCode}]의 모임 기록을 정말 삭제하시겠습니까?\n\n※ 포함된 모든 참가자의 포스트잇 및 사진도 완전히 삭제되며 복구할 수 없습니다.`
      )
    ) {
      return
    }

    setDeletingRoomId(roomId)

    try {
      // 1. 해당 방의 포스트잇 먼저 삭제
      const { error: postErr } = await supabase
        .from('posts')
        .delete()
        .eq('room_id', roomId)

      if (postErr) {
        console.error('포스트잇 삭제 실패:', postErr)
        throw new Error(`포스트잇 삭제 실패: ${postErr.message}`)
      }

      // 2. 방 삭제
      const { error: roomErr } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId)

      if (roomErr) {
        console.error('방 삭제 실패:', roomErr)
        throw new Error(`모임 방 삭제 실패: ${roomErr.message}`)
      }

      // 3. UI 상태 즉시 갱신
      setRooms((prev) => prev.filter((r) => r.id !== roomId))
      alert(`[${roomCode}] 모임 기록이 성공적으로 삭제되었습니다.`)
    } catch (err: any) {
      console.error('모임 삭제 중 오류 발생:', err)
      alert(`모임 기록 삭제 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setDeletingRoomId(null)
    }
  }

  // 템플릿이 삭제되어 남아있는 잔여 모임 일괄 정리
  const handleCleanupOrphanRooms = async () => {
    const orphanRooms = rooms.filter((r) => !r.template_id)
    if (orphanRooms.length === 0) return

    if (
      !confirm(
        `템플릿이 없는 잔여 모임 ${orphanRooms.length}개를 모두 삭제하시겠습니까?\n\n※ 연관된 모든 포스트잇과 사진 데이터도 함께 영구 삭제됩니다.`
      )
    ) {
      return
    }

    setIsCleaningUp(true)
    const orphanIds = orphanRooms.map((r) => r.id)

    try {
      // 1. 잔여 모임들의 포스트잇 삭제
      const { error: postErr } = await supabase
        .from('posts')
        .delete()
        .in('room_id', orphanIds)

      if (postErr) throw postErr

      // 2. 잔여 모임 방 삭제
      const { error: roomErr } = await supabase
        .from('rooms')
        .delete()
        .in('id', orphanIds)

      if (roomErr) throw roomErr

      // 3. UI 갱신
      setRooms((prev) => prev.filter((r) => r.template_id !== null))
      alert(`잔여 모임 ${orphanRooms.length}개가 깨끗하게 정리되었습니다.`)
    } catch (err: any) {
      console.error('잔여 모임 정리 중 오류:', err)
      alert(`잔여 모임 정리 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setIsCleaningUp(false)
    }
  }

  const orphanCount = rooms.filter((r) => !r.template_id).length

  return (
    <div className="space-y-6 font-sans">
      {/* 상단 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-purple-950">모임 히스토리 📜</h1>
          <p className="text-xs text-slate-500 mt-1">
            종료된 모임의 목록과 각 모임에서 작성된 따뜻한 나눔 포스트잇 및 사진 기록을 조회하고 관리하세요.
          </p>
        </div>

        {orphanCount > 0 && (
          <button
            type="button"
            disabled={isCleaningUp}
            onClick={handleCleanupOrphanRooms}
            className="self-start sm:self-auto px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-950 border border-purple-300/80 font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>🧹</span>
            {isCleaningUp ? '정리 중...' : `템플릿 없는 모임 정리 (${orphanCount}개)`}
          </button>
        )}
      </div>

      {/* 리스트 표 / 카드리스트 */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium animate-pulse">
          모임 기록을 불러오는 중입니다...
        </div>
      ) : rooms.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-purple-200/80 rounded-[20px] bg-white/80 space-y-2">
          <p className="text-2xl">🍃</p>
          <p className="text-slate-600 font-bold">종료된 모임이 아직 없습니다.</p>
          <p className="text-xs text-slate-400">모임이 진행된 후 종료되면 이곳에 히스토리가 기록됩니다.</p>
        </div>
      ) : (
        <div className="bg-white/95 backdrop-blur-md rounded-[20px] border border-purple-100/80 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_32px_rgba(88,28,135,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-purple-50/50 border-b border-purple-100 text-slate-600 text-xs font-bold">
                  <th className="py-3.5 px-5">방 코드</th>
                  <th className="py-3.5 px-5">사용된 템플릿</th>
                  <th className="py-3.5 px-5">모임 일시</th>
                  <th className="py-3.5 px-5 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {rooms.map((room) => (
                  <tr
                    key={room.id}
                    onClick={() => router.push(`/admin/history/${room.id}`)}
                    className="hover:bg-purple-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="py-4 px-5">
                      <span className="font-mono font-bold bg-purple-100 text-purple-900 text-xs px-2.5 py-1 rounded-md border border-purple-200/80">
                        {room.room_code}
                      </span>
                    </td>
                    <td className="py-4 px-5 font-bold text-slate-800">
                      {room.templates?.title ? (
                        room.templates.title
                      ) : (
                        <span className="text-slate-400 text-xs font-normal bg-slate-100 px-2 py-0.5 rounded">
                          템플릿 삭제됨 (기록 보존)
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-xs text-slate-500">
                      {new Date(room.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/history/${room.id}`}
                          className="inline-block px-3.5 py-1.5 bg-purple-50 group-hover:bg-purple-900 group-hover:text-white text-purple-900 font-bold rounded-xl text-xs transition-all shadow-xs border border-purple-200/60"
                        >
                          기록 보기 →
                        </Link>
                        <button
                          type="button"
                          disabled={deletingRoomId === room.id}
                          onClick={() => handleDeleteRoom(room.id, room.room_code)}
                          className="px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                        >
                          {deletingRoomId === room.id ? '삭제 중...' : '삭제'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}