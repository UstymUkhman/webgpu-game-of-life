import Renderer from '@/renderer.wgsl';
import Simulation from '@/simulation.wgsl';

type GPUPipelineLayoutBufferVertices = {
  pipeline: GPURenderPipeline,
  layout: GPUPipelineLayout,
  buffer: GPUBuffer,
  vertices: number
};

type GPUContextDeviceFormat = {
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  device: GPUDevice
};

type GPUBindGroupsLayout = {
  layout: GPUBindGroupLayout,
  groups: GPUBindGroup[]
};

const WEBGPU_NOT_SUPPORTED = 404;
const RENDER_LOOP_INTERVAL = 250;

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

function createComputePipeline(
  layout: GPUPipelineLayout,
  device: GPUDevice
): GPUComputePipeline {
  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createshadermodule
  const simulationShaderModule = device.createShaderModule({
    label: 'Simulation Shader',
    code: Simulation
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createcomputepipeline
  return device.createComputePipeline({
    label: 'Simulation Pipeline',
    /**
     * `layout: 'auto'` causes the pipeline to create bind group layouts
     * automatically from the bindings declared in the shader code.
     * https://gpuweb.github.io/gpuweb/#dom-gpupipelinedescriptorbase-layout
     * 
     * layout: 'auto',
     */

    // Explicit pipeline layout with custom bind group layout instead of the automatically
    // created one from the bindings declared in the shader code to allow render and
    // compute shaders to share resources that are present in the same bind group.
    layout,

    compute: {
      module: simulationShaderModule,
      entryPoint: 'mainCompute'
    }
  });
}

function createGridBindGroups(
  // pipeline: GPURenderPipeline,
  device: GPUDevice,
  size: number
): GPUBindGroupsLayout {
  // Uniform buffer array for the grid size.
  const uniformArray = new Float32Array([size, size]);

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbuffer
  const uniformBuffer = device.createBuffer({
    label: 'Grid Uniforms',
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

  // Storage buffer array for the active state of each cell.
  const storageArray = new Uint32Array(size * size);

  // Two storage buffers hold cells states using ping pong pattern.
  const storageBuffers = [
    // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbuffer
    device.createBuffer({
      label: 'Cell State A',
      size: storageArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    }),
    // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbuffer
    device.createBuffer({
      label: 'Cell State B',
      size: storageArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
  ];

  // Every third cell of the first grid is marked as active.
  for (let i = 0; i < storageArray.length; i += 3) storageArray[i] = 1;

  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  device.queue.writeBuffer(storageBuffers[0], 0, storageArray);

  // Every other cell of the second grid is marked as active.
  for (let i = 0; i < storageArray.length; i++) storageArray[i] = i % 2;

  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  device.queue.writeBuffer(storageBuffers[1], 0, storageArray);

  // Bind group layout and pipeline layout that describes all
  // of the resources that are present in the bind group,
  // not just the ones used by a specific pipeline.
  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbindgrouplayout
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Cell Bind Group Layout',
    entries: [{
      binding: 0,
      // Grid uniform buffer.
      // `type: 'uniform'` is optional,
      // but buffer value has to be
      // at least an empty object.
      buffer: { type: 'uniform' },
      // https://gpuweb.github.io/gpuweb/#typedefdef-gpushaderstageflags
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
    }, {
      binding: 1,
      // Cell input state buffer.
      buffer: { type: 'read-only-storage' },
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX
    }, {
      binding: 2,
      // Cell output state buffer.
      buffer: { type: 'storage' },
      visibility: GPUShaderStage.COMPUTE
    }]
  });

  // Two bind groups are created, one for each storage buffer.
  const bindGroups = [
    // A bind group is a collection of resources that need to be accessible to a shader at the same time.
    // It can include several types of buffers, like a uniform buffer, textures and samplers.
    // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbindgroup
    device.createBindGroup({
      label: 'Cell Bind Group A',
      /**
       * `layout: 'auto'` causes the pipeline to create bind group layouts
       * automatically from the bindings declared in the shader code.
       * Index of `0` corresponds to the `@group(0)` in the shader.
       * https://gpuweb.github.io/gpuweb/#dom-gpupipelinebase-getbindgrouplayout
       * 
       * layout: pipeline.getBindGroupLayout(0),
       */

      // Custom bind group layout instead of the automatically created one from
      // the bindings declared in the shader code to allow render and compute
      // shaders to share resources that are present in the same bind group.
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: {
          buffer: uniformBuffer
        }
      }, {
        binding: 1,
        resource: {
          buffer: storageBuffers[0]
        }
      }, {
        binding: 2,
        resource: {
          buffer: storageBuffers[1]
        }
      }]
    }),

    device.createBindGroup({
      label: 'Cell Bind Group B',
      // https://gpuweb.github.io/gpuweb/#dom-gpupipelinebase-getbindgrouplayout
      // layout: pipeline.getBindGroupLayout(0),
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: {
          buffer: uniformBuffer
        }
      }, {
        binding: 1,
        resource: {
          buffer: storageBuffers[1]
        }
      }, {
        binding: 2,
        resource: {
          buffer: storageBuffers[0]
        }
      }]
    })
  ];

  return {
    layout: bindGroupLayout,
    groups: bindGroups
  };
}

function createRenderPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  layout: GPUBindGroupLayout
): GPUPipelineLayoutBufferVertices {
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
    label: 'Cell Vertices',
    size: vertices.byteLength,
    // https://gpuweb.github.io/gpuweb/#typedefdef-gpubufferusageflags
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // A list of bind group layouts that one or more pipelines can use.
  // The order of the bind group layouts in the array needs to
  // correspond with the `@group` attributes in the shaders.
  // In this case, `layout` is associated with `@group(0)`.
  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createpipelinelayout
  const pipelineLayout = device.createPipelineLayout({
    label: 'Cell Pipeline Layout',
    bindGroupLayouts: [layout],
  });

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
    code: Renderer
  });

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createrenderpipeline
  const cellPipeline = device.createRenderPipeline({
    label: 'Cell Pipeline',
    /**
     * `layout: 'auto'` causes the pipeline to create bind group layouts
     * automatically from the bindings declared in the shader code.
     * https://gpuweb.github.io/gpuweb/#dom-gpupipelinedescriptorbase-layout
     * 
     * layout: 'auto',
     */

    // Explicit pipeline layout with custom bind group layout instead of the automatically
    // created one from the bindings declared in the shader code to allow render and
    // compute shaders to share resources that are present in the same bind group.
    layout: pipelineLayout,

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
    layout: pipelineLayout,
    buffer: vertexBuffer
  };
}

function createRenderPass(
  pipelines: [GPUComputePipeline, GPURenderPipeline],
  context: GPUCanvasContext,
  groups: GPUBindGroup[],
  workgroupSize: number,
  device: GPUDevice,
  buffer: GPUBuffer,
  instances: number,
  vertices: number,
  gridSize: number,
  step: number
): number {
  // https://gpuweb.github.io/gpuweb/#gpucommandencoder
  const commandEncoder = device.createCommandEncoder();

  // https://gpuweb.github.io/gpuweb/#dom-gpucommandencoder-begincomputepass
  const computePass = commandEncoder.beginComputePass();

  // https://gpuweb.github.io/gpuweb/#dom-gpucomputepassencoder-setpipeline
  computePass.setPipeline(pipelines[0]);

  // https://gpuweb.github.io/gpuweb/#dom-gpubindingcommandsmixin-setbindgroup
  computePass.setBindGroup(0, groups[step % 2]);

  // Number of workgroups to dispatch, defined by:
  // compute shader invocations per cell on one axis (32)
  // divided by workgroup size definded in a simulation shader (8).
  const workgroupCount = Math.ceil(gridSize / workgroupSize);

  // https://gpuweb.github.io/gpuweb/#dom-gpucomputepassencoder-dispatchworkgroups
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  // https://gpuweb.github.io/gpuweb/#dom-gpucomputepassencoder-end
  computePass.end();

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

  // https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-setpipeline
  renderPass.setPipeline(pipelines[1]);

  // https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-setvertexbuffer
  renderPass.setVertexBuffer(0, buffer);

  // https://gpuweb.github.io/gpuweb/#dom-gpubindingcommandsmixin-setbindgroup
  renderPass.setBindGroup(0, groups[++step % 2]);

  // https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-draw
  renderPass.draw(vertices, instances);

  // https://gpuweb.github.io/gpuweb/#dom-gpurenderpassencoder-end
  renderPass.end();

  // Once a command buffer is submitted, it cannot be used again, so there's no need to hold on to it.
  // In order to submit more commands, a new command buffer needs to be created.
  // https://gpuweb.github.io/gpuweb/#dom-gpucommandencoder-finish
  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-submit
  device.queue.submit([commandEncoder.finish()]);

  return step;
}

initializeWebGPU(document.getElementsByTagName('canvas')[0])
  .then(({ context, device, format }: GPUContextDeviceFormat, size = 32) => {
    const { layout: bindGroupLayout, groups } =
      createGridBindGroups(/* renderPipeline, */ device, size);

    const { pipeline: renderPipeline, layout: pipelineLayout, buffer, vertices } =
      createRenderPipeline(device, format, bindGroupLayout);

    const computePipeline = createComputePipeline(pipelineLayout, device);

    let step = 0,
        instances = size * size,
        lastRender = performance.now();

    const runSimulation = (time: number) => {
      requestAnimationFrame(runSimulation);
      if (time - lastRender < RENDER_LOOP_INTERVAL) return;
      
      step = createRenderPass(
        [computePipeline, renderPipeline],
        context,
        groups,
        8,
        device,
        buffer,
        instances,
        vertices,
        size,
        step
      );

      lastRender = time;
    };

    requestAnimationFrame(runSimulation);
  })
  .catch(error =>
    error.cause === WEBGPU_NOT_SUPPORTED
      ? alert(error.message)
      : console.error(error)
  );
