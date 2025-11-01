# Watch Party Frontend

Real-time synchronized YouTube video watching interface with drift compensation and beautiful UI.

---

## ✨ Features

- 🎥 **YouTube Video Integration**: Seamless YouTube IFrame API integration
- 🔄 **Real-Time Sync**: Sub-second synchronization across all viewers
- ⏱️ **Drift Compensation**: Automatic correction of playback drift
- 🎨 **Modern UI**: Beautiful interface built with shadcn/ui components
- 👥 **Live User Count**: See how many people are watching with you
- 🎮 **Custom Controls**: Synchronized play, pause, and seek controls
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- 🔒 **Autoplay Handling**: Smart browser autoplay policy management
- 🚫 **Click Protection**: Overlay prevents direct player interaction
- ⚡ **Fast & Optimized**: Tailwind CSS for minimal bundle size

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **Socket.io Client** | Real-time WebSocket communication |
| **YouTube IFrame API** | Video playback control |
| **shadcn/ui** | Component library (Radix UI primitives) |
| **Tailwind CSS** | Utility-first styling |
| **Lucide React** | Icon library |
| **Sonner** | Toast notifications |
| **CRACO** | Create React App configuration |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **npm** 8 or higher
- **Backend server** running (local or deployed)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/watchparty.git
   cd watchparty/Watch-Party/frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure backend URL**:
   
   Create `.env.local` for development:
   ```bash
   REACT_APP_BACKEND_URL=http://localhost:8001
   ```

4. **Start development server**:
   ```bash
   npm start
   ```

5. **Open browser**:
   ```
   http://localhost:3000
   ```

---

## 🔧 Environment Variables

### Development (`.env.local`)

```env
# Backend server URL for local development
REACT_APP_BACKEND_URL=http://localhost:8001

# Optional: Enable debug mode (default: enabled in development)
NODE_ENV=development
```

### Production (`.env.production`)

```env
# Backend server URL for production
REACT_APP_BACKEND_URL=https://watch-party-backend-vkj5.onrender.com

# Production mode (disables debug logging)
NODE_ENV=production
```

---

## 📁 Project Structure

```
frontend/
├── public/
│   └── index.html              ← HTML template
├── src/
│   ├── components/
│   │   ├── ui/                 ← shadcn/ui components (44 components)
│   │   │   ├── button.jsx
│   │   │   ├── card.jsx
│   │   │   ├── input.jsx
│   │   │   └── ...
│   │   └── WatchParty.jsx      ← Main app component (692 lines)
│   ├── hooks/
│   │   └── use-toast.js        ← Toast notifications hook
│   ├── lib/
│   │   └── utils.js            ← Utility functions (classnames)
│   ├── App.js                  ← App entry point
│   ├── App.css                 ← App-specific styles
│   ├── index.js                ← React DOM render
│   └── index.css               ← Global styles + Tailwind
├── plugins/
│   ├── health-check/           ← Dev server health check plugin
│   └── visual-edits/           ← Babel metadata plugin
├── craco.config.js             ← CRACO configuration
├── tailwind.config.js          ← Tailwind configuration
├── postcss.config.js           ← PostCSS configuration
├── components.json             ← shadcn/ui configuration
├── jsconfig.json               ← JavaScript configuration
├── package.json                ← Dependencies
└── README.md                   ← This file
```

---

## 🎯 Key Components

### WatchParty.jsx

The main component handling all synchronization logic:

**Key Features**:
- Socket.io connection management
- YouTube player initialization
- Server state synchronization
- Drift compensation (±350ms threshold)
- Version control for state updates
- Autoplay policy handling
- User interaction tracking

**State Management**:
- `socket` - Socket.io connection
- `userCount` - Live viewer count
- `currentVideoId` - Active YouTube video
- `isPlaying` - Playback state
- `playerReadyUI` - Player initialization status

**Refs** (avoid stale closures):
- `playerRef` - YouTube player instance
- `isPlayerReady` - Player ready state
- `lastVersionRef` - Version tracking
- `applyingServerUpdate` - Prevents echo

### UI Components (shadcn/ui)

Accessible, customizable components:
- `Button` - Action buttons
- `Card` - Content containers
- `Input` - Text input
- `Toast` - Notifications
- And 40+ more...

---

## 🔄 Architecture

### Connection Flow

```
1. User opens app
   ↓
2. Connect to backend via Socket.io
   ↓
3. Load YouTube IFrame API
   ↓
4. Request current session state
   ↓
5. Initialize YouTube player with video
   ↓
6. Sync to server's playback state
   ↓
7. Listen for real-time updates
```

### Synchronization Pattern

**Server-Authoritative Time**:
```javascript
// Server sends anchor point:
{
  playbackTimeAtLastEvent: 10.0,  // Time at last event
  lastEventAt: 1234567890,        // Server timestamp
  serverTime: 1234567900          // Current server time
}

// Client calculates target time:
elapsedMs = serverTime - lastEventAt;
targetTime = playbackTimeAtLastEvent + (elapsedMs / 1000);

// Client corrects drift if needed:
drift = Math.abs(targetTime - currentTime);
if (drift > 0.35) {
  player.seekTo(targetTime);
}
```

### Version Control

```javascript
// Every state change has a version
lastVersionRef.current = 0;

// On receiving update:
if (snapshot.version <= lastVersionRef.current) {
  return; // Ignore stale update
}
lastVersionRef.current = snapshot.version;
applySnapshot(snapshot);
```

### Echo Prevention

```javascript
// Set flag when user performs action
isLocalAction.current = true;
socket.emit('play', { currentTime });

// Flag prevents applying own echo
setTimeout(() => {
  isLocalAction.current = false;
}, 500);
```

---

## 🎨 Customization

### Styling

**Tailwind Configuration** (`tailwind.config.js`):
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        // Add custom colors
      }
    }
  }
}
```

**Global Styles** (`src/index.css`):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Add custom styles */
```

### Adding UI Components

Use shadcn/ui CLI to add components:
```bash
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
```

### Modifying Controls

Edit `WatchParty.jsx` controls section:
```javascript
// Around line 600-650
<div className="flex gap-2">
  <Button onClick={handlePlay}>Play</Button>
  <Button onClick={handlePause}>Pause</Button>
  {/* Add custom buttons */}
</div>
```

---

## 🚢 Deployment

### Build for Production

```bash
# Install dependencies
npm install

# Create production build
npm run build

# Output: build/ directory
```

### Render.com (Recommended)

**Setup**:
1. Create Static Site on [Render](https://render.com)
2. Connect repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `build`
   - **Environment Variables**:
     - `NODE_ENV=production`
     - `REACT_APP_BACKEND_URL=https://watch-party-backend-vkj5.onrender.com`
4. Deploy!

**Cost**: Free (100GB bandwidth/month)

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Set environment variable
vercel env add REACT_APP_BACKEND_URL
```

### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy
npm run build
netlify deploy --prod --dir=build

# Set environment variable in Netlify dashboard
```

### Other Platforms

Works on any static hosting:
- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront
- Firebase Hosting

---

## 🧪 Testing

### Manual Testing Checklist

**Connection**:
- [ ] App connects to backend
- [ ] Toast shows "Connected to watch party!"
- [ ] User count updates correctly

**Video Loading**:
- [ ] Can paste YouTube URL
- [ ] Video loads and displays
- [ ] Video ID extracted correctly

**Playback Controls**:
- [ ] Play button works
- [ ] Pause button works
- [ ] Seek forward/backward works
- [ ] Custom controls override player controls

**Synchronization**:
- [ ] Open two browser windows
- [ ] Play in one window
- [ ] Other window plays automatically
- [ ] Both stay in sync (±350ms)
- [ ] Seeking syncs across clients

**Edge Cases**:
- [ ] Joining mid-playback syncs correctly
- [ ] Browser autoplay policy handled
- [ ] Connection recovery after disconnect
- [ ] Works with network latency

### Automated Testing (Future)

```bash
# Install testing dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom

# Run tests
npm test
```

---

## 🐛 Troubleshooting

### "Failed to connect to server"

**Cause**: Backend not running or incorrect URL

**Solution**:
1. Check backend is running: `curl https://watch-party-backend-vkj5.onrender.com/api/health`
2. Verify `REACT_APP_BACKEND_URL` is correct
3. Check browser console for CORS errors
4. Ensure backend allows frontend origin

### Video not loading

**Cause**: Invalid YouTube URL or API not loaded

**Solution**:
1. Use format: `https://www.youtube.com/watch?v=VIDEO_ID`
2. Check browser console for YouTube API errors
3. Verify video is embeddable (not restricted)

### Playback out of sync

**Cause**: Network latency or drift threshold too high

**Solution**:
1. Check network latency (< 200ms recommended)
2. Adjust drift threshold in `applySnapshot()`:
   ```javascript
   if (drift > 0.35) { // Lower for stricter sync
   ```
3. Verify server is using authoritative time

### Controls not working

**Cause**: Player not ready or event handler error

**Solution**:
1. Check `playerReadyUI` state is `true`
2. Open browser console for errors
3. Verify Socket.io connection is active
4. Check backend logs for received events

### "Click to start watching" banner stuck

**Cause**: Browser autoplay policy

**Solution**:
1. Click anywhere on the page to interact
2. Banner should disappear
3. Video should start playing
4. This is normal browser behavior

### Build errors

**Cause**: Missing dependencies or Node version mismatch

**Solution**:
```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install

# Use correct Node version
nvm use 18  # or nvm install 18
```

---

## 📊 Performance

### Bundle Size

```
Production build:
  - Main bundle: ~500KB (gzipped)
  - YouTube API: ~200KB
  - Total: ~700KB

Load time on 4G: < 2 seconds
```

### Optimization Tips

1. **Lazy load components**:
   ```javascript
   const Dialog = lazy(() => import('@/components/ui/dialog'));
   ```

2. **Memoize expensive computations**:
   ```javascript
   const targetTime = useMemo(() => computeTargetTime(snapshot), [snapshot]);
   ```

3. **Debounce seek events**:
   ```javascript
   const debouncedSeek = debounce(handleSeek, 300);
   ```

4. **Tree shake unused components**:
   - Only import components you use
   - Tailwind purges unused styles automatically

---

## 🔒 Security

### Best Practices

1. **Environment Variables**: Never commit `.env` files
2. **API Keys**: No API keys needed (YouTube IFrame API is free)
3. **CORS**: Backend should restrict to your frontend domain
4. **Input Validation**: URL validation happens on backend
5. **XSS Protection**: React escapes content automatically

### Content Security Policy (Optional)

Add to `public/index.html`:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' https://www.youtube.com; 
               frame-src https://www.youtube.com;">
```

---

## 🚀 Advanced Features

### Custom Video Source

Currently supports YouTube. To add other sources:

1. Create player adapters in `src/components/players/`
2. Abstract player interface
3. Implement for Vimeo, Dailymotion, etc.

### Chat Feature

Add real-time chat:
```javascript
// In WatchParty.jsx
socket.on('chat-message', (message) => {
  addMessageToChat(message);
});

socket.emit('chat-message', { text, user });
```

### User Avatars

Add user identification:
```javascript
const [username, setUsername] = useState('');

socket.emit('set-username', username);
socket.on('user-list', (users) => setUsers(users));
```

### Playlist Support

Add video queue:
```javascript
const [playlist, setPlaylist] = useState([]);

socket.emit('add-to-playlist', videoUrl);
socket.on('playlist-updated', (newPlaylist) => setPlaylist(newPlaylist));
```

---

## 🤝 Contributing

### Development Workflow

1. **Fork repository**
2. **Create feature branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make changes**
4. **Test locally**:
   ```bash
   npm start
   # Test all features
   ```
5. **Build production**:
   ```bash
   npm run build
   ```
6. **Commit**:
   ```bash
   git commit -m "Add amazing feature"
   ```
7. **Push**:
   ```bash
   git push origin feature/amazing-feature
   ```
8. **Open Pull Request**

### Code Style

- Use functional components with hooks
- Follow React best practices
- Use Tailwind utility classes
- Add comments for complex logic
- Use `const` for constants, `let` for variables
- Prefer arrow functions
- Use meaningful variable names

---

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start development server (port 3000) |
| `npm run build` | Create production build |
| `npm test` | Run test suite |
| `npm run eject` | Eject from Create React App (irreversible) |

---

## 📚 Documentation

- **Main README**: [Watch-Party/README.md](../README.md)
- **Technical Docs**: [TECHNICAL_DOCUMENTATION.md](../TECHNICAL_DOCUMENTATION.md)
- **Deployment Guide**: [DEPLOYMENT_GUIDE_RENDER.md](../DEPLOYMENT_GUIDE_RENDER.md)
- **Production Guide**: [PRODUCTION_READY_GUIDE.md](../PRODUCTION_READY_GUIDE.md)
- **Backend Docs**: [Backend Repository](https://github.com/YOUR_USERNAME/watchparty-backend)

---

## 🆘 Support

### Resources

- **React Docs**: https://react.dev
- **Socket.io Client**: https://socket.io/docs/v4/client-api/
- **YouTube IFrame API**: https://developers.google.com/youtube/iframe_api_reference
- **shadcn/ui**: https://ui.shadcn.com
- **Tailwind CSS**: https://tailwindcss.com

### Get Help

- 🐛 [Report Issues](https://github.com/YOUR_USERNAME/watchparty/issues)
- 💬 [Discussions](https://github.com/YOUR_USERNAME/watchparty/discussions)
- 📧 [Email Support](mailto:your-email@example.com)

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) file

---

## 🎉 Acknowledgments

- **shadcn/ui** - For the amazing component library
- **Socket.io** - For real-time communication
- **YouTube** - For the IFrame API
- **Radix UI** - For accessible primitives
- **Tailwind CSS** - For utility-first styling

---

**Version**: 1.0.0  
**Last Updated**: November 2025  
**Status**: Production Ready ✅

---

## 🌟 Quick Links

| Link | Description |
|------|-------------|
| [Live Demo](https://your-frontend.onrender.com) | Try it out |
| [Backend Repo](https://github.com/YOUR_USERNAME/watchparty-backend) | Server code |
| [Deploy Guide](../DEPLOYMENT_GUIDE_RENDER.md) | Deployment instructions |
| [Report Bug](https://github.com/YOUR_USERNAME/watchparty/issues) | Found an issue? |

---

**Happy watching! 🍿**
