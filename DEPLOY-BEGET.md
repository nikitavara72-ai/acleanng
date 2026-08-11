# Перенос chistodom.store на Beget VPS

Vercel отпадает: его IP режутся из российских сетей, сайт не открывается
без VPN. Настройками это не лечится. Ниже — полный перенос на твой VPS
`46.173.26.113`. Домен остаётся тот же, менять придётся одну DNS-запись.

Время: около часа, если порт 80 откроется без сюрпризов.

---

## 1. Подключиться и посмотреть, что там есть

```bash
ssh root@46.173.26.113
```

```bash
cat /etc/os-release          # какая система
node -v                      # есть ли node и какой
nginx -v                     # есть ли nginx
systemctl is-active nginx
```

Проекту нужен **Node 20 или новее** (Next 16 на более старых не соберётся).

## 2. Поставить Node, если его нет или он старый

Для Ubuntu/Debian:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
```

## 3. Залить код

Вариант через git (удобнее для будущих обновлений) — заведи репозиторий
и склонируй. Либо напрямую с ноутбука, из папки проекта в PowerShell:

```powershell
scp -r app components lib public package.json jsconfig.json next.config.mjs root@46.173.26.113:/var/www/chistodom/
```

`node_modules` и `.next` не копируй — соберём на сервере.

## 4. Собрать

```bash
cd /var/www/chistodom
npm ci --omit=dev || npm install --omit=dev
npm install --include=dev    # для сборки нужен и dev-набор
npm run build
```

Сборка в режиме standalone (`VERCEL` не задан — значит включается сама).
Дальше надо доложить статику, Next её отдельно не копирует:

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

Проверка, что вообще запускается:

```bash
cd .next/standalone && PORT=3000 node server.js
```

В другом терминале: `curl -I http://127.0.0.1:3000` → должен быть `200`.
Останови (`Ctrl+C`) и иди дальше.

## 5. Переменные окружения

```bash
nano /var/www/chistodom/.next/standalone/.env
```

```
TELEGRAM_BOT_TOKEN=токен_от_BotFather
TELEGRAM_CHAT_ID=id_чата
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=chistodom72@yandex.ru
SMTP_PASS=пароль_приложения
MAIL_TO=chistodom72@yandex.ru
SITE_URL=https://chistodom.store
```

```bash
chmod 600 /var/www/chistodom/.next/standalone/.env
```

Права важны: в файле лежат токен бота и пароль почты.

## 6. systemd — чтобы сайт поднимался сам

```bash
nano /etc/systemd/system/chistodom.service
```

```ini
[Unit]
Description=Chistodom Next.js
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/chistodom/.next/standalone
EnvironmentFile=/var/www/chistodom/.next/standalone/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
chown -R www-data:www-data /var/www/chistodom
systemctl daemon-reload
systemctl enable --now chistodom
systemctl status chistodom
```

`HOSTNAME=127.0.0.1` — приложение слушает только локально, наружу его
пускает nginx. Так снаружи не достучаться до 3000 порта мимо прокси.

## 7. nginx

```bash
apt install -y nginx
nano /etc/nginx/sites-available/chistodom
```

```nginx
server {
    listen 80;
    server_name chistodom.store www.chistodom.store;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # картинки и статика — отдаём надолго
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/chistodom /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
curl -I http://127.0.0.1
```

`X-Forwarded-For` обязателен — без него rate-limit на форме будет видеть
все заявки как приходящие с одного адреса и заблокирует реальных людей.

## 8. Порт 80 снаружи — твоя старая проблема

Раньше он не отвечал. Проверяй по порядку:

```bash
ss -tlnp | grep ':80'        # слушает ли nginx на 0.0.0.0
ufw status                    # локальный фаервол
iptables -L -n | head -20
```

Если `ufw` активен:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

Если локально всё открыто, а снаружи тишина — фаервол на стороне Beget.
Он настраивается **в панели управления Beget**, не на сервере. Ищи раздел
с брандмауэром или firewall для VPS и открой 80 и 443. Если не найдёшь —
пиши в их поддержку, вопрос решается за пару минут.

Проверка снаружи (с ноутбука):

```powershell
Test-NetConnection 46.173.26.113 -Port 80
```

Нужен `TcpTestSucceeded : True`. Пока его нет — дальше идти бессмысленно.

## 9. Перевести домен на сервер

Reg.ru → Мои домены → chistodom.store → Управление зоной.

Удали A-запись, которая указывает на Vercel, и поставь:

| Тип | Субдомен | Значение |
|---|---|---|
| A | @ | `46.173.26.113` |
| A | www | `46.173.26.113` |

CNAME на Vercel для `www` тоже удали.

Проверка через 15–60 минут:

```powershell
nslookup chistodom.store
```

Должен вернуться `46.173.26.113`.

В Vercel домен можно отвязать, чтобы он не пытался выпускать сертификат.

## 10. HTTPS

Только после того, как домен реально указывает на сервер:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d chistodom.store -d www.chistodom.store
```

Certbot сам поправит конфиг nginx и настроит редирект с http на https.
Продление автоматическое, проверить: `certbot renew --dry-run`.

**До получения сертификата не открывай сайт по https** — приложение шлёт
заголовок HSTS, браузер его запомнит и потом будет отказываться заходить
по http, пока не почистишь настройки сайта вручную.

## 11. Проверить, что всё живо

```bash
curl -I https://chistodom.store
curl -s https://chistodom.store/robots.txt
curl -s -o /dev/null -w "%{http_code}\n" https://chistodom.store/works/kitchen-after.jpg
```

И с телефона **без VPN** — главная проверка, ради которой всё затевалось.

Форму заполни сам: заявка должна прийти в телеграм.

## Обновление сайта потом

```bash
cd /var/www/chistodom
# залить новые файлы (git pull или scp)
npm install --include=dev
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
systemctl restart chistodom
```

Имеет смысл сложить это в `deploy.sh` на сервере и запускать одной командой.

## После запуска

- Яндекс.Вебмастер: подтвердить права, добавить sitemap, **выставить регион Тюмень**
- Google Search Console: то же самое
- Проверить «Статистику обхода» через неделю — теперь бот дойдёт,
  сервер российский
