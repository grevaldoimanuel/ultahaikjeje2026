(function () {
    'use strict';

    // ===================================================
    // DETEKSI PERANGKAT
    // ===================================================

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.innerWidth <= 768);
    const isLowEnd = navigator.hardwareConcurrency ? navigator.hardwareConcurrency <= 4 : isMobile;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

    // ===================================================
    // KONFIGURASI
    // ===================================================

    const CFG = {
        SLIDE_AUTO: 10000,
        CONFETTI_COUNT: isLowEnd ? 50 : 140,
        CONFETTI_DURATION: 4000,
        BG_FLOATER_COUNT: isMobile ? 6 : 12,
        HERO_PARTICLE_COUNT: isMobile ? 10 : 24,
        SPLASH_PARTICLE_COUNT: isMobile ? 12 : 24,
        SPARKLE_INTERVAL: isMobile ? 120 : 80,
        TYPEWRITER_SPEED: 20,
        VIZ_BAR_COUNT: isMobile ? 8 : 14,
        // Kata sandi rahasia untuk membuka kejutan
        SECRET_PASSWORD: 'jejenong',
        // Target ulang tahun: 5 Juli 2026
        BIRTHDAY_TARGET: new Date(2026, 6, 5, 0, 0, 0),
    };

    // ===================================================
    // STATUS APLIKASI
    // ===================================================

    const S = {
        splashDone: false,
        slide: 0,
        slides: 100,
        autoSlide: null,
        letterOpen: false,
        giftOpen: false,
        wishMade: false,
        typewriterDone: false,
        splashCountdownInterval: null,
        h1mActive: false,
        h1mInterval: null,
        h1mRemaining: 0,
        musicStarted: false,
        musicHealthInterval: null,
        audioVizInterval: null,
    };

    // ===================================================
    // REFERENSI DOM
    // ===================================================

    const $ = (id) => document.getElementById(id);
    const D = {
        splash: $('splash'),
        splashCanvas: $('splash-canvas'),
        splashCharms: $('splash-charms'),
        pwInput: $('pw-input'),
        pwBtn: $('pw-btn'),
        pwError: $('pw-error'),
        pwMarquee: $('pw-marquee'),
        pwField: document.querySelector('.splash-pw-field'),
        main: $('main'),
        bgCanvas: $('bg-canvas'),
        bgFloaters: $('bg-floaters'),
        heroParticles: $('hero-particles'),
        track: $('slides-wrap'),
        prev: $('slide-prev'),
        next: $('slide-next'),
        dots: $('slide-dots'),
        counter: $('slide-counter'),
        captionNum: $('slide-caption-num'),
        captionText: $('slide-caption-text'),
        captionIcon: $('slide-caption-icon'),
        captionWrap: $('slide-caption'),
        progressFill: $('slide-progress-fill'),
        envWrap: $('envelope-wrap'),
        envelope: $('envelope'),
        letterModal: $('letter-modal'),
        letterContent: $('letter-content'),
        giftBox: $('gift-box'),
        giftHint: $('gift-hint'),
        modal: $('surprise-modal'),
        modalOk: $('surprise-ok'),
        confetti: $('confetti-canvas'),
        sparkleTrail: $('sparkle-trail'),
        tapHearts: $('tap-hearts'),
        audioViz: $('audio-viz'),
        wishCake: $('wish-cake'),
        candleFlame: $('candle-flame'),
        candleGlow: $('candle-glow'),
        wishHint: $('wish-hint'),
        wishMessage: $('wish-message'),
        tapOverlay: $('tap-overlay'),
        wishSection: $('wish-section'),
        smokeContainer: $('smoke-container'),
        blowEffects: $('blow-effects'),
        splashPassword: $('splash-password'),
        bgMusic: $('bg-music'),
        letterCloseBtn: $('letter-close-btn'),
        wishFloatEmojis: $('wish-float-emojis'),
        scdDays: $('scd-days'),
        scdHours: $('scd-hours'),
        scdMins: $('scd-mins'),
        scdSecs: $('scd-secs'),
        scdMsg: $('scd-msg'),
        h1mOverlay: $('h1m-overlay'),
        h1mParticles: $('h1m-particles'),
        h1mLabel: $('h1m-label'),
        h1mRingFill: $('h1m-ring-fill'),
        h1mNumber: $('h1m-number'),
        h1mMessage: $('h1m-message'),
        h1mProgressFill: $('h1m-progress-fill'),
    };

    // ===================================================
    // UTILITAS UMUM
    // ===================================================

    /**
     * Memasang pendengar resize dengan debounce pada window.
     * @param {Function} fn - Callback yang dijalankan saat resize.
     * @param {number} [delay=200] - Jeda debounce dalam milidetik.
     */
    function onResize(fn, delay = 200) {
        let t;
        window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fn, delay); });
    }

    /**
     * Membuat pembersih batch periodik untuk elemen DOM sementara.
     * Menggantikan pola setTimeout individual yang boros memori.
     * @param {number} expiryMs - Waktu kedaluwarsa elemen dalam milidetik.
     * @param {number} [intervalMs=200] - Interval pembersihan dalam milidetik.
     * @returns {{ add: (el: HTMLElement) => void }} Antarmuka untuk menambahkan elemen.
     */
    function createBatchCleaner(expiryMs, intervalMs = 200) {
        const pending = [];
        setInterval(() => {
            const now = Date.now();
            while (pending.length && now - pending[0].time >= expiryMs) {
                pending.shift().el.remove();
            }
        }, intervalMs);
        return {
            add(el) { pending.push({ el, time: Date.now() }); },
        };
    }

    // ===================================================
    // CACHE PRELOAD GAMBAR
    // ===================================================

    const BASE_IMG_URL = 'https://raw.githubusercontent.com/grevaldoimanuel/ultahaikjeje2026/refs/heads/main';
    const imageCache = {};
    const imageLoading = {}; // Lacak gambar mana yang sedang diambil

    /**
     * Memuat semua 100 gambar slide ke cache blob untuk tampilan tercepat.
     * Strategi 3 tingkat prioritas agar tidak memblokir resource kritis:
     *   - Prioritas 1 (1-5):  Langsung dimuat — gambar pertama yang dilihat user
     *   - Prioritas 2 (6-20): Dimuat setelah 2 detik — gambar berikutnya di slideshow
     *   - Prioritas 3 (21-100): Dimuat setelah 5 detik — sisa gambar di latar belakang
     */
    function preloadImages() {
        // Prioritas 1: Langsung muat 5 gambar pertama — gambar yang langsung terlihat
        preloadBatch(1, 5, 3); // concurrent = 3 — ringankan beban awal

        // Prioritas 2: Muat gambar 6-20 setelah 2 detik
        setTimeout(() => {
            preloadBatch(6, 20, 5); // concurrent = 5
        }, 2000);

        // Prioritas 3: Muat sisa gambar 21-100 setelah 5 detik
        setTimeout(() => {
            preloadBatch(21, 100, 6); // concurrent = 6
        }, 5000);
    }

    /**
     * Memuat batch gambar secara paralel dengan batasan concurrent.
     * @param {number} from - Nomor gambar awal (inklusif).
     * @param {number} to - Nomor gambar akhir (inklusif).
     * @param {number} concurrency - Jumlah maksimum pengambilan paralel.
     */
    function preloadBatch(from, to, concurrency) {
        const urls = [];
        for (let i = from; i <= to; i++) {
            const url = `${BASE_IMG_URL}/${i}.jpg`;
            if (!imageCache[url] && !imageLoading[url]) {
                urls.push(url);
            }
        }

        let idx = 0;
        function loadNext() {
            if (idx >= urls.length) return;
            const url = urls[idx++];
            imageLoading[url] = true;
            fetch(url).then(res => res.blob()).then(blob => {
                imageCache[url] = URL.createObjectURL(blob);
                delete imageLoading[url];
                loadNext();
            }).catch(() => {
                imageCache[url] = false;
                delete imageLoading[url];
                loadNext();
            });
        }

        for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
            loadNext();
        }
    }

    // ===================================================
    // PRELOAD AUDIO
    // ===================================================

    const audioUrl = 'https://github.com/grevaldoimanuel/ultahaikjeje2026/raw/refs/heads/main/Until%20I%20Found%20You.mp3';

    /**
     * Memuat file musik latar dan mengaturnya sebagai sumber audio.
     */
    function preloadAudio() {
        fetch(audioUrl).then(res => res.blob()).then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            if (D.bgMusic) {
                const source = D.bgMusic.querySelector('source');
                if (source) { source.src = blobUrl; D.bgMusic.load(); }
            }
        }).catch(() => { /* Pramuat audio gagal, akan gunakan cadangan */ });
    }

    // ===================================================
    // MANAJER EFEK SUARA - Suara Web Audio yang Lucu & Romantis
    // ===================================================

    const SFX = {
        ctx: null,
        enabled: true,
        countdownInterval: null,
        tickCount: 0,

        /**
         * Inisialisasi malas AudioContext pada interaksi pengguna pertama.
         * @returns {AudioContext} Instance AudioContext bersama.
         */
        getCtx() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return this.ctx;
        },

        /**
         * Membuat nada lonceng lucu dengan vibrato melenting.
         * @param {number} freq - Frekuensi dasar dalam Hz.
         * @param {number} startTime - Waktu AudioContext untuk mulai.
         * @param {number} duration - Durasi dalam detik.
         * @param {number} vol - Tingkat volume (0-1).
         */
        _cuteBell(freq, startTime, duration, vol) {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            // Vibrato melenting
            const vib = ctx.createOscillator();
            const vibGain = ctx.createGain();
            vib.type = 'sine';
            vib.frequency.value = 5.5;
            vibGain.gain.value = freq * 0.008;
            vib.connect(vibGain);
            vibGain.connect(osc.frequency);
            vib.start(startTime);
            vib.stop(startTime + duration);
            // Envelope: serangan cepat, peluruhan melenting
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(vol * 0.4, startTime + duration * 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);

            // Nada atas sparkle
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(freq * 2, startTime);
            gain2.gain.setValueAtTime(0, startTime);
            gain2.gain.linearRampToValueAtTime(vol * 0.25, startTime + 0.005);
            gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.6);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(startTime);
            osc2.stop(startTime + duration * 0.6);

            // Harmonik ketiga - shimmer
            const osc3 = ctx.createOscillator();
            const gain3 = ctx.createGain();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(freq * 3, startTime + 0.02);
            gain3.gain.setValueAtTime(0, startTime + 0.02);
            gain3.gain.linearRampToValueAtTime(vol * 0.1, startTime + 0.03);
            gain3.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.4);
            osc3.connect(gain3);
            gain3.connect(ctx.destination);
            osc3.start(startTime + 0.02);
            osc3.stop(startTime + duration * 0.4);
        },

        /**
         * Membuat suara petikan mirip harpa yang romantis.
         * @param {number} freq - Frekuensi dalam Hz.
         * @param {number} startTime - Waktu AudioContext untuk mulai.
         * @param {number} vol - Tingkat volume (0-1).
         */
        _harpPluck(freq, startTime, vol) {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(vol * 0.3, startTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.8);

            // Gema shimmer
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.frequency.setValueAtTime(freq * 2.01, startTime + 0.03);
            gain2.gain.setValueAtTime(0, startTime + 0.03);
            gain2.gain.linearRampToValueAtTime(vol * 0.15, startTime + 0.04);
            gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(startTime + 0.03);
            osc2.stop(startTime + 0.5);
        },

        /**
         * Membuat suara burst noise yang difilter.
         * @param {number} startTime - Waktu AudioContext untuk mulai.
         * @param {number} duration - Durasi dalam detik.
         * @param {string} filterType - Tipe BiquadFilter (misal. 'bandpass').
         * @param {number|number[]} filterFreq - Frekuensi atau [mulai, akhir] untuk sweep.
         * @param {number} filterQ - Faktor Q untuk filter.
         * @param {number} vol - Tingkat volume (0-1).
         */
        _noiseBurst(startTime, duration, filterType, filterFreq, filterQ, vol) {
            const ctx = this.getCtx();
            const bufferSize = Math.ceil(ctx.sampleRate * duration);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1);
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = filterType;
            if (typeof filterFreq === 'number') {
                filter.frequency.value = filterFreq;
            } else {
                // Array [mulai, akhir] untuk sweep
                filter.frequency.setValueAtTime(filterFreq[0], startTime);
                filter.frequency.exponentialRampToValueAtTime(filterFreq[1], startTime + duration * 0.8);
            }
            filter.Q.value = filterQ;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start(startTime);
            noise.stop(startTime + duration + 0.01);
        },

        /**
         * Memainkan pasangan detak jantung "lub-dub" (osilator dengan frekuensi menurun).
         * @param {Array<{time:number, freqStart:number, freqEnd:number, vol:number, dur:number}>} beats
         */
        _playHeartbeat(beats) {
            const ctx = this.getCtx();
            const now = ctx.currentTime;
            beats.forEach(({ time, freqStart, freqEnd, vol, dur }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freqStart, now + time);
                osc.frequency.exponentialRampToValueAtTime(freqEnd, now + time + dur);
                gain.gain.setValueAtTime(0, now + time);
                gain.gain.linearRampToValueAtTime(vol, now + time + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + time);
                osc.stop(now + time + dur);
            });
        },

        /**
         * Memainkan urutan nada sparkle dengan envelope cepat.
         * @param {number[]} notes - Frekuensi nada.
         * @param {number} offset - Waktu mulai relatif terhadap now (detik).
         * @param {number} interval - Jeda antar nada (detik).
         * @param {number} vol - Volume puncak.
         * @param {number} attack - Waktu serangan (detik).
         * @param {number} dur - Durasi total nada (detik).
         * @param {string} [type='sine'] - Tipe osilator.
         * @param {number} [pitchBend] - Faktor pitch bend (misal. 1.02).
         * @param {number} [bendTime] - Waktu pitch bend relatif terhadap waktu nada (detik).
         */
        _playNoteSeq(notes, offset, interval, vol, attack, dur, type, pitchBend, bendTime) {
            const ctx = this.getCtx();
            const now = ctx.currentTime;
            notes.forEach((freq, i) => {
                const t = now + offset + i * interval;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type || 'sine';
                osc.frequency.setValueAtTime(freq, t);
                if (pitchBend) osc.frequency.exponentialRampToValueAtTime(freq * pitchBend, t + (bendTime || dur * 0.3));
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(vol, t + attack);
                gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + dur);
            });
        },

        // === DETAK HITUNGAN MUNDUR - Twinkle kotak musik lucu ===

        /**
         * Memulai efek suara detak hitungan mundur berulang.
         * Menambahkan nada sambutan ajaib di awal sebagai tanda audio aktif.
         */
        startCountdownTick() {
            this.tickCount = 0;

            // Nada sambutan ajaib — feedback bahwa audio berhasil aktif
            try {
                this._playNoteSeq([1047, 1319, 1568], 0, 0.1, 0.12, 0.01, 0.4);
            } catch (e) { /* Gagal diam-diam */ }

            // Mulai tick pertama setelah nada sambutan
            setTimeout(() => {
                this.playTick();
                this.countdownInterval = setInterval(() => {
                    if (!this.enabled) return;
                    this.playTick();
                }, 1000);
            }, 450);
        },

        /**
         * Memainkan satu nada detak hitungan mundur dengan frekuensi bergantian.
         */
        playTick() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;
                this.tickCount++;

                // Bergantian antara dua nada lucu untuk nuansa musikal
                const isEven = this.tickCount % 2 === 0;
                const baseFreq = isEven ? 1047 : 1319; // C6 / E6 - rentang kotak musik

                // Lonceng kotak musik utama dengan vibrato melenting
                this._cuteBell(baseFreq, now, 0.35, 0.1);

                // Aksen sparkle kecil di setiap detak ke-3
                if (this.tickCount % 3 === 0) {
                    const sparkle = ctx.createOscillator();
                    const sparkGain = ctx.createGain();
                    sparkle.type = 'sine';
                    sparkle.frequency.setValueAtTime(2637, now + 0.05); // E7 tinggi
                    sparkGain.gain.setValueAtTime(0, now + 0.05);
                    sparkGain.gain.linearRampToValueAtTime(0.04, now + 0.06);
                    sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                    sparkle.connect(sparkGain);
                    sparkGain.connect(ctx.destination);
                    sparkle.start(now + 0.05);
                    sparkle.stop(now + 0.2);
                }

                // Setiap detak ke-4 tambahkan harmoni bawah yang lembut dan romantis
                if (this.tickCount % 4 === 0) {
                    this._cuteBell(523.25, now + 0.08, 0.4, 0.06); // Gema lembut C5
                }
            } catch (e) { /* Gagal diam-diam */ }
        },

        /**
         * Menghentikan efek suara detak hitungan mundur.
         */
        stopCountdownTick() {
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
        },

        // === LONCENG BUKA - Sparkle dongeng romantis ===

        /**
         * Memainkan lonceng pembukaan: arpeggio harpa naik + kaskade sparkle + detak jantung.
         */
        playUnlock() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;

                // Arpeggio harpa naik yang romantis (nuansa kisah cinta)
                const harpNotes = [
                    523.25,  // C5
                    659.25,  // E5
                    783.99,  // G5
                    880.00,  // A5
                    1046.50, // C6
                    1318.51, // E6
                ];
                harpNotes.forEach((freq, i) => {
                    this._harpPluck(freq, now + i * 0.1, 0.15);
                });

                // Kaskade sparkle peri ajaib (setelah harpa)
                this._playNoteSeq([1568, 1760, 2093, 2349, 2637, 3136, 3520], 0.55, 0.04, 0.07, 0.005, 0.2, 'sine', 1.02, 0.05);

                // Detak jantung romantis setelah sparkle
                this._playHeartbeat([
                    { time: 0.85, freqStart: 220, freqEnd: 120, vol: 0.15, dur: 0.15 },
                    { time: 0.95, freqStart: 200, freqEnd: 110, vol: 0.1, dur: 0.15 },
                ]);

                // Shimmer debu peri terakhir
                this._cuteBell(2093, now + 1.1, 0.6, 0.08);
                this._cuteBell(2637, now + 1.2, 0.5, 0.06);
            } catch (e) { /* Gagal diam-diam */ }
        },

        // === BUKA SURAT - Flutter hati romantis + bisikan penuh mimpi ===

        /**
         * Memainkan suara buka surat: gesekan kertas, pop segel, flutter hati, dan lonceng.
         */
        playLetterOpen() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;

                // Gesekan kertas yang lembut
                this._noiseBurst(now, 0.5, 'bandpass', [4000, 1200], 1.2, 0.08);

                // Pop segel lucu - "boing" melenting
                const pop = ctx.createOscillator();
                const popGain = ctx.createGain();
                pop.type = 'sine';
                pop.frequency.setValueAtTime(600, now + 0.05);
                pop.frequency.exponentialRampToValueAtTime(300, now + 0.1);
                // Lentingan kembali sedikit
                pop.frequency.linearRampToValueAtTime(350, now + 0.15);
                pop.frequency.exponentialRampToValueAtTime(200, now + 0.25);
                popGain.gain.setValueAtTime(0.2, now + 0.05);
                popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                pop.connect(popGain);
                popGain.connect(ctx.destination);
                pop.start(now + 0.05);
                pop.stop(now + 0.3);

                // Flutter hati romantis - denyut ganda cepat
                const flutter = ctx.createOscillator();
                const flGain = ctx.createGain();
                flutter.type = 'sine';
                flutter.frequency.setValueAtTime(180, now + 0.15);
                flutter.frequency.exponentialRampToValueAtTime(100, now + 0.25);
                flGain.gain.setValueAtTime(0.12, now + 0.15);
                flGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                flutter.connect(flGain);
                flGain.connect(ctx.destination);
                flutter.start(now + 0.15);
                flutter.stop(now + 0.25);

                // Flutter kedua (lebih lembut)
                const flutter2 = ctx.createOscillator();
                const flGain2 = ctx.createGain();
                flutter2.type = 'sine';
                flutter2.frequency.setValueAtTime(160, now + 0.28);
                flutter2.frequency.exponentialRampToValueAtTime(90, now + 0.38);
                flGain2.gain.setValueAtTime(0.08, now + 0.28);
                flGain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
                flutter2.connect(flGain2);
                flGain2.connect(ctx.destination);
                flutter2.start(now + 0.28);
                flutter2.stop(now + 0.38);

                // Lonceng cinta (nada kotak musik setelah membuka)
                this._cuteBell(784, now + 0.35, 0.6, 0.08); // G5
                this._cuteBell(1047, now + 0.5, 0.5, 0.06); // C6

                // Jejak sparkle lembut
                this._playNoteSeq([1568, 1760, 2093], 0.6, 0.08, 0.04, 0.005, 0.15);
            } catch (e) { /* Gagal diam-diam */ }
        },

        // === TIUP LILIN - "Phew~" lucu + pembubaran ajaib ===

        /**
         * Memainkan suara tiup lilin: hembusan, poof, lonceng pembubaran, dan desahan.
         */
        playCandleBlow() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;

                // Tiupan lembut - "phew~"
                this._noiseBurst(now, 0.4, 'bandpass', [300, 3000], 1.8, 0.15);

                // Suara "poof" lucu - pop melenting
                const poof = ctx.createOscillator();
                const poofGain = ctx.createGain();
                poof.type = 'sine';
                poof.frequency.setValueAtTime(400, now + 0.08);
                // Lentingan ke atas
                poof.frequency.exponentialRampToValueAtTime(600, now + 0.12);
                poof.frequency.exponentialRampToValueAtTime(150, now + 0.25);
                poofGain.gain.setValueAtTime(0.18, now + 0.08);
                poofGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                poof.connect(poofGain);
                poofGain.connect(ctx.destination);
                poof.start(now + 0.08);
                poof.stop(now + 0.3);

                // Pembubaran ajaib - nada lonceng penuh mimpi mengambang ke atas
                this._playNoteSeq([1047, 1319, 1568, 1760, 2093], 0.2, 0.07, 0.06, 0.01, 0.35, 'sine', 1.03, 0.1);

                // Desahan penuh mimpi manis - nada turun yang lembut
                const sigh = ctx.createOscillator();
                const sighGain = ctx.createGain();
                sigh.type = 'triangle';
                sigh.frequency.setValueAtTime(660, now + 0.5);
                sigh.frequency.exponentialRampToValueAtTime(440, now + 0.9);
                sighGain.gain.setValueAtTime(0, now + 0.5);
                sighGain.gain.linearRampToValueAtTime(0.08, now + 0.52);
                sighGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
                sigh.connect(sighGain);
                sighGain.connect(ctx.destination);
                sigh.start(now + 0.5);
                sigh.stop(now + 0.9);

                // Sparkle kecil di akhir
                this._cuteBell(1760, now + 0.9, 0.4, 0.05);
            } catch (e) { /* Gagal diam-diam */ }
        },

        // === BUKA HADIAH - Ledakan sparkle cinta + pengungkapan ajaib ===

        /**
         * Memainkan suara buka hadiah: pop, kaskade harpa, hujan sparkle, detak jantung, dan lonceng.
         */
        playGiftOpen() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;

                // "Pop!" lucu - suara membuka hadiah yang melenting
                const pop = ctx.createOscillator();
                const popGain = ctx.createGain();
                pop.type = 'sine';
                pop.frequency.setValueAtTime(500, now);
                pop.frequency.exponentialRampToValueAtTime(800, now + 0.03);
                pop.frequency.exponentialRampToValueAtTime(300, now + 0.1);
                popGain.gain.setValueAtTime(0.2, now);
                popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                pop.connect(popGain);
                popGain.connect(ctx.destination);
                pop.start(now);
                pop.stop(now + 0.15);

                // Kaskade harpa romantis - pengungkapan kisah cinta!
                const loveArpeggio = [
                    523.25,  // C5
                    659.25,  // E5
                    783.99,  // G5
                    880.00,  // A5
                    1046.50, // C6
                    1174.66, // D6
                    1318.51, // E6
                    1567.98, // G6
                    1760.00, // A6
                    2093.00, // C7
                ];
                loveArpeggio.forEach((freq, i) => {
                    this._harpPluck(freq, now + 0.08 + i * 0.055, 0.12);
                });

                // Hujan debu peri ajaib (sparkle lucu turun seperti hujan)
                const sparkleFreqs = [2349, 2637, 2794, 3136, 3322, 3520, 3729, 4186];
                sparkleFreqs.forEach((freq, i) => {
                    const t = now + 0.55 + i * 0.03;
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, t);
                    // Penurunan pitch kecil lalu naik untuk efek "twinkle"
                    osc.frequency.setValueAtTime(freq * 0.98, t);
                    osc.frequency.linearRampToValueAtTime(freq * 1.02, t + 0.02);
                    gain.gain.setValueAtTime(0, t);
                    gain.gain.linearRampToValueAtTime(0.05, t + 0.003);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.12);
                });

                // Detak jantung romantis
                this._playHeartbeat([
                    { time: 0.9, freqStart: 180, freqEnd: 100, vol: 0.15, dur: 0.15 },
                    { time: 1.0, freqStart: 160, freqEnd: 90, vol: 0.1, dur: 0.15 },
                ]);

                // Lonceng cinta terakhir - resolusi kotak musik
                this._cuteBell(1047, now + 1.15, 0.7, 0.1); // C6
                this._cuteBell(1319, now + 1.25, 0.6, 0.08); // E6
                this._cuteBell(1568, now + 1.35, 0.8, 0.12); // G6
                this._cuteBell(2093, now + 1.5, 1.0, 0.1);   // C7 — nada sparkle terakhir
            } catch (e) { /* Gagal diam-diam */ }
        },

        // === PASSWORD SALAH - "Boing~" kartun lucu + suara kecewa manis ===

        /**
         * Memainkan suara password salah: boing kartun melenting, "wah-wah" kecewa yang lucu,
         * dan sparkle kecil penghibur agar tetap terasa manis dan tidak menakutkan.
         */
        playWrongPassword() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;

                // === Boing kartun lucu - suara melenting yang menggemaskan ===
                const boing = ctx.createOscillator();
                const boingGain = ctx.createGain();
                boing.type = 'sine';
                // Naik cepat lalu turun perlahan — efek "boing"
                boing.frequency.setValueAtTime(200, now);
                boing.frequency.exponentialRampToValueAtTime(600, now + 0.04);
                boing.frequency.exponentialRampToValueAtTime(150, now + 0.3);
                // Lentingan kedua yang lebih kecil
                boing.frequency.exponentialRampToValueAtTime(400, now + 0.35);
                boing.frequency.exponentialRampToValueAtTime(120, now + 0.55);
                boingGain.gain.setValueAtTime(0.2, now);
                boingGain.gain.exponentialRampToValueAtTime(0.12, now + 0.15);
                boingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                boing.connect(boingGain);
                boingGain.connect(ctx.destination);
                boing.start(now);
                boing.stop(now + 0.55);

                // === Harmonik "boing" — suara lebih gemuk dan kartun ===
                const boingHarm = ctx.createOscillator();
                const boingHarmGain = ctx.createGain();
                boingHarm.type = 'triangle';
                boingHarm.frequency.setValueAtTime(400, now);
                boingHarm.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
                boingHarm.frequency.exponentialRampToValueAtTime(300, now + 0.3);
                boingHarm.frequency.exponentialRampToValueAtTime(800, now + 0.35);
                boingHarm.frequency.exponentialRampToValueAtTime(240, now + 0.55);
                boingHarmGain.gain.setValueAtTime(0.08, now);
                boingHarmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                boingHarm.connect(boingHarmGain);
                boingHarmGain.connect(ctx.destination);
                boingHarm.start(now);
                boingHarm.stop(now + 0.55);

                // === "Wah wah" kecewa yang lucu — trombon kartun mini ===
                const wah1 = ctx.createOscillator();
                const wah1Gain = ctx.createGain();
                wah1.type = 'sawtooth';
                // Nada turun pertama — "waaaah~"
                wah1.frequency.setValueAtTime(350, now + 0.2);
                wah1.frequency.exponentialRampToValueAtTime(200, now + 0.45);
                wah1Gain.gain.setValueAtTime(0, now + 0.2);
                wah1Gain.gain.linearRampToValueAtTime(0.06, now + 0.22);
                wah1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                // Filter agar sawtooth terdengar lembut, tidak kasar
                const wahFilter = ctx.createBiquadFilter();
                wahFilter.type = 'lowpass';
                wahFilter.frequency.value = 1200;
                wahFilter.Q.value = 2;
                wah1.connect(wahFilter);
                wahFilter.connect(wah1Gain);
                wah1Gain.connect(ctx.destination);
                wah1.start(now + 0.2);
                wah1.stop(now + 0.45);

                // Nada turun kedua — "wah~" (lebih rendah)
                const wah2 = ctx.createOscillator();
                const wah2Gain = ctx.createGain();
                wah2.type = 'sawtooth';
                wah2.frequency.setValueAtTime(280, now + 0.4);
                wah2.frequency.exponentialRampToValueAtTime(150, now + 0.65);
                wah2Gain.gain.setValueAtTime(0, now + 0.4);
                wah2Gain.gain.linearRampToValueAtTime(0.04, now + 0.42);
                wah2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
                const wah2Filter = ctx.createBiquadFilter();
                wah2Filter.type = 'lowpass';
                wah2Filter.frequency.value = 1000;
                wah2Filter.Q.value = 2;
                wah2.connect(wah2Filter);
                wah2Filter.connect(wah2Gain);
                wah2Gain.connect(ctx.destination);
                wah2.start(now + 0.4);
                wah2.stop(now + 0.65);

                // === Pop lucu di awal — "tuk!" ===
                const pop = ctx.createOscillator();
                const popGain = ctx.createGain();
                pop.type = 'sine';
                pop.frequency.setValueAtTime(800, now);
                pop.frequency.exponentialRampToValueAtTime(300, now + 0.06);
                popGain.gain.setValueAtTime(0.15, now);
                popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                pop.connect(popGain);
                popGain.connect(ctx.destination);
                pop.start(now);
                pop.stop(now + 0.08);

                // === Sparkle penghibur manis ===
                // Lonceng kecil yang menggemaskan
                this._cuteBell(659, now + 0.6, 0.4, 0.06);   // E5
                this._cuteBell(784, now + 0.72, 0.35, 0.05);  // G5
                this._cuteBell(1047, now + 0.85, 0.3, 0.04);  // C6

                // === Jingle "coba lagi" yang menghibur — nada naik pendek ===
                this._playNoteSeq([523, 587, 659], 0.95, 0.08, 0.07, 0.01, 0.2, 'triangle');
            } catch (e) { /* Gagal diam-diam */ }
        },

        // === HARI H - Fanfare ulang tahun yang meriah & ajaib! ===

        /**
         * Memainkan fanfare ulang tahun yang meriah: kaskade harpa, lonceng celebrasi,
         * burst sparkle peri, dan resolusi akhir yang penuh kebahagiaan!
         */
        playBirthdayFanfare() {
            try {
                const ctx = this.getCtx();
                const now = ctx.currentTime;

                // === Fase 1: Persiapan ajaib — sparkle naik perlahan ===
                this._playNoteSeq([523.25, 659.25, 783.99, 1046.50, 1318.51], 0, 0.09, 0.1, 0.01, 0.3, 'sine', 1.05, 0.08);

                // === Fase 2: Fanfare utama — arpeggio harpa naik yang meriah (0.4s - 1.2s) ===
                const fanfareArpeggio = [
                    523.25,  // C5
                    659.25,  // E5
                    783.99,  // G5
                    1046.50, // C6
                    1174.66, // D6
                    1318.51, // E6
                    1567.98, // G6
                    1760.00, // A6
                    2093.00, // C7
                ];
                fanfareArpeggio.forEach((freq, i) => {
                    this._harpPluck(freq, now + 0.4 + i * 0.07, 0.18);
                });

                // === Fase 3: Lonceng celebrasi — kotak musik raksasa (1.0s - 2.0s) ===
                const bellNotes = [
                    { freq: 1047, time: 1.0, dur: 0.8, vol: 0.12 },   // C6
                    { freq: 1319, time: 1.1, dur: 0.7, vol: 0.1 },    // E6
                    { freq: 1568, time: 1.2, dur: 0.8, vol: 0.12 },   // G6
                    { freq: 2093, time: 1.35, dur: 1.0, vol: 0.15 },  // C7 — nada puncak!
                    { freq: 2637, time: 1.5, dur: 0.9, vol: 0.1 },    // E7
                    { freq: 2093, time: 1.7, dur: 1.2, vol: 0.12 },   // C7 — resolusi
                ];
                bellNotes.forEach(({ freq, time, dur, vol }) => {
                    this._cuteBell(freq, now + time, dur, vol);
                });

                // === Fase 4: Hujan sparkle peri — cascade dari atas ===
                this._playNoteSeq([2349, 2637, 2794, 3136, 3322, 3520, 3729, 4186, 3520, 3136, 2637, 2349], 1.5, 0.06, 0.06, 0.005, 0.18, 'sine', 1.02, 0.03);

                // === Fase 5: Detak jantung bahagia — "lub-dub" besar ===
                this._playHeartbeat([
                    { time: 2.0, freqStart: 250, freqEnd: 120, vol: 0.2, dur: 0.2 },
                    { time: 2.15, freqStart: 220, freqEnd: 100, vol: 0.15, dur: 0.2 },
                ]);

                // === Fase 6: Resolusi akhir — akord besar penuh kebahagiaan (2.3s - 3.5s) ===
                const finalChord = [523.25, 659.25, 783.99, 1046.50]; // C major — kebahagiaan!
                finalChord.forEach((freq, i) => {
                    const t = now + 2.3;
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = (i === 0) ? 'sine' : 'triangle';
                    osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0, t);
                    gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + 1.5);
                });

                // Sparkle terakhir manis
                this._cuteBell(2093, now + 3.0, 1.0, 0.08);
                this._cuteBell(2637, now + 3.2, 0.8, 0.06);
                this._cuteBell(3520, now + 3.4, 0.6, 0.04);
            } catch (e) { /* Gagal diam-diam */ }
        },

        // === HENTIKAN SEMUA SFX - Menghentikan semua efek suara (TAPI BUKAN musik latar) ===

        /**
         * Menghentikan semua efek suara dan menutup AudioContext.
         * Musik latar TIDAK terpengaruh.
         */
        stopAll() {
            this.enabled = false;
            this.stopCountdownTick();
            // Tutup AudioContext untuk memotong suara yang tersisa
            if (this.ctx) {
                try { this.ctx.close(); } catch (e) {}
                this.ctx = null;
            }
        }
    };

    // ===================================================
    // KETUK UNTUK MASUK — Buka kunci AudioContext agar suara bisa autoplay
    // ===================================================

    let audioUnlocked = false;

    /**
     * Mencoba unlock AudioContext dan memulai hitungan mundur dengan suara.
     * Dipanggil saat user menget layar "Tap to Enter".
     */
    function unlockAudioAndStart() {
        if (audioUnlocked) return;
        audioUnlocked = true;

        // 1. Buat dan resume AudioContext segera
        try {
            const ctx = SFX.getCtx();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
        } catch (e) { /* Gagal diam-diam */ }

        // 2. Pudarkan overlay tap
        if (D.tapOverlay) {
            D.tapOverlay.classList.add('leaving');
            setTimeout(() => { D.tapOverlay.remove(); }, 900);
        }

        // 3. Tampilkan splash screen dengan animasi fade-in
        if (D.splash) {
            D.splash.style.opacity = '1';
            D.splash.style.pointerEvents = 'auto';
            D.splash.style.transition = 'opacity 0.8s ease-out';
        }

        // 4. Mulai hitungan mundur dengan suara (sekarang AudioContext sudah aktif!)
        setTimeout(() => {
            initSplashCountdown();
        }, 100);

        // 5. Hapus semua listener tap overlay
        document.removeEventListener('click', handleTapToEnter);
        document.removeEventListener('touchend', handleTapToEnter);
        document.removeEventListener('keydown', handleTapToEnter);
    }

    /**
     * Handler untuk tap overlay — memastikan hanya dipicu sekali.
     */
    function handleTapToEnter(e) {
        // Cegah double-trigger dari click + touchend
        e.preventDefault();
        unlockAudioAndStart();
    }

    // ===================================================
    // EFEK TYPEWRITER HALAMAN TAP
    // ===================================================

    /**
     * Memulai animasi mesin ketik untuk teks di halaman "Tap to Enter".
     * Teks utama diketik dulu, lalu sub-teks, dengan kursor berkedip.
     */
    function initTapTypewriter() {
        const textEl = document.querySelector('.tap-overlay-text');
        const subEl = document.querySelector('.tap-overlay-sub');
        if (!textEl || !subEl) return;

        // Simpan teks asli lalu kosongkan
        const mainText = textEl.textContent;
        const subText = subEl.textContent;
        textEl.textContent = '';
        subEl.textContent = '';

        const speed = 60; // Milidetik per huruf
        let mainIdx = 0;
        let subIdx = 0;

        // Fase 1: Ketik teks utama
        textEl.classList.add('typing');
        function typeMain() {
            if (mainIdx < mainText.length) {
                textEl.textContent += mainText[mainIdx++];
                // Jeda lebih lama di spasi dan tanda baca
                const ch = mainText[mainIdx - 1];
                const pause = (ch === ' ' || ch === ',' || ch === '.' || ch === '♡') ? speed * 2 : speed;
                setTimeout(typeMain, pause);
            } else {
                // Selesai mengetik teks utama — hapus kursor, lanjut ke sub-teks
                textEl.classList.remove('typing');
                setTimeout(typeSub, 300);
            }
        }

        // Fase 2: Ketik sub-teks
        function typeSub() {
            subEl.classList.add('typing');
            function typeSubChar() {
                if (subIdx < subText.length) {
                    subEl.textContent += subText[subIdx++];
                    const ch = subText[subIdx - 1];
                    const pause = (ch === ' ' || ch === ',' || ch === '.' || ch === '♡') ? speed * 2 : speed;
                    setTimeout(typeSubChar, pause);
                } else {
                    subEl.classList.remove('typing');
                }
            }
            typeSubChar();
        }

        // Mulai setelah animasi masuk selesai (1 detik)
        setTimeout(typeMain, 1000);
    }

    // Pasang listener ke tap overlay
    (function setupTapOverlay() {
        if (!D.tapOverlay) {
            // Fallback: jika overlay tidak ada, langsung unlock
            audioUnlocked = true;
            try { SFX.getCtx(); } catch(e) {}
            initSplashCountdown();
            return;
        }
        D.tapOverlay.addEventListener('click', handleTapToEnter);
        D.tapOverlay.addEventListener('touchend', handleTapToEnter, { passive: false });
        document.addEventListener('keydown', handleTapToEnter, { once: true });

        // Mulai efek typewriter di halaman tap
        initTapTypewriter();
    })();

    // ===================================================
    // LATAR BELAKANG DINAMIS - Canvas Partikel
    // ===================================================

    /**
     * Menginisialisasi latar belakang partikel animasi dengan gelembung, bintang, sparkle, dan orb.
     */
    function initDynamicBackground() {
        const c = D.bgCanvas;
        if (!c) return;
        if (prefersReducedMotion) return; // Lewati animasi canvas untuk pengguna yang minta dikurangi
        const ctx = c.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w, h;
        let canvasVisible = true;
        document.addEventListener('visibilitychange', () => { canvasVisible = !document.hidden; });

        function resize() {
            w = window.innerWidth; h = window.innerHeight;
            c.width = w * dpr; c.height = h * dpr;
            c.style.width = w + 'px'; c.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize(); onResize(resize);

        const particleCount = isLowEnd ? 20 : (isMobile ? 35 : 55);
        const colors = [
            { r: 147, g: 51, b: 234 }, { r: 168, g: 85, b: 247 }, { r: 192, g: 132, b: 252 },
            { r: 216, g: 180, b: 254 }, { r: 236, g: 72, b: 153 }, { r: 244, g: 114, b: 182 }, { r: 252, g: 211, b: 77 },
        ];
        const types = ['bubble', 'star', 'sparkle', 'orb'];
        const particles = [];
        for (let i = 0; i < particleCount; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const baseSize = type === 'orb' ? (Math.random() * 28 + 12) : type === 'bubble' ? (Math.random() * 10 + 3) : type === 'star' ? (Math.random() * 3 + 1.5) : (Math.random() * 2 + 0.8);
            particles.push({
                type, color, x: Math.random() * w, y: Math.random() * h,
                size: Math.max(1, baseSize), alpha: Math.random() * 0.25 + 0.04,
                vx: (Math.random() - 0.5) * (type === 'orb' ? 0.25 : 0.5),
                vy: (Math.random() - 0.5) * (type === 'orb' ? 0.15 : 0.4),
                pulseSpeed: Math.random() * 0.02 + 0.008, pulsePhase: Math.random() * Math.PI * 2,
                rotation: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.015,
                twinkleSpeed: Math.random() * 0.04 + 0.015, twinklePhase: Math.random() * Math.PI * 2,
                oscAmp: Math.random() * 0.4 + 0.08, oscFreq: Math.random() * 0.007 + 0.002,
                t: Math.random() * 1000,
            });
        }

        function drawStar(cx, cy, r, rot, alpha, color) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},1)`;
            ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},0.5)`;
            ctx.shadowBlur = r * 2.5; ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI / 2) * i;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                const ma = a + Math.PI / 4;
                ctx.lineTo(Math.cos(ma) * r * 0.3, Math.sin(ma) * r * 0.3);
            }
            ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
        }

        function drawBubble(cx, cy, r, alpha, color) {
            const radius = Math.max(1, r);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
            ctx.fill();
            // Sorotan halus
            ctx.beginPath();
            ctx.arc(cx - radius * 0.3, cy - radius * 0.3, Math.max(0.5, radius * 0.3), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
            ctx.fill();
        }

        function drawSparkle(cx, cy, r, alpha, color) {
            ctx.save(); ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},1)`;
            ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},0.7)`;
            ctx.shadowBlur = r * 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0; ctx.restore();
        }

        function drawOrb(cx, cy, r, alpha, color) {
            const radius = Math.max(1, r);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.6})`;
            ctx.fill();
            // Cahaya luar
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.15})`;
            ctx.fill();
        }

        const drawFns = { bubble: drawBubble, star: drawStar, sparkle: drawSparkle, orb: drawOrb };

        function animate() {
            if (!canvasVisible) { requestAnimationFrame(animate); return; }
            ctx.clearRect(0, 0, w, h);
            for (const p of particles) {
                p.t++; p.x += p.vx + Math.sin(p.t * p.oscFreq) * p.oscAmp;
                p.y += p.vy + Math.cos(p.t * p.oscFreq * 0.7) * p.oscAmp * 0.5;
                p.rotation += p.rotSpeed;
                if (p.x < -p.size * 2) p.x = w + p.size;
                if (p.x > w + p.size * 2) p.x = -p.size;
                if (p.y < -p.size * 2) p.y = h + p.size;
                if (p.y > h + p.size * 2) p.y = -p.size;
                const pulse = Math.sin(p.t * p.pulseSpeed + p.pulsePhase);
                const currentSize = Math.max(1, p.size * (1 + pulse * 0.15));
                const currentAlpha = p.alpha * (0.7 + pulse * 0.3);
                const twinkle = p.type === 'sparkle' ? (Math.sin(p.t * p.twinkleSpeed + p.twinklePhase) + 1) * 0.5 : 1;
                drawFns[p.type](p.x, p.y, p.type === 'sparkle' ? currentSize * (0.5 + twinkle * 0.5) : currentSize, currentAlpha * twinkle, p.color);
            }
            requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    }

    // ===================================================
    // JEJAK SPARKLE (hanya desktop)
    // ===================================================

    /**
     * Menginisialisasi efek jejak sparkle yang mengikuti kursor mouse di desktop.
     */
    function initSparkleTrail() {
        if (isMobile || prefersReducedMotion) return;
        let lastTime = 0;
        const colors = ['#c084fc', '#f472b6', '#fcd34d', '#d8b4fe', '#f9a8d4', '#fff'];
        const cleaner = createBatchCleaner(800, 200);
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastTime < CFG.SPARKLE_INTERVAL) return;
            lastTime = now;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 5 + 2;
            const spark = document.createElement('div');
            spark.className = 'sparkle';
            spark.style.cssText = `left:${e.clientX - size / 2}px;top:${e.clientY - size / 2}px;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size}px ${color};`;
            D.sparkleTrail.appendChild(spark);
            cleaner.add(spark);
        });
    }

    // ===================================================
    // HATI TAP
    // ===================================================

    /**
     * Menginisialisasi efek emoji saat tap/klik di mana pun di halaman.
     * Aktif dari halaman awal (tap overlay) sampai halaman akhir (footer).
     * Menggunakan semua emoji yang ada di seluruh halaman.
     */
    function initTapHearts() {
        const hearts = [
            '\u2661', '\u{1F497}', '\u{1F495}', '\u{1F496}', '\u{1FA77}', '\u{1F90D}',
            '\u2728', '\u264B', '\u{1F411}', '\u{1F981}', '\u{1F9F8}', '\u{1F338}',
            '\u{1F980}', '\u{1F431}', '\u{1F98B}', '\u{1F382}', '\u{1F381}', '\u{1F48C}',
            '\u2B50', '\u{1F31F}', '\u{1F4AB}', '\u2726', '\u2727', '\u{1F33A}',
            '\u{1F337}', '\u{1F380}', '\u{1F33B}', '\u{1F319}', '\u2764', '\u{1F49D}',
        ];
        const cleaner = createBatchCleaner(1600, 400);

        function spawnHeart(x, y) {
            const heart = document.createElement('div');
            heart.className = 'tap-heart';
            heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
            heart.style.cssText = `left:${x - 10}px;top:${y - 10}px;font-size:${Math.random() * 0.7 + 0.9}rem;`;
            D.tapHearts.appendChild(heart);
            cleaner.add(heart);
        }

        document.addEventListener('click', (e) => { spawnHeart(e.clientX, e.clientY); });
        document.addEventListener('touchend', (e) => {
            const t = e.changedTouches[0];
            if (t) spawnHeart(t.clientX, t.clientY);
        }, { passive: true });
    }

    // ===================================================
    // EFEK RIPPLE
    // ===================================================

    /**
     * Menambahkan efek ripple material-design ke tombol interaktif.
     */
    function initRipple() {
        document.querySelectorAll('.letter-modal-close, .surprise-ok, .slide-arrow, .splash-pw-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const ripple = document.createElement('span');
                ripple.className = 'ripple';
                ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;`;
                this.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            });
        });
    }

    // ===================================================
    // EFEK MESIN KETIK
    // ===================================================

    /**
     * Memulai animasi mesin ketik untuk paragraf surat dengan [data-typewriter].
     */
    function startTypewriter() {
        if (S.typewriterDone) return;
        S.typewriterDone = true;
        const paragraphs = D.letterContent.querySelectorAll('[data-typewriter]');
        let pIdx = 0;

        function typeNext() {
            if (pIdx >= paragraphs.length) return;
            const p = paragraphs[pIdx];
            const fullText = p.textContent;
            p.textContent = ''; p.classList.add('typing');
            let ci = 0;
            (function typeChar() {
                if (ci < fullText.length) {
                    p.textContent += fullText[ci++];
                    setTimeout(typeChar, CFG.TYPEWRITER_SPEED);
                } else {
                    p.classList.remove('typing');
                    pIdx++;
                    if (pIdx < paragraphs.length) setTimeout(typeNext, 250);
                }
            })();
        }
        typeNext();
    }

    // ===================================================
    // VISUALISASI AUDIO
    // ===================================================

    /**
     * Menginisialisasi bar visualisasi audio animasi (selalu menampilkan animasi, tanpa toggle).
     */
    function initAudioViz() {
        const vizBarCount = prefersReducedMotion ? Math.ceil(CFG.VIZ_BAR_COUNT / 2) : CFG.VIZ_BAR_COUNT;
        for (let i = 0; i < vizBarCount; i++) {
            const bar = document.createElement('div');
            bar.className = 'viz-bar';
            bar.style.height = '2px';
            D.audioViz.appendChild(bar);
        }
        const bars = D.audioViz.querySelectorAll('.viz-bar');
        S.audioVizInterval = setInterval(() => {
            bars.forEach(bar => {
                bar.style.height = (Math.random() * 18 + 2) + 'px';
                bar.style.opacity = 0.35 + Math.random() * 0.35;
            });
        }, 150);
    }

    // ===================================================
    // KUTIP HARAPAN
    // ===================================================

    /**
     * Menginisialisasi bagian harapan/kue dengan penangan klik, emoji mengambang, dan bintang jatuh.
     */
    function initWish() {
        D.wishCake.addEventListener('click', makeWish);
        // Tunda animasi harapan sampai bagian mendekati viewport
        if (D.wishSection) {
            const wishObs = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        initWishFloatingEmojis();
                        initWishShootingStars();
                        wishObs.disconnect(); // Hanya inisialisasi sekali
                    }
                });
            }, { rootMargin: '200px 0px', threshold: 0 });
            wishObs.observe(D.wishSection);
        } else {
            // Cadangan jika elemen bagian harapan tidak ada
            initWishFloatingEmojis();
            initWishShootingStars();
        }
    }

    /**
     * Membuat partikel emoji mengambang di bagian harapan.
     */
    function initWishFloatingEmojis() {
        if (!D.wishFloatEmojis) return;
        const emojis = ['✨', '🌟', '💫', '♡', '🌸', '♋', '🦁', '🧸', '🦀', '🐱', '🦋', '🐑', '🎂', '🎀', '💌', '🌺'];
        const count = prefersReducedMotion ? (isMobile ? 3 : 5) : (isMobile ? 6 : 10);
        for (let i = 0; i < count; i++) {
            const el = document.createElement('span');
            el.className = 'wish-float-emoji';
            el.textContent = emojis[i % emojis.length];
            el.style.cssText = `font-size:${Math.random() * 0.6 + 0.6}rem;left:${Math.random() * 85 + 7}%;animation-duration:${Math.random() * 10 + 10}s;animation-delay:${Math.random() * 8}s;opacity:${Math.random() * 0.25 + 0.08};`;
            D.wishFloatEmojis.appendChild(el);
        }
    }

    /**
     * Membuat animasi bintang jatuh berkala di bagian harapan.
     */
    function initWishShootingStars() {
        if (!D.wishSection || prefersReducedMotion) return;

        function spawnStar() {
            if (S.wishMade) return;
            const star = document.createElement('div');
            star.className = 'wish-shooting-star';
            const angle = -(25 + Math.random() * 30);
            const dist = 200 + Math.random() * 300;
            const rad = angle * Math.PI / 180;
            star.style.cssText = `left:${Math.random() * 60 + 10}%;top:${Math.random() * 40 + 5}%;--ss-angle:${angle}deg;--ss-dx:${Math.cos(rad) * dist}px;--ss-dy:${-Math.sin(rad) * dist}px;--ss-dur:${1 + Math.random()}s;`;
            D.wishSection.appendChild(star);
            setTimeout(() => star.remove(), 3000);
            setTimeout(spawnStar, 3000 + Math.random() * 6000);
        }
        setTimeout(spawnStar, 2000);
    }

    /**
     * Menangani klik harapan/kue: meniup lilin, memunculkan efek, dan menembakkan konfeti.
     */
    function makeWish() {
        if (S.wishMade) {
            // Nyalakan lilin lagi — reset semuanya agar bisa ditiup lagi
            S.wishMade = false;
            D.candleFlame.classList.remove('blown');
            D.candleGlow.classList.remove('extinguished');
            D.wishMessage.classList.remove('show');
            // Tampilkan teks petunjuk lagi dengan animasi baru
            D.wishHint.classList.remove('hidden');
            // Hapus efek yang tersisa
            if (D.wishSection) {
                D.wishSection.querySelectorAll('.blow-effects, .wish-burst-emoji, .wish-shooting-star, .smoke-container').forEach(el => el.innerHTML = '');
            }
            return;
        }
        S.wishMade = true;
        // Fase 1: Api mulai berkedip lebih cepat (persiapan tiupan)
        setTimeout(() => D.candleFlame.classList.add('flicker'), 200);
        // Fase 2: Kedipan lebih intensif (siap untuk ditiup)
        setTimeout(() => {
            D.candleFlame.classList.remove('flicker');
            // Jeda singkat lalu kedipan kedua
            setTimeout(() => D.candleFlame.classList.add('flicker'), 100);
        }, 500);
        // Fase 3: Tiupan lilin — api padam dengan efek dramatis
        setTimeout(() => {
            D.candleFlame.classList.remove('flicker');
            D.candleFlame.classList.add('blown');
            // Putar efek suara tiupan lilin
            SFX.playCandleBlow();
            D.candleGlow.classList.add('extinguished');
            if (D.wishSection) { D.wishSection.classList.add('blow-flash'); setTimeout(() => D.wishSection.classList.remove('blow-flash'), 1200); }
            spawnSmoke(); spawnCandleSparks(); spawnShockwave(); spawnEmojiBurst();
        }, 1000);
        setTimeout(() => D.wishHint.classList.add('hidden'), 800);
        setTimeout(() => D.wishMessage.classList.add('show'), 2000);
        setTimeout(() => fireConfetti(isMobile ? 60 : 140), 1100);
        setTimeout(() => fireConfetti(isMobile ? 30 : 60), 2200);
    }

    /**
     * Memunculkan partikel asap dari lilin setelah ditiup.
     */
    function spawnSmoke() {
        if (!D.smokeContainer) return;
        const count = isMobile ? 4 : 6;
        for (let i = 0; i < count; i++) {
            const smoke = document.createElement('div');
            smoke.className = 'smoke-particle';
            smoke.style.cssText = `--smoke-dur:${1.5 + Math.random() * 1.5}s;--smoke-delay:${i * 0.15}s;--smoke-drift:${(Math.random() - 0.5) * 20}px;--smoke-drift2:${(Math.random() - 0.5) * 15}px;--smoke-drift3:${(Math.random() - 0.5) * 25}px;width:${6 + Math.random() * 5}px;height:${6 + Math.random() * 5}px;`;
            D.smokeContainer.appendChild(smoke);
            setTimeout(() => smoke.remove(), 4000);
        }
    }

    /**
     * Memunculkan partikel spark dari lilin setelah ditiup.
     */
    function spawnCandleSparks() {
        const candle = document.querySelector('.candle');
        if (!candle || !D.wishCake) return;
        const count = isMobile ? 5 : 10;
        for (let i = 0; i < count; i++) {
            const spark = document.createElement('div');
            spark.className = 'candle-spark';
            const angle = Math.random() * Math.PI * 2;
            const dist = 18 + Math.random() * 35;
            spark.style.cssText = `left:50%;top:-5px;--sx:${Math.cos(angle) * dist}px;--sy:${Math.sin(angle) * dist - 18}px;animation-delay:${Math.random() * 0.3}s;animation-duration:${0.5 + Math.random() * 0.4}s;`;
            candle.appendChild(spark);
            setTimeout(() => spark.remove(), 1500);
        }
    }

    /**
     * Memunculkan cincin gelombang kejut yang meluas dari kue.
     */
    function spawnShockwave() {
        if (!D.blowEffects || !D.wishCake) return;
        for (let i = 0; i < 2; i++) {
            const wave = document.createElement('div');
            wave.className = 'blow-shockwave';
            if (D.wishSection) {
                const sRect = D.wishSection.getBoundingClientRect();
                const cRect = D.wishCake.getBoundingClientRect();
                wave.style.left = (cRect.left + cRect.width / 2 - sRect.left) + 'px';
                wave.style.top = (cRect.top - sRect.top + 10) + 'px';
            }
            wave.style.animationDelay = (i * 0.2) + 's';
            wave.style.borderColor = i === 0 ? 'rgba(255,200,50,0.5)' : 'rgba(147,51,234,0.4)';
            D.blowEffects.appendChild(wave);
            setTimeout(() => wave.remove(), 2000);
        }
    }

    /**
     * Memunculkan ledakan emoji yang memancar dari kue.
     */
    function spawnEmojiBurst() {
        if (!D.wishSection) return;
        const emojis = ['✨', '🌟', '💫', '♡', '🌸', '🎀', '🎂', '♋', '🦁', '🧸', '🦀', '🐱', '🦋', '🐑', '💌', '🌺', '🌷', '🪄', '🎁'];
        const count = isMobile ? 14 : 22;
        const sRect = D.wishSection.getBoundingClientRect();
        const cRect = D.wishCake.getBoundingClientRect();
        const cx = cRect.left + cRect.width / 2 - sRect.left;
        const cy = cRect.top - sRect.top + 10;
        for (let i = 0; i < count; i++) {
            const el = document.createElement('span');
            el.className = 'wish-burst-emoji';
            el.textContent = emojis[i % emojis.length];
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const dist = 50 + Math.random() * 100;
            el.style.cssText = `left:${cx}px;top:${cy}px;--bx:${Math.cos(angle) * dist}px;--by:${Math.sin(angle) * dist - 35}px;animation-delay:${Math.random() * 0.3}s;font-size:${1.1 + Math.random() * 0.8}rem;`;
            D.wishSection.appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }
    }

    // ===================================================
    // LAYAR PEMBUKA - Pintu masuk misterius dengan hitungan mundur & kata sandi
    // ===================================================

    /**
     * Menginisialisasi layar pembuka dengan animasi canvas, pesona, dan input kata sandi.
     * Hitungan mundur diinisialisasi terpisah oleh unlockAudioAndStart() agar AudioContext sudah aktif.
     */
    function initSplash() {
        animateSplashCanvas();
        createSplashCharms();
        // initSplashCountdown() dipanggil dari unlockAudioAndStart() setelah AudioContext di-resume
        initPasswordEntry();
        // Auto-scale splash-center agar konten selalu fit di viewport tanpa scroll
        fitSplashCenter();
        onResize(fitSplashCenter);
        // Catatan: touchmove preventDefault dihapus dari splash agar
        // splash-center yang overflow-y: auto bisa di-scroll di perangkat touch
    }

    /**
     * Memastikan .splash-center memiliki max-height yang tepat agar konten
     * bisa di-scroll di dalamnya jika melebihi viewport.
     * Tidak lagi menggunakan scale — cukup overflow-y: auto di CSS.
     */
    function fitSplashCenter() {
        const center = document.querySelector('.splash-center');
        if (!center) return;
        // Reset transform — tidak perlu scale lagi
        center.style.transform = 'translate3d(0,0,0)';
        center.style.transformOrigin = 'center center';

        // Hitung max-height berdasarkan viewport yang tersedia
        const vh = window.innerHeight;
        const safeT = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
        const safeB = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
        const availH = vh - safeT - safeB - 32; // 32px margin tambahan
        center.style.maxHeight = availH + 'px';
    }

    /**
     * Menganimasikan latar belakang layar pembuka dengan orb gradien mengambang.
     */
    function animateSplashCanvas() {
        // Animasi orb canvas dinonaktifkan — tidak ada gerakan di layar pembuka
        const c = D.splashCanvas;
        if (!c) return;
        c.width = window.innerWidth;
        c.height = window.innerHeight;
    }

    /**
     * Membuat pesona emoji mengambang di layar pembuka.
     */
    function createSplashCharms() {
        // Emoji mengambang charm dinonaktifkan — tidak ada gerakan di layar pembuka
        // Emoji dekoratif statis sebagai gantinya
        const emojis = ['♡', '🌸', '✨', '♋', '🦁', '🧸', '🎀', '🦀', '🦋', '💫', '🐱', '🐑'];
        const count = Math.min(CFG.SPLASH_PARTICLE_COUNT, 8); // Lebih sedikit charm statis
        for (let i = 0; i < count; i++) {
            const el = document.createElement('span');
            el.textContent = emojis[i % emojis.length];
            el.style.cssText = `position:absolute;font-size:${Math.random() * 1.1 + 0.7}rem;left:${Math.random() * 100}%;top:${Math.random() * 100}%;opacity:${Math.random() * 0.12 + 0.04};animation:none;pointer-events:none;`;
            D.splashCharms.appendChild(el);
        }
    }

    // ===================================================
    // HITUNGAN MUNDUR LAYAR PEMBUKA - Hitung mundur sampai 5 Juli 2026
    // ===================================================

    /**
     * Mengisi tampilan countdown ke nol dan menampilkan pesan hari H.
     */
    function setCountdownZero() {
        if (D.scdDays) D.scdDays.textContent = '0';
        if (D.scdHours) D.scdHours.textContent = '0';
        if (D.scdMins) D.scdMins.textContent = '0';
        if (D.scdSecs) D.scdSecs.textContent = '0';
        if (D.scdMsg) D.scdMsg.textContent = "It's your day, my radiant darling~ Happy Birthday! \u{1F389}\u{1F382}\u2661";
    }

    /**
     * Menginisialisasi penghitung mundur ke tanggal target ulang tahun.
     */
    function initSplashCountdown() {
        const target = CFG.BIRTHDAY_TARGET;

        const initialDiff = target - new Date();
        if (initialDiff <= 0) {
            setCountdownZero();
            triggerBirthdayCelebration();
            return;
        }

        // Jika sisa waktu <= 60 detik, langsung mulai efek H-1 menit!
        if (initialDiff <= 60000 && !S.h1mActive) {
            const remainingSec = Math.ceil(initialDiff / 1000);
            H1M.start(remainingSec);
            return;
        }

        SFX.startCountdownTick();

        function update() {
            const diff = target - new Date();
            if (diff <= 0) {
                SFX.stopCountdownTick();
                setCountdownZero();
                clearInterval(S.splashCountdownInterval);
                triggerBirthdayCelebration();
                return;
            }

            // Jika sisa waktu <= 60 detik, mulai efek H-1 menit!
            if (diff <= 60000 && !S.h1mActive) {
                SFX.stopCountdownTick();
                clearInterval(S.splashCountdownInterval);
                const remainingSec = Math.ceil(diff / 1000);
                H1M.start(remainingSec);
                return;
            }

            if (D.scdDays) D.scdDays.textContent = Math.floor(diff / (1000 * 60 * 60 * 24));
            if (D.scdHours) D.scdHours.textContent = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
            if (D.scdMins) D.scdMins.textContent = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
            if (D.scdSecs) D.scdSecs.textContent = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
        }
        update();
        S.splashCountdownInterval = setInterval(update, 1000);
    }

    // ===================================================
    // EFEK H-1 MENIT — Hitungan mundur dramatis 60 detik terakhir
    // ===================================================

    const H1M = {
        RING_CIRCUMFERENCE: 2 * Math.PI * 90, // ≈ 565.49
        TOTAL_SECONDS: 60,

        // Pesan romantis berubah setiap interval
        MESSAGES: [
            { from: 60, to: 51, text: 'Every heartbeat brings us closer, darling♡' },
            { from: 50, to: 41, text: 'The stars are aligning just for you, my love♡' },
            { from: 40, to: 31, text: 'Almost there... can you feel the magic?♡' },
            { from: 30, to: 21, text: 'Your most enchanting moment is near♡' },
            { from: 20, to: 11, text: 'The moment is almost ours, my darling♡' },
            { from: 10, to: 6,  text: 'So close, my love...♡' },
            { from: 5,  to: 1,  text: '' }, // Tidak ada teks, hanya angka besar
        ],

        /**
         * Memulai efek H-1 menit: overlay dramatis dengan countdown 60 detik.
         * Dipanggil saat hitungan mundur splash mencapai <= 60 detik.
         * @param {number} remainingSec - Sisa detik menuju target (1-60).
         */
        start(remainingSec) {
            if (S.h1mActive) return;
            S.h1mActive = true;

            const sec = Math.min(Math.max(Math.ceil(remainingSec), 1), 60);
            S.h1mRemaining = sec;

            // Hentikan tick hitungan mundur biasa
            SFX.stopCountdownTick();

            // Tampilkan overlay H-1
            if (D.h1mOverlay) {
                D.h1mOverlay.style.display = 'flex';
                D.h1mOverlay.className = 'h1m-overlay phase-normal';
            }

            // Sembunyikan hitungan mundur biasa di splash
            const splashCd = $('splash-countdown');
            if (splashCd) splashCd.style.opacity = '0';

            // Buat partikel latar belakang
            this._createParticles();

            // Set posisi awal ring
            this._updateRing(sec);
            this._updateNumber(sec);
            this._updateMessage(sec);
            this._updateProgress(sec);
            this._updatePhase(sec);

            // Mainkan nada sambutan H-1
            this._playH1MStart();

            // Mulai interval setiap detik
            S.h1mInterval = setInterval(() => this._tick(), 1000);
        },

        /**
         * Tick setiap detik — memperbarui angka, ring, pesan, dan fase.
         */
        _tick() {
            S.h1mRemaining--;

            if (S.h1mRemaining <= 0) {
                this._finish();
                return;
            }

            const sec = S.h1mRemaining;
            this._updateRing(sec);
            this._updateNumber(sec);
            this._updateMessage(sec);
            this._updateProgress(sec);
            this._updatePhase(sec);

            // Mainkan suara tick yang sesuai fase
            this._playTick(sec);
        },

        /**
         * Memperbarui SVG ring progress berdasarkan sisa detik.
         */
        _updateRing(sec) {
            if (!D.h1mRingFill) return;
            const offset = this.RING_CIRCUMFERENCE * (1 - sec / this.TOTAL_SECONDS);
            D.h1mRingFill.style.strokeDashoffset = offset;
        },

        /**
         * Memperbarui angka countdown besar dengan animasi tick.
         */
        _updateNumber(sec) {
            if (!D.h1mNumber) return;
            D.h1mNumber.textContent = sec;

            // Picu animasi tick (pulse)
            D.h1mNumber.classList.remove('tick');
            // Paksa reflow agar animasi restart
            void D.h1mNumber.offsetWidth;
            D.h1mNumber.classList.add('tick');
        },

        /**
         * Memperbarui pesan romantis berdasarkan interval sisa detik.
         */
        _updateMessage(sec) {
            if (!D.h1mMessage) return;
            const msg = this.MESSAGES.find(m => sec >= m.from && sec <= m.to);

            // Pudarkan lalu ganti teks
            D.h1mMessage.classList.add('fade');
            setTimeout(() => {
                D.h1mMessage.textContent = msg ? msg.text : '';
                D.h1mMessage.classList.remove('fade');
            }, 300);
        },

        /**
         * Memperbarui progress bar di bawah overlay.
         */
        _updateProgress(sec) {
            if (!D.h1mProgressFill) return;
            const pct = (sec / this.TOTAL_SECONDS) * 100;
            D.h1mProgressFill.style.width = pct + '%';
        },

        /**
         * Memperbarui kelas fase berdasarkan sisa detik.
         * - phase-normal: 60-31
         * - phase-urgent: 30-11
         * - phase-final: 10-1
         */
        _updatePhase(sec) {
            if (!D.h1mOverlay) return;
            let phase = 'phase-normal';
            if (sec <= 10) phase = 'phase-final';
            else if (sec <= 30) phase = 'phase-urgent';

            // Hanya update jika fase berubah
            if (!D.h1mOverlay.classList.contains(phase)) {
                D.h1mOverlay.classList.remove('phase-normal', 'phase-urgent', 'phase-final');
                D.h1mOverlay.classList.add(phase);

                // Mainkan efek suara saat fase berubah
                if (phase === 'phase-urgent') this._playPhaseShift(30);
                if (phase === 'phase-final') this._playPhaseShift(10);
            }
        },

        /**
         * Membuat partikel sparkle di latar belakang overlay.
         */
        _createParticles() {
            if (!D.h1mParticles) return;
            const count = isMobile ? 12 : 20;
            for (let i = 0; i < count; i++) {
                const spark = document.createElement('div');
                spark.className = 'h1m-sparkle';
                spark.style.cssText = `
                    left: ${Math.random() * 100}%;
                    bottom: -10px;
                    animation-duration: ${3 + Math.random() * 5}s;
                    animation-delay: ${Math.random() * 4}s;
                    width: ${2 + Math.random() * 4}px;
                    height: ${2 + Math.random() * 4}px;
                `;
                D.h1mParticles.appendChild(spark);
            }
        },

        /**
         * Memainkan nada sambutan saat H-1 dimulai — arpeggio misterius.
         */
        _playH1MStart() {
            try {
                const ctx = SFX.getCtx();
                const now = ctx.currentTime;

                // Arpeggio misterius naik — nuansa "sesuatu yang ajaib datang"
                const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
                notes.forEach((freq, i) => {
                    SFX._cuteBell(freq, now + i * 0.12, 0.5, 0.1);
                });

                // Sparkle kecil
                SFX._playNoteSeq([1568, 1760, 2093], 0.6, 0.06, 0.05, 0.005, 0.2);
            } catch (e) { /* Gagal diam-diam */ }
        },

        /**
         * Memainkan suara tick setiap detik — semakin dramatis mendekati akhir.
         */
        _playTick(sec) {
            try {
                const ctx = SFX.getCtx();
                const now = ctx.currentTime;

                if (sec > 30) {
                    // Fase normal: lonceng lembut
                    SFX._cuteBell(sec % 2 === 0 ? 1047 : 1319, now, 0.35, 0.08);
                } else if (sec > 10) {
                    // Fase urgent: lonceng lebih keras + detak bawah
                    SFX._cuteBell(sec % 2 === 0 ? 1047 : 1319, now, 0.3, 0.12);
                    // Detak bawah yang lembut
                    const bass = ctx.createOscillator();
                    const bassGain = ctx.createGain();
                    bass.type = 'sine';
                    bass.frequency.setValueAtTime(220, now);
                    bassGain.gain.setValueAtTime(0, now);
                    bassGain.gain.linearRampToValueAtTime(0.06, now + 0.01);
                    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                    bass.connect(bassGain);
                    bassGain.connect(ctx.destination);
                    bass.start(now);
                    bass.stop(now + 0.2);
                } else {
                    // Fase final: detak dramatis — semakin cepat & keras
                    const intensity = 1 - (sec / 10); // 0.0 → 0.9
                    const vol = 0.1 + intensity * 0.15;

                    // Detak utama
                    const beat = ctx.createOscillator();
                    const beatGain = ctx.createGain();
                    beat.type = 'sine';
                    beat.frequency.setValueAtTime(180 + intensity * 120, now);
                    beat.frequency.exponentialRampToValueAtTime(100, now + 0.15);
                    beatGain.gain.setValueAtTime(vol, now);
                    beatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    beat.connect(beatGain);
                    beatGain.connect(ctx.destination);
                    beat.start(now);
                    beat.stop(now + 0.25);

                    // Sparkle tinggi
                    SFX._cuteBell(2093 + sec * 50, now + 0.03, 0.2, 0.04 + intensity * 0.06);
                }
            } catch (e) { /* Gagal diam-diam */ }
        },

        /**
         * Memainkan efek suara saat fase berubah.
         */
        _playPhaseShift(atSec) {
            try {
                const ctx = SFX.getCtx();
                const now = ctx.currentTime;

                if (atSec === 30) {
                    // Pergeseran ke urgent: kaskade nada naik
                    SFX._playNoteSeq([784, 988, 1175, 1397, 1568], 0, 0.06, 0.1, 0.01, 0.3);
                } else if (atSec === 10) {
                    // Pergeseran ke final: fanfare mini dramatis!
                    SFX._playNoteSeq([1047, 1319, 1568, 2093, 2637], 0, 0.05, 0.12, 0.005, 0.35, 'sine', 1.03, 0.05);
                    // Detak jantung besar
                    SFX._playHeartbeat([
                        { time: 0.3, freqStart: 250, freqEnd: 100, vol: 0.2, dur: 0.2 },
                        { time: 0.42, freqStart: 220, freqEnd: 90, vol: 0.15, dur: 0.15 },
                    ]);
                }
            } catch (e) { /* Gagal diam-diam */ }
        },

        /**
         * Menyelesaikan countdown H-1 — ledakan partikel, lalu trigger celebrasi.
         */
        _finish() {
            clearInterval(S.h1mInterval);
            S.h1mInterval = null;

            // Atur fase zero
            if (D.h1mOverlay) {
                D.h1mOverlay.classList.remove('phase-normal', 'phase-urgent', 'phase-final');
                D.h1mOverlay.classList.add('phase-zero');
            }

            // Ubah angka jadi "Happy Birthday!"
            if (D.h1mNumber) {
                D.h1mNumber.textContent = 'Happy Birthday, my love!';
            }

            // Sembunyikan pesan dan label
            if (D.h1mMessage) D.h1mMessage.style.display = 'none';
            if (D.h1mLabel) D.h1mLabel.style.display = 'none';

            // Buat ledakan partikel di tengah layar
            this._createBurstParticles();

            // Mainkan fanfare akhir
            this._playFinishBurst();

            // Setelah animasi selesai (1.5s), pudarkan overlay dan picu celebrasi
            setTimeout(() => {
                if (D.h1mOverlay) {
                    D.h1mOverlay.classList.add('h1m-leaving');
                    setTimeout(() => {
                        D.h1mOverlay.style.display = 'none';
                    }, 600);
                }
                triggerBirthdayCelebration();
            }, 1500);
        },

        /**
         * Membuat ledakan partikel dari tengah layar saat countdown mencapai 0.
         */
        _createBurstParticles() {
            if (!D.h1mOverlay) return;
            const colors = ['var(--purple-300)', 'var(--pink-300)', 'var(--purple-400)', 'var(--pink-400)', '#fff'];
            for (let i = 0; i < 30; i++) {
                const particle = document.createElement('div');
                particle.className = 'h1m-burst-particle';
                const angle = (Math.PI * 2 * i) / 30;
                const dist = 80 + Math.random() * 180;
                const bx = Math.cos(angle) * dist;
                const by = Math.sin(angle) * dist;
                particle.style.cssText = `
                    top: 50%;
                    left: 50%;
                    background: ${colors[i % colors.length]};
                    box-shadow: 0 0 6px ${colors[i % colors.length]};
                    --bx: ${bx}px;
                    --by: ${by}px;
                    animation-delay: ${Math.random() * 0.2}s;
                    width: ${3 + Math.random() * 5}px;
                    height: ${3 + Math.random() * 5}px;
                `;
                D.h1mOverlay.appendChild(particle);
            }
        },

        /**
         * Memainkan suara ledakan akhir saat countdown mencapai 0.
         */
        _playFinishBurst() {
            try {
                const ctx = SFX.getCtx();
                const now = ctx.currentTime;

                // Ledakan sparkle besar
                SFX._playNoteSeq([1568, 1760, 2093, 2349, 2637, 3136, 3520], 0, 0.04, 0.1, 0.005, 0.3, 'sine', 1.02, 0.03);

                // Detak jantung besar
                SFX._playHeartbeat([
                    { time: 0.15, freqStart: 300, freqEnd: 100, vol: 0.25, dur: 0.2 },
                    { time: 0.3, freqStart: 260, freqEnd: 90, vol: 0.18, dur: 0.15 },
                ]);

                // Lonceng celebrasi
                SFX._cuteBell(1047, now + 0.4, 1.0, 0.12);
                SFX._cuteBell(1319, now + 0.55, 0.8, 0.1);
                SFX._cuteBell(1568, now + 0.7, 0.6, 0.08);
            } catch (e) { /* Gagal diam-diam */ }
        },
    };

    // ===================================================
    // CELEBRASI HARI H - Efek khusus, suara, auto-unlock, transisi otomatis
    // ===================================================

    /**
     * Memulakan celebrasi hari H: efek visual meriah, suara fanfare,
     * auto-unlock password, dan transisi otomatis ke halaman utama.
     */
    function triggerBirthdayCelebration() {
        // 1. Tambahkan kelas celebrasi ke splash screen untuk efek visual
        D.splash.classList.add('birthday-celebration');

        // 2. Buat elemen celebrasi — teks besar "Happy Birthday!" dengan animasi
        const celebOverlay = document.createElement('div');
        celebOverlay.className = 'birthday-celebration-overlay';
        celebOverlay.innerHTML = `
            <div class="birthday-celebration-content">
                <div class="birthday-emoji-row">🎂✨🎀🎁💫🎀✨🎂</div>
                <div class="birthday-big-text">Happy Birthday, My Love!</div>
                <div class="birthday-name-text">Aik Jeje♡</div>
                <div class="birthday-emoji-row">🌟🦋🌸🎀🧸🎀🌸🦋🌟</div>
                <div class="birthday-sub-text">The stars aligned just for you, my most precious one~</div>
            </div>
        `;
        document.body.appendChild(celebOverlay);

        // 3. Hujan emoji celebrasi di splash screen
        const celebEmojis = ['🎂', '✨', '🎀', '🎁', '💫', '🌸', '🌟', '🦋', '🧸', '♋', '🦁', '🦀', '🐱', '🐑', '💌', '🌺'];
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 40; i++) {
            const emoji = document.createElement('div');
            emoji.className = 'birthday-falling-emoji';
            emoji.textContent = celebEmojis[i % celebEmojis.length];
            emoji.style.cssText = `
                left: ${Math.random() * 100}%;
                animation-delay: ${Math.random() * 2.5}s;
                animation-duration: ${2.5 + Math.random() * 3}s;
                font-size: ${1.2 + Math.random() * 1.8}rem;
            `;
            frag.appendChild(emoji);
        }
        celebOverlay.appendChild(frag);

        // 4. Putar fanfare ulang tahun yang meriah
        SFX.playBirthdayFanfare();

        // 5. Sembunyikan password input — tidak perlu lagi di hari H!
        if (D.splashPassword) {
            D.splashPassword.style.transition = 'opacity 0.5s ease';
            D.splashPassword.style.opacity = '0';
            setTimeout(() => { D.splashPassword.style.display = 'none'; }, 500);
        }

        // 6. Masuk situs otomatis setelah celebrasi (3.5 detik — setelah fanfare selesai)
        setTimeout(() => {
            // Pudarkan overlay celebrasi
            celebOverlay.style.transition = 'opacity 0.8s ease';
            celebOverlay.style.opacity = '0';
            setTimeout(() => celebOverlay.remove(), 800);

            // Buka kunci otomatis dan masuk ke halaman utama
            enterSite();
        }, 3500);
    }

    // ===================================================
    // INPUT KATA SANDI - Kata rahasia untuk membuka kejutan
    // ===================================================

    /**
     * Menginisialisasi input kata sandi dan pendengar event tombol.
     */
    function initPasswordEntry() {
        D.pwBtn.addEventListener('click', tryPassword);
        D.pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPassword(); });

        // Sinkronisasi label marquee mengambang dengan status input
        D.pwInput.addEventListener('focus', () => { D.pwField && D.pwField.classList.add('is-focused'); });
        D.pwInput.addEventListener('blur', () => {
            D.pwField && D.pwField.classList.remove('is-focused');
            D.pwField && D.pwField.classList.toggle('has-value', D.pwInput.value.length > 0);
        });
        D.pwInput.addEventListener('input', () => {
            D.pwField && D.pwField.classList.toggle('has-value', D.pwInput.value.length > 0);
        });

        // Tidak auto-fokus — biarkan user mengetuk input secara manual
        // agar keyboard tidak langsung muncul setelah ketuk untuk masuk
    }

    /**
     * Memvalidasi kata sandi yang dimasukkan terhadap kata sandi rahasia yang dikonfigurasi.
     */
    function tryPassword() {
        const input = D.pwInput.value.trim().toLowerCase();
        if (input === CFG.SECRET_PASSWORD) {
            D.pwError.textContent = '';
            // Putar efek suara pembukaan
            SFX.playUnlock();
            enterSite();
        } else {
            D.pwError.textContent = "Oopsie, that's not the magic word, darling~ Try again? ♡";
            D.pwInput.value = '';
            D.pwInput.focus();
            // Putar efek suara password salah yang lucu & imut
            SFX.playWrongPassword();
        }
    }

    // ===================================================
    // MASUK SITUS - Transisi dari layar pembuka ke konten utama
    // ===================================================

    /**
     * Bertransisi dari layar pembuka ke konten utama, menginisialisasi semua fitur.
     */
    function enterSite() {
        if (S.splashDone) return;
        S.splashDone = true;
        clearInterval(S.splashCountdownInterval);
        // Hentikan efek H-1 menit jika sedang aktif
        if (S.h1mInterval) {
            clearInterval(S.h1mInterval);
            S.h1mInterval = null;
        }
        if (D.h1mOverlay) D.h1mOverlay.style.display = 'none';
        // Hentikan efek suara detak hitungan mundur setelah kata sandi dibuka
        SFX.stopCountdownTick();

        // Cek apakah ini hari H — confetti ekstra meriah!
        const isBirthday = (CFG.BIRTHDAY_TARGET - new Date()) <= 0;

        D.splash.classList.add('leaving');
        // Hilangkan fokus input agar keyboard tutup & atur ulang zoom iOS
        if (D.pwInput) D.pwInput.blur();
        setTimeout(() => {
            D.splash.style.display = 'none';
            D.main.style.display = '';
            // PERBAIKAN SCROLL: Bersihkan semua hambatan scroll
            document.body.classList.remove('no-scroll');
            // Hapus semua inline style yang bentrok dengan CSS
            document.documentElement.style.removeProperty('overflow');
            document.documentElement.style.removeProperty('height');
            document.documentElement.style.removeProperty('position');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('position');
            document.body.style.removeProperty('height');
            document.body.style.removeProperty('touch-action');
            document.body.style.removeProperty('overscroll-behavior');
            // Pastikan hanya properti yang diperlukan yang di-set
            document.documentElement.style.overflowX = 'hidden';
            document.documentElement.style.overflowY = 'scroll';
            document.body.style.touchAction = 'pan-y';
            document.body.style.overscrollBehavior = 'contain';
            // Paksa reflow
            void document.body.offsetHeight;
            // Atur ulang zoom & posisi — pastikan tidak ada zoom yang tertinggal
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            initDynamicBackground();
            initHeroParticles();
            initSlideshow();
            initLetter();
            initGift();
            initWish();
            initScrollReveal();
            initScrollProgress();
            // PERBAIKAN OVERFLOW: Auto-fit section agar konten muat di viewport mobile
            initSectionAutoFit();
            // Efek non-kritis ditunda ke waktu idle
            scheduleIdle(() => { initSparkleTrail(); });
            scheduleIdle(() => { initRipple(); });
            scheduleIdle(() => { initAudioViz(); });
            scheduleIdle(() => { initBgFloaters(); });
            setTimeout(() => fireConfetti(), 500);

            // Confetti ekstra untuk hari H — ledakan ganda yang meriah!
            if (isBirthday) {
                setTimeout(() => fireConfetti(isMobile ? 80 : 200), 1200);
                setTimeout(() => fireConfetti(isMobile ? 40 : 100), 2500);
            }
        }, 500);
    }

    // ===================================================
    // ELEMEN MENGAMBANG LATAR
    // ===================================================

    /**
     * Membuat elemen emoji mengambang yang melayang melintasi latar belakang.
     */
    function initBgFloaters() {
        const items = ['🧸', '🐱', '🦋', '🌸', '♡', '✨', '🦀', '🎀', '💫', '🌟', '🦁', '🐑', '♋', '🎂', '💌', '🌺'];
        const floaterCount = prefersReducedMotion ? Math.ceil(CFG.BG_FLOATER_COUNT / 2) : CFG.BG_FLOATER_COUNT;
        for (let i = 0; i < floaterCount; i++) {
            const el = document.createElement('div');
            el.className = 'bg-floater';
            el.textContent = items[i % items.length];
            el.style.cssText = `font-size:${Math.random() * 1.2 + 0.8}rem;left:${Math.random() * 100}%;animation-duration:${Math.random() * 18 + 12}s;animation-delay:${Math.random() * 12}s;opacity:${Math.random() * 0.08 + 0.03};`;
            D.bgFloaters.appendChild(el);
        }
    }

    // ===================================================
    // PARTIKEL HERO
    // ===================================================

    /**
     * Membuat titik partikel mengambang di bagian hero.
     */
    function initHeroParticles() {
        const heroCount = prefersReducedMotion ? Math.ceil(CFG.HERO_PARTICLE_COUNT / 2) : CFG.HERO_PARTICLE_COUNT;
        for (let i = 0; i < heroCount; i++) {
            const p = document.createElement('div');
            p.className = 'hero-particle';
            p.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 3}s;animation-duration:${Math.random() * 2.5 + 1.5}s;`;
            D.heroParticles.appendChild(p);
        }
    }

    // ===================================================
    // SLIDESHOW - Galeri foto dengan navigasi
    // ===================================================

    /** Label slide yang digunakan oleh generateSlides() sebagai fallback ketika HTML tidak memiliki slide. */
    const LABELS = [
        'The Way You Steal My Heart Away♡', 'Sunshine Wrapped in Your Sweet Smile♡',
        'Sweeter Than Any Daydream♡', 'A Smile That Melts Every Cloud♡',
        'A Day Painted in Starlight♡', 'Our Own Little Wonderland♡',
        'Right Beside You Feels Like Home♡', 'A Memory I Hold Close to My Heart♡',
        'Worth Every Wish I\'ve Ever Made♡', 'You, The Divine Gift from Heaven♡',
        'Every Moment With You Is Magic♡', 'The Light That Guides My Way♡',
        'A Love That Knows No Bounds♡', 'My Heart Beats Only For You♡',
        'You Make The World More Beautiful♡', 'Forever Yours, Forever True♡',
        'A Dream I Never Want To Wake From♡', 'The Reason I Believe In Love♡',
        'Your Laughter Is My Favorite Song♡', 'In Your Arms I Found My Home♡',
        'A Love Story Written in The Stars♡', 'You Are My Happily Ever After♡',
        'The Most Beautiful Chapter of My Life♡', 'With You, Every Day Is Valentine♡',
        'My Heart Belongs to You Always♡',
    ];

    /** Ikon slide yang digunakan oleh generateSlides() sebagai fallback ketika HTML tidak memiliki slide. */
    const ICONS = ['🧸', '🦋', '🌸', '🐑', '🦁', '✨', '🌷', '🎀', '💫', '🌺', '🎂', '💌', '🐱', '🦀', '♋', '🌟', '🪄', '🎁', '♡', '🌸', '🧸', '🦋', '🐱', '🐑', '🦁', '✨', '🎀', '💫', '🌺', '🌷', '💌', '🎂'];

    /**
     * Membuat 100 elemen slide secara dinamis ke dalam slides-wrap.
     * Setiap slide adalah elemen .slide-item yang diposisikan absolut
     * dengan transisi fade (opacity + scale).
     */
    function generateSlides() {
        if (!D.track) return;
        const existing = D.track.querySelectorAll('.slide-item');
        if (existing.length > 0) return;
        // Gunakan DocumentFragment untuk penyisipan batch — menghindari reflow berulang
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= S.slides; i++) {
            const label = LABELS[(i - 1) % LABELS.length];
            const icon = ICONS[(i - 1) % ICONS.length];
            const src = `${BASE_IMG_URL}/${i}.jpg`;
            const slide = document.createElement('div');
            slide.className = 'slide-item';
            slide.setAttribute('data-idx', i);
            slide.setAttribute('data-src', src);
            slide.setAttribute('data-label', label);
            slide.setAttribute('data-icon', icon);
            frag.appendChild(slide);
        }
        D.track.appendChild(frag);
        D.counter.textContent = `1 / ${S.slides}`;
    }

    /**
     * Membuat dan memasukkan elemen <img> ke dalam .slide-item.
     * @param {HTMLElement} slideEl - Elemen .slide-item tujuan.
     * @param {'eager'|'lazy'} loading - Strategi pemuatan gambar.
     * @param {string} [fetchPriority] - Prioritas pengambilan.
     */
    function insertSlideImage(slideEl, loading, fetchPriority) {
        const url = slideEl.getAttribute('data-src');
        if (!url || !url.trim() || slideEl.querySelector('img')) return;
        const originalUrl = url.trim();
        const img = document.createElement('img');
        const cachedBlob = imageCache[originalUrl];
        const src = (cachedBlob && cachedBlob !== false) ? cachedBlob : originalUrl;
        img.src = src;
        img.alt = slideEl.getAttribute('data-label') || 'Photo';
        img.loading = loading;
        img.decoding = 'async';
        if (fetchPriority) img.fetchPriority = fetchPriority;
        if (cachedBlob && cachedBlob !== false) {
            img.style.opacity = '1';
        } else {
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.5s ease';
        }
        img.onload = () => { requestAnimationFrame(() => { img.style.opacity = '1'; }); };
        img.onerror = () => { if (src !== originalUrl) img.src = originalUrl; else img.remove(); };
        slideEl.insertBefore(img, slideEl.firstChild);
    }

    /**
     * Memuat elemen gambar satu slide jika belum ada.
     * @param {HTMLElement} slideEl - Elemen .slide-item tujuan.
     * @param {string} [fetchPriority] - Prioritas pengambilan ('high', 'low', 'auto').
     */
    function loadSingleSlideImage(slideEl, fetchPriority) {
        if (!slideEl || slideEl.querySelector('img')) return;
        insertSlideImage(slideEl, 'eager', fetchPriority);
    }

    /**
     * Memuat malas gambar untuk slide saat ini dan slide terdekat.
     * Pramuat slide saat ini dengan fetchPriority='high', 2 berikutnya dengan 'auto', sisanya 'lazy'.
     */
    function lazyLoadVisibleSlides(currentIdx) {
        const slides = D.track ? D.track.querySelectorAll('.slide-item') : [];
        slides.forEach((slide) => {
            const idx = parseInt(slide.getAttribute('data-idx')) - 1;
            const distance = Math.abs(idx - currentIdx);
            if (distance === 0) {
                loadSingleSlideImage(slide, 'high');
            } else if (distance <= 2) {
                loadSingleSlideImage(slide, 'auto');
            } else if (distance <= 5 && !slide.querySelector('img')) {
                insertSlideImage(slide, 'lazy');
            }
        });
    }

    /**
     * Menginisialisasi slideshow dengan navigasi, sentuh/gestyur, dan kontrol keyboard.
     * Menggunakan fade transitions — tidak ada track sliding.
     */
    function initSlideshow() {
        generateSlides();
        lazyLoadVisibleSlides(0);

        // Buat dot navigasi
        for (let i = 0; i < S.slides; i++) {
            const dot = document.createElement('button');
            dot.className = 'slide-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => goSlide(i));
            D.dots.appendChild(dot);
        }
        D.prev.addEventListener('click', () => goSlide(S.slide - 1));
        D.next.addEventListener('click', () => goSlide(S.slide + 1));

        // Gesti usap — pasang ke viewport agar area sentuh lebih luas
        let sx = 0;
        const swipeThreshold = isMobile ? 35 : 45;
        const viewport = document.querySelector('.slide-viewport');
        const swipeTarget = viewport || D.track;
        if (swipeTarget) {
            swipeTarget.addEventListener('touchstart', e => { sx = e.changedTouches[0].clientX; }, { passive: true });
            swipeTarget.addEventListener('touchend', e => {
                const dx = sx - e.changedTouches[0].clientX;
                if (Math.abs(dx) > swipeThreshold) goSlide(S.slide + (dx > 0 ? 1 : -1));
            }, { passive: true });
        }

        // Navigasi papan tombol
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') goSlide(S.slide - 1);
            if (e.key === 'ArrowRight') goSlide(S.slide + 1);
        });
        startAutoSlide();

        // Tampilkan slide pertama
        goSlide(0);
    }

    /**
     * Menavigasi ke indeks slide tertentu dengan animasi fade.
     * @param {number} n - Indeks slide tujuan (berputar mengelilingi batas).
     */
    function goSlide(n) {
        S.slide = ((n % S.slides) + S.slides) % S.slides;
        const slides = D.track ? D.track.querySelectorAll('.slide-item') : [];
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === S.slide);
        });
        // Perbarui dots
        [...D.dots.children].forEach((d, i) => d.classList.toggle('active', i === S.slide));
        // Perbarui counter
        D.counter.textContent = `${S.slide + 1} / ${S.slides}`;
        // Perbarui progress bar
        if (D.progressFill) {
            const pct = ((S.slide + 1) / S.slides) * 100;
            D.progressFill.style.width = pct + '%';
        }
        // Perbarui caption
        updateCaption(S.slide);
        // Muat gambar malas untuk slide terdekat
        lazyLoadVisibleSlides(S.slide);
        resetAutoSlide();
    }

    /**
     * Memperbarui caption overlay dengan data slide saat ini.
     * @param {number} idx - Indeks slide saat ini.
     */
    function updateCaption(idx) {
        const slides = D.track ? D.track.querySelectorAll('.slide-item') : [];
        const slide = slides[idx];
        if (!slide) return;
        const num = String(idx + 1).padStart(2, '0');
        const label = slide.getAttribute('data-label') || '';
        const icon = slide.getAttribute('data-icon') || '';

        // Sembunyikan caption dulu, lalu tampilkan dengan data baru
        if (D.captionWrap) {
            D.captionWrap.classList.remove('visible');
            setTimeout(() => {
                if (D.captionNum) D.captionNum.textContent = num;
                if (D.captionText) D.captionText.textContent = label;
                if (D.captionIcon) D.captionIcon.textContent = icon;
                D.captionWrap.classList.add('visible');
            }, 150);
        }
    }

    /** Memulai interval kemajuan slide otomatis. */
    function startAutoSlide() { S.autoSlide = setInterval(() => goSlide(S.slide + 1), CFG.SLIDE_AUTO); }

    /** Mengatur ulang pewaktu slide otomatis (misalnya setelah navigasi manual). */
    function resetAutoSlide() { clearInterval(S.autoSlide); startAutoSlide(); }

    // ===================================================
    // SURAT - Surat cinta dengan animasi amplop
    // ===================================================

    /**
     * Menginisialisasi penangan klik amplop/surat.
     */
    function initLetter() {
        D.envelope.addEventListener('click', openLetter);
        if (D.letterCloseBtn) D.letterCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); closeLetter(); });
        // Tutup surat saat klik area gelap di luar konten surat
        if (D.letterModal) D.letterModal.addEventListener('click', (e) => { if (e.target === D.letterModal) closeLetter(); });
        // Cegah scroll latar belakang saat surat terbuka (mobile touch)
        if (D.letterModal) {
            D.letterModal.addEventListener('touchmove', function(e) {
                if (!e.target.closest('.letter-paper')) e.preventDefault();
            }, { passive: false });
        }
    }

    // Kunci scroll saat modal terbuka — cukup toggle class, tanpa position:fixed
    // (position:fixed dihapus dari body.no-scroll karena menyebabkan scroll hilang di iOS)

    function _lockScroll() {
        document.body.classList.add('no-scroll');
    }

    function _unlockScroll() {
        document.body.classList.remove('no-scroll');
    }

    /**
     * Membuka amplop dengan animasi, memulai mesin ketik, dan menembakkan konfeti.
     */
    function openLetter() {
        if (S.letterOpen) return;
        S.letterOpen = true;
        // Putar efek suara buka surat
        SFX.playLetterOpen();
        D.envelope.classList.add('open');
        setTimeout(() => {
            D.letterModal.classList.add('show');
            _lockScroll();
            setTimeout(() => { D.envWrap.classList.add('hide'); }, 400);
        }, 700);
        setTimeout(() => fireConfetti(isMobile ? 25 : 50), 900);
    }

    /**
     * Menutup surat dan menyegel ulang amplop dengan animasi.
     */
    function closeLetter() {
        if (!S.letterOpen) return;
        D.letterModal.classList.remove('show');
        _unlockScroll();
        setTimeout(() => {
            D.envelope.classList.remove('open');
            D.envWrap.classList.remove('hide');
            D.envWrap.classList.add('reappear');
            setTimeout(() => D.envWrap.classList.remove('reappear'), 800);
            S.letterOpen = false;
        }, 500);
    }

    // ===================================================
    // HADIAH / KEJUTAN - Buka/tutup yang bisa di-toggle dengan musik saat pertama kali dibuka
    // ===================================================

    /**
     * Menginisialisasi penangan klik kotak hadiah dan modal.
     */
    function initGift() {
        D.giftBox.addEventListener('click', toggleGift);
        D.modalOk.addEventListener('click', closeModal);
        D.modal.addEventListener('click', (e) => { if (e.target === D.modal) closeModal(); });
        // Cegah scroll latar belakang saat modal terbuka (mobile touch)
        if (D.modal) {
            D.modal.addEventListener('touchmove', function(e) {
                if (!e.target.closest('.surprise-modal-inner')) e.preventDefault();
            }, { passive: false });
        }
    }

    /**
     * Mengalihkan keadaan kotak hadiah antara buka dan tutup.
     */
    function toggleGift() {
        if (S.giftOpen) {
            // Tutup modal dulu jika sedang ditampilkan, lalu tutup kotak hadiah
            D.modal.classList.remove('show');
            closeGiftBox();
        } else {
            openGiftBox();
        }
    }

    /**
     * Membuka kotak hadiah dengan animasi, memulai musik, dan menembakkan konfeti.
     */
    function openGiftBox() {
        S.giftOpen = true;
        D.giftBox.classList.remove('closing');
        D.giftBox.classList.add('open');
        // Putar efek suara buka hadiah
        SFX.playGiftOpen();
        // Mulai musik hanya saat hadiah pertama kali dibuka
        if (!S.musicStarted) { S.musicStarted = true; startMusic(); }
        // Hentikan semua efek suara saat hadiah dibuka (musik latar berlanjut)
        setTimeout(() => SFX.stopAll(), 1500);
        // Perbarui teks petunjuk
        D.giftHint.textContent = "Tap again to tuck it away, my sweet lovebird~ ♡";
        setTimeout(() => fireConfetti(isMobile ? 80 : 180), 350);
        setTimeout(() => { D.modal.classList.add('show'); _lockScroll(); spawnSurpriseHearts(); }, 900);
    }

    /**
     * Membuat hati mengambang dekoratif di dalam modal kejutan.
     */
    function spawnSurpriseHearts() {
        const container = document.getElementById('surprise-float-hearts');
        if (!container) return;
        // Bersihkan hati lama
        container.innerHTML = '';
        const heartChars = ['♡', '✨', '🌸', '🦋', '💫', '🎀', '🧸'];
        const count = isMobile ? 8 : 14;
        for (let i = 0; i < count; i++) {
            const heart = document.createElement('span');
            heart.className = 'surprise-float-heart';
            heart.textContent = heartChars[Math.floor(Math.random() * heartChars.length)];
            heart.style.left = Math.random() * 100 + '%';
            heart.style.animationDuration = (6 + Math.random() * 8) + 's';
            heart.style.animationDelay = (Math.random() * 5) + 's';
            heart.style.setProperty('--sh-drift', (Math.random() * 20 - 10) + 'px');
            heart.style.setProperty('--sh-drift2', (Math.random() * 20 - 10) + 'px');
            heart.style.fontSize = (0.5 + Math.random() * 0.6) + 'rem';
            heart.style.opacity = (0.15 + Math.random() * 0.25);
            container.appendChild(heart);
        }
    }

    /**
     * Menutup modal kejutan lalu menutup kotak hadiah.
     */
    function closeModal() {
        D.modal.classList.remove('show');
        _unlockScroll();
        setTimeout(() => closeGiftBox(), 400);
    }

    /**
     * Menutup kotak hadiah dengan animasi dan mengatur ulang teks petunjuk.
     */
    function closeGiftBox() {
        D.giftBox.classList.add('closing');
        D.giftBox.classList.remove('open');
        // Animasikan tutup turun kembali
        const lidWrap = D.giftBox.querySelector('.gift-lid-wrap');
        if (lidWrap) {
            lidWrap.style.transition = 'transform .7s cubic-bezier(.34,1.56,.64,1), opacity .5s ease';
        }
        // Atur ulang teks petunjuk
        D.giftHint.textContent = "Go on, tap the gift, my darling~ something magical awaits inside! ♡";
        setTimeout(() => {
            D.giftBox.classList.remove('closing');
            // Hapus transisi inline agar CSS mengambil alih saat buka berikutnya
            if (lidWrap) lidWrap.style.transition = '';
            S.giftOpen = false;
        }, 700);
    }

    // ===================================================
    // KONFETI
    // ===================================================

    /**
     * Menyiapkan dimensi canvas konfeti sesuai viewport dan DPR.
     * Jika ukuran sudah sesuai, hanya membersihkan dan mengatur ulang transformasi.
     * @returns {{ ctx: CanvasRenderingContext2D, vw: number, vh: number }}
     */
    function setupConfettiCanvas() {
        const c = D.confetti;
        const ctx = c.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vw = window.innerWidth, vh = window.innerHeight;
        const newW = vw * dpr;
        const newH = vh * dpr;
        if (c.width !== newW || c.height !== newH) {
            c.width = newW;
            c.height = newH;
            c.style.width = vw + 'px';
            c.style.height = vh + 'px';
            ctx.scale(dpr, dpr);
        } else {
            ctx.clearRect(0, 0, vw, vh);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        return { ctx, vw, vh };
    }

    /**
     * Menembakkan animasi ledakan konfeti pada canvas konfeti.
     * @param {number} [count=CFG.CONFETTI_COUNT] - Jumlah potongan konfeti yang dibuat.
     */
    function fireConfetti(count = CFG.CONFETTI_COUNT) {
        const { ctx, vw, vh } = setupConfettiCanvas();

        const colors = ['#9333ea', '#a855f7', '#c084fc', '#d8b4fe', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fcd34d', '#f59e0b', '#7c3aed', '#e9d5ff'];
        const pieces = [];
        for (let i = 0; i < count; i++) {
            pieces.push({
                x: Math.random() * vw, y: -Math.random() * vh * 0.5 - 40,
                w: Math.random() * 10 + 3, h: Math.random() * 7 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 1.5,
                osc: Math.random() * 0.035 + 0.007, amp: Math.random() * 40 + 12,
                alpha: 1, t: Math.random() * 100,
            });
        }

        const t0 = performance.now();
        const dur = CFG.CONFETTI_DURATION;

        (function frame(now) {
            const p = (now - t0) / dur;
            ctx.clearRect(0, 0, vw, vh);
            let alive = 0;
            for (const pc of pieces) {
                if (pc.alpha <= 0) continue;
                alive++;
                pc.t += 0.016;
                pc.x += pc.vx + Math.sin(pc.t * pc.osc * 60) * pc.amp * 0.016;
                pc.y += pc.vy; pc.rot += pc.rotV;
                if (p > 0.7) pc.alpha = Math.max(0, 1 - (p - 0.7) / 0.3);
                ctx.save(); ctx.translate(pc.x, pc.y); ctx.rotate(pc.rot * Math.PI / 180);
                ctx.globalAlpha = pc.alpha; ctx.fillStyle = pc.color;
                const r = Math.min(2.5, pc.w * 0.25);
                const hw = pc.w / 2, hh = pc.h / 2;
                ctx.beginPath();
                ctx.moveTo(-hw + r, -hh); ctx.lineTo(hw - r, -hh);
                ctx.quadraticCurveTo(hw, -hh, hw, -hh + r); ctx.lineTo(hw, hh - r);
                ctx.quadraticCurveTo(hw, hh, hw - r, hh); ctx.lineTo(-hw + r, hh);
                ctx.quadraticCurveTo(-hw, hh, -hw, hh - r); ctx.lineTo(-hw, -hh + r);
                ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
                ctx.closePath(); ctx.fill(); ctx.restore();
            }
            if (p < 1 && alive > 0) { requestAnimationFrame(frame); }
            else { ctx.clearRect(0, 0, vw, vh); }
        })(t0);
    }

    // ===================================================
    // MUSIK - Autoplay saat hadiah pertama kali dibuka, selalu berulang, tidak pernah berhenti
    // ===================================================

    /**
     * Memulai musik latar dengan beberapa perlindungan untuk memastikan pemutaran berkelanjutan.
     * Menangani batasan autoplay, perubahan visibilitas tab, dan pemulihan error.
     */
    function startMusic() {
        if (!D.bgMusic) return;
        const audio = D.bgMusic;
        audio.volume = 0.35;
        audio.loop = true;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                const tryPlay = () => {
                    audio.play().catch(() => {});
                    document.removeEventListener('click', tryPlay);
                    document.removeEventListener('touchend', tryPlay);
                    document.removeEventListener('keydown', tryPlay);
                };
                document.addEventListener('click', tryPlay);
                document.addEventListener('touchend', tryPlay, { passive: true });
                document.addEventListener('keydown', tryPlay);
            });
        }

        // Cadangan: pastikan lagu selalu berulang
        audio.addEventListener('ended', () => {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && S.musicStarted && audio.paused) audio.play().catch(() => {});
        });

        // Pemeriksaan kesehatan berkala — lacak interval agar bisa dibersihkan
        S.musicHealthInterval = setInterval(() => {
            if (S.musicStarted && audio.paused && !audio.ended) audio.play().catch(() => {});
        }, 5000);

        audio.addEventListener('error', () => {
            setTimeout(() => { audio.load(); audio.play().catch(() => {}); }, 1000);
        });
    }

    // ===================================================
    // SCROLL REVEAL
    // ===================================================

    /**
     * Menginisialisasi scroll reveal berbasis IntersectionObserver untuk setiap bagian.
     */
    function initScrollReveal() {
        const sections = document.querySelectorAll('.section');
        sections.forEach(s => s.classList.add('reveal'));
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
        sections.forEach(s => obs.observe(s));
    }

    // ===================================================
    // PROGRESS SCROLL BAR
    // ===================================================

    /**
     * Membuat bilah progres di bagian atas halaman yang menunjukkan posisi scroll.
     */
    function initScrollProgress() {
        const bar = document.createElement('div');
        bar.className = 'scroll-progress'; bar.id = 'scroll-progress';
        document.body.appendChild(bar);
        // Gunakan rAF throttle untuk 120fps yang halus
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollTop = window.pageYOffset;
                    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                    const progress = docHeight > 0 ? scrollTop / docHeight : 0;
                    // scaleX lebih halus dari width — tidak memicu layout
                    bar.style.transform = `scaleX(${progress})`;
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // ===================================================
    // AUTO-FIT SECTION — Pastikan konten muat di viewport
    // ===================================================

    /**
     * Menginisialisasi auto-fit untuk setiap section agar konten tidak keluar layar.
     * Berjalan di semua perangkat — menyesuaikan padding dan min-height agar konten muat.
     * Karena section sekarang overflow:visible, konten tidak akan terpotong,
     * tapi kita pastikan section punya min-height yang pas dan padding yang cukup.
     */
    function initSectionAutoFit() {
        // Semua section sudah menggunakan min-height: 100dvh dan padding: var(--section-pad) di CSS.
        // Tidak perlu lagi manipulasi inline style yang bisa bentrok dengan CSS.
        // Fungsi ini hanya memastikan scroll berfungsi setelah transisi splash.
        function ensureScrollable() {
            document.documentElement.style.overflowY = 'scroll';
            document.documentElement.style.overflowX = 'hidden';
            document.body.style.touchAction = 'pan-y';
        }

        // Jalankan setelah konten selesai dirender
        setTimeout(function() {
            requestAnimationFrame(ensureScrollable);
        }, 1000);
        onResize(ensureScrollable);
    }

    // ===================================================
    // INISIALISASI
    // ===================================================

    /**
     * Fungsi inisialisasi utama. Dipanggil saat DOMContentLoaded atau segera jika DOM sudah siap.
     * Menyiapkan pramuat, layar pembuka, canvas konfeti, dan pendengar event global.
     */
    function init() {
        preloadImages();
        setTimeout(() => preloadAudio(), 3000); // Tunda 3 detik agar tidak bersaing dengan gambar kritis
        initSplash();

        // Siapkan canvas konfeti dan perbarui saat ukuran viewport berubah
        setupConfettiCanvas();
        onResize(() => setupConfettiCanvas());

        // Cegah klik kanan pada elemen interaktif
        document.addEventListener('contextmenu', e => {
            if (e.target.closest('.envelope, .gift-box, .slide-arrow, .wish-cake')) e.preventDefault();
        });

        if (isMobile) document.body.classList.add('is-mobile');
        if (isLowEnd) document.body.classList.add('is-low-end');

        // Efek emoji tap/klik — aktif sejak awal di seluruh halaman
        initTapHearts();

        // === Jeda animasi di luar layar untuk hemat CPU/GPU ===
        initAnimationPause();
    }

    /**
     * Menghentikan animasi CSS pada elemen yang tidak terlihat di viewport.
     * Menggunakan IntersectionObserver agar animasi resume saat terlihat lagi.
     * Ini mengurangi beban GPU/CPU secara drastis saat scroll.
     */
    function initAnimationPause() {
        const animatedSelectors = [
            '.bg-floater',
            '.hero-particle',
            '.hero-animal',
            '.wish-float-emoji',
            '.wish-bg-layer',
        ];
        const elements = document.querySelectorAll(animatedSelectors.join(','));
        if (!elements.length) return;

        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.style.animationPlayState = 'running';
                } else {
                    e.target.style.animationPlayState = 'paused';
                }
            });
        }, { rootMargin: '100px 0px', threshold: 0 });

        elements.forEach(el => obs.observe(el));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();