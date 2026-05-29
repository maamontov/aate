# AATE — Deploy Guide (VPS)

## 1) Подготовка сервера
- Установи Docker + Docker Compose plugin.
- Настрой DNS: `aate.example.com` -> IP VPS.
- Открой порты `80` и `443`.

## 2) Запуск контейнеров
```bash
docker compose up -d --build
```

Проверка:
```bash
curl http://127.0.0.1:3001/health
```

## 3) Nginx + HTTPS
- Возьми шаблон `deploy/nginx/aate.conf.example`.
- Подставь свой домен вместо `aate.example.com`.
- Положи конфиг в `/etc/nginx/conf.d/aate.conf`.
- Выпусти сертификат Let's Encrypt (`certbot`), затем перезагрузи Nginx.

## 4) Smoke checks
- Открой `https://<домен>/host` для главного экрана.
- Открой `https://<домен>/play` на двух телефонах.
- Создай комнату, подключись, запусти матч, проверь смену фаз и reconnect.
