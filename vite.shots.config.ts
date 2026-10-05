import { mergeConfig } from 'vite';
import base from './vite.config';
export default mergeConfig(base, { cacheDir: '/tmp/vite-cache-fix244', server: { fs: { allow: ['/home/user/moondreams-dev-apps', '/tmp/fix244'] } } });
