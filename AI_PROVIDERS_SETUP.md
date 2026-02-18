# Multi-Provider AI Setup Guide

This app now supports multiple AI providers to avoid rate limits and provide redundancy.

## Supported Providers

### 1. Google Gemini (Default)
- **Models**: gemini-3-flash-preview, gemini-2.5-flash, gemini-2.5-pro
- **Free Tier**: 15 requests per minute
- **Environment Variable**: `GEMINI_API_KEY` or `GOOGLE_API_KEY`

### 2. Moonshot Kimi (K2.5 Free)
- **Models**: kimi-k2.5-free
- **Free Tier**: 3 requests per minute
- **Get API Key**: https://platform.moonshot.cn/
- **Environment Variable**: `KIMI_API_KEY` or `MOONSHOT_API_KEY`

### 3. MiniMax
- **Models**: MiniMax-Text-01
- **Environment Variable**: `MINIMAX_API_KEY`
- **Get API Key**: https://www.minimaxi.com/

## Setup Instructions

### Local Development (.env file)
Create or edit your `.env` file:

```bash
# Google Gemini (Primary)
GEMINI_API_KEY=your_gemini_key_here

# Moonshot Kimi (Fallback)
KIMI_API_KEY=your_kimi_key_here

# MiniMax (Fallback)
MINIMAX_API_KEY=your_minimax_key_here
```

### Vercel Deployment
1. Go to your Vercel Dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each API key:
   - Name: `GEMINI_API_KEY`, Value: your key
   - Name: `KIMI_API_KEY`, Value: your key
   - Name: `MINIMAX_API_KEY`, Value: your key
5. Redeploy your project

## How It Works

1. **Primary Provider**: The app tries your selected provider first
2. **Auto-Fallback**: If the primary provider is rate-limited or fails, it automatically switches to the next available provider
3. **Provider Priority**: gemini → kimi → minimax

## Switching Providers

Go to **Settings** tab in the app to:
- View which providers are available
- Select your preferred provider
- See real-time provider status

## Rate Limits

- **Gemini**: ~15 requests/minute (free tier)
- **Kimi**: ~3 requests/minute (free tier)
- **MiniMax**: Varies by plan

The app tracks rate limits and automatically falls back to prevent errors.
