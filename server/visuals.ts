import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_DIR } from './db.ts';

function hashStr(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Palette {
  bgTop: string;
  bgBottom: string;
  glow: string;
  silhouette: string;
  accent: string;
  paper: boolean;
}

function getStylePalette(styleSlug: string, prompt: string): Palette {
  const lower = prompt.toLowerCase();
  if (styleSlug === 'stickman') {
    return {
      bgTop: '#1E293B',
      bgBottom: '#334155',
      glow: '#FDBA74',
      silhouette: '#09090B',
      accent: '#F59E0B',
      paper: false,
    };
  }
  if (styleSlug === 'ghibli_anime') {
    return {
      bgTop: '#38BDF8',
      bgBottom: '#86EFAC',
      glow: '#FEF08A',
      silhouette: '#1E3A2F',
      accent: '#EA580C',
      paper: true,
    };
  }
  if (styleSlug === 'cyberpunk_neon') {
    return {
      bgTop: '#090D16',
      bgBottom: '#0F172A',
      glow: '#22D3EE',
      silhouette: '#020617',
      accent: '#FB923C',
      paper: false,
    };
  }
  if (styleSlug === 'halloween_dark') {
    return {
      bgTop: '#181024',
      bgBottom: '#291519',
      glow: '#FDE68A',
      silhouette: '#09090B',
      accent: '#EA580C',
      paper: false,
    };
  }
  if (styleSlug === 'flat_illustration') {
    return {
      bgTop: '#FFF4EC',
      bgBottom: '#F2E8DF',
      glow: '#FFB27A',
      silhouette: '#1E293B',
      accent: '#E5540A',
      paper: true,
    };
  }
  if (styleSlug === 'chinese_animation') {
    return {
      bgTop: '#F3EFE6',
      bgBottom: '#D6D0C4',
      glow: '#F59E0B',
      silhouette: '#1C1917',
      accent: '#B91C1C',
      paper: true,
    };
  }
  if (styleSlug === 'comic_book' || lower.includes('midnight') || lower.includes('corridor') || lower.includes('fog')) {
    return {
      bgTop: '#0F172A',
      bgBottom: '#1C1917',
      glow: '#F59E0B',
      silhouette: '#09090B',
      accent: '#FF6A1A',
      paper: false,
    };
  }
  if (styleSlug === 'japanese_anime') {
    return {
      bgTop: '#1E293B',
      bgBottom: '#FB923C',
      glow: '#FDE68A',
      silhouette: '#1E1B4B',
      accent: '#FF6A1A',
      paper: false,
    };
  }
  if (styleSlug === '3d_animated') {
    return {
      bgTop: '#292524',
      bgBottom: '#7C2D12',
      glow: '#FFB27A',
      silhouette: '#1C1917',
      accent: '#FF6A1A',
      paper: false,
    };
  }
  return {
    bgTop: '#18181B',
    bgBottom: '#431407',
    glow: '#FDBA74',
    silhouette: '#09090B',
    accent: '#FF6A1A',
    paper: false,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PSYCH_AND_CINEMATIC_SCENES = [
  '/src/assets/images/psych_scene_window_1795356673101.jpg',
  '/src/assets/images/psych_scene_hallway_1795356671218.jpg',
  '/src/assets/images/psych_scene_street_1795356671382.jpg',
  '/src/assets/images/psych_scene_desk_1795356670980.jpg',
  '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
  '/src/assets/images/reel_sample_motivation_1795353526355.jpg',
  '/src/assets/images/reel_sample_stoic_1795353526542.jpg',
];

const STYLE_GALLERY: Record<string, string[]> = {
  cinematic_realistic: PSYCH_AND_CINEMATIC_SCENES,
  realistic_human: [
    '/src/assets/images/reel_sample_stoic_1795353526542.jpg',
    '/src/assets/images/reel_sample_motivation_1795353526355.jpg',
    ...PSYCH_AND_CINEMATIC_SCENES,
  ],
  flat_illustration: [
    '/src/assets/images/reel_sample_stoic_1795353526542.jpg',
    '/src/assets/images/psych_scene_desk_1795356670980.jpg',
    '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    '/src/assets/images/reel_sample_motivation_1795353526355.jpg',
  ],
  comic_book: [
    '/src/assets/images/reel_sample_horror_1795353526303.jpg',
    '/src/assets/images/psych_scene_hallway_1795356671218.jpg',
    '/src/assets/images/psych_scene_street_1795356671382.jpg',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
  ],
  japanese_anime: [
    '/src/assets/images/reel_sample_anime_1795353526457.jpg',
    '/src/assets/images/ghibli_character_portrait_1795355968900.jpg',
    '/src/assets/images/cyberpunk_character_portrait_1795355968518.jpg',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
  ],
  ghibli_anime: [
    '/src/assets/images/ghibli_character_portrait_1795355968900.jpg',
    '/src/assets/images/reel_sample_anime_1795353526457.jpg',
    '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    '/src/assets/images/psych_scene_desk_1795356670980.jpg',
  ],
  cyberpunk_neon: [
    '/src/assets/images/cyberpunk_character_portrait_1795355968518.jpg',
    '/src/assets/images/psych_scene_street_1795356671382.jpg',
    '/src/assets/images/psych_scene_hallway_1795356671218.jpg',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    '/src/assets/images/reel_sample_anime_1795353526457.jpg',
  ],
  halloween_dark: [
    '/src/assets/images/halloween_dark_character_1795355968336.jpg',
    '/src/assets/images/halloween_fruit_character_1795355968887.jpg',
    '/src/assets/images/reel_sample_horror_1795353526303.jpg',
    '/src/assets/images/psych_scene_street_1795356671382.jpg',
    '/src/assets/images/psych_scene_hallway_1795356671218.jpg',
  ],
  chinese_animation: [
    '/src/assets/images/reel_sample_chinese_epic_1795353526462.jpg',
    '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
    '/src/assets/images/reel_sample_motivation_1795353526355.jpg',
    '/src/assets/images/psych_scene_street_1795356671382.jpg',
    '/src/assets/images/psych_scene_desk_1795356670980.jpg',
  ],
  '3d_animated': [
    '/src/assets/images/style_preview_3d_1795353526103.jpg',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    '/src/assets/images/psych_scene_desk_1795356670980.jpg',
    '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
    '/src/assets/images/reel_sample_motivation_1795353526355.jpg',
  ],
};

export function renderSceneArtworkSvg(params: {
  fileId: string;
  styleSlug: string;
  imagePrompt: string;
  sceneIdx: number;
  hasCharacter: boolean;
  characterName?: string | null;
}): string {
  const gallery = STYLE_GALLERY[params.styleSlug];
  if (gallery && gallery.length > 0) {
    const lower = params.imagePrompt.toLowerCase();
    // Keyword affinity for natural story flow across scenes, falling back to clean per-scene rotation
    if (params.sceneIdx === 0 || (!params.hasCharacter && gallery === PSYCH_AND_CINEMATIC_SCENES)) {
      if (lower.includes('window') || lower.includes('rain') || lower.includes('alone')) {
        return '/src/assets/images/psych_scene_window_1795356673101.jpg';
      }
      if (lower.includes('corridor') || lower.includes('hallway') || lower.includes('door')) {
        return '/src/assets/images/psych_scene_hallway_1795356671218.jpg';
      }
      if (lower.includes('street') || lower.includes('walk') || lower.includes('night') || lower.includes('mist')) {
        return '/src/assets/images/psych_scene_street_1795356671382.jpg';
      }
      if (lower.includes('desk') || lower.includes('book') || lower.includes('lamp') || lower.includes('study')) {
        return '/src/assets/images/psych_scene_desk_1795356670980.jpg';
      }
      if (lower.includes('dawn') || lower.includes('cliff') || lower.includes('sunrise') || lower.includes('horizon')) {
        return '/src/assets/images/psych_scene_horizon_1795356671733.jpg';
      }
    }
    return gallery[params.sceneIdx % gallery.length];
  }

  // Stickman Animation keeps stylized hand-drawn SVG + showcase artwork alternation
  if (params.styleSlug === 'stickman' && params.sceneIdx % 2 === 0) {
    return '/src/assets/images/stickman_anime_style_1795355967506.jpg';
  }

  const pal = getStylePalette(params.styleSlug, params.imagePrompt);
  const seed = hashStr(params.imagePrompt + params.sceneIdx);
  const lower = params.imagePrompt.toLowerCase();

  const sunX = 280 + (seed % 520);
  const sunY = 420 + ((seed >> 4) % 440);
  const sunR = 120 + (seed % 90);

  let motifSvg = '';

  if (params.styleSlug === 'stickman') {
    const cx = 500 + ((seed % 120) - 60);
    const cy = 1040;
    motifSvg = `
      <circle cx="${cx}" cy="${cy - 180}" r="220" fill="url(#glowGrad)" opacity="0.55"/>
      <path d="M120,1360 Q540,1340 960,1375 L1080,1920 L0,1920 Z" fill="#1E293B"/>
      <line x1="120" y1="1360" x2="960" y2="1375" stroke="#09090B" stroke-width="10" stroke-linecap="round"/>
      <!-- Kinetic speed lines -->
      <path d="M${cx + 80},${cy - 220} Q${cx + 260},${cy - 240} ${cx + 350},${cy - 210}" fill="none" stroke="#F59E0B" stroke-width="26" stroke-linecap="round"/>
      <path d="M${cx + 90},${cy - 175} Q${cx + 240},${cy - 185} ${cx + 320},${cy - 150}" fill="none" stroke="#FBBF24" stroke-width="18" stroke-linecap="round"/>
      <path d="M${cx - 190},${cy - 40} Q${cx - 230},${cy + 40} ${cx - 190},${cy + 110}" fill="none" stroke="#09090B" stroke-width="5" opacity="0.5" stroke-linecap="round"/>
      <!-- Dynamic Stickman Anime Character -->
      <path d="M${cx},${cy - 110} L${cx - 18},${cy + 70}" stroke="#09090B" stroke-width="18" stroke-linecap="round"/>
      <path d="M${cx - 6},${cy - 75} L${cx - 115},${cy - 10} L${cx - 70},${cy + 30}" fill="none" stroke="#09090B" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${cx + 4},${cy - 80} L${cx + 120},${cy - 35} L${cx + 165},${cy - 95}" fill="none" stroke="#09090B" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${cx - 18},${cy + 70} L${cx - 125},${cy + 195} L${cx - 65},${cy + 315}" fill="none" stroke="#09090B" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${cx - 18},${cy + 70} L${cx + 95},${cy + 205} L${cx + 175},${cy + 315}" fill="none" stroke="#09090B" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${cx + 165}" cy="${cy - 95}" r="22" fill="#FFFFFF" stroke="#09090B" stroke-width="8"/>
      <circle cx="${cx - 70}" cy="${cy + 30}" r="20" fill="#FFFFFF" stroke="#09090B" stroke-width="8"/>
      <circle cx="${cx + 10}" cy="${cy - 210}" r="112" fill="#FFFFFF" stroke="#09090B" stroke-width="14"/>
      <ellipse cx="${cx + 2}" cy="${cy - 105}" rx="56" ry="26" fill="#F59E0B" stroke="#09090B" stroke-width="7"/>
    `;
  } else if (lower.includes('lantern') || lower.includes('corridor') || lower.includes('door')) {
    motifSvg = `
      <polygon points="180,220 900,220 760,1480 320,1480" fill="#09090B" opacity="0.45"/>
      <rect x="370" y="540" width="340" height="720" rx="12" fill="none" stroke="${pal.glow}" stroke-width="4" opacity="0.4"/>
      <circle cx="540" cy="760" r="190" fill="url(#glowGrad)" opacity="0.75"/>
      <rect x="515" y="715" width="50" height="76" rx="10" fill="${pal.glow}" stroke="#1C1917" stroke-width="5"/>
      <path d="M260,1520 L820,1520 L980,1920 L100,1920 Z" fill="${pal.silhouette}" opacity="0.7"/>
    `;
  } else {
    motifSvg = `
      <circle cx="${sunX}" cy="${sunY}" r="${sunR * 1.4}" fill="url(#glowGrad)" opacity="0.85"/>
      <path d="M0,1240 L120,1140 L190,1190 L280,980 L380,1120 L480,1040 L590,1160 L720,940 L840,1100 L960,1020 L1080,1180 L1080,1920 L0,1920 Z" fill="${pal.silhouette}" opacity="0.88"/>
      <rect x="0" y="1380" width="1080" height="540" fill="${pal.silhouette}"/>
    `;
  }

  const characterSvg =
    params.hasCharacter && params.styleSlug !== 'stickman'
      ? `
      <g transform="translate(540, 1220)">
        <ellipse cx="0" cy="210" rx="115" ry="22" fill="#000000" opacity="0.28"/>
        <path d="M-64,210 L-46,20 C-44,-18 -20,-34 0,-34 C20,-34 44,-18 46,20 L64,210 Z" fill="${pal.accent}"/>
        <circle cx="0" cy="-78" r="44" fill="${pal.paper ? '#292524' : '#FDE68A'}"/>
        <path d="M-46,-84 C-48,-126 48,-126 46,-84 C32,-106 -32,-106 -46,-84 Z" fill="${pal.silhouette}"/>
      </g>
    `
      : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.bgTop}"/>
      <stop offset="100%" stop-color="${pal.bgBottom}"/>
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal.glow}" stop-opacity="0.95"/>
      <stop offset="65%" stop-color="${pal.accent}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${pal.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#skyGrad)"/>
  <circle cx="${sunX}" cy="${sunY}" r="420" fill="url(#glowGrad)" opacity="0.5"/>
  ${motifSvg}
  ${characterSvg}
  <rect width="1080" height="1920" fill="none" stroke="${pal.paper ? '#1C1917' : '#FFFFFF'}" stroke-opacity="0.06" stroke-width="12"/>
  <!-- ${escapeXml(params.styleSlug)} -->
</svg>`;

  const filename = `scene_${params.fileId}.svg`;
  const outPath = path.resolve(GENERATED_DIR, filename);
  fs.writeFileSync(outPath, svg, 'utf-8');
  return `/generated/${filename}`;
}

export function renderCharacterPortraitSvg(params: {
  id: string;
  name: string;
  styleId?: string;
  outfit: string;
  hair: string;
  mood: string;
}): string {
  const seed = hashStr(params.name + params.outfit + params.hair + (params.styleId ?? ''));

  if (params.styleId === 'style_stickman') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <defs>
    <linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#sbg)"/>
  <circle cx="300" cy="300" r="180" fill="#FDBA74" opacity="0.22"/>
  <path d="M80,660 L520,660" stroke="#09090B" stroke-width="10" stroke-linecap="round"/>
  <path d="M300,375 L292,505 M296,415 L205,465 M302,410 L405,390" stroke="#09090B" stroke-width="16" stroke-linecap="round"/>
  <path d="M292,505 L220,655 M292,505 L380,655" stroke="#09090B" stroke-width="16" stroke-linecap="round"/>
  <path d="M315,365 Q430,340 490,365" fill="none" stroke="#F59E0B" stroke-width="24" stroke-linecap="round"/>
  <circle cx="300" cy="270" r="98" fill="#FFFFFF" stroke="#09090B" stroke-width="12"/>
  <ellipse cx="300" cy="368" rx="46" ry="20" fill="#F59E0B" stroke="#09090B" stroke-width="6"/>
</svg>`;
    const filename = `char_${params.id}.svg`;
    fs.writeFileSync(path.resolve(GENERATED_DIR, filename), svg, 'utf-8');
    return `/generated/${filename}`;
  }

  let bgTop = `hsl(${20 + (seed % 20)}, 85%, 94%)`;
  let bgBot = `hsl(${20 + (seed % 20)}, 50%, 84%)`;
  let halo = '#FFFFFF';
  let coat = ['#E5540A', '#1E293B', '#B45309', '#0F766E', '#4338CA'][seed % 5];

  if (params.styleId === 'style_cyberpunk') {
    bgTop = '#090D16';
    bgBot = '#1E293B';
    halo = '#22D3EE';
    coat = '#0F172A';
  } else if (params.styleId === 'style_halloween') {
    bgTop = '#181024';
    bgBot = '#3B1822';
    halo = '#FB923C';
    coat = '#27172E';
  } else if (params.styleId === 'style_ghibli') {
    bgTop = '#BAE6FD';
    bgBot = '#BBF7D0';
    halo = '#FEF9C3';
    coat = '#4D7C5D';
  }

  const skinTones = ['#8D5524', '#C68642', '#6F4222', '#E0AC69'];
  const skin = skinTones[(seed >> 3) % skinTones.length];
  const featureColor = params.styleId === 'style_cyberpunk' ? '#FB923C' : '#1C1917';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgTop}"/>
      <stop offset="100%" stop-color="${bgBot}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#bg)"/>
  <circle cx="300" cy="310" r="210" fill="${halo}" opacity="0.35"/>
  <path d="M120,800 L160,540 C172,480 230,450 300,450 C370,450 428,480 440,540 L480,800 Z" fill="${coat}"/>
  <rect x="262" y="385" width="76" height="85" rx="34" fill="${skin}"/>
  <ellipse cx="300" cy="295" rx="108" ry="126" fill="${skin}"/>
  <path d="M188,268 C184,158 416,158 412,268 C394,210 206,210 188,268 Z" fill="#1C1917"/>
  <circle cx="256" cy="295" r="10" fill="${featureColor}"/>
  <circle cx="344" cy="295" r="10" fill="${featureColor}"/>
  <path d="M268,354 Q300,372 332,354" fill="none" stroke="${featureColor}" stroke-width="6" stroke-linecap="round"/>
</svg>`;

  const filename = `char_${params.id}.svg`;
  const outPath = path.resolve(GENERATED_DIR, filename);
  fs.writeFileSync(outPath, svg, 'utf-8');
  return `/generated/${filename}`;
}

/**
 * Generates a gentle, warm ambient musical WAV file (16-bit PCM mono 22050Hz, 20s seamless loop)
 * tailored to the track ID so library music tracks play cleanly in HTMLAudioElement and AudioContext.
 */
export function buildAmbientMusicWav(trackId: string): Buffer {
  const sampleRate = 22050;
  const durationSec = 16;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  const chordSets: Record<string, number[][]> = {
    mus_dawn_rise: [[220, 277.18, 329.63], [246.94, 293.66, 369.99], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]],
    mus_glass_rain: [[261.63, 311.13, 392.0], [233.08, 293.66, 349.23], [207.65, 261.63, 311.13], [196.0, 246.94, 293.66]],
    mus_midnight_drone: [[110, 164.81, 220], [103.83, 155.56, 207.65], [98, 146.83, 196], [110, 164.81, 220]],
    mus_golden_strings: [[196, 246.94, 293.66], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]],
    mus_warm_pulse: [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]],
    mus_storybook: [[293.66, 369.99, 440], [329.63, 392, 493.88], [246.94, 293.66, 369.99], [220, 277.18, 329.63]],
  };
  const chords = chordSets[trackId] ?? chordSets.mus_dawn_rise;
  const isPulse = trackId === 'mus_warm_pulse' || trackId === 'mus_storybook';

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const bar = Math.floor(t / 4) % chords.length;
    const barT = t % 4;
    const freqs = chords[bar];
    // Smooth bar crossfade envelope
    const env = Math.min(1, barT / 0.6) * Math.min(1, (4 - barT) / 0.6);
    const pulse = isPulse ? 0.72 + 0.28 * Math.sin(2 * Math.PI * 1.5 * t) : 1;

    let sample = 0;
    for (let fIdx = 0; fIdx < freqs.length; fIdx++) {
      const f = freqs[fIdx];
      sample += Math.sin(2 * Math.PI * f * t) * (0.32 / (fIdx + 1));
    }
    // Gentle fade in & out at edges
    const loopFade = Math.min(1, t / 0.5) * Math.min(1, (durationSec - t) / 0.5);
    const val = Math.max(-1, Math.min(1, sample * env * pulse * loopFade * 0.45));
    buf.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }

  return buf;
}
