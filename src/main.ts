import Shader from '@/shader.wgsl';

type GPUContextDeviceFormat = {
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  device: GPUDevice
};

type GPUPipelineBufferVertices = {
  pipeline: GPURenderPipeline,
  buffer: GPUBuffer,
  vertices: number
};

const WEBGPU_NOT_SUPPORTED = 404;

async function initializeWebGPU(
  canvas: HTMLCanvasElement
): Promise<GPUContextDeviceFormat> {
  const GPU = navigator.gpu;

  if (!GPU) throw new Error(
    'WebGPU is not supported on this browser.',
    { cause: WEBGPU_NOT_SUPPORTED }
  );

  // https://gpuweb.github.io/gpuweb/#adapter-selection
  const adapter = await GPU.requestAdapter({
    powerPreference: 'low-power',
    forceFallbackAdapter: false
  });

  if (!adapter) throw new Error('No appropriate GPUAdapter found.');

  const context = canvas.getContext('webgpu');

  if (!context) throw new Error('Failed to initialize WebGPU context.');

  // https://gpuweb.github.io/gpuweb/#gpudevice
  const device = await adapter.requestDevice();

  // https://gpuweb.github.io/gpuweb/#dom-gpu-getpreferredcanvasformat
  const format = GPU.getPreferredCanvasFormat();

  // https://gpuweb.github.io/gpuweb/#dom-gpucanvascontext-configure
  context.configure({ device, format });

  return { context, device, format };
}

function createRenderPipeline(
  device: GPUDevice,
  format: GPUTextureFormat
): GPUPipelineBufferVertices {
  const vertices = new Float32Array([
  //  X     Y
    -0.8,  0.8, // Top Left          0______________1, 5
     0.8,  0.8, // Top Right         |            /|
    -0.8, -0.8, // Bottom Left       |         /   |
    -0.8, -0.8, // Bottom Left       |      /      |
     0.8, -0.8, // Bottom Right      |   /         |
     0.8,  0.8  // Top Right     2, 3|/____________|4
  ]);

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbuffer
  const vertexBuffer = device.createBuffer({
    // https://gpuweb.github.io/gpuweb/#typedefdef-gpubufferusageflags
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    size: vertices.byteLength,
    label: 'Cell Vertices'
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // https://gpuweb.github.io/gpuweb/#dictdef-gpuvertexbufferlayout
  const vertexBufferLayout = {
    // Number of bytes the GPU needs to skip forward in
    // the buffer when it's looking for the next vertex.
    // Each vertex is made up of two 32-bit float numbers,
    // a 32-bit float is 4 bytes, so two floats is 8 bytes.
    arrayStride: 8,
    attributes: [
      // Vertex Position:
      {
        // https://gpuweb.github.io/gpuweb/#enumdef-gpuvertexformat
        format: 'float32x2' as GPUVertexFormat,
        // Arbitrary number between 0 and 15, must be unique for every defined attribute.
        // https://gpuweb.github.io/gpuweb/#dom-gpuvertexattribute-shaderlocation
        shaderLocation: 0,
        // https://gpuweb.github.io/gpuweb/#dom-gpuvertexattribute-offset
        offset: 0
      }
    ]
  };

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createshadermodule
  const cellShaderModule = device.createShaderModule({
    label: 'Cell Shader',
    code: Shader
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createrenderpipeline
  const cellPipeline = device.createRenderPipeline({
    label: 'Cell Pipeline',
    layout: 'auto',

    // Vertex Stage:
    vertex: {
      buffers: [vertexBufferLayout],
      module: cellShaderModule,
      entryPoint: 'mainVert'
    },

    // Fragment Stage:
    fragment: {
      module: cellShaderModule,
      entryPoint: 'mainFrag',
      targets: [{ format }]
    }
  });

  return {
    vertices: vertices.length / 2,
    pipeline: cellPipeline,
    buffer: vertexBuffer
  };
}

function createGridBindGroup(
  pipeline: GPURenderPipeline,
  device: GPUDevice,
  size: number
) {
  // Uniform buffer array for the grid size.
  const uniformArray = new Float32Array([size, size]);

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbuffer
  const uniformBuffer = device.createBuffer({
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    size: uniformArray.byteLength,
    label: 'Grid Uniforms'
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

  // A bind group is a collection of resources that need to be accessible to a shader at the same time.
  // It can include several types of buffers, like a uniform buffer, textures and samplers.
  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbindgroup
  return device.createBindGroup({
    // `layout: 'auto'` causes the pipeline to create bind group layouts
    // automatically from the bindings declared in the shader code.
    // Index of `0` corresponds to the `@group(0)` in the shader.
    // https://gpuweb.github.io/gpuweb/#dom-gpupipelinebase-getbindgrouplayout
    layout: pipeline.getBindGroupLayout(0),
    label: 'Cell renderer bind group',
    entries: [{
      binding: 0,
      resource: {
        buffer: uniformBuffer
      }
    }]
  });
}

function createRenderPass(
  pipeline: GPURenderPipeline,
  context: GPUCanvasContext,
  group: GPUBindGroup,
  device: GPUDevice,
  buffer: GPUBuffer,
  instances: number,
  vertices: number,
): void {
  // https://gpuweb.github.io/gpuweb/#gpucommandencoder
  const commandEncoder = device.createCommandEncoder();

  // https://gpuweb.github.io/gpuweb/#dom-gpucommandencoder-beginrenderpass
  const renderPass = commandEncoder.beginRenderPass({
    // https://gpuweb.github.io/gpuweb/#dictdef-gpurenderpasscolorattachment
    colorAttachments: [{
      // https://gpuweb.github.io/gpuweb/#dom-gpucanvascontext-getcurrenttexture
      // https://gpuweb.github.io/gpuweb/#dom-gputexture-createview
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0.4, 1], // RGBA
      // https://gpuweb.github.io/gpuweb/#enumdef-gpustoreop
      storeOp: 'store',
      // https://gpuweb.github.io/gpuweb/#enumdef-gpuloadop
      loadOp: 'clear'
    }]
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-setvertexbuffer
  renderPass.setVertexBuffer(0, buffer);

  // https://gpuweb.github.io/gpuweb/#dom-gpubindingcommandsmixin-setbindgroup
  renderPass.setBindGroup(0, group);

  // https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-setpipeline
  renderPass.setPipeline(pipeline);

  // https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-draw
  renderPass.draw(vertices, instances);

  // https://gpuweb.github.io/gpuweb/#dom-gpurenderpassencoder-end
  renderPass.end();

  // Once a command buffer is submitted, it cannot be used again, so there's no need to hold on to it.
  // In order to submit more commands, a new command buffer needs to be created.
  // https://gpuweb.github.io/gpuweb/#dom-gpucommandencoder-finish
  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-submit
  device.queue.submit([commandEncoder.finish()]);
}

initializeWebGPU(document.getElementsByTagName('canvas')[0])
  .then(({ context, device, format }: GPUContextDeviceFormat, size = 32) => {
    const { pipeline, buffer, vertices } = createRenderPipeline(device, format);

    createRenderPass(
      pipeline,
      context,
      createGridBindGroup(
        pipeline,
        device,
        size
      ),
      device,
      buffer,
      size * size,
      vertices
    );
  })
  .catch(error =>
    error.cause === WEBGPU_NOT_SUPPORTED
      ? alert(error.message)
      : console.error(error)
  );
