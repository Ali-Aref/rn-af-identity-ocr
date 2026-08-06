Pod::Spec.new do |s|
  s.name           = 'RnOcrPro'
  s.version        = '0.1.0'
  s.summary        = 'On-device OCR for React Native Expo with Persian and Pashto focus'
  s.description    = 'Tesseract-based on-device OCR supporting Persian (fas), Pashto (pus), English, and extensible language packs'
  s.author         = 'Ali Aref'
  s.homepage       = 'https://github.com/Ali-Aref/rn-ocr-pro'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: 'https://github.com/Ali-Aref/rn-ocr-pro.git' }
  s.static_framework = true
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'
  s.dependency 'kta-tesseract-swift', '~> 0.0.7'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '$(inherited) -lc++ -lz',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = "Resources/**"

  s.resource_bundles = {
    'RnOcrProTessdata' => ['Resources/tessdata/*.traineddata']
  }
end
