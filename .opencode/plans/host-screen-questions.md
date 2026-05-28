# Plan: Убрать заголовки, большой код комнаты, объединить фазу+таймер

## Изменения

### 1. `client/src/host.ts`

**Lobby section HTML:**
- Убрать `<h2>AATE — Конфигурация</h2>` и `<p class="muted">Создание комнаты...</p>`
- Добавить `<p id="room-code" class="room-code" style="display:none"></p>` — большой код по центру
- После `room:created` — показать `#room-code` с текстом `XXXX`
- После `match:started` или фазы !== lobby — скрыть `#room-code`

**Game section HTML:**
- Убрать `<h2>AATE — Матч</h2>`
- Убрать `<p id="state-game">`
- Заменить `<p id="timer">` на `<p id="phase-timer" class="phase-timer"></p>` — фаза · время, по центру
- Убрать `setStateGame` функцию

**`restartTimer`:**
- Маппинг фаз на русский:
  - `question` → Вопрос
  - `answering` → Ответ
  - `guessing` → Угадай
  - `reveal` → Раскрытие
  - `finished` → Конец
- Формат: `"Ответ · 12с"` (без "Таймер:")

### 2. `client/src/play.ts`

- Убрать `<h2>AATE — Подключение</h2>`
- Убрать `<h2>AATE — Игра</h2>`
- Заменить `#timer` на `#phase-timer` (аналогично host)
- Обновить `restartTimer` с тем же маппингом фаз

### 3. `client/index.html` — CSS

```css
.room-code {
  font-size: 48px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 8px;
  font-family: 'Courier New', monospace;
  margin: 24px 0;
}
.phase-timer {
  text-align: center;
  font-size: 16px;
  color: #4f4f4f;
  margin: 12px 0 4px;
}
```

## Файлы

| Файл | Что |
|------|-----|
| `client/src/host.ts` | Убрать заголовки, добавить room-code, объединить phase+timer |
| `client/src/play.ts` | Убрать заголовки, объединить phase+timer |
| `client/index.html` | CSS: `.room-code`, `.phase-timer` |
