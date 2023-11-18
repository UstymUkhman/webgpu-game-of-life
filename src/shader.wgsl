// Uniform for the grid size.
@group(0) @binding(0) var<uniform> grid: vec2f;

@vertex
fn mainVert(
  @location(0) position: vec2f,
  // Cell instance index from `0` to `grid * grid - 1`:
  @builtin(instance_index) instance: u32
) -> @builtin(position) vec4f
{
  let fInstance = f32(instance);
  // Cell coordinates from its instance index:
  let cell = vec2f(fInstance % grid.x, floor(fInstance / grid.x));

  let cellOffset = cell / grid * 2;
  let normalizedPosition = (position + 1) / grid - 1;

  return vec4f(normalizedPosition + cellOffset, 0, 1);
}

@fragment
fn mainFrag() -> @location(0) vec4f
{
  return vec4f(1, 0, 0, 1);
}
