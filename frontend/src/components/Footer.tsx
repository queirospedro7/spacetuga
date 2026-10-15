import { useRef, useEffect } from 'react';
import { Github } from 'lucide-react';
import { motion } from 'framer-motion';

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<Array<{ x: number; y: number; opacity: number; radius: number }>>([]);
  const animFrameRef = useRef<number | null>(null);

  // High-performance particle trail with smooth fade-out delay across the whole footer
  useEffect(() => {
    const canvas = canvasRef.current;
    const footer = footerRef.current;
    if (!canvas || !footer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isVisible = false;
    let isRunning = false;

    const updateSize = () => {
      if (!canvas || !footer) return;
      canvas.width = footer.offsetWidth;
      canvas.height = footer.offsetHeight;
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    const render = () => {
      if (!isVisible || trailRef.current.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        isRunning = false;
        animFrameRef.current = null;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Loop through trail points in reverse to remove faded points
      for (let i = trailRef.current.length - 1; i >= 0; i--) {
        const p = trailRef.current[i];
        p.opacity -= 0.02; // Smooth fade-out delay (approx 1.2s total duration)
        p.radius += 0.45; // Soft expansion as it dissolves

        if (p.opacity <= 0) {
          trailRef.current.splice(i, 1);
          continue;
        }

        // Draw soft glowing radial gradient for each trail point (Pace blue #1995fa)
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `rgba(25, 149, 250, ${p.opacity * 0.95})`);
        grad.addColorStop(0.5, `rgba(59, 130, 246, ${p.opacity * 0.4})`);
        grad.addColorStop(1, 'rgba(25, 149, 250, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (trailRef.current.length > 0) {
        animFrameRef.current = requestAnimationFrame(render);
      } else {
        isRunning = false;
        animFrameRef.current = null;
      }
    };

    const startTrail = () => {
      if (isVisible && !isRunning) {
        isRunning = true;
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    (window as unknown as { __lagg_start_footer_trail?: () => void }).__lagg_start_footer_trail = startTrail;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible && trailRef.current.length > 0 && !isRunning) {
          isRunning = true;
          animFrameRef.current = requestAnimationFrame(render);
        } else if (!isVisible && isRunning) {
          isRunning = false;
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        }
      },
      { threshold: 0.01 }
    );

    observer.observe(footer);

    return () => {
      delete (window as unknown as { __lagg_start_footer_trail?: () => void }).__lagg_start_footer_trail;
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!footerRef.current) return;
    const rect = footerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Add new trail point with slight distance threshold
    const lastPoint = trailRef.current[trailRef.current.length - 1];
    if (!lastPoint || Math.hypot(x - lastPoint.x, y - lastPoint.y) > 10) {
      trailRef.current.push({
        x,
        y,
        opacity: 1,
        radius: 90,
      });
      const startTrail = (window as unknown as { __lagg_start_footer_trail?: () => void }).__lagg_start_footer_trail;
      if (startTrail) startTrail();
    }
  };

  return (
    <footer
      ref={footerRef}
      onMouseMove={handleMouseMove}
      className="relative bg-[#09090b] border-t border-neutral-800 pt-20 pb-0 overflow-hidden font-sans select-none"
    >
      {/* Whole-Footer Canvas Fading Glow Trail Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen z-0"
      />

      {/* 1. Top Section: 2 Columns */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-start gap-12 relative z-10">
        {/* Left Section */}
        <div className="space-y-4 max-w-sm">
          <div className="flex items-center space-x-3">
            <span className="font-['Archivo_Black',sans-serif] text-2xl tracking-[-0.05em] uppercase text-white">
              Tuga
            </span>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed font-sans">
            A calm, high-performance workspace designed for low-latency peer-to-peer voice, HD video calls, and encrypted direct messaging with complete local privacy.
          </p>
        </div>

        {/* Right Section: 3 Horizontal Columns */}
        <div className="flex flex-row flex-wrap items-start gap-12 sm:gap-16 md:gap-24 font-sans">
          {/* Column 1: Workspace */}
          <ul className="space-y-3 text-sm font-medium text-neutral-300">
            <li>
              <span className="text-white font-semibold">Workspace</span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                Overview
              </span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                Voice Engine
              </span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                Video Channel
              </span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                Direct Messaging
              </span>
            </li>
          </ul>

          {/* Column 2: Protocol & Privacy */}
          <ul className="space-y-3 text-sm font-medium text-neutral-300">
            <li>
              <span className="text-white font-semibold">Protocol</span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                WebRTC Standard
              </span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                Local-First Storage
              </span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                DTLS & SRTP
              </span>
            </li>
            <li>
              <span className="hover:text-[#1995fa] transition-colors cursor-pointer">
                Privacy Policy
              </span>
            </li>
          </ul>

          {/* Column 3: Project & Author */}
          <ul className="space-y-3 text-sm font-medium text-neutral-300">
            <li>
              <span className="text-white font-semibold">Source</span>
            </li>
            <li>
              <a
                href="https://github.com/queirospedro7"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#1995fa] transition-colors inline-flex items-center gap-1.5"
              >
                <Github className="w-4 h-4" /> GitHub Repository
              </a>
            </li>
            <li>
              <a
                href="https://github.com/queirospedro7"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#1995fa] transition-colors"
              >
                Designed by <span className="underline underline-offset-2 font-bold text-white">queirospedro</span>
              </a>
            </li>
            <li className="text-neutral-500 text-xs">
              MIT License — Desktop
            </li>
          </ul>
        </div>
      </div>

      {/* 2. Sub-Header Copyright Line */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 mt-12 pt-6 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-xs text-neutral-500 relative z-10">
        <span>All rights reserved © 2026 by Tuga Workspace</span>
        <span>100% Peer-to-Peer — WebRTC — MIT License</span>
      </div>

      {/* 3. Bottom Giant Wordmark Tuga */}
      <div className="w-full overflow-hidden leading-none select-none mt-8 relative pointer-events-none z-10">
        <motion.div
          initial={{ y: '30%', opacity: 0.4 }}
          whileInView={{ y: '15%', opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: false, amount: 0.1 }}
          className="relative font-['Archivo_Black',sans-serif] font-black text-[clamp(10rem,32vw,30rem)] leading-[0.65] tracking-[-0.08em] text-center uppercase whitespace-nowrap text-white/90 transform"
        >
          Tuga
        </motion.div>
      </div>
    </footer>
  );
}

