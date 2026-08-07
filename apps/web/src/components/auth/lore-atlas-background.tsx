'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

const nodes = [
  { id: 'ember-crown', x: 22, y: 39, r: 2.2, type: 'hub' },
  { id: 'salt-banner', x: 33, y: 31, r: 1.45, type: 'region' },
  { id: 'ash-vault', x: 42, y: 43, r: 0.95, type: 'lore' },
  { id: 'oracle', x: 29, y: 55, r: 1.05, type: 'lore' },
  { id: 'neon-archives', x: 55, y: 28, r: 1.75, type: 'region' },
  { id: 'null-choir', x: 64, y: 45, r: 0.95, type: 'lore' },
  { id: 'memory-court', x: 49, y: 58, r: 1.05, type: 'lore' },
  { id: 'river-names', x: 24, y: 74, r: 1.55, type: 'region' },
  { id: 'ferryman', x: 39, y: 78, r: 0.85, type: 'lore' },
  { id: 'founder-record', x: 12, y: 61, r: 0.8, type: 'lore' },
  { id: 'hidden-era', x: 70, y: 66, r: 1.35, type: 'region' },
  { id: 'artifact-veil', x: 80, y: 38, r: 0.8, type: 'lore' },
] as const;

const connections = [
  'M22 39 C27 32 30 30 33 31',
  'M22 39 C29 40 36 44 42 43',
  'M22 39 C19 48 22 53 29 55',
  'M29 55 C23 59 17 61 12 61',
  'M29 55 C27 64 25 69 24 74',
  'M24 74 C29 79 34 80 39 78',
  'M42 43 C47 34 51 29 55 28',
  'M55 28 C62 31 69 35 80 38',
  'M55 28 C61 35 64 39 64 45',
  'M64 45 C58 51 53 55 49 58',
  'M49 58 C56 64 63 67 70 66',
  'M70 66 C73 55 77 46 80 38',
  'M39 78 C48 73 58 68 70 66',
] as const;

const contours = [
  'M5 47 C11 37 19 32 30 34 C39 35 43 25 53 22 C64 19 70 27 82 24 C89 22 94 16 99 11',
  'M3 62 C12 56 21 58 31 52 C43 45 52 51 63 45 C73 40 80 31 94 30',
  'M9 80 C19 85 31 84 42 78 C55 72 67 76 84 67 C91 63 96 58 100 55',
  'M8 25 C18 19 28 12 43 14 C55 16 62 12 75 9 C83 7 90 8 96 5',
  'M15 70 C22 66 27 65 33 61 C45 52 55 56 66 50 C74 46 83 44 92 41',
  'M19 38 C24 45 33 49 43 48 C54 47 58 37 67 36 C76 35 82 43 90 42',
] as const;

const coastlines = [
  'M8 66 C12 54 22 50 26 42 C31 32 42 32 48 26 C56 18 68 22 73 31 C77 39 72 47 79 55 C87 64 79 75 68 76 C58 77 53 84 43 81 C34 78 30 72 22 73 C15 74 10 72 8 66Z',
  'M55 64 C61 58 68 58 74 52 C81 46 90 50 93 59 C96 69 90 78 79 81 C69 84 62 78 55 64Z',
  'M19 24 C24 17 34 17 39 23 C44 29 40 36 31 37 C23 38 15 32 19 24Z',
] as const;

const particles = [
  { left: '9%', top: '22%', delay: '0s', distance: '22px' },
  { left: '17%', top: '83%', delay: '6s', distance: '-18px' },
  { left: '30%', top: '18%', delay: '11s', distance: '16px' },
  { left: '44%', top: '72%', delay: '3s', distance: '-20px' },
  { left: '58%', top: '21%', delay: '8s', distance: '18px' },
  { left: '72%', top: '56%', delay: '13s', distance: '-16px' },
  { left: '84%', top: '33%', delay: '4s', distance: '20px' },
  { left: '91%', top: '78%', delay: '10s', distance: '-14px' },
] as const;

export function LoreAtlasBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canUseParallax = window.matchMedia('(pointer: fine) and (min-width: 768px)');

    if (!root || reducedMotion.matches || !canUseParallax.matches) {
      return;
    }

    let animationFrame = 0;

    const handlePointerMove = (event: PointerEvent) => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5).toFixed(3);
        const y = (event.clientY / window.innerHeight - 0.5).toFixed(3);

        root.style.setProperty('--atlas-parallax-x', x);
        root.style.setProperty('--atlas-parallax-y', y);
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true" className="lore-atlas-background">
      <div className="lore-atlas-background__hub" />
      <svg
        className="lore-atlas-background__map"
        focusable="false"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 100 100"
      >
        <defs>
          <radialGradient id="atlas-node-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--hive-red)" stopOpacity="0.78" />
            <stop offset="58%" stopColor="var(--hive-red)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--hive-red)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="atlas-cool-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8ab4ff" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#8ab4ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="lore-atlas-background__contours">
          {contours.map((path) => (
            <path d={path} key={path} />
          ))}
        </g>

        <g className="lore-atlas-background__coastlines">
          {coastlines.map((path) => (
            <path d={path} key={path} />
          ))}
        </g>

        <g className="lore-atlas-background__connections">
          {connections.map((path) => (
            <path d={path} key={path} />
          ))}
        </g>

        <g className="lore-atlas-background__signals">
          {connections.slice(0, 7).map((path, index) => (
            <path d={path} key={path} style={{ animationDelay: `${index * -2.2}s` }} />
          ))}
        </g>

        <g className="lore-atlas-background__nodes">
          {nodes.map((node, index) => (
            <g className={`lore-atlas-background__node is-${node.type}`} key={node.id}>
              <circle
                className="lore-atlas-background__node-glow"
                cx={node.x}
                cy={node.y}
                r={node.r * 4.8}
              />
              <circle
                className="lore-atlas-background__node-core"
                cx={node.x}
                cy={node.y}
                r={node.r}
                style={{ animationDelay: `${index * -0.65}s` }}
              />
            </g>
          ))}
        </g>
      </svg>

      <div className="lore-atlas-background__particles">
        {particles.map((particle) => (
          <span
            key={`${particle.left}-${particle.top}`}
            style={
              {
                '--particle-distance': particle.distance,
                animationDelay: particle.delay,
                left: particle.left,
                top: particle.top,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="lore-atlas-background__veil" />
    </div>
  );
}
