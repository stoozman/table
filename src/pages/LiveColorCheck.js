import React, { useEffect, useRef, useState, useMemo } from 'react';
import supabase from '../supabase';

// ---------- Color utils ----------
function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgbToXyz(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // sRGB D65
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  return { X: X * 100, Y: Y * 100, Z: Z * 100 };
}
function xyzToLab(X, Y, Z) {
  // D65 reference white
  const Xn = 95.047; const Yn = 100.0; const Zn = 108.883;
  const x = X / Xn, y = Y / Yn, z = Z / Zn;
  const eps = 216 / 24389;
  const kappa = 24389 / 27;
  const fx = x > eps ? Math.cbrt(x) : (kappa * x + 16) / 116;
  const fy = y > eps ? Math.cbrt(y) : (kappa * y + 16) / 116;
  const fz = z > eps ? Math.cbrt(z) : (kappa * z + 16) / 116;
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return { L, a, b };
}
function rgbToLab(r, g, b) {
  const { X, Y, Z } = rgbToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}
// CIEDE2000 implementation
function deg2rad(d) { return (d * Math.PI) / 180; }
function rad2deg(r) { return (r * 180) / Math.PI; }
function deltaE00(lab1, lab2) {
  const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;
  const avgLp = (L1 + L2) / 2.0;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2.0;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25.0, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (C1p + C2p) / 2.0;
  const h1p = Math.atan2(b1, a1p) >= 0 ? Math.atan2(b1, a1p) : Math.atan2(b1, a1p) + 2 * Math.PI;
  const h2p = Math.atan2(b2, a2p) >= 0 ? Math.atan2(b2, a2p) : Math.atan2(b2, a2p) + 2 * Math.PI;
  let avghp = Math.abs(h1p - h2p) > Math.PI ? (h1p + h2p + 2 * Math.PI) / 2.0 : (h1p + h2p) / 2.0;
  const T = 1 - 0.17 * Math.cos(avghp - deg2rad(30)) + 0.24 * Math.cos(2 * avghp) + 0.32 * Math.cos(3 * avghp + deg2rad(6)) - 0.20 * Math.cos(4 * avghp - deg2rad(63));
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > Math.PI) dhp -= 2 * Math.PI * Math.sign(dhp);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2.0);
  const SL = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const delthetarad = deg2rad(30) * Math.exp(-Math.pow((rad2deg(avghp) - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25.0, 7)));
  const RT = -RC * Math.sin(2 * delthetarad);
  const KL = 1, KC = 1, KH = 1;
  const dE = Math.sqrt(
    Math.pow(dLp / (SL * KL), 2) +
    Math.pow(dCp / (SC * KC), 2) +
    Math.pow(dHp / (SH * KH), 2) +
    RT * (dCp / (SC * KC)) * (dHp / (SH * KH))
  );
  return dE;
}

const THRESHOLD = 3.0; // default deltaE00 threshold

export default function LiveColorCheck() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [labs, setLabs] = useState({ L: 0, a: 0, b: 0 });
  const [closest, setClosest] = useState(null);
  const [top3, setTop3] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState('');
  const [etalons, setEtalons] = useState([]);

  useEffect(() => {
    // fetch etalons from Supabase table `etalons`
    (async () => {
      const { data, error } = await supabase.from('etalons').select('*');
      if (error) {
        console.error('Etalons fetch error', error);
        setError('Не удалось загрузить эталоны. Проверьте таблицу etalons и права.');
      } else {
        setEtalons(data || []);
      }
    })();
  }, []);

  useEffect(() => {
    // open camera
    const constraints = { video: { facingMode: 'environment' }, audio: false };
    navigator.mediaDevices?.getUserMedia(constraints)
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setStreamReady(true);
          };
        }
      })
      .catch(err => {
        console.error(err);
        setError('Камера недоступна: дайте доступ или откройте на телефоне.');
      });
    return () => {
      const stream = videoRef.current?.srcObject;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const computeLabFromCenter = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    // central ROI 120x120 (adjustable)
    const roiSize = Math.max(60, Math.floor(Math.min(w, h) * 0.15));
    const x0 = Math.floor(w / 2 - roiSize / 2);
    const y0 = Math.floor(h / 2 - roiSize / 2);
    const imageData = ctx.getImageData(x0, y0, roiSize, roiSize);
    const d = imageData.data;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (let i = 0; i < d.length; i += 4) {
      sumR += d[i];
      sumG += d[i + 1];
      sumB += d[i + 2];
      count++;
    }
    const avgR = sumR / count;
    const avgG = sumG / count;
    const avgB = sumB / count;
    const lab = rgbToLab(avgR, avgG, avgB);
    return { lab, roi: { x: x0, y: y0, size: roiSize } };
  };

  // main loop
  useEffect(() => {
    if (!streamReady) return;
    let raf;
    const loop = () => {
      if (!frozen) {
        const res = computeLabFromCenter();
        if (res) {
          setLabs(res.lab);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [streamReady, frozen]);

  // find closest etalon(s)
  useEffect(() => {
    if (!etalons.length) return;
    const candidates = etalons
      .filter(e => typeof e.L === 'number' && typeof e.a === 'number' && typeof e.b === 'number')
      .map(e => {
        const dE = deltaE00(labs, { L: e.L, a: e.a, b: e.b });
        return { ...e, dE };
      })
      .sort((a, b) => a.dE - b.dE);
    if (candidates.length) {
      setClosest(candidates[0]);
      setTop3(candidates.slice(0, 3));
    } else {
      setClosest(null);
      setTop3([]);
    }
  }, [labs, etalons]);

  const verdict = useMemo(() => {
    if (!closest) return null;
    const ok = closest.dE <= THRESHOLD;
    return { ok, text: ok ? 'Соответствует' : 'Не соответствует' };
  }, [closest]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Проверка цвета (камера)</h2>
      {error && (
        <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ position: 'relative', width: '100%', maxWidth: 640 }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        {/* ROI overlay */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 140, height: 140,
          transform: 'translate(-50%, -50%)',
          border: '2px dashed #00e', borderRadius: 8,
          pointerEvents: 'none',
        }} />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setFrozen(f => !f)}>
          {frozen ? 'Возобновить' : 'Замер'}
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div><b>LAB:</b> L={labs.L.toFixed(2)} a={labs.a.toFixed(2)} b={labs.b.toFixed(2)}</div>
        {closest && (
          <div style={{ marginTop: 8 }}>
            <div><b>Предложение:</b> {closest.product_name || closest.name || '(без названия)'} (ΔE00={closest.dE.toFixed(2)})</div>
            {typeof closest.rus_color_name === 'string' && closest.rus_color_name && (
              <div><b>Цвет по эталону:</b> {closest.rus_color_name}</div>
            )}
            {verdict && (
              <div style={{ marginTop: 8, fontWeight: 'bold', color: verdict.ok ? 'green' : 'crimson' }}>
                {verdict.text} (порог {THRESHOLD})
              </div>
            )}
          </div>
        )}
      </div>

      {top3.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div><b>Топ-3 кандидата:</b></div>
          <ol style={{ marginTop: 4 }}>
            {top3.map((e, idx) => (
              <li key={idx}>
                {(e.product_name || e.name || '(без названия)')} — ΔE00={e.dE.toFixed(2)}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
        Порог соответствия можно будет настроить позднее индивидуально по продукту. Сейчас используется ΔE00 ≤ {THRESHOLD}.
      </div>
    </div>
  );
}
