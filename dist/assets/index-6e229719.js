(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))i(e);new MutationObserver(e=>{for(const n of e)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function l(e){const n={};return e.integrity&&(n.integrity=e.integrity),e.referrerPolicy&&(n.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?n.credentials="include":e.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function i(e){if(e.ep)return;e.ep=!0;const n=l(e);fetch(e.href,n)}})();var m=`struct VertexOutput {
  @location(0) cell: vec2f,
  @builtin(position) position: vec4f
};

@group(0) @binding(0) var<uniform> grid: vec2f;

@group(0) @binding(1) var<storage> state: array<u32>;

@vertex
fn mainVert(
  
  @location(0) position: vec2f,
  
  @builtin(instance_index) instance: u32
) -> VertexOutput
{
  let fInstance = f32(instance);
  let state = f32(state[instance]);

  
  let cell = vec2f(fInstance % grid.x, floor(fInstance / grid.x));

  var output: VertexOutput;

  output.position = vec4f(
    
    (position * state + 1) / grid - 1 +
    
    cell / grid * 2,
    0, 1
  );

  output.cell = cell;
  return output;
}

@fragment

fn mainFrag(
  @location(0) cell: vec2f
) -> @location(0) vec4f
{
  let rg = cell / grid;
  
  return vec4f(rg, 1 - rg.g, 1);
}`,P=`@group(0) @binding(0) var<uniform> grid: vec2f;

@group(0) @binding(1) var<storage> cellStateIn: array<u32>; 
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

fn cellIndex(cell: vec2u) -> u32 {
  
  
  return (cell.x % u32(grid.x)) + (cell.y % u32(grid.y)) * u32(grid.x);
}

fn cellActive(x: u32, y: u32) -> u32 {
  return cellStateIn[cellIndex(vec2(x, y))];
}

@compute
@workgroup_size(8, 8)
fn mainCompute(
  
  
  @builtin(global_invocation_id) cell: vec3u
) {
  
  let activeNeighbors =
    cellActive(cell.x + 1, cell.y + 1) +
    cellActive(cell.x + 1, cell.y    ) +
    cellActive(cell.x + 1, cell.y - 1) +
    cellActive(cell.x    , cell.y - 1) +
    cellActive(cell.x - 1, cell.y - 1) +
    cellActive(cell.x - 1, cell.y    ) +
    cellActive(cell.x - 1, cell.y + 1) +
    cellActive(cell.x    , cell.y + 1);

  let i = cellIndex(cell.xy);

  switch activeNeighbors
  {
    
    case 2: { cellStateOut[i] = cellStateIn[i]; }
    
    case 3: { cellStateOut[i] = 1; }
    
    
    default: { cellStateOut[i] = 0; }
  }
}`;const y=404,h=250;async function S(t){const r=navigator.gpu;if(!r)throw new Error("WebGPU is not supported on this browser.",{cause:y});const l=await r.requestAdapter({powerPreference:"low-power",forceFallbackAdapter:!1});if(!l)throw new Error("No appropriate GPUAdapter found.");const i=t.getContext("webgpu");if(!i)throw new Error("Failed to initialize WebGPU context.");const e=await l.requestDevice(),n=r.getPreferredCanvasFormat();return i.configure({device:e,format:n}),{context:i,device:e,format:n}}function G(t,r){const l=r.createShaderModule({label:"Simulation Shader",code:P});return r.createComputePipeline({label:"Simulation Pipeline",layout:t,compute:{module:l,entryPoint:"mainCompute"}})}function v(t,r){const l=new Float32Array([r,r]),i=t.createBuffer({label:"Grid Uniforms",size:l.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});t.queue.writeBuffer(i,0,l);const e=new Uint32Array(r*r),n=[t.createBuffer({label:"Cell State A",size:e.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),t.createBuffer({label:"Cell State B",size:e.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})];for(let a=0;a<e.length;a++)e[a]=+(Math.random()>.6);t.queue.writeBuffer(n[0],0,e);const o=t.createBindGroupLayout({label:"Cell Bind Group Layout",entries:[{binding:0,buffer:{type:"uniform"},visibility:GPUShaderStage.COMPUTE|GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT},{binding:1,buffer:{type:"read-only-storage"},visibility:GPUShaderStage.COMPUTE|GPUShaderStage.VERTEX},{binding:2,buffer:{type:"storage"},visibility:GPUShaderStage.COMPUTE}]}),u=[t.createBindGroup({label:"Cell Bind Group A",layout:o,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:n[0]}},{binding:2,resource:{buffer:n[1]}}]}),t.createBindGroup({label:"Cell Bind Group B",layout:o,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:n[1]}},{binding:2,resource:{buffer:n[0]}}]})];return{layout:o,groups:u}}function U(t,r,l){const i=new Float32Array([-.8,.8,.8,.8,-.8,-.8,-.8,-.8,.8,-.8,.8,.8]),e=t.createBuffer({label:"Cell Vertices",size:i.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});t.queue.writeBuffer(e,0,i);const n=t.createPipelineLayout({label:"Cell Pipeline Layout",bindGroupLayouts:[l]}),o={arrayStride:8,attributes:[{format:"float32x2",shaderLocation:0,offset:0}]},u=t.createShaderModule({label:"Cell Shader",code:m}),a=t.createRenderPipeline({label:"Cell Pipeline",layout:n,vertex:{buffers:[o],module:u,entryPoint:"mainVert"},fragment:{module:u,entryPoint:"mainFrag",targets:[{format:r}]}});return{vertices:i.length/2,pipeline:a,layout:n,buffer:e}}function x(t,r,l,i,e,n,o,u,a,f){const d=e.createCommandEncoder(),s=d.beginComputePass();s.setPipeline(t[0]),s.setBindGroup(0,l[f%2]);const g=Math.ceil(a/i);s.dispatchWorkgroups(g,g),s.end();const c=d.beginRenderPass({colorAttachments:[{view:r.getCurrentTexture().createView(),clearValue:[0,0,.4,1],storeOp:"store",loadOp:"clear"}]});return c.setPipeline(t[1]),c.setVertexBuffer(0,n),c.setBindGroup(0,l[++f%2]),c.draw(u,o),c.end(),e.queue.submit([d.finish()]),f}S(document.getElementsByTagName("canvas")[0]).then(({context:t,device:r,format:l})=>{let i=0,e=32,n=e*e,o=performance.now();const{layout:u,groups:a}=v(r,e),{pipeline:f,layout:d,buffer:s,vertices:g}=U(r,l,u),c=G(d,r),p=b=>{requestAnimationFrame(p),!(b-o<h)&&(i=x([c,f],t,a,8,r,s,n,g,e,i),o=b)};requestAnimationFrame(p)}).catch(t=>t.cause===y?alert(t.message):console.error(t));
