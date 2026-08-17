import { redirect } from 'next/navigation'

export default function RootPage() {
  // 메인 접속 시 진행자 랜딩 페이지(/host)로 자동 리다이렉트
  redirect('/host')
}