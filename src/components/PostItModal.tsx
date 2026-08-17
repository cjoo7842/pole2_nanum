'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Post } from '@/types/database'

interface PostItModalProps {
  isOpen: boolean
  post: Post | null
  onClose: () => void
  // [추가] 명세서: "팝업 하단의 [다음 사람 지목] 버튼 클릭 시 기존 팝업이 닫히며,
  // 남은 포스트잇 중 무작위 1개가 다시 화면 전체에 크게 팝업."
  // 기존 코드는 이 버튼이 없어 onClose(단순 닫기)만 존재했음.
  // onNext는 host/[roomId]/page.tsx의 handlePickRandomPost를 그대로 연결하면 됨
  // (그 함수가 이미 "미지목 0개 → 완료 모달" 분기까지 처리하고 있음).
  onNext: () => void
}

export const PostItModal: React.FC<PostItModalProps> = ({ isOpen, post, onClose, onNext }) => {
  if (!isOpen || !post) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm">
      {/* 배경 클릭 시 닫기 */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* 모달 팝업 본체 */}
      {/* [수정] 명세서: "화면 중앙에 거의 꽉 채워지는 대형 팝업 모달"
          기존 max-w-lg(~512px)는 진행자용 대형 화면 기준으로 너무 작았음.
          max-w-4xl + 세로도 화면의 대부분을 채우도록 확장, 내부 요소도 비례해서 확대. */}
      <motion.div
        initial={{ scale: 0.75, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.75, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-amber-50 rounded-3xl p-8 sm:p-12 shadow-2xl border-2 border-amber-200 z-10 space-y-8"
      >
        {/* 상단 핀 굵은 장식 */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-rose-500 rounded-full border-2 border-rose-700 shadow-md" />

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors text-2xl font-bold p-2"
        >
          ✕
        </button>

        {/* 작성자 이름 */}
        <div className="border-b border-amber-200/80 pb-4">
          <span className="text-sm font-semibold text-amber-800 tracking-wider uppercase">
            지목된 나눔
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-amber-950 mt-1">
            {post.author_name || '익명'} 님의 나눔
          </h2>
        </div>

        {/* 이미지 첨부 영역 */}
        {post.image_url && (
          <div className="relative w-full max-h-[45vh] rounded-2xl overflow-hidden bg-amber-100 border border-amber-200/60 shadow-inner flex items-center justify-center">
            <img
              src={post.image_url}
              alt="지목된 나눔 이미지"
              className="w-full h-full object-contain max-h-[45vh] rounded-2xl"
            />
          </div>
        )}

        {/* 나눔 본문 내용 */}
        {post.content && (
          <div className="bg-white/80 rounded-2xl p-6 border border-amber-200/50 min-h-[120px] shadow-sm">
            <p className="text-lg sm:text-xl text-slate-800 whitespace-pre-wrap leading-relaxed font-medium">
              {post.content}
            </p>
          </div>
        )}

        {/* 하단 버튼 영역 */}
        {/* [수정] 기존엔 onClose 하나만 있었음 → "경청 완료" 확인용 보조 버튼(onClose)과
            "다음 사람 지목"으로 이어가는 주 버튼(onNext)을 분리 */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="sm:flex-1 py-3.5 px-4 bg-white hover:bg-amber-100 text-amber-900 font-bold rounded-xl border border-amber-200 shadow-sm transition-colors text-center"
          >
            함께 경청했습니다 👏
          </button>
          <button
            onClick={onNext}
            className="sm:flex-[2] py-4 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-extrabold rounded-xl shadow-md transition-colors text-center text-lg"
          >
            다음 사람 지목 🎲
          </button>
        </div>
      </motion.div>
    </div>
  )
}
