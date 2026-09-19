// Frozen schema-16 shader sources, adopted from the Creator built-in generator.
// Changes require a new supported model contract; no client/runtime import.
export const approvedFilters = [
  {
    id: "brightness",
    filterId: "backgroundBrightness",
    min: -1,
    max: 1,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uBrightness;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  rgb += vec3(uBrightness);\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uBrightness: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  rgb += vec3<f32>(shaderUniforms.uBrightness);\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
  {
    id: "contrast",
    filterId: "backgroundContrast",
    min: -1,
    max: 1,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uContrast;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  rgb = (rgb - vec3(0.5)) * (1.0 + uContrast) + vec3(0.5);\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uContrast: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  rgb = (rgb - vec3<f32>(0.5)) * (1.0 + shaderUniforms.uContrast) + vec3<f32>(0.5);\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
  {
    id: "saturation",
    filterId: "backgroundSaturation",
    min: -1,
    max: 1,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uSaturation;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));\n  rgb = mix(vec3(luma), rgb, 1.0 + uSaturation);\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uSaturation: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));\n  rgb = mix(vec3<f32>(luma), rgb, 1.0 + shaderUniforms.uSaturation);\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
  {
    id: "hue",
    filterId: "backgroundHue",
    min: -180,
    max: 180,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uHue;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  \n  float angle = uHue * 0.017453292519943295;\n  float cosine = cos(angle);\n  float sine = sin(angle);\n  vec3 rotated = vec3(\n    rgb.r * (0.213 + cosine * 0.787 - sine * 0.213) +\n      rgb.g * (0.715 - cosine * 0.715 - sine * 0.715) +\n      rgb.b * (0.072 - cosine * 0.072 + sine * 0.928),\n    rgb.r * (0.213 - cosine * 0.213 + sine * 0.143) +\n      rgb.g * (0.715 + cosine * 0.285 + sine * 0.140) +\n      rgb.b * (0.072 - cosine * 0.072 - sine * 0.283),\n    rgb.r * (0.213 - cosine * 0.213 - sine * 0.787) +\n      rgb.g * (0.715 - cosine * 0.715 + sine * 0.715) +\n      rgb.b * (0.072 + cosine * 0.928 + sine * 0.072)\n  );\n  rgb = rotated;\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uHue: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  \n  let angle = shaderUniforms.uHue * 0.017453292519943295;\n  let cosine = cos(angle);\n  let sine = sin(angle);\n  let rotated = vec3<f32>(\n    rgb.r * (0.213 + cosine * 0.787 - sine * 0.213) +\n      rgb.g * (0.715 - cosine * 0.715 - sine * 0.715) +\n      rgb.b * (0.072 - cosine * 0.072 + sine * 0.928),\n    rgb.r * (0.213 - cosine * 0.213 + sine * 0.143) +\n      rgb.g * (0.715 + cosine * 0.285 + sine * 0.140) +\n      rgb.b * (0.072 - cosine * 0.072 - sine * 0.283),\n    rgb.r * (0.213 - cosine * 0.213 - sine * 0.787) +\n      rgb.g * (0.715 - cosine * 0.715 + sine * 0.715) +\n      rgb.b * (0.072 + cosine * 0.928 + sine * 0.072)\n  );\n  rgb = rotated;\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
  {
    id: "grayscale",
    filterId: "backgroundGrayscale",
    min: 0,
    max: 1,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uGrayscale;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));\n  rgb = mix(rgb, vec3(luma), uGrayscale);\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uGrayscale: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));\n  rgb = mix(rgb, vec3<f32>(luma), shaderUniforms.uGrayscale);\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
  {
    id: "sepia",
    filterId: "backgroundSepia",
    min: 0,
    max: 1,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uSepia;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  vec3 sepia = vec3(\n    dot(rgb, vec3(0.393, 0.769, 0.189)),\n    dot(rgb, vec3(0.349, 0.686, 0.168)),\n    dot(rgb, vec3(0.272, 0.534, 0.131))\n  );\n  rgb = mix(rgb, sepia, uSepia);\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uSepia: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  let sepia = vec3<f32>(\n    dot(rgb, vec3<f32>(0.393, 0.769, 0.189)),\n    dot(rgb, vec3<f32>(0.349, 0.686, 0.168)),\n    dot(rgb, vec3<f32>(0.272, 0.534, 0.131))\n  );\n  rgb = mix(rgb, sepia, shaderUniforms.uSepia);\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
  {
    id: "invert",
    filterId: "backgroundInvert",
    min: 0,
    max: 1,
    source: {
      webgl: {
        fragment:
          "precision mediump float;\n\nin vec2 vTextureCoord;\nout vec4 finalColor;\n\nuniform sampler2D uTexture;\nuniform float uProgress;\nuniform vec2 uResolution;\nuniform float uInvert;\n\nvoid main(void)\n{\n  vec4 color = texture(uTexture, vTextureCoord);\n  if (color.a <= 0.0) {\n    finalColor = color;\n    return;\n  }\n\n  vec3 rgb = color.rgb / color.a;\n  rgb = mix(rgb, vec3(1.0) - rgb, uInvert);\n  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);\n}",
      },
      webgpu: {
        source:
          "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\nstruct ShaderUniforms {\n  uProgress: f32,\n  uResolution: vec2<f32>,\n  uInvert: f32,\n};\n\n@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {\n  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n  position.y =\n    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -\n    gfu.uOutputTexture.z;\n  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n  return VSOutput(vec4(position, 0.0, 1.0), uv);\n}\n\n@fragment\nfn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {\n  let color = textureSample(uTexture, uSampler, uv);\n  if (color.a <= 0.0) {\n    return color;\n  }\n\n  var rgb = color.rgb / color.a;\n  rgb = mix(rgb, vec3<f32>(1.0) - rgb, shaderUniforms.uInvert);\n  return vec4<f32>(\n    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,\n    color.a\n  );\n}",
      },
    },
  },
];
