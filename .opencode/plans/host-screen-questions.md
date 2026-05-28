# Plan: Host screen — вопросы, варианты, dropdown, старт-кнопка

## Контекст

Сервер уже отправляет полный объект `room` через `emitRoom()` (server/src/index.ts:43), включая `questions`, `activeAnswer`, `guessAnswer`. Но тип `PublicRoomState` в `shared/protocol.ts` их не объявляет — клиент не может к ним обратиться типобезопасно. Нужно:
1. Расширить протокол
2. Обрезать серверную эмиссию (не слать все вопросы, только текущий)
3. Отрендерить на host-экране

---

## Шаг 1: `shared/protocol.ts` — расширить `PublicRoomState`

Добавить в тип `PublicRoomState`:

```typescript
currentQuestion: { text: string; options: [string, string, string] } | null;
activeAnswer: 1 | 2 | 3 | null;
guessAnswer: 1 | 2 | 3 | null;
```

**Почему**: клиент получает эти данные от сервера, но тип их не описывает. Без этого изменения — нет типобезопасного доступа.

---

## Шаг 2: `server/src/index.ts` — обновить `emitRoom()`

Текущая реализация шлёт весь `room` (включая все вопросы колоды — спойлер). Заменить на публичный снимок:

```typescript
function emitRoom(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  const q = room.questions[room.currentRoundIndex] ?? null;
  const publicState = {
    roomCode: room.roomCode,
    phase: room.phase,
    deckSize: room.deckSize,
    playerA: room.playerA ? { nickname: room.playerA.nickname, score: room.playerA.score } : null,
    playerB: room.playerB ? { nickname: room.playerB.nickname, score: room.playerB.score } : null,
    activePlayer: room.activePlayer,
    currentRoundIndex: room.currentRoundIndex,
    phaseDeadlineTs: room.phaseDeadlineTs,
    paused: room.paused,
    pauseDeadlineTs: room.pauseDeadlineTs,
    winner: room.winner,
    currentQuestion: q ? { text: q.text, options: q.options } : null,
    activeAnswer: room.activeAnswer,
    guessAnswer: room.guessAnswer,
  };
  io.to(roomCode).emit(SERVER_TO_CLIENT.roomUpdated, publicState);
}
```

---

## Шаг 3: `client/index.html` — CSS для вопросов и вариантов

Добавить стили:

```css
/* Вопрос — крупный текст по центру */
.question-text {
  font-size: 36px;
  font-weight: 600;
  text-align: center;
  margin: 16px 0 24px;
  line-height: 1.35;
}

/* Варианты ответов — крупные карточки в ряд */
.options-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 16px 0;
}
.option-card {
  padding: 20px 14px;
  border: 2px solid #e6e6e6;
  border-radius: 12px;
  text-align: center;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.3;
  transition: border-color 200ms, background 200ms;
}
.option-card.selected-active { border-color: #f2c94c; background: #fef9e7; }
.option-card.selected-guess { border-color: #eb5757; background: #fde8e8; }
.option-card.match { border-color: #27ae60; background: #e8f8f0; }

/* Dropdown для выбора режима */
select#deck-size {
  font-size: 16px;
  padding: 12px;
  appearance: none;
  background-image: url("data:image/svg+xml,...chevron...");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

/* Скрыть старт пока не создана комната */
#start { display: none; }
#start.visible { display: block; }
```

---

## Шаг 4: `client/src/host.ts` — переработать HTML и логику

### Lobby section (замена 3 кнопок на dropdown + скрытый старт):

```html
<div id="section-lobby">
  <h2>AATE — Конфигурация</h2>
  <p class="muted">Создание комнаты и управление матчем.</p>
  <select id="deck-size">
    <option value="" disabled selected>Выберите режим игры</option>
    <option value="10">Быстрый (10 вопросов)</option>
    <option value="20">Средний (20 вопросов)</option>
    <option value="40">Полный (40 вопросов)</option>
  </select>
  <button id="create">Создать комнату</button>
  <button id="start">Старт матча</button>
  <hr />
  <p id="status-lobby" class="muted"></p>
  <p id="state-lobby" class="muted"></p>
</div>
```

Логика:
- `#deck-size` change → если выбрано, показать `#create`
- `#create` клик → `emit hostCreateRoom` с выбранным `deckSize`
- После `room:created` → скрыть `#deck-size` и `#create`, показать `#start`
- `#start` клик → `emit hostStartMatch`

### Game section (добавить отображение вопроса и вариантов):

```html
<div id="section-game" style="display:none">
  <h2>AATE — Матч</h2>
  <p id="status-game" class="muted"></p>
  <p id="state-game" class="muted"></p>
  <div id="question-area">
    <p id="question-text" class="question-text"></p>
    <div id="options-row" class="options-row">
      <div id="opt-1" class="option-card"></div>
      <div id="opt-2" class="option-card"></div>
      <div id="opt-3" class="option-card"></div>
    </div>
  </div>
  <p id="timer" class="muted"></p>
  <div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div>
</div>
```

Логика обновления в `room:updated`:

```typescript
const q = room.currentQuestion;
const questionText = document.querySelector("#question-text");
const questionArea = document.querySelector("#question-area");

if (q && room.phase !== "lobby") {
  questionArea.style.display = "";
  questionText.textContent = q.text;
  // отрендерить 3 опции
  for (let i = 0; i < 3; i++) {
    const card = document.querySelector(`#opt-${i + 1}`);
    card.textContent = q.options[i];
    card.className = "option-card";
    // Подсветка при reveal
    if (room.phase === "reveal") {
      if (room.activeAnswer === i + 1) card.classList.add("selected-active");
      if (room.guessAnswer === i + 1) card.classList.add("selected-guess");
      if (room.activeAnswer === i + 1 && room.guessAnswer === i + 1) card.classList.add("match");
    }
  }
} else {
  questionArea.style.display = "none";
}
```

---

## Затронутые файлы

| Файл | Тип изменения |
|------|--------------|
| `shared/protocol.ts` | Расширить `PublicRoomState` тремя полями |
| `server/src/index.ts` | `emitRoom()` → публичный снимок вместо raw room |
| `client/index.html` | Новые CSS: `.question-text`, `.options-row`, `.option-card`, dropdown |
| `client/src/host.ts` | Lobby: dropdown + скрытый старт. Game: вопрос + варианты |

---

## Вопросы

1. **Размер шрифта вопроса**: предложил 28px — нормально для host-экрана на большом экране? Или ещё крупнее (например, 36px)?
2. **Варианты ответов**: 18px текст в карточках — достаточно? Или тоже крупнее?
3. **Reveal-подсветка**: жёлтый = active, красный = guess, зелёный = совпадение — ок?
4. **Dropdown**: три варианта с описанием (Быстрый/Средний/Полный) — устраивает?
