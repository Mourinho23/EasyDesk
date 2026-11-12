(() => {
  document.querySelectorAll('.molten-metal-canvas').forEach(canvas => {
    const section = canvas.closest('.molten-section');
    if (!section) return;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power'
  });

  if (!gl) {
    console.warn('EasyDesk hero background requires WebGL 2; using the static fallback.');
    return;
  }

  const vertexSource = `#version 300 es
    in vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;

  const fragmentSource = `#version 300 es
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uPointerStrength;
    uniform vec2 uFlare;
    uniform float uFlareAge;
    out vec4 outColor;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 cell = floor(p);
      vec2 local = fract(p);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
        local.y
      );
    }

    float flow(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 4; i++) {
        value += noise(p) * amplitude;
        p = p * 2.03 + vec2(13.7, 9.2);
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      vec2 point = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
      point = point * 10.0 + vec2(-0.11, 0.0);

      vec2 pointerUv = vec2(uPointer.x, 1.0 - uPointer.y);
      vec2 pointerDelta = uv - pointerUv;
      float pointerHeat = exp(-dot(pointerDelta, pointerDelta) * 24.0) * uPointerStrength;
      point += normalize(pointerDelta + vec2(0.0001)) * pointerHeat * 0.55;

      float time = uTime * 0.16;
      vec2 warp = vec2(
        flow(point * 0.47 + vec2(time, -time * 0.6)),
        flow(point * 0.47 + vec2(8.3 - time * 0.7, time))
      );
      float broad = flow(point * 0.58 + (warp - 0.5) * 2.4);
      float detail = flow(point * 1.15 - warp * 1.7 + vec2(-time * 0.8, time * 0.55));
      float molten = clamp(broad * 0.72 + detail * 0.28 + pointerHeat * 0.12, 0.0, 1.0);

      vec3 violet = vec3(0.216, 0.173, 0.420);
      vec3 pink = vec3(1.0, 0.624, 0.988);
      vec3 color = mix(violet, pink, smoothstep(0.36, 0.7, molten));
      float veins = smoothstep(0.58, 0.82, detail + broad * 0.28);
      color = mix(color, vec3(1.0), veins * 0.28);

      vec2 flareDelta = uv - vec2(uFlare.x, 1.0 - uFlare.y);
      float flare = exp(-dot(flareDelta, flareDelta) * 42.0) * exp(-max(uFlareAge, 0.0) * 2.4);
      color = mix(color, vec3(1.0), clamp(flare * 0.85, 0.0, 0.85));
      float alpha = clamp(smoothstep(0.2, 0.74, molten) * 0.71 + veins * 0.12 + flare * 0.48, 0.0, 0.82);

      outColor = vec4(color * alpha, alpha);
    }`;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) {
      console.error('Unable to create the EasyDesk hero background shader.');
      return null;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`Unable to compile the EasyDesk hero background shader: ${gl.getShaderInfoLog(shader)}`);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  if (!program) {
    console.error('Unable to create the EasyDesk hero background program.');
    return;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(`Unable to link the EasyDesk hero background program: ${gl.getProgramInfoLog(program)}`);
    gl.deleteProgram(program);
    return;
  }

  const buffer = gl.createBuffer();
  if (!buffer) {
    console.error('Unable to create the EasyDesk hero background geometry.');
    gl.deleteProgram(program);
    return;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    time: gl.getUniformLocation(program, 'uTime'),
    pointer: gl.getUniformLocation(program, 'uPointer'),
    pointerStrength: gl.getUniformLocation(program, 'uPointerStrength'),
    flare: gl.getUniformLocation(program, 'uFlare'),
    flareAge: gl.getUniformLocation(program, 'uFlareAge')
  };

  const pointer = { x: 0.5, y: 0.5, strength: 0 };
  const target = { x: 0.5, y: 0.5, strength: 0 };
  let flare = { x: 0.5, y: 0.5, time: -10 };
  let time = 0;
  let lastFrame = 0;
  let frameId = 0;
  let visible = true;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  const render = now => {
    frameId = 0;
    if (!visible || document.hidden) return;

    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    const reducedMotion = motionPreference.matches;
    if (!reducedMotion) time += delta;

    const easing = 1 - Math.exp(-delta / 0.25);
    pointer.x += (target.x - pointer.x) * easing;
    pointer.y += (target.y - pointer.y) * easing;
    pointer.strength += (target.strength - pointer.strength) * easing;

    resize();
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.uniform1f(uniforms.pointerStrength, reducedMotion ? 0 : pointer.strength * 0.5);
    gl.uniform2f(uniforms.flare, flare.x, flare.y);
    gl.uniform1f(uniforms.flareAge, performance.now() / 1000 - flare.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reducedMotion) frameId = requestAnimationFrame(render);
  };

  const start = () => {
    if (frameId || !visible || document.hidden) return;
    if (motionPreference.matches) render(performance.now());
    else frameId = requestAnimationFrame(render);
  };

  const updatePointer = event => {
    const bounds = section.getBoundingClientRect();
    target.x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    target.y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    target.strength = 1;
  };

  section.addEventListener('pointermove', updatePointer, { passive: true });
  section.addEventListener('pointerleave', () => {
    target.strength = 0;
  });
  section.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('a, button, input, select, textarea')) return;
    const bounds = section.getBoundingClientRect();
    flare = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
      time: performance.now() / 1000
    };
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
    } else {
      start();
    }
  });

  motionPreference.addEventListener('change', () => {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    lastFrame = 0;
    start();
  });

  const visibility = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) {
      start();
    } else if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
    }
  });
  visibility.observe(section);

  const sizes = new ResizeObserver(resize);
  sizes.observe(section);
  resize();
  start();
  });
})();
