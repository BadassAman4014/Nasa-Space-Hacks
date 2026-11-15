# NASA Space Hacks Deployment Guide

This project uses a split architecture:
- **Frontend**: React/Vite on Vercel
- **Backend**: FastAPI on Render

## Deployment Steps

### 1. Backend Deployment (Render)

#### Prerequisites:
- Render account (https://render.com)
- NASA Earthdata account (optional, for real-time data)
- Google Gemini API key (for AI assistant)

#### Steps:
1. **Push code to GitHub**
2. **Connect to Render**:
   - Go to Render dashboard
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will detect `render.yaml` automatically

3. **Set Environment Variables in Render**:
   - `EARTHDATA_USERNAME` - NASA Earthdata username (optional)
   - `EARTHDATA_PASSWORD` - NASA Earthdata password (optional)
   - `EARTHDATA_TOKEN` - NASA Earthdata token (optional)
   - `GEMINI_API_KEY` - Google Gemini API key
   - `GEMINI_MODEL` - gemini-3.8-flash (default)
   - `CORS_ORIGINS` - Update with your Vercel frontend URL after deployment

4. **Deploy**:
   - Render will build and deploy automatically
   - Note the backend URL (e.g., `https://nasa-space-hacks-backend.onrender.com`)

### 2. Frontend Deployment (Vercel) - ✅ COMPLETED

**Your Vercel URL**: `https://app-smoky-tau-52.vercel.app`

#### Next Steps:
1. **Set Environment Variables in Vercel**:
   - Go to Vercel dashboard → Project Settings → Environment Variables
   - Add: `VITE_API_BASE_URL` = `https://nasa-space-hacks-backend.onrender.com/api`
   - Add: `VITE_PUBLIC_API_URL` = `https://nasa-space-hacks-backend.onrender.com/api`

2. **Redeploy Frontend**:
   - After setting variables, trigger a redeploy
   - Or push any change to GitHub to trigger auto-deploy

### 3. Testing the Deployment

1. **Frontend**: Visit your Vercel URL
2. **Backend Health Check**: `{backend-url}/health`
3. **API Test**: `{backend-url}/api/health`

## Environment Variables Reference

### Backend (Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `EARTHDATA_USERNAME` | No | NASA Earthdata username |
| `EARTHDATA_PASSWORD` | No | NASA Earthdata password |
| `EARTHDATA_TOKEN` | No | NASA Earthdata bearer token |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GEMINI_MODEL` | No | Gemini model (default: gemini-3.8-flash) |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `DATA_DIR` | No | Data directory path (default: /data) |

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Backend API URL |
| `VITE_PUBLIC_API_URL` | No | Fallback backend URL |

## Troubleshooting

### Backend Issues:
1. **Build fails on Render**:
   - Check Dockerfile dependencies
   - Increase build timeout if needed
   - Check Python version compatibility

2. **NASA API errors**:
   - Verify Earthdata credentials
   - Check NASA API status
   - Project uses cached data if API unavailable

3. **CORS errors**:
   - Verify `CORS_ORIGINS` includes frontend URL
   - Check for trailing slashes
   - Restart backend after updating CORS

### Frontend Issues:
1. **API calls fail**:
   - Verify `VITE_API_BASE_URL` is correct
   - Check browser console for errors
   - Test backend directly with curl

2. **Build errors**:
   - Check Node.js version compatibility
   - Verify all dependencies in package.json

## Development vs Production

### Local Development:
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
npm install
npm run dev
```

### Production:
- Backend: Automatic deployment via Render
- Frontend: Automatic deployment via Vercel
- Data: Persistent storage on Render disk
