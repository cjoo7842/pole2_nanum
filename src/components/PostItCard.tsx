'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Post } from '@/types/database'

interface PostItCardProps {
  post: Post
  onClick?: () => void
  index?: number
}

const PASTEL_COLORS = [
  'bg-amber-100 border-amber-200 text-amber-950', // 옐로우
  'bg-rose-100 border-rose-200 text-rose-950',   // 핑크
  'bg-sky-100 border-sky-200 text-sky-950',       // 블루
  'bg-emerald-100 border-emerald-200 text-emerald-950', // 그린
  'bg-purple-100 border-purple-200 text-purple-950', // 퍼플
]

const ROTATIONS = ['-rotate-1', 'rotate-1', '-rotate-2', 'rotate-2', 'rotate-0']

export const PostItCard: React.FC<PostItCardProps> = ({ post, onClick, index = 0 }) => {
  const colorClass = PASTEL_COLORS[index % PASTEL_COLORS.length]
  const rotationClass = ROTATIONS[index % ROTATIONS.length]

  // [수정] 명세서: "지목이 완료된 포스트잇은 그리드 바탕 화면에서 시각적으로 완벽히 제거/투명화"
  // 기존 코드는 is_selected일 때 오히려 ring/scale로 강조하고 "지목됨" 배지를 붙여
  // 명세서와 반대로 동작했음. 이제 지목 완료 카드는 클릭 불가 + 투명/축소 처리하여
  // 그리드에서 사실상 사라진 것처럼 보이게 한다.
  //
  // 참고: AnimatePresence로 감싸 그리드에서 완전히 unmount(제거)하는 방식이 더 깔끔하지만,
  // 그건 부모(host/[roomId]/page.tsx)에서 posts.filter(p => !p.is_selected)로 처리하는 걸 권장.
  // 이 컴포넌트 자체도 방어적으로 "혹시 필터링 전에 렌더링되더라도" 시각적으로 사라지도록 처리한다.
  if (post.is_selected) {
    return (
      <motion.div
        initial={false}
        animate={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="pointer-events-none min-h-[160px]"
        aria-hidden="true"
      />
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03, rotate: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`relative p-4 rounded-lg shadow-md border cursor-pointer transition-all ${colorClass} ${rotationClass} flex flex-col justify-between min-h-[160px]`}
    >
      {/* 카드 상단 핀 디테일 */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-rose-500 rounded-full shadow-sm border border-rose-600 z-10" />

      {/* 포스트잇 본문 및 이미지 */}
      <div className="space-y-2 mt-1">
        {post.image_url && (
          <div className="relative w-full h-28 rounded-md overflow-hidden bg-black/5">
            <img
              src={post.image_url}
              alt="포스트잇 첨부 이미지"
              className="w-full h-full object-cover"
            />
          </div>
        )}
        {post.content && (
          <p className="text-sm font-medium whitespace-pre-wrap break-words line-clamp-4 leading-relaxed">
            {post.content}
          </p>
        )}
      </div>

      {/* 작성자 이름 */}
      <div className="mt-3 text-right">
        <span className="text-xs font-bold opacity-75">
          - {post.author_name || '익명'}
        </span>
      </div>
    </motion.div>
  )
}
