# SJH Portfolio 코드 검토 및 업데이트 요약

## 현재 프로젝트 구조
- `index.html`: 단일 페이지 구조, 홈/포트폴리오/연구 기록, 공용 관리자 모달
- `app.js`: Supabase 공개 데이터 조회, 실시간 반영, 관리자 화면, 등록/수정/삭제 UI, 사진 미리보기, 링크 프리뷰 렌더링
- `functions/api/auth.js`, `logout.js`, `_utils.js`: 서버 비밀번호 인증, HttpOnly 세션 쿠키, URL 검증 및 Supabase 서버 요청 도우미
- `functions/api/admin.js`: 세션/Origin 검증 후 프로필 변경, 포트폴리오·연구 기록 등록/수정/다중 삭제, 서버 측 사진 업로드
- `supabase/schema.sql`: 테이블/RLS, 공개 읽기, Storage 버킷 및 Realtime 설정
- `config.js`: 공개 Supabase URL/publishable 키 및 외부 프로필 링크(서버 비밀키를 둘 곳 아님)

## 반영된 기능
1. 포트폴리오/연구 기록에 사진을 선택 첨부할 수 있고, 선택 즉시 미리보기가 보입니다.
2. 사진은 PNG/JPG/WebP/GIF, 최대 5MB입니다. 서버에서도 형식·크기를 검증하며, 이미지는 `record-images` Storage 버킷에 저장됩니다.
3. 링크와 사진은 모두 선택사항입니다. 기존 기록 수정에서는 현재 사진을 미리 보여주고 새 사진을 선택하면 교체합니다.
4. 사진은 홈의 최근 기록과 목록 카드에 렌더링됩니다.
5. YouTube/Vimeo/CodePen/Figma에 대해서는 알려진 임베드 URL로 실제 임베드를 표시하고, 원본 링크를 함께 제공합니다.
6. GitHub/Hugging Face/기타 URL은 iframe에 무조건 넣지 않고, 제목·도메인·경로가 표시되는 클릭형 미리보기 카드로 제공합니다.
7. 기존 관리자 인증, 저장 시 재인증, 기록 수정, 검색/다중 삭제 흐름은 유지했습니다.

## 배포·DB 적용 주의
- 기존 Supabase DB에는 `supabase/photo-attachments-migration.sql`을 먼저 SQL Editor에서 실행합니다. 이때 `photo_url` 열, 포트폴리오 `link`의 NULL 허용, `record-images` 버킷을 추가합니다.
- 이 변경은 GitHub에 커밋하지 않았습니다. ZIP의 파일을 사용자가 직접 업로드/커밋하면 됩니다.
- 실제 Cloudflare 배포, Storage 업로드 권한, 외부 provider별 embed 응답은 운영 환경에서 별도로 확인해야 합니다.
- `config.js`의 publishable key는 브라우저 공개 키입니다. `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`은 GitHub에 절대 추가하지 마세요.
