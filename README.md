# Getex Messenger (Full-Stack)

Полностью рабочий мессенджер на базе вашего UI-дизайна:
- регистрация и логин (JWT)
- реальные пользователи
- реальные чаты и сообщения
- realtime через Socket.io
- голосовые и видеозвонки через WebRTC (с Socket сигналингом)
- поиск пользователей
- группы и каналы
- истории (image/video, просмотренные/непросмотренные)
- отправка файлов, изображений, видео и голосовых из памяти устройства
- профиль и настройки
- уведомления о сообщениях и звонках

## Технологии
- Frontend: Next.js (React, TypeScript), ваш существующий UI
- Backend: Node.js, Express
- Realtime: Socket.io
- Calls: WebRTC + Socket сигналинг
- Database: MongoDB (через Mongoose)
  - если `MONGO_URI` не задан, автоматически поднимается in-memory MongoDB (`mongodb-memory-server`)

## Структура проекта
```text
getex/
  app/
    layout.tsx
    page.tsx
    globals.css
  components/
    getex/
      login-form.tsx
      topbar.tsx
      chat-sidebar.tsx
      chat-area.tsx
      settings-panel.tsx
      call-overlay.tsx
      aurora-background.tsx
      announcement-banner.tsx
      ...
    ui/
      ...
  lib/
    client/
      api.ts
      socket.ts
      webrtc.ts
      types.ts
    utils.ts
  public/
    ...
  server/
    index.js
    app.js
    db.js
    config/
      env.js
    middleware/
      auth.js
      error.js
    models/
      User.js
      Message.js
      DirectChat.js
      Call.js
      Session.js
      Group.js
      GroupMessage.js
      Story.js
    routes/
      auth.js
      users.js
      chats.js
      groups.js
      stories.js
      calls.js
    services/
      auth.js
      socket.js
      tls.js
      presence.js
  .env.example
  package.json
  next.config.mjs
```

## БД (аналог требуемых таблиц)
### `users`
- `id` (`_id`)
- `username`
- `name`
- `phone`
- `password_hash` (`passwordHash`)
- `avatar`
- `created_at` (`createdAt`)

### `messages`
- `id` (`_id`)
- `sender_id` (`senderId`)
- `receiver_id` (`receiverId`)
- `text`
- `type` (`text` / `voice` / `image` / `video` / `file`)
- `created_at` (`createdAt`)

### `groups`
- `id` (`_id`)
- `kind` (`group` / `channel`)
- `name`
- `avatar`
- `members`
- `created_at` (`createdAt`)

### `group_messages`
- `id` (`_id`)
- `groupId`
- `senderId`
- `text`
- `type` (`text` / `voice` / `image` / `video` / `file`)
- `created_at` (`createdAt`)

### `stories`
- `id` (`_id`)
- `userId`
- `type` (`image` / `video`)
- `mediaUrl`
- `viewedBy`
- `expiresAt`

### `calls`
- `id` (`_id`)
- `caller`
- `receiver`
- `type` (`voice` / `video`)
- `status`

## API
### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/qr/request`
- `GET /api/auth/qr/status/:challengeId?secret=...`
- `POST /api/auth/qr/approve`
- `GET /api/auth/me`
- `GET /api/auth/check-username?username=...`
- `POST /api/auth/logout`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/:sessionId`
- `POST /api/auth/sessions/revoke-others`

### Users
- `GET /api/users/search?q=...` (username/phone)
- `PUT /api/users/profile`
- `PUT /api/users/password`

### Chats / Messages
- `GET /api/chats`
- `POST /api/chats/start`
- `GET /api/messages/:userId`
- `POST /api/messages`

### Groups / Channels
- `GET /api/groups?kind=group|channel`
- `POST /api/groups`
- `PUT /api/groups/:groupId/avatar`
- `GET /api/groups/:groupId/messages`
- `POST /api/groups/:groupId/messages`

### Stories
- `GET /api/stories`
- `POST /api/stories`
- `POST /api/stories/:storyId/view`

### Calls
- `GET /api/calls`

### Health
- `GET /api/health`

## Socket.io события
- `message:send` / `message:new`
- `group:message:send` / `group:message:new`
- `typing:start` / `typing:stop`
- `presence:update`
- `call:start`, `call:incoming`, `call:outgoing`, `call:accept`, `call:accepted`, `call:decline`, `call:declined`, `call:end`, `call:ended`
- `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`

## Запуск
1. Установить зависимости:
```bash
npm install
```

2. (Опционально) создать `.env` по примеру `.env.example`.

3. Запустить (одной командой):
```bash
npm start
```

`npm start` автоматически:
- делает production build,
- запускает production сервер без dev-индикаторов,
- поднимает HTTPS (self-signed сертификат).

Открывайте:
- `https://localhost:3000` (локально)
- `https://<IP_вашего_ПК>:3000` (в вашей сети)

## HTTPS примечание
- Сертификат генерируется автоматически в `.cert/` при первом запуске.
- Браузер может показать предупреждение о доверии к self-signed сертификату. Это нормально для локального окружения.
- Для камеры/микрофона и QR-сканера откройте сайт именно по `https://...`, примите сертификат и дайте разрешения браузера.

## Примечания
- Сервер слушает `HOST`/`PORT` и работает не только на localhost.
- Для видеозвонков браузер запросит доступ к камере/микрофону.
- Для notifications разрешите уведомления в браузере.
