import React, { useEffect, useRef } from 'react';
import './Waveform.css';

export default function Waveform({ active, type = 'mic' }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const analyserRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    if (!active) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (type === 'mic') {
      // Real mic waveform using Web Audio API
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        dataRef.current = new Uint8Array(analyser.frequencyBinCount);

        function draw() {
          if (!active) return;
          animRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(dataRef.current);

          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          const barCount = 32;
          const barWidth = width / barCount - 2;
          const data = dataRef.current;

          for (let i = 0; i < barCount; i++) {
            const idx = Math.floor(i * data.length / barCount);
            const value = data[idx] / 255;
            const barHeight = Math.max(2, value * height * 0.8);

            ctx.fillStyle = `rgba(37, 99, 235, ${0.4 + value * 0.6})`;
            ctx.beginPath();
            ctx.roundRect(
              i * (barWidth + 2),
              (height - barHeight) / 2,
              barWidth,
              barHeight,
              2
            );
            ctx.fill();
          }
        }
        draw();

        return () => {
          stream.getTracks().forEach(t => t.stop());
          audioCtx.close();
        };
      }).catch(() => {
        // Fallback: animated sine wave
        drawSineWave(canvas, ctx, animRef, active);
      });
    } else {
      // TTS indicator: animated sine wave
      drawSineWave(canvas, ctx, animRef, active);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [active, type]);

  return (
    <div className={`waveform waveform-${type} ${active ? 'active' : ''}`}>
      <canvas ref={canvasRef} width={200} height={40} />
    </div>
  );
}

function drawSineWave(canvas, ctx, animRef, active) {
  let phase = 0;
  function draw() {
    if (!active) return;
    animRef.current = requestAnimationFrame(draw);
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)';
    ctx.lineWidth = 2;

    for (let x = 0; x < width; x++) {
      const y = height / 2 + Math.sin((x / width) * 4 * Math.PI + phase) * 12 *
        (0.5 + 0.5 * Math.sin(phase * 0.3));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    phase += 0.08;
  }
  draw();
}
