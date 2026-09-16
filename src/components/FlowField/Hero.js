import React, { useMemo } from 'react';
import { flowField, cubeBetween } from './index';
import s from './styles.module.css';

/**
 * Homepage hero field — the richest instance of the flow motif.
 *
 * 12 streamlines across 1280×640. One bright "spine" current enters at left,
 * terminates at the block's front-left corner with a ripple + stagnation dot, and
 * splits into two currents that pass BEHIND the block and fade downstream.
 *
 * ALL THREE cubes are fed to the generator, not just the central block — the
 * streamlines have to hug every silhouette. Drawing a cube without adding it to
 * the field leaves lines running straight through it, which is what makes a cube
 * stop reading as solid.
 */
const LINES = [40, 80, 125, 170, 215, 260, 380, 425, 470, 515, 560, 600];

const BIG = { x: 860, y: 275, size: 140 };
// Derived, not hardcoded: each small cube is centred between the two streamlines
// it sits among, so the gap above equals the gap below.
//
// Lane choice matters as much as centring. The hero block's gradient squeezes the
// lines nearest it — at x=1205 the 125/170 lane closes to 20px while 80/125 opens
// to 55px — so each cube sits in a lane with room, and the lower one is placed
// well upstream of the block where the field is calm.
const SMALL_TOP = cubeBetween({ cx: 1205, size: 34, lineA: 80, lineB: 125 });
const SMALL_LOW = cubeBetween({ cx: 470, size: 40, lineA: 470, lineB: 515 });

export default function HeroFlowField() {
  const field = useMemo(
    () =>
      flowField({
        width: 1280,
        height: 640,
        lines: LINES,
        cubes: [BIG, SMALL_TOP, SMALL_LOW],
      }),
    [],
  );

  const [big, smallTop, smallLow] = field.cubes;

  return (
    <div className={s.heroWrap} aria-hidden="true">
      {/* Scales with the viewport instead of sitting at a fixed 1280px, so the
          field still covers the hero when zoomed or on a narrow window. */}
      <svg viewBox="0 0 1280 640" className={s.heroSvg} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="hfSoft" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset=".22" stopColor="#38bdf8" stopOpacity=".6" />
            <stop offset=".62" stopColor="#818cf8" stopOpacity=".55" />
            <stop offset=".9" stopColor="#a855f7" stopOpacity=".35" />
            <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hfFaint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0" />
            <stop offset=".3" stopColor="#7dd3fc" stopOpacity=".3" />
            <stop offset=".75" stopColor="#c084fc" stopOpacity=".26" />
            <stop offset="1" stopColor="#c084fc" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hfSpine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset=".3" stopColor="#7dd3fc" stopOpacity=".95" />
            <stop offset="1" stopColor="#e0f2fe" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="hfFront" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f1629" />
            <stop offset="1" stopColor="#141d33" />
          </linearGradient>
          <linearGradient id="hfTopO" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1f4568" />
            <stop offset="1" stopColor="#321b4e" />
          </linearGradient>
          <linearGradient id="hfTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".32" />
            <stop offset="1" stopColor="#a855f7" stopOpacity=".2" />
          </linearGradient>
          <linearGradient id="hfSideO" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#351d52" />
            <stop offset="1" stopColor="#0b0f1f" />
          </linearGradient>
          <linearGradient id="hfSide" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#a855f7" stopOpacity=".22" />
            <stop offset="1" stopColor="#0a0f1e" stopOpacity=".9" />
          </linearGradient>
          <radialGradient id="hfGlow">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".38" />
            <stop offset=".5" stopColor="#a855f7" stopOpacity=".16" />
            <stop offset="1" stopColor="#060913" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="950" cy="326" rx="330" ry="250" fill="url(#hfGlow)" className={s.glowPulse} />

        <g fill="none" strokeLinecap="round">
          {field.paths.map((p, i) => (
            <path
              key={i}
              id={`hfl${i}`}
              d={p.d}
              stroke={p.gradient === 'soft' ? 'url(#hfSoft)' : 'url(#hfFaint)'}
              strokeWidth={p.width}
            />
          ))}
          <path
            id="hfSup"
            d="M856 340 C 842 296 852 260 905 236 C 960 216 1035 220 1082 244 C 1160 284 1220 306 1340 316"
            stroke="url(#hfSoft)"
            strokeWidth="2.8"
          />
          <path
            id="hfSdn"
            d="M856 340 C 844 372 852 404 876 418 C 940 446 1000 442 1058 424 C 1160 392 1240 348 1340 330"
            stroke="url(#hfSoft)"
            strokeWidth="2.8"
          />
        </g>

        {[
          { r: 3.4, fill: '#a5f3fc', begin: 0, path: 'hfSup' },
          { r: 2.6, fill: '#a5f3fc', begin: 1.3, path: 'hfSup', op: 0.7 },
          { r: 3.4, fill: '#a5f3fc', begin: 0.6, path: 'hfSdn' },
          { r: 2.6, fill: '#c4b5fd', begin: 1.9, path: 'hfSdn', op: 0.7 },
        ].map((p, i) => (
          <circle key={i} r={p.r} fill={p.fill} opacity={p.op ?? 1}>
            <animateMotion dur="2.6s" begin={`${p.begin}s`} repeatCount="indefinite">
              <mpath href={`#${p.path}`} />
            </animateMotion>
          </circle>
        ))}

        {/* Large hero block — opaque faces, blockFloat 8s. */}
        <g className={s.blockFloat} style={{ transformOrigin: `${big.centreX}px ${big.centreY}px` }}>
          <polygon points={big.front} fill="url(#hfFront)" stroke="#38bdf8" strokeOpacity=".6" strokeWidth="1.3" />
          <polygon points={big.top} fill="url(#hfTopO)" stroke="#7dd3fc" strokeOpacity=".65" strokeWidth="1.3" />
          <polygon points={big.side} fill="url(#hfSideO)" stroke="#a855f7" strokeOpacity=".55" strokeWidth="1.3" />
          <line x1="860" y1="320" x2="1000" y2="320" stroke="#38bdf8" strokeOpacity=".16" />
          <line x1="860" y1="365" x2="1000" y2="365" stroke="#38bdf8" strokeOpacity=".12" />
        </g>

        {/* Spine, drawn after the block so its head sits on the front face. */}
        <path
          id="hfSpineP"
          d="M-60 300 C 250 300 560 316 856 340"
          fill="none"
          stroke="url(#hfSpine)"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        {[
          { r: 4.5, fill: '#e0f2fe', begin: 0 },
          { r: 3, fill: '#7dd3fc', begin: 0.8, op: 0.85 },
          { r: 3, fill: '#7dd3fc', begin: 1.6, op: 0.85 },
          { r: 2.6, fill: '#7dd3fc', begin: 2.4, op: 0.7 },
        ].map((p, i) => (
          <circle key={i} r={p.r} fill={p.fill} opacity={p.op ?? 1}>
            <animateMotion dur="3.2s" begin={`${p.begin}s`} repeatCount="indefinite">
              <mpath href="#hfSpineP" />
            </animateMotion>
          </circle>
        ))}

        {/* Stagnation point where the spine meets the block. */}
        <circle
          className={s.ripple}
          cx="856"
          cy="340"
          r="7"
          fill="none"
          stroke="#7dd3fc"
          strokeWidth="1.5"
          opacity=".75"
          style={{ transformOrigin: '856px 340px' }}
        />
        <circle cx="856" cy="340" r="3.4" fill="#e0f2fe" />

        {[
          { line: 4, dur: 4.4, begin: 0, fill: '#7dd3fc', op: 0.75 },
          { line: 4, dur: 4.4, begin: 2.2, fill: '#7dd3fc', op: 0.5 },
          { line: 7, dur: 4.8, begin: 0.7, fill: '#c084fc', op: 0.75 },
          { line: 7, dur: 4.8, begin: 3.1, fill: '#c084fc', op: 0.5 },
          { line: 2, dur: 6.2, begin: 1.4, fill: '#7dd3fc', op: 0.5, r: 2 },
          { line: 9, dur: 6.6, begin: 2.8, fill: '#c084fc', op: 0.5, r: 2 },
        ].map((p, i) => (
          <circle key={i} r={p.r ?? 2.6} fill={p.fill} opacity={p.op}>
            <animateMotion dur={`${p.dur}s`} begin={`${p.begin}s`} repeatCount="indefinite">
              <mpath href={`#hfl${p.line}`} />
            </animateMotion>
          </circle>
        ))}

        {/* Small cubes — geometry from the generator, so they match the field
            deformation exactly rather than being positioned by hand. */}
        <g
          className={s.blockFloat}
          style={{
            transformOrigin: `${smallTop.centreX}px ${smallTop.centreY}px`,
            animationDuration: '9s',
            animationDelay: '-3s',
          }}
        >
          <polygon points={smallTop.front} fill="url(#hfFront)" fillOpacity=".9" stroke="#38bdf8" strokeOpacity=".5" strokeWidth="1" />
          <polygon points={smallTop.top} fill="url(#hfTop)" stroke="#7dd3fc" strokeOpacity=".55" strokeWidth="1" />
          <polygon points={smallTop.side} fill="url(#hfSide)" stroke="#a855f7" strokeOpacity=".45" strokeWidth="1" />
        </g>
        <g
          className={s.blockFloatB}
          style={{ transformOrigin: `${smallLow.centreX}px ${smallLow.centreY}px` }}
        >
          <polygon points={smallLow.front} fill="url(#hfFront)" fillOpacity=".85" stroke="#c084fc" strokeOpacity=".45" strokeWidth="1" />
          <polygon points={smallLow.top} fill="url(#hfTop)" stroke="#7dd3fc" strokeOpacity=".5" strokeWidth="1" />
          <polygon points={smallLow.side} fill="url(#hfSide)" stroke="#a855f7" strokeOpacity=".4" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}
