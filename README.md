# 신준호 개발 포트폴리오

한국어 중심의 개인 포트폴리오 사이트입니다. Cloudflare Pages에 배포하며, Supabase PostgreSQL과 Realtime을 사용합니다. 프로필/포트폴리오/연구 기록은 데이터베이스에 보관되므로 새로고침해도 유지되고, 새로 등록되거나 수정되면 연결된 방문자의 화면에 실시간으로 반영됩니다.

## 포함 기능

- 홈: 프로필 사진/설명, 최근 포트폴리오, 최근 연구 기록, GitHub 및 Hugging Face 링크
- 포트폴리오/연구 기록: 최신순·오래된순 정렬, 나열 보기·자세히 보기, 긴 내용 펼치기, 사진 첨부, 링크 미리보기 카드 및 YouTube/Vimeo/CodePen/Figma 임베드
- 관리자 인증: 서버 환경변수로 비밀번호 확인, 1시간 만료 HttpOnly 쿠키 세션
- 관리자 작업: 프로필 사진(1MB 이하)·설명 변경, 포트폴리오/연구 기록 등록·수정·검색·다중 삭제. 포트폴리오와 연구 기록은 링크와 사진(최대 5MB, 미리보기)을 선택사항으로 첨부할 수 있습니다. 저장/등록/삭제 시 오너 비밀번호를 다시 확인합니다.
- 실시간 표시: Supabase Realtime으로 DB 변경 감지
- 접근 제어: 브라우저 공개 키에는 읽기 권한만 부여하며, 쓰기 권한 키는 서버 환경변수에만 저장

## 1. Supabase 데이터베이스 설정

1. [Supabase](https://supabase.com/)에서 프로젝트를 만듭니다.
2. 프로젝트의 **SQL Editor**를 엽니다.
3. 이 저장소의 `supabase/schema.sql` 전체를 붙여넣고 실행합니다.
4. 프로젝트의 **Project Settings → API Keys**에서 프로젝트 URL, 브라우저용 Publishable key(또는 legacy `anon` key), 서버 전용 `service_role` JWT 키를 확인합니다.
   - 브라우저용 publishable/anon 키는 `config.js`에 들어가므로 공개 키만 사용하세요.
   - **서버 전용 키는 `service_role` JWT 키를 사용하고 절대 `config.js` 또는 GitHub에 넣지 마세요.**
5. Supabase Realtime 설정에서 SQL이 `profiles`, `portfolios`, `research_records` 테이블을 `supabase_realtime` publication에 넣었는지 확인합니다. SQL에서 자동으로 추가하도록 작성되어 있습니다.

## 2. 공개 설정 수정

`config.js`를 열어 다음 네 값을 바꿉니다.

- `supabaseUrl`: Supabase 프로젝트 URL
- `supabasePublishableKey`: Supabase publishable key 또는 legacy anon key
- `huggingFaceUrl`: 본인의 Hugging Face 프로필 URL
- `githubUrl`: 본인의 GitHub 프로필 URL

이 파일에는 관리자 비밀번호, Supabase `service_role` 키, 세션 서명을 위한 비밀값을 절대로 넣지 마세요. 브라우저에 전달되는 `config.js`는 누구나 볼 수 있습니다.

## 3. 관리자 비밀번호와 서버 비밀값 설정

Cloudflare Pages 프로젝트의 **Settings → Variables and Secrets**로 들어가 아래 값을 추가합니다. 관리자 비밀번호는 이전에 정한 값을 `ADMIN_PASSWORD`의 값으로 직접 입력하세요. 소스 코드/`config.js`에는 적지 않습니다.

| 변수 이름 | 종류 | 값 |
|---|---|---|
| `ADMIN_PASSWORD` | Secret | 관리자 비밀번호 |
| `ADMIN_SESSION_SECRET` | Secret | 32자 이상 무작위 문자열 |
| `SUPABASE_URL` | Variable | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Supabase의 legacy `service_role` JWT 키 |

`ADMIN_SESSION_SECRET`은 예를 들어 PowerShell에서 다음 명령으로 생성할 수 있습니다.

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

결과를 `ADMIN_SESSION_SECRET`에 넣으세요. 이 값 역시 GitHub에 올리면 안 됩니다. 변수를 추가하거나 바꾼 뒤에는 새 배포를 진행해야 새 설정이 적용됩니다.

## 4. Cloudflare Pages에 배포

1. 프로젝트 파일 전체를 GitHub 저장소에 올립니다.
2. Cloudflare 대시보드에서 **Workers & Pages → Create → Pages → Connect to Git**으로 GitHub 저장소를 연결합니다.
3. 프레임워크 프리셋은 **None** 또는 정적 사이트로 설정합니다.
4. Build command는 비워두고, Build output directory는 `.`로 설정합니다. 루트의 `index.html`이 사이트 진입점이며 `functions/`의 API는 Cloudflare Pages Functions로 배포됩니다.
5. 배포가 완료되면 프로젝트 URL에서 사이트를 열어 확인합니다.
6. 위의 서버 환경변수/Secret을 모두 설정한 후 다시 배포합니다.

공식 참고: [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Pages Functions bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/).

## 5. Windows에서 로컬 실행 (VS Code)

PowerShell을 프로젝트 폴더에서 열고 아래 명령을 실행합니다.

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

`.dev.vars`에서 플레이스홀더를 실제 값으로 바꿉니다. `.dev.vars`는 `.gitignore`에 포함되어 GitHub로 올라가지 않습니다. 그다음 실행합니다.

```powershell
npx wrangler pages dev .
```

처음 실행할 때 Wrangler 설치를 물어보면 안내에 따라 설치합니다. 로컬에서 관리자 로그인과 글쓰기를 테스트하려면 `.dev.vars` 안에 `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 모두 설정해야 합니다.

## 보안 참고

- 관리자 비밀번호는 서버 기능에서만 확인합니다. 프런트엔드 파일에 비밀번호를 포함하지 않습니다.
- 성공한 로그인은 1시간 후 만료되는 `HttpOnly; SameSite=Strict` 쿠키를 사용하며 JavaScript에서 세션 토큰을 읽을 수 없습니다.
- 브라우저의 Supabase 공개 키는 보안 비밀이 아닙니다. SQL에서 공개 키에 읽기 권한만 부여했고, 쓰기 작업은 서버 Function이 세션을 확인한 다음 수행합니다.
- 비밀번호를 입력하는 본인 브라우저의 개발자 도구에서는 로그인 요청 내용을 관찰할 수 있을 수 있습니다. 어떤 웹사이트도 사용자가 직접 연 개발자 도구에서 입력값을 완전히 감출 수는 없습니다. 비밀번호를 코드/저장소에 노출하지 않고 HTTPS로 전송하는 것이 핵심입니다.
- 공개 사이트를 운영하기 전에는 관리자 비밀번호를 충분히 길고 고유하게 설정하고, Cloudflare에서 로그인 API에 대한 Rate Limiting 규칙을 추가하는 것을 권장합니다.
- 사진 첨부는 Supabase Storage의 공개 `record-images` 버킷과 `photo_url` 컬럼을 사용합니다. 이미 DB를 설정했다면 `supabase/photo-attachments-migration.sql`을 Supabase SQL Editor에서 실행하세요. 업로드된 이미지는 URL을 아는 누구나 볼 수 있으므로 공개해도 되는 사진만 첨부하세요.
- 링크 미리보기는 저장된 URL을 안전하게 표시합니다. YouTube, Vimeo, CodePen, Figma 링크는 지원되는 형식일 때 iframe 임베드를 표시하고, 그 외(예: GitHub/Hugging Face)는 클릭 가능한 미리보기 카드로 표시합니다. 일부 외부 서비스는 임베드를 제한할 수 있으며, 이 경우 원본 사이트에서 열기 링크를 사용할 수 있습니다. 사이트 전체의 원본 링크는 iframe으로 무조건 열지 않아 임의의 외부 페이지가 페이지 안에서 실행되는 위험을 줄였습니다.
- 관리자 비밀번호 변경 UI는 포함하지 않았습니다.

## 사용자 이름 / 프로필

표시 이름은 요청에 따라 `신준호`로 고정되어 있으며 관리자 폼에서 바꿀 수 없습니다. 소개 문구는 처음 실행할 때 보이는 기본 문구이므로 첫 프로필 설명 변경 시 원하는 문구로 바꾸면 됩니다.
