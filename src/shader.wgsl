struct VertexOutput {
  @location(0) cell: vec2f,
  @builtin(position) position: vec4f
};

// Uniform for the grid size.
@group(0) @binding(0) var<uniform> grid: vec2f;

@vertex
fn mainVert(
  @location(0) position: vec2f,
  // Cell instance index from `0` to `grid * grid - 1`:
  @builtin(instance_index) instance: u32
) -> VertexOutput
{
  let fInstance = f32(instance);
  // Cell coordinates from its instance index:
  let cell = vec2f(fInstance % grid.x, floor(fInstance / grid.x));

  var output: VertexOutput;

  output.position = vec4f(
    // Normalized cell position:
    (position + 1) / grid - 1 +
    // Cell position offset:
    cell / grid * 2,
    0, 1
  );

  output.cell = cell;
  return output;
}

@fragment
// `VertexOutput` can be "destructured" to use individual properties:
fn mainFrag(@location(0) cell: vec2f) -> @location(0) vec4f
{
  let rg = cell / grid;
  // Tweak the blue channel:
  return vec4f(rg, 1 - rg.g, 1);
}
