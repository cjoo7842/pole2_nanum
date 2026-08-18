'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Template } from '@/types/database'

export default function AdminDashboardPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTemplates = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('templates').select('*').order('created_at', { ascending: false })
      if (data && data.length > 0) {
        setTemplates(data)
        setSelectedTemplateId(data[0].id) // 기본 선택
      }
      setLoading(false)
    }
    fetchTemplates()
  }, [])

  const handleStartRoomWithTemplate = () => {
    if (!selectedTemplateId) {
      alert('템플릿을 선택해 주세요.')
      return
    }
    // 선택한 templateId를 쿼리 파라미터로 포함하여 메인 화면으로 이동
    router.push(`/?templateId=${selectedTemplateId}`)
  }

  if (loading) return <div className="p-8 text-center text-slate-400">대시보드 불러오는 중...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-6">
      <h1 className="text-2xl font-black text-slate-900">관리자 대시보드</h1>
      
      {/* Today's Sharing Start Section */}
      <section className="bg-amber-50 border border-amber-200 rounded-3xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-amber-950">✨ 오늘 나눔 시작하기</h2>
        <p className="text-xs text-amber-800">
          사용할 질문 템플릿을 선택한 후 모임을 열어보세요.
        </p>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">질문 템플릿 선택</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleStartRoomWithTemplate}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow transition-all text-sm"
        >
          선택한 템플릿으로 모임 개설하러 가기 →
        </button>
      </section>
    </div>
  )
}