// Uniform buffer for the grid size.
@group(0) @binding(0) var<uniform> grid: vec2f;

// Exposed cell input and output states as storage buffers.
@group(0) @binding(1) var<storage> cellStateIn: array<u32>; // read-only
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

// Mapped cell index into a linear storage array.
fn cellIndex(cell: vec2u) -> u32 {
  return cell.y * u32(grid.x) + cell.x;
}

@compute
@workgroup_size(8, 8)
fn mainCompute(
  // Three-dimensional vector of unsigned integers holding the index
  // of the current call from the grid of shader invocations.
  @builtin(global_invocation_id) cell: vec3u
) {
  if (cellStateIn[cellIndex(cell.xy)] == 1) {
    cellStateOut[cellIndex(cell.xy)] = 0;
  } else {
    cellStateOut[cellIndex(cell.xy)] = 1;
  }

  // cellStateIn[cellIndex(cell.xy)] == 1
  //   ? cellStateOut[cellIndex(cell.xy)] = 0
  //   : cellStateOut[cellIndex(cell.xy)] = 1;
}
