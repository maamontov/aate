---
name: aate-context
description: Полный контекст проекта AATE (Almost A Third Eye) — браузерная социальная игра 1v1. Используй этот навык при работе с кодом AATE для понимания архитектуры, правил игры, стека технологий, структуры файлов и конвенций.
---

# AATE — Контекст проекта

## Языковая конвенция

**Все комментарии в коде, описания функций, JSDoc — на русском языке.** Переменные, функции и типы остаются на английском (это код), но все пояснения пишутся по-русски.

## Обзор проекта

AATE (Almost A Third Eye) — браузерная социальная игра 1v1, где игроки пытаются угадать, как другой человек ответит на каверзный вопрос про отношения. Цель — не найти «правильный» ответ, а проверить взаимопонимание между игроками.

## Технологический стек

| Слой | Технология |
|------|------------|
| Фронтенд | TypeScript, PixiJS (визуал/анимации), socket.io-client, чистый DOM для UI |
| Бэкенд | Node.js + TypeScript, Socket.IO, Express (healthcheck/статика) |
| Общие типы | TypeScript-протокол (`shared/protocol.ts`) |
| Деплой | Docker Compose, Nginx reverse proxy, Let's Encrypt HTTPS |
| Вопросы | Локальный JSON-файл (`questions/relations.ru.json`) |

## Структура файлов

```
aate/
├── docker-compose.yml
├── CORE_LOOP.md          # Правила игры и фазы раунда
├── DEPLOY.md             # Гайд по деплою на VPS
├── PITCH.md              # Питч продукта
├── TECH_PLAN.md          # Технический план архитектуры
├── shared/
│   └── protocol.ts       # Общие типы/события клиент-сервер
├── questions/
│   └── relations.ru.json # Банк вопросов (40+)
├── server/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts      # Точка входа сервера
│       ├── events.ts     # Обработчики socket-событий
│       └── types.ts      # Серверные типы
├── client/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.ts       # Точка входа клиента
│       ├── socket.ts     # Socket.IO клиент
│       ├── host.ts       # Host Screen
│       ├── play.ts       # Player Phone
│       ├── state.ts      # Состояние клиента
│       ├── events.ts     # Клиентские обработчики
│       ├── baseEvents.ts # Базовые события
│       ├── timer.ts      # Таймер
│       ├── pixiHint.ts   # Хелперы PixiJS
│       └── types.ts      # Клиентские типы
└── deploy/
    └── nginx/
```

## Архитектура

Одна комната = один матч. Сервер авторитетен для состояния (in-memory).

- **Host Screen** (`/host`, `/host/room/:roomCode`): общий экран матча. Управляет лобби/стартом.
- **Player Phone** (`/play`, `/play/room/:roomCode`): личный экран. Два игрока.

## Правила игры

### Роли
- **Активный игрок** — выбирает реальный ответ на вопрос.
- **Угадывающий** — предсказывает ответ активного. Роли меняются каждый раунд.

### Фазы раунда
1. **question** — Показ вопроса + 3 варианта.
2. **answering** — Активный игрок выбирает 1/2/3 (скрыто).
3. **guessing** — Угадывающий предсказывает выбор.
4. **reveal** — Сравнение, +1 за совпадение.
5. **Переход** — Смена ролей, next или `finished`.

### Конец матча
Колода сыграна (10/20/40) → победитель = больше очков. Равенство = ничья.

### Таймер
Серверный. Не успел → пропуск, раунд пустой, игра дальше.

## Socket-события

### Клиент → Сервер
| Событие | Данные |
|---------|--------|
| `host:create_room` | `{ deckSize }` |
| `player:join_room` | `{ roomCode, nickname }` |
| `host:start_match` | `{ roomCode }` |
| `player:submit_active_answer` | `{ roomCode, value: 1|2|3 }` |
| `player:submit_guess_answer` | `{ roomCode, value: 1|2|3 }` |
| `client:reconnect_room` | `{ roomCode, roleHint, nickname }` |

### Сервер → Клиент
`room:created`, `room:updated`, `match:started`, `round:phase_changed`, `round:revealed`, `score:updated`, `match:finished`, `error:domain`

**Принцип**: после действия — полный снимок комнаты.

## Модель состояния комнаты

```typescript
{
  roomCode: string;
  hostSocketId: string | null;
  players: {
    playerA: { socketId, nickname, score };
    playerB: { socketId, nickname, score };
  };
  deckSize: 10 | 20 | 40;
  questions: Question[];
  currentRoundIndex: number;
  phase: "lobby" | "question" | "answering" | "guessing" | "reveal" | "finished";
  activePlayer: "playerA" | "playerB";
  selections: {
    activeAnswer: 1 | 2 | 3 | null;
    guessAnswer: 1 | 2 | 3 | null;
  };
  phaseDeadlineTs: number | null;
}
```

## Схема вопросов

```json
{
  "id": "q_001",
  "text": "Как бы ты предпочел(а) провести идеальный вечер?",
  "options": ["Тихо дома вдвоем", "Активно и вне дома", "Спонтанно, без планов"],
  "tags": ["relations", "lifestyle"]
}
```

Правила: 3 варианта, без «правильного» ответа, неоднозначные.

## Docker-сборка

- Контекст `.` (корень), Dockerfile'ы в `server/` и `client/`.
- Серверу нужны: `server/package.json`, `server/tsconfig.json`, `server/src/`, `shared/`, `questions/`.
- Клиенту нужны: `client/package.json`, `client/tsconfig.json`, `client/index.html`, `client/src/`, `shared/`.
- `shared/` обязателен — `server/src/` импортирует `../../shared/protocol.js`.
- `tsconfig.json`: `rootDir: ".."`, shared компилируется в `dist/shared/`.
- Клиент: nginx:1.27-alpine runtime.

## Конвенции

- Тексты/вопросы на русском.
- `localStorage` → только `lastNickname`.
- Состояние только на сервере (in-memory, без БД).
- Rate-limiting на join/submit.
- Валидация всех payload.
- Ограничения ника.

## Дизайн

- Минимализм, воздух, фокус на тексте.
- Деликатные анимации фаз.
- Скорость чтения > декор.
- Короткие сессии, быстрый старт, без регистрации.
