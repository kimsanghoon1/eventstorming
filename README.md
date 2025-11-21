# EventStorming Tool

Event Storming 및 UML 다이어그램 생성을 위한 협업 도구입니다. Vue 3 + Vite 기반의 웹 애플리케이션과 AI 에이전트를 통해 코드 역공학 및 다이어그램 자동 생성을 지원합니다.

## 주요 기능

- 🎨 **이벤트스토밍 캔버스**: 드래그 앤 드롭으로 Event, Command, Policy 등을 배치
- 🔗 **직교 연결선**: 수평/수직 세그먼트 핸들로 자유롭게 경로 편집
- 🤖 **AI 에이전트**: 코드 분석 및 자동 다이어그램 생성
- 💾 **실시간 협업**: Y.js 기반 실시간 동기화
- 📊 **UML 다이어그램**: 클래스 다이어그램, 시퀀스 다이어그램 지원

## 설치 및 실행

### 사전 요구사항

- Node.js: `^20.19.0` 또는 `>=22.12.0`
- Python: `3.11+` (AI 에이전트용)
- uv: Python 패키지 관리자

### 1. 의존성 설치

```bash
# Node.js 패키지 설치
npm install

# Python 패키지 설치 (uv 사용)
uv sync
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 필요한 환경 변수를 설정하세요:

```bash
# OpenAI API 키 (AI 에이전트용)
OPENAI_API_KEY=your_api_key_here

# 기타 설정
PORT=3000
```

### 3. 개발 서버 실행

```bash
# 모든 서비스 동시 실행 (권장)
npm run dev

# 또는 개별 실행
npm run dev:server  # Express 서버만
npm run dev:client  # Vite 클라이언트만
```

서버가 실행되면 `http://localhost:5173` 에서 애플리케이션에 접속할 수 있습니다.

### 4. 빌드 (프로덕션)

```bash
# 타입 체크 + 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 프로젝트 구조

```
eventstorming/
├── src/
│   ├── components/        # Vue 컴포넌트
│   │   ├── canvas-items/  # 캔버스 아이템 (연결선, 객체)
│   │   ├── EventCanvas.vue
│   │   └── UmlCanvas.vue
│   ├── store.ts           # 상태 관리 (Y.js)
│   ├── types.ts           # TypeScript 타입 정의
│   └── utils/
│       └── canvas.ts      # 캔버스 유틸리티 함수
├── orchestrator_agent/    # 오케스트레이터 AI 에이전트
├── eventstorming_agent/   # 이벤트스토밍 AI 에이전트
├── uml_agent/            # UML AI 에이전트
├── server.js             # Express 백엔드
└── vite.config.ts        # Vite 설정
```

## 사용 방법

### 연결선 편집

1. 연결선을 클릭하여 선택
2. 세그먼트 중앙에 나타나는 흰색 핸들을 드래그
3. 수평 세그먼트는 위아래로, 수직 세그먼트는 좌우로만 이동 가능
4. 연결선 끝점은 자동으로 가장 가까운 면에 스냅됨

### AI 에이전트 사용

1. 코드 역공학: ZIP 파일 업로드 → 자동 다이어그램 생성
2. 요구사항 기반 생성: 텍스트 입력 → AI가 이벤트스토밍 다이어그램 생성

## 기술 스택

- **Frontend**: Vue 3, TypeScript, Vite, Konva.js
- **Backend**: Express.js, Y.js (WebSocket)
- **AI**: OpenAI GPT-4, Python
- **협업**: Y.js (CRDT 기반 실시간 동기화)

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.
