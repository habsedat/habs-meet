import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // CRITICAL: For production builds, explicitly load prod.env
  // For development, use demo.env or .env.local
  let envFile = '';
  if (mode === 'production') {
    // Check if prod.env exists and load it
    const prodEnvPath = path.resolve(process.cwd(), 'prod.env');
    if (fs.existsSync(prodEnvPath)) {
      envFile = 'prod.env';
      console.log('[Vite] Loading production environment from: prod.env');
    }
  } else {
    // For development, try demo.env
    const demoEnvPath = path.resolve(process.cwd(), 'demo.env');
    if (fs.existsSync(demoEnvPath)) {
      envFile = 'demo.env';
      console.log('[Vite] Loading development environment from: demo.env');
    }
  }
  
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Vite loads: .env, .env.local, .env.[mode], .env.[mode].local
  // BUT we want to prioritize our specific env files (demo.env or prod.env)
  let env: Record<string, string> = {};
  
  // First, load the specific env file if it exists
  if (envFile) {
    const envPath = path.resolve(process.cwd(), envFile);
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          env[key.trim()] = value;
        }
      }
    });
    console.log(`[Vite] Loaded ${envFile} with ${Object.keys(env).length} variables`);
  }
  
  // Then load Vite's default env files, but don't override our specific file values
  const viteEnv = loadEnv(mode, process.cwd(), '');
  // Only add vars that aren't already set from our specific file
  Object.keys(viteEnv).forEach(key => {
    if (!env[key]) {
      env[key] = viteEnv[key];
    }
  });
  
  // Log loaded env vars for debugging (without exposing sensitive data)
  console.log('[Vite] Building for mode:', mode);
  console.log('[Vite] Firebase Project ID:', env.VITE_FIREBASE_PROJECT_ID || 'NOT SET');
  console.log('[Vite] Firebase API Key:', env.VITE_FIREBASE_API_KEY ? 'SET (' + env.VITE_FIREBASE_API_KEY.substring(0, 10) + '...)' : 'NOT SET');
  
  // Validate required env vars
  const requiredVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ];
  
  const missingVars = requiredVars.filter(v => !env[v]);
  if (missingVars.length > 0) {
    console.warn('[Vite] WARNING: Missing environment variables:', missingVars.join(', '));
  }
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    // Make env variables available in the app
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
      'import.meta.env.VITE_FIREBASE_MEASUREMENT_ID': JSON.stringify(env.VITE_FIREBASE_MEASUREMENT_ID),
      'import.meta.env.VITE_LIVEKIT_WS_URL': JSON.stringify(env.VITE_LIVEKIT_WS_URL),
      'import.meta.env.VITE_API_BASE': JSON.stringify(env.VITE_API_BASE || '/api'),
    },
  };
});







