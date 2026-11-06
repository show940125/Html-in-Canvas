import * as motion from './vendor/motion.js';
import * as lucide from 'lucide';
import {installPlaybackControls} from './presentation';
(window as any).__csMotion=motion;(window as any).lucide={...lucide,createIcons:(options:any={})=>lucide.createIcons({icons:lucide.icons,...options})};
(window as any).__csInstallControls=installPlaybackControls;
