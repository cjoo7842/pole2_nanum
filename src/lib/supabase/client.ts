// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

// 브라우저에서 Supabase 클라이언트를 싱글턴으로 관리합니다.
// createClient()를 여러 컴포넌트에서 반복 호출해도 항상 같은 인스턴스를 재사용하여,
// useCallback/useEffect의 의존성 배열이 매 렌더마다 바뀌어 무한 재요청 루프가
// 발생하는 문제를 원천적으로 방지합니다.
let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}