/**
 * Shared WebGPU device singleton.
 *
 * A GPUDevice must be shared across component mounts: destroying a device on
 * unmount can tear down the underlying Dawn instance (observed on SwiftShader,
 * where React StrictMode's double mount made the first cleanup's destroy() kill
 * the second mount's device with "A valid external Instance reference no longer
 * exists"). Instead of a per-mount device we acquire one lazily and keep it for
 * the lifetime of the page, re-acquiring only if the browser reports a real
 * device loss.
 */

let devicePromise: Promise<GPUDevice> | null = null

export function acquireWebGPUDevice(): Promise<GPUDevice> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
  if (!gpu) {
    return Promise.reject(new Error('WebGPU is not supported in this browser.'))
  }

  if (!devicePromise) {
    devicePromise = (async () => {
      const adapter = await gpu.requestAdapter()
      if (!adapter) {
        throw new Error('No suitable GPU adapter found.')
      }
      const device = await adapter.requestDevice()
      device.lost.then((info) => {
        // Allow a fresh device on the next acquire after a real loss
        // (driver reset, GPU process crash, ...).
        if (info.reason !== 'destroyed') {
          devicePromise = null
        }
      })
      return device
    })()
    // A failed acquisition should not poison future attempts.
    devicePromise.catch(() => {
      devicePromise = null
    })
  }

  return devicePromise
}
