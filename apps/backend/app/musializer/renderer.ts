/**
 * WebGL renderer for the Musializer port. It draws exactly what raylib draws
 * in `fft_render`: solid bars, then smears and circles through Musializer's
 * `circle.fs` shader, with raylib's default alpha blending.
 *
 * Musializer — Copyright 2023 Alexey Kutepov and Musializer Contributors, MIT.
 */

import { BACKGROUND_RGB, FLOATS_PER_VERTEX, VERTICES_PER_QUAD, type MusializerGeometry } from './analysis';

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
attribute vec4 aColor;
uniform vec2 uResolution;
varying vec2 fragTexCoord;
varying vec4 fragColor;
void main() {
  fragTexCoord = aTexCoord;
  fragColor = aColor;
  vec2 clip = aPosition / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const SOLID_SHADER = `
precision mediump float;
varying vec4 fragColor;
void main() {
  gl_FragColor = fragColor;
}
`;

// resources/shaders/glsl330/circle.fs, in GLSL ES 1.00.
const CIRCLE_SHADER = `
precision mediump float;
varying vec2 fragTexCoord;
varying vec4 fragColor;
uniform float radius;
uniform float power;
void main() {
  float r = radius;
  vec2 p = fragTexCoord - vec2(0.5);
  if (length(p) <= 0.5) {
    float s = length(p) - r;
    if (s <= 0.0) {
      gl_FragColor = fragColor * 1.5;
    } else {
      float t = 1.0 - s / (0.5 - r);
      gl_FragColor = mix(vec4(fragColor.xyz, 0.0), fragColor * 1.5, pow(t, power));
    }
  } else {
    gl_FragColor = vec4(0.0);
  }
}
`;

type Program = {
  program: WebGLProgram;
  position: number;
  texCoord: number;
  color: number;
  resolution: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  power: WebGLUniformLocation | null;
};

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL could not create a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Musializer shader failed to compile: ${log}`);
  }
  return shader;
}

function link(gl: WebGLRenderingContext, fragmentSource: string): Program {
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL could not create a program.');
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`Musializer program failed to link: ${log}`);
  }
  return {
    program,
    position: gl.getAttribLocation(program, 'aPosition'),
    texCoord: gl.getAttribLocation(program, 'aTexCoord'),
    color: gl.getAttribLocation(program, 'aColor'),
    resolution: gl.getUniformLocation(program, 'uResolution'),
    radius: gl.getUniformLocation(program, 'radius'),
    power: gl.getUniformLocation(program, 'power'),
  };
}

export type MusializerRenderer = {
  /** Draws one frame of `bins` bars into a `width` by `height` pixel canvas. */
  render(geometry: MusializerGeometry, bins: number, width: number, height: number): void;
  dispose(): void;
};

/** Null when the browser cannot provide WebGL. */
export function createMusializerRenderer(canvas: HTMLCanvasElement): MusializerRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false });
  if (!gl) return null;

  let solid: Program;
  let circle: Program;
  try {
    solid = link(gl, SOLID_SHADER);
    circle = link(gl, CIRCLE_SHADER);
  } catch {
    return null;
  }
  const buffer = gl.createBuffer();
  const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;

  const draw = (program: Program, vertices: Float32Array, bins: number, width: number, height: number) => {
    gl.useProgram(program.program);
    gl.uniform2f(program.resolution, width, height);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, bins * VERTICES_PER_QUAD * FLOATS_PER_VERTEX), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(program.position);
    gl.vertexAttribPointer(program.position, 2, gl.FLOAT, false, stride, 0);
    if (program.texCoord >= 0) {
      gl.enableVertexAttribArray(program.texCoord);
      gl.vertexAttribPointer(program.texCoord, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    }
    gl.enableVertexAttribArray(program.color);
    gl.vertexAttribPointer(program.color, 4, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.drawArrays(gl.TRIANGLES, 0, bins * VERTICES_PER_QUAD);
  };

  return {
    render(geometry, bins, width, height) {
      gl.viewport(0, 0, width, height);
      gl.clearColor(BACKGROUND_RGB[0] / 255, BACKGROUND_RGB[1] / 255, BACKGROUND_RGB[2] / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (bins <= 0) return;

      // raylib's default BLEND_ALPHA.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

      draw(solid, geometry.bars, bins, width, height);

      gl.useProgram(circle.program);
      gl.uniform1f(circle.radius, 0.3);
      gl.uniform1f(circle.power, 3.0);
      draw(circle, geometry.smears, bins, width, height);

      gl.uniform1f(circle.radius, 0.07);
      gl.uniform1f(circle.power, 5.0);
      draw(circle, geometry.circles, bins, width, height);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(solid.program);
      gl.deleteProgram(circle.program);
    },
  };
}
