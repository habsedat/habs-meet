# Habs Meet

A professional video meeting application built with React, LiveKit, and Firebase. Features invite-only meetings, real-time chat, screen sharing, HD recording capabilities, and **advanced background effects** with LiveKit track processors.

## 🎨 Brand Identity

### Color Palette
- **Electric Tech Blue**: `#0E3A8A` - Primary brand color
- **Deep Creative Violet**: `#6C63FF` - Secondary accent
- **Bright Golden Yellow**: `#FFD35C` - Call-to-action color
- **Midnight Black**: `#0E0E10` - Background color
- **Cloud Silver**: `#F5F5F5` - Surface color

### Typography
- **Primary Font**: Habs Futurist (custom font)
- **Fallback**: Inter, system-ui, sans-serif
- **Font Installation**: Place `habs-futurist.woff2` in `apps/web/public/fonts/` and uncomment the @font-face rule in `apps/web/src/index.css`

## 🏗️ Architecture

### Monorepo Structure
```
habs-meet/
├── apps/
│   ├── web/                 # React + Vite + TypeScript frontend
│   └── functions/           # Firebase Cloud Functions
├── firebase.json           # Firebase configuration
├── .firebaserc            # Firebase project aliases
├── firestore.rules        # Firestore security rules
├── storage.rules          # Firebase Storage rules
└── package.json           # Root package.json with workspaces
```

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Firebase Cloud Functions (Node.js 18)
- **Database**: Firestore
- **Storage**: Firebase Storage
- **Authentication**: Firebase Auth
- **Video**: LiveKit Cloud with Track Processors
- **Background Effects**: LiveKit BackgroundBlur & VirtualBackground
- **Package Manager**: pnpm

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+
- Firebase CLI
- LiveKit Cloud account

### 1. Clone and Install
```bash
git clone https://github.com/habsedat/habs-meet.git
cd habs-meet
pnpm install
```

### 2. Firebase Setup

#### Create Firebase Projects
```bash
# Create dev project
firebase projects:create habs-meet-dev

# Create prod project  
firebase projects:create habs-meet-prod

# Add projects to .firebaserc
firebase use --add habs-meet-dev
firebase use --add habs-meet-prod
```

#### Configure Functions (Dev)
```bash
firebase use habs-meet-dev
firebase functions:config:set \
  livekit.apikey="LK_your_api_key" \
  livekit.apisecret="your_api_secret" \
  livekit.ws_url="wss://your-subdomain.livekit.cloud" \
  webhook.secret="your_webhook_secret" \
  invites.signing_secret="your_invite_signing_secret"
```

#### Configure Functions (Prod)
```bash
firebase use habs-meet-prod
firebase functions:config:set \
  livekit.apikey="LK_your_api_key" \
  livekit.apisecret="your_api_secret" \
  livekit.ws_url="wss://your-subdomain.livekit.cloud" \
  webhook.secret="your_webhook_secret" \
  invites.signing_secret="your_invite_signing_secret"
```

### 3. Environment Configuration

Create `apps/web/.env.local`:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_BASE=/api
VITE_LIVEKIT_WS_URL=wss://your-subdomain.livekit.cloud
VITE_SHOW_BRAND_PAGE=true
```

### 4. Development
```bash
# Start development server with Firebase emulators
pnpm dev

# Or start individually
pnpm --filter web dev
firebase emulators:start
```

### 5. Deployment

#### Deploy to Development
```bash
firebase use habs-meet-dev
firebase deploy --only hosting,functions
```

#### Deploy to Production
```bash
firebase use habs-meet-prod
firebase deploy --only hosting,functions
```

## 📱 Features

### Core Functionality
- **Invite-Only Meetings**: Secure room access with signed tokens
- **Real-time Video**: HD video with LiveKit Cloud
- **Screen Sharing**: High-quality screen sharing up to 3.5 Mbps
- **Chat**: Real-time messaging with Firestore
- **Recording**: HD meeting recordings with cloud storage
- **Host Controls**: Lock rooms, manage participants, start/stop recordings

### 🎭 Background Effects (NEW!)
- **Live Background Blur**: Professional blur effects using LiveKit processors
- **Virtual Backgrounds**: Image and video backgrounds with real-time segmentation
- **Persistent Preferences**: Background choices saved across sessions
- **Multi-Attach Support**: Same processed track for main and modal previews
- **Zoom-like Experience**: Optional background effects with toggle control

### User Experience
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Keyboard Shortcuts**: M (mute), V (video), S (share), Esc (leave)
- **Bandwidth Optimization**: Adaptive streaming with simulcast
- **Modern UI**: Clean, professional interface with Habs brand colors

## 🔐 Security

### Authentication
- Firebase Authentication with email/password
- JWT tokens for API access
- User profiles stored in Firestore

### Invite System
- HMAC-signed invite tokens
- Single-use or limited-use invites
- Expiration dates
- Host-only invite creation/revocation

### Firestore Rules
- Auth required for all operations
- Host-only room management
- Participant-only chat access
- Host-only recording access

## 🎥 LiveKit Integration

### Video Configuration
- **Camera**: Max 1.5 Mbps with simulcast
- **Thumbnails**: ~250 kbps
- **Screen Share**: Up to 3.5 Mbps
- **Codec**: VP9 with H.264 fallback for Safari

### Background Effects
- **Track Processors**: LiveKit BackgroundBlur & VirtualBackground
- **WebGL Support**: Automatic fallback for unsupported browsers
- **Memory Management**: Proper cleanup to prevent context leaks
- **Error Handling**: Graceful degradation when effects fail

### Recording
- Egress API for recording management
- Webhook handling for recording completion
- Automatic Firebase Storage upload
- Recording metadata in Firestore

## 📊 Data Model

### Firestore Collections

#### `rooms/{roomId}`
```typescript
{
  title: string;
  createdBy: string;
  status: "open" | "locked" | "ended";
  waitingRoom: boolean;
  createdAt: Timestamp;
}
```

#### `rooms/{roomId}/participants/{uid}`
```typescript
{
  role: "host" | "speaker" | "viewer";
  joinedAt: Timestamp;
  leftAt?: Timestamp;
}
```

#### `rooms/{roomId}/chat/{msgId}`
```typescript
{
  uid: string;
  displayName: string;
  text: string;
  createdAt: Timestamp;
}
```

#### `invites/{inviteId}`
```typescript
{
  roomId: string;
  createdBy: string;
  role: "viewer" | "speaker";
  maxUses: number;
  used: number;
  expiresAt: Timestamp;
  revoked: boolean;
  createdAt: Timestamp;
}
```

#### `recordings/{recId}`
```typescript
{
  roomId: string;
  storagePath: string;
  size: number;
  duration: number;
  layout: string;
  createdAt: Timestamp;
}
```

## 🔌 API Endpoints

### Invite Management
- `POST /api/invites/create` - Create invite (host only)
- `POST /api/invites/redeem` - Redeem invite token
- `POST /api/invites/revoke` - Revoke invite (host only)

### Meeting Management
- `POST /api/meet/token` - Get LiveKit access token
- `GET /api/meet/rooms/:roomId/guard` - Check room access
- `POST /api/meet/webhooks/livekit` - LiveKit webhook handler

## 🎨 Brand Kit

Visit `/brand` in development to see the complete design system including:
- Color palette with hex codes
- Typography samples
- Button styles
- Form elements
- Meeting tiles
- Badges and status indicators

## 🧪 Testing

### End-to-End Test Flow
1. Create a room as host
2. Generate an invite link
3. Redeem invite as participant
4. Join meeting
5. Test background effects (blur, images, videos)
6. Start recording
7. Verify webhook creates recording document

### Manual Testing
```bash
# Start emulators
firebase emulators:start

# Create test room and invite
node scripts/seed.js
```

## 📝 Development Notes

### Code Organization
- Each page has separate CSS and TSX files for easy maintenance
- Components are modular and reusable
- Context providers manage global state
- TypeScript for type safety

### Background Effects Architecture
- **BackgroundEngine**: Manages LiveKit track processors
- **Multi-Attach**: Same LocalVideoTrack attached to multiple video elements
- **Persistent Storage**: localStorage for background preferences
- **Error Handling**: Graceful fallbacks when WebGL/processors fail

### Performance
- Lazy loading for routes
- Optimized video streaming
- Efficient Firestore queries
- Minimal bundle size with Vite
- WebGL context management

### Accessibility
- Keyboard navigation support
- Screen reader friendly
- High contrast colors
- Focus indicators

## 🚨 Troubleshooting

### Common Issues

#### Firebase Emulators Not Starting
```bash
# Clear emulator data
firebase emulators:start --import=./emulator-data --export-on-exit
```

#### LiveKit Connection Issues
- Verify WebSocket URL in environment variables
- Check API key and secret configuration
- Ensure CORS is properly configured

#### Background Effects Not Working
- Check WebGL support in browser
- Verify LiveKit track processors are loaded
- Check console for processor initialization errors
- Ensure MediaPipe WASM files are accessible

#### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Clear Vite cache
pnpm --filter web build --force
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review Firebase and LiveKit documentation

---

**Live Demo**: https://habs-meet-dev.web.app
