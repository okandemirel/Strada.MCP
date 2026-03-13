import type { IPrompt, PromptArgument, PromptMessage } from '../prompt.interface.js';

const PLATFORMS = ['android', 'ios', 'webgl', 'standalone'] as const;
type Platform = (typeof PLATFORMS)[number];

export class OptimizeBuildPrompt implements IPrompt {
  readonly name = 'optimize_build';
  readonly description = 'Build optimization checklist for Unity projects';
  readonly arguments: PromptArgument[] = [
    {
      name: 'platform',
      description: 'Target platform: android, ios, webgl, or standalone',
      required: true,
    },
  ];

  async render(args: Record<string, string>): Promise<PromptMessage[]> {
    const platform = args.platform as Platform;
    if (!platform) {
      throw new Error('platform is required');
    }

    if (!PLATFORMS.includes(platform)) {
      throw new Error(
        `Invalid platform "${platform}". Supported: ${PLATFORMS.join(', ')}`,
      );
    }

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I need to optimize my Strada.Core Unity project build for ${platform}. Please provide a comprehensive optimization checklist covering build size, runtime performance, and platform-specific settings.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: buildOptimizationGuide(platform),
        },
      },
    ];
  }
}

function buildOptimizationGuide(platform: Platform): string {
  const common = `## Common Optimizations (All Platforms)

### Build Size
- [ ] Enable **Managed Stripping Level**: High (Player Settings > Other)
- [ ] Remove unused **Assembly References** from .asmdef files
- [ ] Audit \`Resources/\` folder — move assets to Addressables
- [ ] Enable **Compress Mesh** on all imported models
- [ ] Set texture compression to platform-appropriate format
- [ ] Remove unused packages from \`manifest.json\`

### Strada.Core Specific
- [ ] Use \`BurstSystemBase\` for compute-heavy ECS systems
- [ ] Minimize component sizes (< 64 bytes each)
- [ ] Avoid allocations in \`OnUpdate()\` hot paths
- [ ] Use \`[ExecutionOrder]\` to batch related systems
- [ ] Disable unused modules in bootstrap configuration
- [ ] Profile event bus throughput — avoid event storms

### Code Quality
- [ ] Enable \`IL2CPP\` backend (not Mono) for release builds
- [ ] Set \`Api Compatibility Level\` to \`.NET Standard 2.1\`
- [ ] Remove \`#if UNITY_EDITOR\` debug code from builds
- [ ] Audit third-party plugins for unused code`;

  const platformSpecific: Record<Platform, string> = {
    android: `## Android-Specific Optimizations

### Build Settings
- [ ] Set **Target Architecture**: ARM64 only (drop ARMv7 if min API >= 23)
- [ ] Enable **Minify**: Release (ProGuard/R8)
- [ ] Use **App Bundle (AAB)** format for Play Store
- [ ] Set \`targetSdkVersion\` to latest stable (API 34+)
- [ ] Enable **Split APKs by target architecture**

### Graphics
- [ ] Use **Vulkan** as primary graphics API (with OpenGLES 3.0 fallback)
- [ ] Set texture compression: **ASTC** (preferred) or **ETC2**
- [ ] Limit max texture resolution to 2048x2048
- [ ] Reduce shadow resolution (1024 or lower)
- [ ] Use **GPU instancing** for repeated objects

### Performance
- [ ] Target **30 FPS** for battery life or **60 FPS** for action games
- [ ] Implement **adaptive quality** based on device tier
- [ ] Use **Addressables** for on-demand asset loading
- [ ] Test on low-end devices (2GB RAM, Mali GPU)
- [ ] Enable **Optimized Frame Pacing**

### Memory
- [ ] Max texture memory budget: 256MB for low-end, 512MB for high-end
- [ ] Use **texture streaming** for open-world scenes
- [ ] Monitor GC allocations — aim for zero per frame`,

    ios: `## iOS-Specific Optimizations

### Build Settings
- [ ] Set **Architecture**: ARM64 only
- [ ] Enable **Bitcode**: No (deprecated in Xcode 14+)
- [ ] Set **Minimum iOS Version**: 15.0+ (drop older devices)
- [ ] Use **IL2CPP** backend (required for App Store)
- [ ] Enable **Strip Engine Code**

### Graphics
- [ ] Use **Metal** graphics API (only option on modern iOS)
- [ ] Set texture compression: **ASTC**
- [ ] Enable **GPU instancing**
- [ ] Use \`MetalPerformanceShaders\` for compute where possible
- [ ] Limit draw calls to < 200 per frame

### Performance
- [ ] Target **60 FPS** (120 FPS for ProMotion devices if needed)
- [ ] Enable **Thermal State monitoring** — throttle when hot
- [ ] Use \`UnityEngine.iOS.Device.generation\` for device-tier detection
- [ ] Test on oldest supported device (iPhone 8 / iPad 6th gen)

### App Store
- [ ] Include **all required icon sizes**
- [ ] Set **App Transport Security** exceptions if needed
- [ ] Test with **TestFlight** before submission
- [ ] Ensure < 200MB initial download (on-demand resources for rest)`,

    webgl: `## WebGL-Specific Optimizations

### Build Settings
- [ ] Set **Compression Format**: Brotli (best ratio) or Gzip
- [ ] Enable **Code Optimization**: Disk Size (not Speed)
- [ ] Set **Memory Size**: 256MB (adjust per project needs)
- [ ] Enable **Decompression Fallback** for non-Brotli servers
- [ ] Use **WebGL 2.0** (required for modern features)

### Graphics
- [ ] Set texture compression: **DXT** (WebGL default)
- [ ] Limit max texture resolution to 1024x1024
- [ ] Reduce shader variants with \`#pragma skip_variants\`
- [ ] Avoid compute shaders (limited WebGL support)
- [ ] Use simple shaders — mobile/URP recommended

### Performance
- [ ] Target **30-60 FPS** depending on complexity
- [ ] Minimize JavaScript interop calls
- [ ] Use **Addressables** for streaming assets
- [ ] Implement loading screen (WebGL boot is slow)
- [ ] Test in multiple browsers (Chrome, Firefox, Safari)

### Size Reduction
- [ ] Audit total build size — aim for < 30MB compressed
- [ ] Remove unused Unity modules (Physics, Audio, etc.)
- [ ] Strip unused features via \`ProjectSettings/boot.json\`
- [ ] Use **Assembly Definition References** to exclude editor code
- [ ] Consider **multi-threading**: off (WebGL single-threaded)`,

    standalone: `## Standalone (PC/Mac) Optimizations

### Build Settings
- [ ] Set **Architecture**: x86_64 only
- [ ] Enable **IL2CPP** for release, **Mono** for dev builds
- [ ] Set **Managed Stripping Level**: High
- [ ] Enable **Development Build** only for testing
- [ ] Configure **Screen Resolution Dialog**: Disabled (use in-game settings)

### Graphics
- [ ] Support **DX12/Vulkan** (primary) + **DX11/OpenGL** (fallback)
- [ ] Set texture compression: **DXT5/BC7**
- [ ] Enable **HDR rendering** if applicable
- [ ] Support **resolution scaling** for lower-end PCs
- [ ] Implement quality presets (Low/Medium/High/Ultra)

### Performance
- [ ] Target **60 FPS** minimum, uncapped optional
- [ ] Implement **VSync** toggle in settings
- [ ] Use **async scene loading** for open-world
- [ ] Enable **multi-threaded rendering**
- [ ] Profile with **RenderDoc** for GPU bottlenecks

### Distribution
- [ ] Test on minimum spec hardware
- [ ] Include **crash reporter** (Unity Cloud Diagnostics)
- [ ] Set up **Steam/Epic** SDK if applicable
- [ ] Handle **window resizing** and **fullscreen toggle**
- [ ] Support **ultrawide** and **multi-monitor** setups`,
  };

  return `I'll provide a comprehensive build optimization checklist for **${platform}**.

${common}

${platformSpecific[platform]}

Would you like me to analyze your project's current settings? I can check your \`ProjectSettings\` and \`manifest.json\` using the Unity resources to identify specific optimization opportunities.`;
}
