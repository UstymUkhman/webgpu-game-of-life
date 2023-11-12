import './style.css';

type GPUContextDevice = {
  context: GPUCanvasContext,
  device: GPUDevice
};

const WEBGPU_NOT_SUPPORTED = 404;

async function initializeWebGPU (canvas: HTMLCanvasElement): Promise<GPUContextDevice> {
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

  return { context, device };
}

function createRenderPass ({ context, device }: GPUContextDevice): void {
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

  // https://gpuweb.github.io/gpuweb/#dom-gpurenderpassencoder-end
  renderPass.end();

  // Once a command buffer is submitted, it cannot be used again, so there's no need to hold on to it.
  // In order to submit more commands, a new command buffer needs to be created.
  // https://gpuweb.github.io/gpuweb/#dom-gpucommandencoder-finish
  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-submit
  device.queue.submit([commandEncoder.finish()]);
}

initializeWebGPU(document.getElementsByTagName('canvas')[0])
  .then(createRenderPass)
  .catch(error =>
    error.cause === WEBGPU_NOT_SUPPORTED
      ? alert(error.message)
      : console.error(error)
  );
