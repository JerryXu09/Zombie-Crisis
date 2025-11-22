
import { SoundType, WeaponType } from '../types';

class AudioService {
  private ctx: AudioContext | null = null;
  private bgmNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private bgmInterval: any = null;
  private isMuted: boolean = false;
  private lastSoundTime: number = 0;

  constructor() {
  }

  public init() {
    if (!this.ctx) {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- SYNTHESIS HELPERS ---

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // --- SOUND EFFECTS ---

  public playSound(type: SoundType) {
    if (!this.ctx || this.isMuted) return;
    
    const now = this.ctx.currentTime;
    if (type.startsWith('WEAPON') && now - this.lastSoundTime < 0.05) {
        return; 
    }
    this.lastSoundTime = now;

    switch (type) {
      case SoundType.UI_CLICK:
        this.playTone(800, 'sine', 0.05, 0.1);
        break;
      case SoundType.UI_SELECT:
        this.playTone(1200, 'sine', 0.05, 0.1);
        break;
      case SoundType.UI_ERROR:
        this.playTone(150, 'sawtooth', 0.2, 0.2);
        break;
      case SoundType.DEPLOY_ACTION:
        this.playTone(400, 'square', 0.1, 0.3);
        this.playTone(600, 'square', 0.1, 0.3, 0.1);
        break;
      case SoundType.WEAPON_PISTOL:
        this.playGunshot(0.1, 1000, 0.1);
        break;
      case SoundType.WEAPON_SHOTGUN:
        this.playGunshot(0.3, 500, 0.4);
        break;
      case SoundType.WEAPON_SNIPER:
        this.playGunshot(0.2, 2000, 0.3); 
        this.playTone(200, 'sawtooth', 0.05, 0.5, 0); 
        break;
      case SoundType.WEAPON_ROCKET:
        this.playExplosion();
        break;
      case SoundType.WEAPON_NET:
        this.playTone(600, 'triangle', 0.05, 0.2);
        this.playTone(300, 'triangle', 0.1, 0.2, 0.05);
        break;
      case SoundType.HEAL_START:
        this.playTone(400, 'sine', 0.5, 0.1);
        break;
      case SoundType.HEAL_COMPLETE:
        this.playTone(800, 'sine', 0.1, 0.2);
        this.playTone(1200, 'sine', 0.2, 0.2, 0.1);
        break;
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number, delay: number = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(this.ctx.currentTime + delay);
    osc.stop(this.ctx.currentTime + delay + duration + 0.1);
  }

  private playGunshot(duration: number, filterFreq: number, vol: number) {
    if (!this.ctx) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  private playExplosion() {
    if (!this.ctx) return;
    const duration = 1.5;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(10, this.ctx.currentTime + duration); 

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  // --- BACKGROUND MUSIC SYSTEM ---
  
  public startBGM() {
    if (!this.ctx || this.bgmNodes.length > 0 || this.isMuted) return;
    this.init();

    const freqs = [55, 58]; 
    freqs.forEach(f => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);
        
        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, this.ctx!.currentTime);

        const lfo = this.ctx!.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.1, this.ctx!.currentTime);
        const lfoGain = this.ctx!.createGain();
        lfoGain.gain.setValueAtTime(0.05, this.ctx!.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        
        gain.gain.setValueAtTime(0.05, this.ctx!.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.start();
        lfo.start();

        this.bgmNodes.push({ osc, gain });
    });

    const sequence = [110, 0, 110, 0, 130, 0, 103, 0]; 
    let step = 0;
    
    this.bgmInterval = window.setInterval(() => {
        if (this.ctx?.state === 'suspended') return;
        
        const freq = sequence[step % sequence.length];
        if (freq > 0) {
            this.playTone(freq, 'triangle', 0.3, 0.05);
        }
        
        if (Math.random() < 0.1) {
             this.playTone(880, 'sine', 1.0, 0.02); 
        }

        step++;
    }, 500);
  }

  public stopBGM() {
    if (this.bgmInterval) {
        clearInterval(this.bgmInterval);
        this.bgmInterval = null;
    }

    this.bgmNodes.forEach(n => {
        try {
            n.gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 1);
            setTimeout(() => {
                n.osc.stop(); 
                n.osc.disconnect();
                n.gain.disconnect();
            }, 1000);
        } catch(e) {}
    });
    this.bgmNodes = [];
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
        this.stopBGM();
        if (this.ctx) this.ctx.suspend();
    } else {
        if (this.ctx) this.ctx.resume();
        this.startBGM();
    }
  }
}

export const audioService = new AudioService();
