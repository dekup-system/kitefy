"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

/**
 * Vídeo de apresentação da página inicial.
 *
 * Estratégia máxima para autoplay + áudio nos navegadores modernos:
 * 1) Ao montar, tenta iniciar a reprodução já COM áudio (`muted = false`).
 * 2) Se a política de autoplay do navegador bloquear som sem interação prévia,
 *    inicia imediatamente a reprodução silenciosa (`muted = true`), mostra um
 *    botão evidente "Ativar áudio" e desmuta automaticamente no primeiro clique
 *    ou toque do usuário em qualquer ponto da página.
 */
export function HeroIntroVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let userManuallyMuted = false;

    const unlockAudioOnFirstGesture = () => {
      if (cancelled || userManuallyMuted || !videoRef.current) return;
      const el = videoRef.current;
      el.muted = false;
      el.volume = 1;
      el.play()
        .then(() => {
          if (!cancelled) {
            setIsMuted(false);
            setIsPlaying(true);
            setNeedsAudioUnlock(false);
          }
        })
        .catch(() => {
          // Alguns navegadores móveis exigem toque direto no elemento de controle.
        });
      window.removeEventListener("pointerdown", unlockAudioOnFirstGesture);
      window.removeEventListener("keydown", unlockAudioOnFirstGesture);
    };

    const startPlayback = async () => {
      try {
        video.muted = false;
        video.volume = 1;
        await video.play();
        if (!cancelled) {
          setIsMuted(false);
          setIsPlaying(true);
          setNeedsAudioUnlock(false);
        }
      } catch {
        // Navegador bloqueou autoplay com som: inicia mudo e libera áudio no 1º gesto.
        try {
          video.muted = true;
          await video.play();
          if (!cancelled) {
            setIsMuted(true);
            setIsPlaying(true);
            setNeedsAudioUnlock(true);
          }
          window.addEventListener("pointerdown", unlockAudioOnFirstGesture, { passive: true });
          window.addEventListener("keydown", unlockAudioOnFirstGesture, { passive: true });
        } catch {
          if (!cancelled) {
            setIsPlaying(false);
            setNeedsAudioUnlock(true);
          }
        }
      }
    };

    void startPlayback();

    const onVolumeChange = () => {
      if (!videoRef.current) return;
      if (videoRef.current.muted) {
        userManuallyMuted = true;
      }
      setIsMuted(videoRef.current.muted);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", unlockAudioOnFirstGesture);
      window.removeEventListener("keydown", unlockAudioOnFirstGesture);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  function toggleAudio() {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    if (!nextMuted) {
      video.volume = 1;
      void video.play();
      setNeedsAudioUnlock(false);
    }
    setIsMuted(nextMuted);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-navy shadow-[0_24px_60px_-36px_rgba(24,19,49,0.45)]">
        <div className="relative aspect-square w-full bg-brand-navy">
          <video
            ref={videoRef}
            src="/media/kitefy-intro.mp4"
            poster="/media/kitefy-intro-poster.jpg"
            autoPlay
            loop
            playsInline
            preload="auto"
            onClick={toggleAudio}
            className="h-full w-full cursor-pointer object-cover"
            aria-label="Vídeo de apresentação da plataforma Kitefy"
          />

          {/* Banner de desbloqueio imediato quando o navegador segura o áudio no 1º carregamento */}
          {needsAudioUnlock && isMuted ? (
            <button
              type="button"
              onClick={toggleAudio}
              className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-brand-signal px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-brand-signal-hover"
            >
              <Volume2 className="size-3.5" aria-hidden="true" />
              Ativar áudio
            </button>
          ) : null}

          {/* Controles discretos no canto inferior */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
              className="inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              {isPlaying ? (
                <Pause className="size-3.5" aria-hidden="true" />
              ) : (
                <Play className="size-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleAudio}
              aria-label={isMuted ? "Ativar áudio" : "Silenciar áudio"}
              className="inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              {isMuted ? (
                <VolumeX className="size-3.5" aria-hidden="true" />
              ) : (
                <Volume2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
