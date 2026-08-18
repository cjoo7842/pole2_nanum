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
      // Supabase join 결과 명확한 타입 처리 (any 제거)
      const formatted: CompletedRoom[] = (data as RawRoomResponse[]).map((item) => ({
        ...item,
        templates: Array.isArray(item.templates) ? item.templates[0] : item.templates,
      }))
      setRooms(formatted)
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchCompletedRooms()
  }, [fetchCompletedRooms])

  return (
    <div className="space-y-6">
      {/* 상단 헤더 */}
      <div>
        <h1 className="text-2xl font-black text-amber-950">모임 히스토리 📜</h1>
        <p className="text-xs text-slate-500 mt-1">
          종료된 모임의 목록과 각 모임에서 작성된 따뜻한 나눔 포스트잇 및 사진 기록을 조회할 수 있습니다.
        </p>
      </div>

      {/* 리스트 표 / 카드리스트 */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-medium animate-pulse">
          모임 기록을 불러오는 중입니다...
        </div>
      ) : rooms.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white space-y-2">
          <p className="text-2xl">🍃</p>
          <p className="text-slate-600 font-bold">종료된 모임이 아직 없습니다.</p>
          <p className="text-xs text-slate-400">모임이 진행된 후 종료되면 이곳에 히스토리가 기록됩니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
                  <th className="py-3.5 px-5">방 코드</th>
                  <th className="py-3.5 px-5">사용된 템플릿</th>
                  <th className="py-3.5 px-5">모임 일시</th>
                  <th className="py-3.5 px-5 text-right">상세보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {rooms.map((room) => (
                  <tr
                    key={room.id}
                    onClick={() => router.push(`/admin/history/${room.id}`)}
                    className="hover:bg-amber-50/40 transition-colors group cursor-pointer"
                  >
                    <td className="py-4 px-5">
                      <span className="font-mono font-bold bg-amber-100 text-amber-900 text-xs px-2.5 py-1 rounded-md">
                        {room.room_code}
                      </span>
                    </td>
                    <td className="py-4 px-5 font-bold text-slate-800">
                      {room.templates?.title || '자율 나눔 (템플릿 없음)'}
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
                      <Link
                        href={`/admin/history/${room.id}`}
                        className="inline-block px-3.5 py-1.5 bg-slate-100 group-hover:bg-amber-500 group-hover:text-white text-slate-700 font-bold rounded-xl text-xs transition-all shadow-sm"
                      >
                        기록 보기 →
                      </Link>
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