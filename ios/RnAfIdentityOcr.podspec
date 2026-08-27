Pod::Spec.new do |s|
  s.name           = 'RnAfIdentityOcr'
  s.version        = '0.1.1'
  s.summary        = 'On-device OCR for Afghan identity documents (ML Kit/Vision + PP-OCR)'
  s.description    = 'Latin OCR via Vision and Arabic-script OCR via PP-OCRv5 ONNX, with optional B&W preprocess'
  s.author         = 'Ali Aref'
  s.homepage       = 'https://github.com/Ali-Aref/rn-af-identity-ocr'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: 'https://github.com/Ali-Aref/rn-af-identity-ocr.git' }
  s.static_framework = true
  s.swift_version  = '5.0'
  s.license        = 'MIT'

  s.dependency 'ExpoModulesCore'
  s.dependency 'onnxruntime-objc', '~> 1.20.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = ["RnAfIdentityOcr-Bridging-Header.h", "Resources/**"]
  # This pod is built as a framework. Public Objective-C headers are imported
  # into Swift through CocoaPods' generated umbrella header; a bridging header
  # is app-target configuration and is unreliable for framework pods.
  s.public_header_files = "AfOrtRunner.h"
  # PP-OCRv5 mobile det (~4.7 MB) + arabic rec (~7.7 MB) + charset dict.
  s.resources = ['models/*']
end
