# Cara Ambil ID dan Token

## 1. Ambil Discord Bot Token
1. Buka Discord Developer Portal.
2. Pilih Application bot kamu.
3. Masuk menu Bot.
4. Klik Reset Token / Copy Token.
5. Isi ke `bot/.env`:
```env
DISCORD_BOT_TOKEN=TOKEN_KAMU
```

## 2. Ambil Client ID
1. Developer Portal.
2. General Information.
3. Copy Application ID.
4. Isi:
```env
DISCORD_CLIENT_ID=APPLICATION_ID
```

## 3. Ambil Guild ID / Server ID
1. Discord Settings.
2. Advanced.
3. Aktifkan Developer Mode.
4. Klik kanan server.
5. Copy Server ID.
6. Isi:
```env
DISCORD_GUILD_ID=SERVER_ID
DEFAULT_GUILD_ID=SERVER_ID
```

## 4. Invite Bot
OAuth2 > URL Generator:
- Scope: `bot`, `applications.commands`
- Permission: Administrator sementara untuk testing.

Buka URL invite, masukkan bot ke server.

## 5. Setting Channel
Jalankan bot, lalu pakai `/setup` di server.
