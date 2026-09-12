import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * HTML5 canvas signature pad (mouse + touch). Exposes via ref:
 *   clear() and toDataURL() -> 'data:image/png;base64,...'
 * No external dependency.
 */
const SignaturePad = forwardRef(function SignaturePad({ height = 200, onChange }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Size the canvas to its container, accounting for device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1F2937';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [height]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!dirty.current) { dirty.current = true; setEmpty(false); onChange?.(false); }
  };
  const end = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
      setEmpty(true);
      onChange?.(true);
    },
    isEmpty: () => !dirty.current,
    toDataURL: () => canvasRef.current.toDataURL('image/png')
  }));

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="w-full touch-none rounded-lg border-2 border-dashed border-line bg-white"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      {empty && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
          ✍️ Draw your signature here
        </span>
      )}
    </div>
  );
});

export default SignaturePad;
