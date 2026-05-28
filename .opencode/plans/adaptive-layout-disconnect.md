# Plan: Адаптивная верстка, позиционирование игроков, вертикальные варианты, disconnect

## 1. `client/index.html` — CSS

### Хост-панель: адаптивные размеры
- `.panel` на хосте — растянуть на весь экран: `width: 96vw; max-width: 1200px; min-height: 90vh`
- `.question-text` — `clamp(28px, 4vw, 48px)` вместо фиксированных 36px
- `.option-card` — `clamp(18px, 2.5vw, 28px)` вместо 22px
- `.room-code` — `clamp(36px, 6vw, 72px)` вместо 48px

### Блок игроков внизу карточки
```css
.players-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0 0;
  margin-top: auto;
  border-top: 1px solid #ececec;
}
.player-info {
  font-size: clamp(18px, 2.5vw, 28px);
  font-weight: 600;
}
.player-score {
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 700;
  margin-left: 8px;
}
```

### Игрок (телефон): вертикальные варианты
```css
.choices-vertical {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.choices-vertical button {
  padding: 20px;
  font-size: 20px;
  border-radius: 12px;
}
```

---

## 2. `client/src/host.ts`

### HTML lobby section
- Убрать `<p id="status-lobby">` (текст "A: ... | B: ..." в лобби)
- Игроки теперь внизу карточки через `<div class="players-bar">`

### HTML game section
- Добавить `<div id="players-bar" class="players-bar">` в конец `section-game`
- Внутри два `<div class="player-info">` — ник слева/справа + балл

### Логика `room:updated`
- Заполнять `#player-a-info` и `#player-b-info` отдельно
- Формат: `Ник` + отдельно `Балл` (без скобок)
- Игрок A слева, игрок B справа

---

## 3. `client/src/play.ts`

### Удалить
- `<p id="room-info">` из HTML
- `setRoomInfo()` функцию
- Вызовы `setRoomInfo()` в обработчиках
- `<button id="disconnect">` из HTML
- Весь блок `// --- Отключение ---`
- Импорт `resetState` (если больше не используется)

### Вертикальные варианты
- Заменить `c.innerHTML` с `<div class="row">` на `<div class="choices-vertical">`
- Убрать класс `.row` из `#choices`

### Адаптивность
- Панель `.panel` на мобильном — `width: 96vw; padding: 16px`
- Кнопки вариантов — крупнее (padding 20px, font-size 20px)

---

## 4. `server/src/index.ts` — disconnect логика

### Текущее поведение (строки 291-321)
При disconnect любого (host/player) → пауза 30с → потом finished.

### Новое поведение
- Если отключился **игрок** (playerA или playerB) во время активной игры (phase !== "lobby" && phase !== "finished") → сразу finished
- Если отключился **host** → оставить паузу как есть (30с)
- Убрать `disconnectedSockets`, `pauseTimers`, `PAUSE_ON_DISCONNECT_MS` если станут не нужны для host... Нет, для host пауза остаётся, значит всё оставляем, но для игроков меняем логику.

### Изменение в `socket.on("disconnect")`
```typescript
socket.on("disconnect", () => {
  for (const [roomCode, room] of rooms.entries()) {
    const isHost = room.hostSocketId === socket.id;
    const isA = room.playerA?.socketId === socket.id;
    const isB = room.playerB?.socketId === socket.id;
    if (!isHost && !isA && !isB) continue;

    if ((isA || isB) && room.phase !== "lobby" && room.phase !== "finished") {
      // Игрок отключился во время игры — сразу завершаем
      clearRoomTimer(roomCode);
      room.phase = "finished";
      room.phaseDeadlineTs = null;
      scoreWinner(room);
      io.to(roomCode).emit(SERVER_TO_CLIENT.matchFinished, { winner: room.winner, reason: "player_disconnect" });
      emitRoom(roomCode);
    } else if (isHost) {
      // Host отключился — пауза 30с как раньше
      // ...existing pause logic...
    }
    break;
  }
});
```

---

## Затронутые файлы

| Файл | Что |
|------|-----|
| `client/index.html` | Адаптивные размеры, `.players-bar`, `.choices-vertical`, `.player-info` |
| `client/src/host.ts` | Блок игроков внизу, отдельные ник+балл, убрать status-lobby |
| `client/src/play.ts` | Убрать room-info + disconnect, вертикальные варианты |
| `server/src/index.ts` | Disconnect игрока → сразу finished |
