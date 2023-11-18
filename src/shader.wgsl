// Uniform for the grid size.
@group(0) @binding(0) var<uniform> grid: vec2f;

@vertex
fn mainVert(@location(0) position: vec2f) -> @builtin(position) vec4f {
  return vec4f(position / grid, 0, 1);
}

@fragment
fn mainFrag() -> @location(0) vec4f {
  return vec4f(1, 0, 0, 1);
}
